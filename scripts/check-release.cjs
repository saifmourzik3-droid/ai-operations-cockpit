'use strict';
// Audit tracked files only. No values are printed, and runtime credentials remain ignored.
const {execFileSync} = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root=path.resolve(__dirname,'..');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
if (!tracked.length) throw Error('No tracked release files to inspect');
const issues=[];
const secret=/(?<![A-Za-z0-9_-])(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;
for(const name of tracked) {
  if ((/(^|\/)\.env(?:\.|$)/.test(name) && name!=='.env.example') || /(?:^|\/)(?:\.private|node_modules|data)\/|demo-access\.txt|\.(?:pem|key|dpapi|zip|db|sqlite)$/.test(name)) issues.push(name+': forbidden file');
  const data=fs.readFileSync(path.join(root,name));
  if(data.includes(0)) {issues.push(name+': binary requires manual review');continue;}
  const text=data.toString('utf8');
  if(secret.test(text)) issues.push(name+': potential credential');
  if(/(?:https?:\/\/)[^\s"'<>`]*\.(?:supabase\.co|onrender\.com)/i.test(text)) issues.push(name+': deployment endpoint');
  if(name==='.env.example' && text.split('\n').some(l=>!l.startsWith('#') && /^[A-Z_]+=.+/.test(l))) issues.push(name+': populated environment example');
}
if(issues.length) {console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`Release check passed: ${tracked.length} text files; no flagged credentials, runtime files or deployment endpoints. Manual review is still required.`);
