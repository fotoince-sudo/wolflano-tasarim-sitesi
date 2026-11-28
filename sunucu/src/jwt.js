// HS256 JWT: Supabase'in oturum anahtarlarıyla aynı biçim (sub, email, role, exp...).
const crypto = require('crypto');

const b64u = (b) => Buffer.from(b).toString('base64url');
let SECRET = null;
const setSecret = (s) => { SECRET = Buffer.from(s, 'utf8'); };

function sign(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + s;
}

// Geçerliyse payload, değilse null. Süresi dolmuşsa { expired: true }.
function verify(tok) {
  if (!SECRET || typeof tok !== 'string') return null;
  const parts = tok.split('.');
  if (parts.length !== 3) return null;
  const want = crypto.createHmac('sha256', SECRET).update(parts[0] + '.' + parts[1]).digest();
  let got;
  try { got = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let h, p;
  try { h = JSON.parse(Buffer.from(parts[0], 'base64url')); p = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { return null; }
  if (!h || h.alg !== 'HS256' || !p || typeof p !== 'object') return null;
  if (typeof p.exp === 'number' && p.exp < Date.now() / 1000) return { expired: true };
  return p;
}

const looksJwt = (t) => typeof t === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t);

module.exports = { sign, verify, setSecret, looksJwt };
