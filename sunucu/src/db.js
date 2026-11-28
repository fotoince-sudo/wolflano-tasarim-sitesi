// Veritabanı bağlantıları.
//  owner: tabloların sahibi (wolflano_usr). Kurulum, üyelik ve sunucu fonksiyonları (service_role) bunu kullanır; erişim kuralları ona uygulanmaz.
//  api:   site isteklerini çalıştıran ikinci kullanıcı (wolflano_api). Tabloların sahibi olmadığı için RLS kuralları ona uygulanır.
const { Pool } = require('pg');
const ayar = require('./ayar');

const owner = new Pool({ ...ayar.db, max: 6, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
const api = new Pool({ ...ayar.db, user: ayar.apiDb.user, password: ayar.apiDb.password, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
owner.on('error', (e) => console.error('db owner', e.message));
api.on('error', (e) => console.error('db api', e.message));

const durum = { apiHazir: false, apiHata: '' };

// claims: JWT içeriği ({ role: 'anon' | 'authenticated' | 'service_role', sub, email, ... })
async function tx(claims, fn) {
  const svc = claims && claims.role === 'service_role';
  if (!svc && !durum.apiHazir) {
    const e = new Error('Site veritabanı kullanıcısı (API_DB_USER) bağlı değil.');
    e.code = 'WF001';
    throw e;
  }
  const c = await (svc ? owner : api).connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('request.jwt.claims', $1, true), set_config('statement_timeout', '25000', true)", [JSON.stringify(claims || { role: 'anon' })]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* bağlantı kopmuş olabilir */ }
    throw e;
  } finally {
    c.release();
  }
}

async function apiKontrol() {
  try {
    const r = await api.query('select current_user u');
    durum.apiHazir = r.rows[0].u === ayar.apiDb.user && ayar.apiDb.user !== ayar.db.user;
    durum.apiHata = durum.apiHazir ? '' : 'API kullanıcısı tablo sahibiyle aynı olamaz.';
  } catch (e) {
    durum.apiHazir = false;
    durum.apiHata = e.message;
  }
  return durum.apiHazir;
}

module.exports = { owner, api, tx, durum, apiKontrol };
