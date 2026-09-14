'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');return 'scrypt$'+salt+'$'+(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
async function verifyPassword(password,hash){const parts=hash.split('$');const result=await scrypt(password,parts[1],64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return crypto.timingSafeEqual(result,Buffer.from(parts[2],'hex'));}
function createAccess(config,{now=Date.now}={}){
 fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});const file=path.join(config.dataDir,'state.json');
 let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{enabled:config.enabled,users:{},events:[]};
 if(typeof state.enabled!=='boolean'||!state.users||!Array.isArray(state.events))throw new Error('État administratif invalide');
 for(const u of config.users)state.users[u.id]??={lastLogin:null,lastActivity:null,ai:0,web:0,webActual:0,errors:0,requests:[]};
 const sessions=new Map(),logins=new Map(),pending=new Set(),recent=new Map();let loginActive=0;
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(file+'.tmp',file);};
 const event=(user,type,code)=>{state.events.push({user,time:new Date(now()).toISOString(),type,...(code?{code}: {})});state.events=state.events.slice(-500);save();};
 const signature=token=>crypto.createHmac('sha256',config.secret).update(token).digest('hex');
 function authenticate(req){
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ao_session='));if(!cookie)return null;
  const value=cookie.slice(11);const [token,mac]=value.split('.');if(!/^[a-f0-9]{64}$/.test(token||'')||!/^[a-f0-9]{64}$/.test(mac||''))return null;
  if(!crypto.timingSafeEqual(Buffer.from(signature(token),'hex'),Buffer.from(mac,'hex')))return null;
  const sid=digest(token),s=sessions.get(sid);if(!s)return null;
  if(s.expires<now()||s.lastSeen+config.idleMs<now()){sessions.delete(sid);return null;}
  const u=config.users.find(u=>u.id===s.user);if(!u)return null;if(req.url!=='/api/session')s.lastSeen=now();
  const metric=state.users[u.id];if(req.url!=='/api/session'&&(!metric.lastActivity||now()-Date.parse(metric.lastActivity)>30000)){metric.lastActivity=new Date(now()).toISOString();save();}
  return {...u,hash:undefined,sid,csrf:s.csrf};
 }
 const unavailable=user=>user.role!=='admin'&&(!config.enabled||!state.enabled||config.expires!==null&&now()>config.expires);
 async function login(username,password,ip){
  const key=digest(ip);const times=(logins.get(key)||[]).filter(t=>now()-t<900000);if(times.length>=10||loginActive>=2)return {status:429};
  if(logins.size>2000){for(const [k,v] of logins)if(!v.some(t=>now()-t<900000))logins.delete(k);if(logins.size>2000)return {status:429};}
  times.push(now());logins.set(key,times);loginActive++;
  try{
   const user=config.users.find(u=>u.username===username);
   const ok=await verifyPassword(password,user?.hash||config.users[0].hash);
   if(!user||!ok){event(user?.id||'unknown','login_failed');return {status:401};}
   for(const [id,s] of sessions)if(s.expires<now()||s.lastSeen+config.idleMs<now())sessions.delete(id);
   const owned=[...sessions].filter(([,s])=>s.user===user.id);if(owned.length>=8)sessions.delete(owned[0][0]);
   const token=crypto.randomBytes(32).toString('hex'),sid=digest(token),csrf=crypto.randomBytes(24).toString('hex');
   sessions.set(sid,{user:user.id,csrf,expires:now()+config.sessionMs,lastSeen:now()});state.users[user.id].lastLogin=new Date(now()).toISOString();state.users[user.id].lastActivity=new Date(now()).toISOString();event(user.id,'login');
   return {status:200,cookie:'ao_session='+token+'.'+signature(token)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+Math.floor(config.sessionMs/1000)+(config.prod?'; Secure':''),user:{...user,hash:undefined,sid,csrf}};
  }finally{loginActive--;}
 }
 function logout(user){sessions.delete(user.sid);event(user.id,'logout');}
 function beginAI(user,requestId,web){
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId||''))return {status:400,error:'Identifiant de requête invalide.'};
  for(const [k,v] of recent)if(v.expires<now())recent.delete(k);
  const key=user.sid+':'+requestId;if(recent.has(key))return {status:409,error:'Cette demande a déjà été envoyée.'};
  if(pending.has(user.id)||pending.size>=3)return {status:429,error:'Une réponse est déjà en cours. Patientez un instant.'};
  const metric=state.users[user.id];metric.requests=metric.requests.filter(t=>now()-t<86400000);
  if(metric.requests.length>=config.day||metric.requests.filter(t=>now()-t<3600000).length>=config.hour)return {status:429,error:'Limite de demandes atteinte. Réessayez plus tard.'};
  recent.set(key,{expires:now()+3600000});pending.add(user.id);metric.requests.push(now());metric.ai++;if(web)metric.web++;event(user.id,'ai_request');return null;
 }
 function endAI(user,{error,webUsed}={}){pending.delete(user.id);if(webUsed)state.users[user.id].webActual++;if(error){state.users[user.id].errors++;event(user.id,'api_error',String(error).slice(0,32));}else save();}
 function adminStatus(){return {enabled:config.enabled&&state.enabled,expired:config.expires!==null&&now()>config.expires,expiresAt:config.expires?new Date(config.expires).toISOString():null,users:config.users.map(u=>({id:u.id,name:u.name,username:u.username,role:u.role,...state.users[u.id],requests:undefined})),events:state.events.slice(-50).reverse(),limits:{hour:config.hour,day:config.day}};}
 function setEnabled(user,value){state.enabled=value;event(user.id,value?'demo_enabled':'demo_suspended');}
 save();return {authenticate,login,logout,unavailable,beginAI,endAI,adminStatus,setEnabled};
}
module.exports={createAccess,hashPassword,verifyPassword};
