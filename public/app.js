'use strict';
const $ = id => document.getElementById(id);
let session, data, selected, enabled = true;
const money = n => new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const notice = text => { $('notice').textContent = text; };
const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
async function request(route, body) {
  const res = await fetch(route,body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session?.csrf || '', 'X-Request-ID':crypto.randomUUID()},body:JSON.stringify(body)});
  const result = await res.json();
  if (!res.ok) {if(res.status===401 && session)location.assign('/login');throw Error(result.error || 'Request failed');}
  return result;
}
async function refresh() {data=await request('/api/operations');render();}
function render() {
  const m=data.metrics; $('metrics').replaceChildren();
  for(const [label,value,note] of [['Operations',m.total,'Fixed fictional scenario'],['Needs attention',m.attention,'Human review required'],['Completed',m.completed,'All checklist steps done'],['Contribution',money(m.contribution),'Revenue minus direct cost']]) {
    const card=el('div',undefined,'metric');card.append(el('span',label),el('strong',String(value)),el('small',note));$('metrics').append(card);
  }
  const query=$('search').value.toLowerCase(),filter=$('filter').value;
  const rows=data.rows.filter(r=>(filter==='all'||r.status===filter)&&[r.id,r.asset,r.client,r.site].join(' ').toLowerCase().includes(query));
  $('rows').replaceChildren();$('empty').hidden=rows.length>0;
  for(const r of rows) {
    const tr=el('tr'),ref=el('td'),button=el('button',r.id,'reference');button.addEventListener('click',()=>openDetails(r.id));ref.append(button,el('small',r.asset));
    const client=el('td',r.client);client.append(el('small',r.site));
    const status=el('td');status.append(el('span',r.status==='attention'?'Needs attention':r.status,'status '+r.status));
    const progress=el('td'),bar=el('progress');bar.max=4;bar.value=r.checklist.filter(t=>t.done).length;bar.setAttribute('aria-label',r.id+' checklist completion');progress.append(bar,document.createTextNode(bar.value+'/4'));
    tr.append(ref,client,el('td',r.date),status,progress);$('rows').append(tr);
  }
}
function openDetails(id) {
  selected=id;const r=data.rows.find(x=>x.id===id);$('detail-title').textContent=r.id+' · '+r.asset;$('detail-meta').textContent=r.site+' / '+r.team;$('checklist').replaceChildren();
  r.checklist.forEach((task,index)=>{const label=el('label'),input=el('input');input.type='checkbox';input.checked=task.done;input.addEventListener('change',async()=>{input.disabled=true;try{await request('/api/checklist',{id,index,done:input.checked});await refresh();openDetails(id);}catch(e){input.checked=!input.checked;notice(e.message);}finally{input.disabled=false;}});label.append(input,el('span',task.label));$('checklist').append(label);});
  if(!$('details').open)$('details').showModal();
}
async function ask(question) {
  const button=$('ask-form').querySelector('button');button.disabled=true;notice('');
  try{const result=await request('/api/assistant',{question});$('answer').textContent=result.answer;$('references').textContent='Simulator · References: '+(result.references.join(', ')||'none');if(session.role==='admin')await adminStatus();}catch(e){notice(e.message);}finally{button.disabled=false;}
}
async function adminStatus() {
  const stats=await request('/api/admin/status');enabled=stats.enabled;$('admin-state').textContent=enabled?'Operator and reviewer access is enabled.':'Operator and reviewer access is paused.';$('toggle-access').textContent=enabled?'Pause operator access':'Resume operator access';$('usage').textContent=stats.users.map(u=>u.name+': '+u.ai+' simulator requests').join('\n');
}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();notice('');const button=e.target.querySelector('button');button.disabled=true;try{const f=new FormData(e.target);await request('/auth/login',{username:f.get('username'),password:f.get('password')});location.assign('/');}catch(err){notice(err.message);}finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await request('/auth/logout',{});location.assign('/login');}catch(e){notice(e.message);}});
$('search').addEventListener('input',render);$('filter').addEventListener('change',render);
$('close-details').addEventListener('click',()=>$('details').close());
$('reset').addEventListener('click',async()=>{try{await request('/api/reset',{});await refresh();$('answer').textContent='Scenario reset. Select a prompt for a new simulated response.';$('references').textContent='';notice('Your fictional scenario has been reset.');}catch(e){notice(e.message);}});
$('ask-form').addEventListener('submit',e=>{e.preventDefault();ask($('question').value);});
document.querySelectorAll('[data-question]').forEach(b=>b.addEventListener('click',()=>{$('question').value=b.dataset.question;ask(b.dataset.question);}));
$('toggle-access').addEventListener('click',async()=>{try{await request('/api/admin/state',{enabled:!enabled});await adminStatus();}catch(e){notice(e.message);}});
(async()=>{
 if(location.pathname==='/login'){$('login-panel').hidden=false;return;}
 try{session=await request('/api/session');$('account').hidden=false;$('user-name').textContent=session.name;$('workspace').hidden=false;await refresh();if(session.role==='admin'){$('admin').hidden=false;await adminStatus();}}catch(e){notice(e.message);}
})();
