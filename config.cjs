'use strict';
const path = require('node:path');
function loadConfig(env = process.env) {
  const number = (key, fallback, min, max) => {
    const n = Number(env[key] || fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw Error('Invalid configuration: ' + key);
    return n;
  };
  const prod = env.NODE_ENV === 'production';
  const port = number('PORT', 4318, 1, 65535);
  const origin = new URL(env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`);
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
      !['http:', 'https:'].includes(origin.protocol) || prod && origin.protocol !== 'https:' ||
      !prod && !['127.0.0.1', 'localhost'].includes(origin.hostname)) throw Error('Invalid public origin');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 48) throw Error('Run npm run setup first');
  const users = ['ADMIN', 'OPERATOR', 'REVIEWER'].map((name, i) => ({
    id: name.toLowerCase(), username: name.toLowerCase(), name: ['Demo Admin', 'Demo Operator', 'Demo Reviewer'][i],
    role: i === 0 ? 'admin' : 'client', hash: env[name + '_PASSWORD_HASH'] || ''
  }));
  if (users.some(u => !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(u.hash))) throw Error('Invalid demo password hash');
  return {prod, port, origin: origin.origin, host: origin.host, bind: prod ? '0.0.0.0' : '127.0.0.1',
    trustProxy: env.TRUST_PROXY === 'true', secret: env.SESSION_SECRET, users,
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '.private', 'state')),
    enabled: true, expires: null, hour: 60, day: 200, sessionMs: 8 * 3600000, idleMs: 3600000};
}
module.exports = {loadConfig};
