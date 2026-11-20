// /auth/v1: Supabase GoTrue'nun sitenin kullandığı kısmı (kayıt, giriş, oturum yenileme, şifre sıfırlama, kullanıcı bilgisi, yönetici uçları).
const crypto = require('crypto');
const { promisify } = require('util');
const { owner } = require('./db');
const jwt = require('./jwt');
const posta = require('./posta');
const ayar = require('./ayar');

const scrypt = promisify(crypto.scrypt);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 's1$' + salt.toString('base64') + '$' + h.toString('base64');
}
async function checkPw(pw, stored) {
  if (!stored || !stored.startsWith('s1$')) return false;
  const [, s, h] = stored.split('$');
  const want = Buffer.from(h, 'base64');
  const got = await scrypt(pw, Buffer.from(s, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, want);
}

// basit hız sınırı: anahtar başına pencere içinde en çok n deneme
const hits = new Map();
function limit(key, n, ms) {
  const now = Date.now();
  const h = (hits.get(key) || []).filter((t) => now - t < ms);
  h.push(now);
  hits.set(key, h);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k);
  return h.length <= n;
}

const json = (status, o, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, body: o === null ? null : JSON.stringify(o) });
const err = (status, code, msg) => json(status, { code: status, error_code: code, msg, error: code, error_description: msg });

function userJson(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, phone: '',
    email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at,
    app_metadata: { provider: 'email', providers: ['email'], ...(u.raw_app_meta_data || {}) },
    user_metadata: u.raw_user_meta_data || {},
    identities: [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email, sub: u.id } }],
    created_at: u.created_at, updated_at: u.updated_at || u.created_at, is_anonymous: false,
  };
}

const COLS = 'id, email, encrypted_password, email_confirmed_at, last_sign_in_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data';
const byEmail = async (e) => (await owner.query(`select ${COLS} from public.auth_users where lower(email) = lower($1)`, [e])).rows[0];
const byId = async (id) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  return (await owner.query(`select ${COLS} from public.auth_users where id = $1`, [id])).rows[0];
};

function accessToken(u) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    aud: 'authenticated', exp: now + ayar.jwtExp, iat: now, iss: ayar.publicUrl + '/auth/v1', sub: u.id, email: u.email, phone: '',
    app_metadata: { provider: 'email', providers: ['email'], ...(u.raw_app_meta_data || {}) }, user_metadata: u.raw_user_meta_data || {},
    role: 'authenticated', aal: 'aal1', is_anonymous: false,
  });
}

async function newToken(userId, kind, ms) {
  const raw = crypto.randomBytes(32).toString('hex');
  await owner.query('insert into public.auth_tokens(hash, user_id, kind, expires_at) values ($1, $2, $3, now() + $4::bigint * interval \'1 millisecond\')', [sha(raw), userId, kind, ms]);
  return raw;
}
async function useToken(raw, kind, once) {
  if (typeof raw !== 'string' || raw.length < 20) return null;
  const r = await owner.query(`${once ? 'update public.auth_tokens set used_at = now() where' : 'select user_id from public.auth_tokens where'}
     hash = $1 and kind = $2 and expires_at > now() and used_at is null ${once ? 'returning user_id' : ''}`, [sha(raw), kind]);
  return r.rows[0] ? r.rows[0].user_id : null;
}

async function session(u) {
  await owner.query('update public.auth_users set last_sign_in_at = now() where id = $1', [u.id]);
  const refresh = await newToken(u.id, 'refresh', 60 * 864e5);
  const fresh = await byId(u.id);
  return { access_token: accessToken(fresh), token_type: 'bearer', expires_in: ayar.jwtExp, expires_at: Math.floor(Date.now() / 1000) + ayar.jwtExp, refresh_token: refresh, user: userJson(fresh) };
}

const verifyLink = (raw, type, redirect) =>
  `${ayar.publicUrl}/auth/v1/verify?token=${raw}&type=${type}&redirect_to=${encodeURIComponent(redirect || ayar.siteUrl + '/')}`;

