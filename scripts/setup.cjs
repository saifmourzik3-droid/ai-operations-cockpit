'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {hashPassword} = require('../access.cjs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const envFile = path.join(root, '.env'), accessFile = path.join(root, 'demo-access.txt');
  if (fs.existsSync(envFile) || fs.existsSync(accessFile)) throw Error('Local configuration already exists; nothing overwritten.');
  const env = ['SESSION_SECRET=' + crypto.randomBytes(48).toString('hex')];
  const credentials = ['LOCAL DEMO ONLY — generated credentials. Do not commit or share this file.'];
  for (const name of ['ADMIN', 'OPERATOR', 'REVIEWER']) {
    const password = crypto.randomBytes(18).toString('base64url');
    env.push(name + '_PASSWORD_HASH=' + await hashPassword(password));
    credentials.push(name.toLowerCase() + ': ' + password);
  }
  fs.writeFileSync(envFile, env.join('\n') + '\n', {mode: 0o600, flag: 'wx'});
  fs.writeFileSync(accessFile, credentials.join('\n') + '\n', {mode: 0o600, flag: 'wx'});
  console.log('Ready. Your local logins are in ignored demo-access.txt. Run npm start.');
})().catch(e => {console.error(e.message); process.exitCode = 1;});
