'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const {loadConfig} = require('./config.cjs'), {createAccess} = require('./access.cjs');
const {freshOperations, metrics, setTask, simulatedAssistant, exportCSV} = require('./operations.cjs');
async function readJSON(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw Object.assign(Error('Request too large'), {status: 413});
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    return body;
  } catch {throw Object.assign(Error('Invalid JSON object'), {status: 400});}
}
function createApp({config = loadConfig(), access = createAccess(config)} = {}) {
  const operations = new Map(config.users.map(u => [u.id, freshOperations()]));
  const server = http.createServer(async (req, res) => {
    const json = (code, data) => {res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data));};
    const file = (name, type) => {res.writeHead(200, {'Content-Type': type}); res.end(fs.readFileSync(path.join(__dirname,'public',name)));};
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (config.prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      if (req.headers.host !== config.host) return json(403, {error:'Host not allowed'});
      if (config.prod && !req.socket.encrypted && !(config.trustProxy && req.headers['x-forwarded-proto'] === 'https')) return json(403, {error:'HTTPS required'});
      if (req.headers.origin && req.headers.origin !== config.origin) return json(403, {error:'Origin not allowed'});
      const write = !['GET','HEAD'].includes(req.method);
      if (write && (req.headers.origin !== config.origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))) return json(403, {error:'Same-origin JSON required'});
      const route = (req.url || '').split('?')[0];
      if (req.method === 'GET') {
        if (route === '/healthz') return json(200, {ok:true, mode:'offline-demo'});
        if (route === '/style.css') return file('style.css','text/css; charset=utf-8');
        if (route === '/app.js') return file('app.js','application/javascript; charset=utf-8');
        if (route === '/login') return file('index.html','text/html; charset=utf-8');
      }
      if (route === '/auth/login' && req.method === 'POST') {
        const b = await readJSON(req);
        if (typeof b.username !== 'string' || typeof b.password !== 'string' || b.username.length > 50 || b.password.length > 256) return json(400, {error:'Invalid credentials format'});
        const ip = config.trustProxy ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim() : req.socket.remoteAddress;
        const result = await access.login(b.username,b.password,ip || 'unknown');
        if (result.status !== 200) return json(result.status,{error:result.status === 429 ? 'Too many attempts; try again later' : 'Invalid login'});
        res.setHeader('Set-Cookie',result.cookie); return json(200,{ok:true});
      }
      const user = access.authenticate(req);
      if (!user) {
        if (route === '/' && req.method === 'GET') {res.writeHead(303,{Location:'/login'}); return res.end();}
        return json(401,{error:'Login required'});
      }
      if (write && req.headers['x-csrf-token'] !== user.csrf) return json(403,{error:'Invalid form session'});
      if (route === '/auth/logout' && req.method === 'POST') {
        access.logout(user); res.setHeader('Set-Cookie','ao_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (config.prod ? '; Secure' : ''));return json(200,{ok:true});
      }
      if (route === '/api/session' && req.method === 'GET') return json(200,{name:user.name,role:user.role,csrf:user.csrf,unavailable:access.unavailable(user)});
      if (route.startsWith('/api/admin/')) {
        if (user.role !== 'admin') return json(403,{error:'Admin required'});
        if (route === '/api/admin/status' && req.method === 'GET') return json(200,access.adminStatus());
        if (route === '/api/admin/state' && req.method === 'POST') {
          const b = await readJSON(req);if (typeof b.enabled !== 'boolean') return json(400,{error:'Boolean enabled required'});
          access.setEnabled(user,b.enabled);return json(200,{ok:true});
        }
        return json(404,{error:'Not found'});
      }
      if (access.unavailable(user)) return json(423,{error:'Demo access is paused by the administrator'});
      if (route === '/' && req.method === 'GET') return file('index.html','text/html; charset=utf-8');
      const rows = operations.get(user.id);
      if (route === '/api/operations' && req.method === 'GET') return json(200,{rows,metrics:metrics(rows)});
      if (route === '/api/checklist' && req.method === 'POST') {
        const b = await readJSON(req);return json(200,{row:setTask(rows,b.id,b.index,b.done)});
      }
      if (route === '/api/reset' && req.method === 'POST') {operations.set(user.id,freshOperations());return json(200,{ok:true});}
      if (route === '/api/export' && req.method === 'GET') {
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="demo-operations.csv"'});return res.end(exportCSV(rows));
      }
      if (route === '/api/assistant' && req.method === 'POST') {
        const b = await readJSON(req);
        const result = simulatedAssistant(b.question,rows);
        const denied = access.beginAI(user,req.headers['x-request-id'],false);
        if (denied) return json(denied.status,{error:'Demo request rejected: duplicate or quota exceeded'});
        try {return json(200,result);} finally {access.endAI(user);}
      }
      return json(404,{error:'Not found'});
    } catch (e) {if (!res.headersSent && !res.destroyed) json(e.status || 500,{error:e.status ? e.message : 'Service temporarily unavailable'});}
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
module.exports = {createApp};
if (require.main === module) {
  const config = loadConfig();
  createApp({config}).listen(config.port,config.bind,() => console.log('Offline demo ready at ' + config.origin));
}