function safeRedirect(r) {
  try {
    const u = new URL(r);
    if (ayar.origins.includes(u.origin) || u.origin === ayar.siteUrl) return u.toString();
  } catch { /* */ }
  return ayar.siteUrl + '/';
}

function bearer(headers) {
  const a = headers.get('authorization') || '';
  return /^bearer /i.test(a) ? a.slice(7).trim() : '';
}

async function currentUser(headers) {
  const p = jwt.verify(bearer(headers));
  if (!p || p.expired || p.role !== 'authenticated' || !p.sub) return null;
  return byId(p.sub);
}

async function auth(rel, req) {
  const { method, params, headers, ip } = req;
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const svc = req.claims.role === 'service_role';

  if (rel === 'signup' && method === 'POST') {
    const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
    if (!EMAIL.test(email) || email.length > 200) return err(400, 'validation_failed', 'Unable to validate email address: invalid format');
    if (pw.length < 6 || pw.length > 72) return err(422, 'weak_password', 'Password should be at least 6 characters.');
    if (!limit('su:' + ip, 8, 3600e3)) return err(429, 'over_request_rate_limit', 'For security purposes, you can only request this after 60 seconds.');
    const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : {};
    const ex = await byEmail(email);
    if (ex && ex.email_confirmed_at) {
      // Supabase gibi: hesabın varlığını açığa vurmaz, ama site "identities: []" ile anlar
      return json(200, { ...userJson(ex), identities: [], user_metadata: {} });
    }
    const ph = await hashPw(pw);
    let u;
    if (ex) {
      u = (await owner.query(`update public.auth_users set encrypted_password = $2, raw_user_meta_data = $3, updated_at = now() where id = $1 returning ${COLS}`, [ex.id, ph, data])).rows[0];
    } else {
      u = (await owner.query(`insert into public.auth_users(id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
        values (gen_random_uuid(), $1, $2, $3, '{"provider":"email","providers":["email"]}', now(), now()) returning ${COLS}`, [email, ph, data])).rows[0];
    }
    if (!posta.hazir()) {
      // e-posta ayarlanmamışsa doğrulama gönderilemez: hesap hemen açılır
      await owner.query('update public.auth_users set email_confirmed_at = now() where id = $1', [u.id]);
      return json(200, await session(u));
    }
    const raw = await newToken(u.id, 'signup', 24 * 3600e3);
    try { await posta.dogrulama(email, verifyLink(raw, 'signup', params.get('redirect_to'))); }
    catch (e) { console.error('dogrulama maili', e.message); return err(500, 'unexpected_failure', 'Error sending confirmation email'); }
    return json(200, userJson(u));
  }

  if (rel === 'verify' && method === 'GET') {
    const type = params.get('type'), to = safeRedirect(params.get('redirect_to') || ayar.siteUrl + '/');
    const kind = type === 'recovery' ? 'recovery' : 'signup';
    const uid = await useToken(params.get('token'), kind, true);
    if (!uid) return { status: 303, headers: { Location: to.split('#')[0] + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' }, body: null };
    if (kind === 'signup') await owner.query('update public.auth_users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [uid]);
    const s = await session(await byId(uid));
    const hash = `access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=${s.expires_in}&refresh_token=${s.refresh_token}&token_type=bearer&type=${kind}`;
    return { status: 303, headers: { Location: to.split('#')[0] + '#' + hash }, body: null };
  }

  if (rel === 'token' && method === 'POST') {
    const gt = params.get('grant_type');
    if (gt === 'password') {
      const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
      if (!limit('pw:' + ip, 30, 900e3) || !limit('pwm:' + email, 10, 900e3)) return err(429, 'over_request_rate_limit', 'Too many requests, try again in a few minutes.');
      const u = await byEmail(email);
      if (!u || !(await checkPw(pw, u.encrypted_password))) return err(400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.email_confirmed_at) return err(400, 'email_not_confirmed', 'Email not confirmed');
      return json(200, await session(u));
    }
    if (gt === 'refresh_token') {
      if (!limit('rt:' + ip, 120, 900e3)) return err(429, 'over_request_rate_limit', 'Too many requests');
      const uid = await useToken(b.refresh_token, 'refresh', false);
      const u = uid && (await byId(uid));
      if (!u) return err(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      return json(200, { access_token: accessToken(u), token_type: 'bearer', expires_in: ayar.jwtExp, expires_at: Math.floor(Date.now() / 1000) + ayar.jwtExp, refresh_token: b.refresh_token, user: userJson(u) });
    }
    return err(400, 'unsupported_grant_type', 'unsupported_grant_type');
  }

  if (rel === 'recover' && method === 'POST') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return err(400, 'validation_failed', 'Unable to validate email address: invalid format');
    if (!limit('rc:' + ip, 6, 3600e3) || !limit('rcm:' + email, 3, 3600e3)) return err(429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 60 seconds.');
    const u = await byEmail(email);
    if (u) {
      const raw = await newToken(u.id, 'recovery', 3600e3);
      try { await posta.sifirlama(email, verifyLink(raw, 'recovery', b.redirect_to || params.get('redirect_to'))); }
      catch (e) { console.error('sifirlama maili', e.message); return err(500, 'unexpected_failure', 'Error sending recovery email'); }
    }
    return json(200, {});
  }

  if (rel === 'user') {
    const u = await currentUser(headers);
    if (!u) return err(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature, token is unverifiable');
    if (method === 'GET') return json(200, userJson(u));
    if (method === 'PUT') {
      if (b.email && String(b.email).toLowerCase() !== u.email) return err(422, 'email_change_not_supported', 'E-posta değişikliği şu an yapılamıyor.');
      if (b.password !== undefined) {
        const pw = String(b.password);
        if (pw.length < 6 || pw.length > 72) return err(422, 'weak_password', 'Password should be at least 6 characters.');
        await owner.query('update public.auth_users set encrypted_password = $2, updated_at = now() where id = $1', [u.id, await hashPw(pw)]);
      }
      if (b.data && typeof b.data === 'object' && !Array.isArray(b.data)) {
        await owner.query("update public.auth_users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || $2::jsonb, updated_at = now() where id = $1", [u.id, JSON.stringify(b.data)]);
      }
      return json(200, userJson(await byId(u.id)));
    }
  }

  if (rel === 'logout' && method === 'POST') {
    const u = await currentUser(headers);
    if (u) await owner.query("update public.auth_tokens set used_at = now() where user_id = $1 and kind = 'refresh' and used_at is null", [u.id]);
    return { status: 204, headers: {}, body: null };
  }

  // Yönetici uçları: yalnız sunucu fonksiyonları (service_role)
  const am = /^admin\/users(?:\/([0-9a-f-]{36}))?$/i.exec(rel);
  if (am) {
    if (!svc) return err(403, 'not_admin', 'User not allowed');
    if (!am[1] && method === 'GET') {
      const per = Math.min(1000, +params.get('per_page') || 50), page = Math.max(1, +params.get('page') || 1);
      const r = await owner.query(`select ${COLS} from public.auth_users order by created_at limit $1 offset $2`, [per, (page - 1) * per]);
      return json(200, { users: r.rows.map(userJson), aud: 'authenticated' });
    }
    const u = am[1] && (await byId(am[1]));
    if (!u) return err(404, 'user_not_found', 'User not found');
    if (method === 'GET') return json(200, userJson(u));
    if (method === 'PUT') {
      if (b.user_metadata && typeof b.user_metadata === 'object') await owner.query('update public.auth_users set raw_user_meta_data = $2, updated_at = now() where id = $1', [u.id, b.user_metadata]);
      if (b.app_metadata && typeof b.app_metadata === 'object') await owner.query("update public.auth_users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || $2::jsonb where id = $1", [u.id, JSON.stringify(b.app_metadata)]);
      if (b.password) await owner.query('update public.auth_users set encrypted_password = $2 where id = $1', [u.id, await hashPw(String(b.password))]);
      if (b.email_confirm === true) await owner.query('update public.auth_users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [u.id]);
      return json(200, userJson(await byId(u.id)));
    }
  }

  return err(404, 'not_found', 'Bu adres yok.');
}

module.exports = { auth };
