// Uçtan uca deneme: yerel Postgres + çalışan sunucu (test/calistir.sh hazırlar).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const U = process.env.WF_URL || 'http://127.0.0.1:3999';
const KEY = 'sb_publishable_PP5xFd7ga61xaDOCHeET_Q_zfMaE_4G';
const owner = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'wolflano_usr', password: 'test', database: 'unpcpgdk_wolflano' });
await owner.connect();

let pass = 0;
const ok = (name) => { pass++; console.log('  ✓', name); };
async function req(path, o = {}) {
  const h = { apikey: KEY, ...(o.headers || {}) };
  if (o.token) h.Authorization = 'Bearer ' + o.token;
  if (o.prefer) h.Prefer = o.prefer;
  let body = o.body;
  if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string' && !(body instanceof Uint8Array)) { body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  const r = await fetch(U + path, { method: o.method || 'GET', headers: h, body, redirect: 'manual' });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { s: r.status, j, h: r.headers };
}
const pw = (p) => { const s = crypto.randomBytes(16); return 's1$' + s.toString('base64') + '$' + crypto.scryptSync(p, s, 64, { N: 16384, r: 8, p: 1 }).toString('base64'); };

// --- anonim ---
let r = await req('/rest/v1/site_content?select=data&id=eq.main');
assert.equal(r.s, 200); assert.ok(r.j[0].data.logo.startsWith(U + '/storage/v1/object/public/site/'), 'eski adres çevrildi'); ok('site içeriği herkese açık, eski Supabase adresleri yeni adrese çevrilmiş');
r = await req('/rest/v1/admin_kv?select=*'); assert.equal(r.s, 200); assert.deepEqual(r.j, []); ok('anonim yönetici verisini göremez');
r = await req('/rest/v1/wf_agenda?select=*'); assert.equal(r.s, 401); ok('anonim ajandaya erişemez');
r = await req('/rest/v1/orders?select=*'); assert.deepEqual(r.j, []); ok('anonim siparişleri göremez');
r = await req('/rest/v1/auth_users?select=*'); assert.equal(r.s, 404); ok('iç tablolar dışarı kapalı');
r = await req('/rest/v1/orders', { method: 'POST', body: { code: 'WLF-XXXXXX', mail: 'a@b.co' } }); assert.equal(r.s, 401); ok('anonim doğrudan sipariş yazamaz');
r = await req('/rest/v1/rpc/wf_reviews', { method: 'POST', body: {} }); assert.equal(r.s, 200); assert.equal(r.j.length, 1); assert.equal(r.j[0].ad, 'Ali'); ok('rpc wf_reviews: yalnız yayındaki yorum');
r = await req('/rest/v1/rpc/wf_hit', { method: 'POST', body: { p_keys: ['v', 'pv', 'p:ana'] } }); assert.equal(r.s, 204);
const st = await owner.query("select count(*)::int n from site_stats"); assert.equal(st.rows[0].n, 3); ok('rpc wf_hit istatistik yazar (yetkili fonksiyon, RLS\'i aşar)');
r = await req('/rest/v1/rpc/bz_take', { method: 'POST', body: { p_uid: crypto.randomUUID(), p_lim: 3 } }); assert.equal(r.s, 404); ok('kapalı fonksiyon (bz_take) dışarıdan çağrılamaz');
r = await req('/rest/v1/rpc/wf_mankenler', { method: 'POST', body: {} }); assert.deepEqual(r.j, ['img/manken-1.png']); ok('rpc wf_mankenler dosya listesinden okur');
r = await req('/rest/v1/rpc/is_wf_admin', { method: 'POST', body: {} }); assert.equal(r.j, false); ok('rpc is_wf_admin anonimde false');

// --- üyelik ---
r = await req('/auth/v1/signup', { method: 'POST', body: { email: 'Yeni@Ornek.com', password: 'gizli123', data: { name: 'Yeni Üye' } } });
assert.equal(r.s, 200); assert.ok(r.j.access_token); const yeni = r.j; ok('kayıt (e-posta ayarı yokken doğrudan oturum açar)');
r = await req('/auth/v1/signup', { method: 'POST', body: { email: 'yeni@ornek.com', password: 'baska123' } }); assert.deepEqual(r.j.identities, []); ok('aynı e-posta ikinci kez kaydolamaz');
r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'yeni@ornek.com', password: 'yanlis' } }); assert.equal(r.s, 400); assert.match(r.j.error_description, /Invalid login/); ok('yanlış şifre reddedilir');
r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'yeni@ornek.com', password: 'gizli123' } }); assert.equal(r.s, 200); const ut = r.j.access_token; ok('giriş');
r = await req('/auth/v1/user', { token: ut }); assert.equal(r.j.email, 'yeni@ornek.com'); assert.equal(r.j.user_metadata.name, 'Yeni Üye'); ok('kullanıcı bilgisi');
r = await req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: yeni.refresh_token } }); assert.equal(r.s, 200); assert.ok(r.j.access_token); ok('oturum yenileme');
r = await req('/rest/v1/profiles?select=*&id=eq.' + yeni.user.id, { token: ut }); assert.equal(r.j.length, 1); assert.equal(r.j[0].ad, 'Yeni Üye'); ok('yeni üyeye profil açıldı (tetikleyici)');
r = await req('/rest/v1/profiles?on_conflict=id', { method: 'POST', token: ut, prefer: 'resolution=merge-duplicates,return=representation', body: { id: yeni.user.id, tel: '05001112233', updated_at: new Date().toISOString() } });
assert.equal(r.s, 201); assert.equal(r.j[0].tel, '05001112233'); assert.equal(r.j[0].ad, 'Yeni Üye'); ok('profil upsert (merge-duplicates)');
r = await req('/rest/v1/profiles?select=*', { token: ut }); assert.equal(r.j.length, 1); ok('üye yalnız kendi profilini görür');
r = await req('/rest/v1/profiles?on_conflict=id', { method: 'POST', token: ut, prefer: 'resolution=merge-duplicates', body: { id: '554778a7-9d6a-49db-9c63-bd3f42a824e6', tel: '0' } }); assert.equal(r.s, 403); ok('başkasının profiline yazamaz');
r = await req('/rest/v1/admin_kv?select=*', { token: ut }); assert.deepEqual(r.j, []); ok('üye yönetici verisini göremez');
r = await req('/auth/v1/user', { method: 'PUT', token: ut, body: { password: 'yenisifre1' } }); assert.equal(r.s, 200);
r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'yeni@ornek.com', password: 'yenisifre1' } }); assert.equal(r.s, 200); ok('şifre değiştirme');
r = await req('/rest/v1/user_designs?on_conflict=user_id,sig', { method: 'POST', token: ut, prefer: 'resolution=merge-duplicates,return=minimal', body: { id: 'd1', user_id: yeni.user.id, sig: 's1', label: 'Tişört', data: { a: 1 } } });
assert.equal(r.s, 201); r = await req('/rest/v1/user_designs?select=id,sig,label&order=used_at.desc&limit=30', { token: ut }); assert.equal(r.j[0].label, 'Tişört'); ok('kayıtlı tasarım (user_designs upsert)');
r = await req('/rest/v1/rpc/wf_request_design_support', { method: 'POST', body: { p_design_id: 'd1', p_step: 'photo', p_request: 'x' } }); assert.equal(r.s, 404); ok('yalnız üyelere açık fonksiyon anonime kapalı');

// --- yönetici ---
await owner.query("update auth_users set encrypted_password = $1 where email = 'sahip@ornek.com'", [pw('sahip123')]);
r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'sahip@ornek.com', password: 'sahip123' } }); assert.equal(r.s, 200); const at = r.j.access_token; ok('Supabase\'den taşınan hesapla giriş (şifre belirlendikten sonra)');
r = await req('/rest/v1/rpc/is_wf_admin', { method: 'POST', token: at, body: {} }); assert.equal(r.j, true); ok('sahip yönetici');
r = await req('/rest/v1/admin_kv?on_conflict=id', { method: 'POST', token: at, prefer: 'resolution=merge-duplicates,return=minimal', body: { id: 'manken', data: { x: [1, 2] } } }); assert.equal(r.s, 201);
r = await req('/rest/v1/admin_kv?select=data&id=eq.manken', { token: at, headers: { Accept: 'application/vnd.pgrst.object+json' } }); assert.deepEqual(r.j, { data: { x: [1, 2] } }); ok('yönetici admin_kv yazar/okur, tekil nesne (Accept object)');
r = await req('/rest/v1/admin_designs', { method: 'POST', token: at, prefer: 'return=representation', body: { title: 'Kurt', kind: 'sablon', published: true, data: { code: 'W001' } } });
assert.equal(r.s, 201); assert.equal(r.j[0].created_by, 'sahip@ornek.com'); const did = r.j[0].id; ok('yönetici tasarım ekler, created_by oturumdan dolar');
r = await req('/rest/v1/admin_designs?select=id,title,code:data->>code,kind&kind=eq.sablon&published=eq.true&order=created_at.desc&limit=500');
assert.equal(r.j.length, 1); assert.equal(r.j[0].code, 'W001'); ok('anonim yayındaki şablonu görür, json yolu takma adla');
r = await req('/rest/v1/admin_designs?id=eq.' + did, { method: 'PATCH', token: at, prefer: 'return=minimal', body: { published: false } }); assert.equal(r.s, 204);
r = await req('/rest/v1/admin_designs?select=id&kind=eq.sablon&published=eq.true'); assert.equal(r.j.length, 0); ok('PATCH ile güncelleme');
r = await req('/rest/v1/admin_designs?select=id&or=(kind.eq.urun,and(kind.eq.sablon,published.is.false))&id=in.(' + did + ')', { token: at, prefer: 'count=exact' });
assert.equal(r.j.length, 1); assert.equal(r.h.get('content-range'), '0-0/1'); ok('or/and/in/is filtreleri ve sayım');
r = await req('/rest/v1/crm_customers?select=*&order=last_order_at.desc.nullslast&limit=500', { token: at }); assert.equal(r.s, 200); ok('sıralama nullslast');
r = await req('/rest/v1/admin_designs?id=eq.' + did, { method: 'DELETE', token: at, prefer: 'return=minimal' }); assert.equal(r.s, 204);
r = await req('/rest/v1/admin_designs?select=id', { token: at }); assert.equal(r.j.length, 0); ok('silme');
r = await req('/rest/v1/wf_staff', { method: 'POST', token: at, prefer: 'resolution=merge-duplicates,return=minimal', body: { email: 'yeni@ornek.com', name: 'Yardımcı' } }); assert.equal(r.s, 201);
r = await req('/rest/v1/rpc/is_wf_admin', { method: 'POST', token: ut, body: {} }); assert.equal(r.j, true); ok('personel eklenince yönetici olur (wf_staff)');
r = await req('/rest/v1/wf_kasa?select=*', { token: ut }); assert.deepEqual(r.j, []); ok('personel Kasa\'yı göremez (yalnız sahip)');
await req('/rest/v1/wf_staff?email=eq.yeni%40ornek.com', { method: 'DELETE', token: at });
r = await req('/rest/v1/rpc/is_wf_admin', { method: 'POST', token: ut, body: {} }); assert.equal(r.j, false); ok('personel çıkarılınca yetki gider');

// --- dosyalar ---
const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' }), 'x.png');
r = await req('/storage/v1/object/site/img/deneme.png', { method: 'POST', token: at, headers: { 'x-upsert': 'true' }, body: fd }); assert.equal(r.s, 200, JSON.stringify(r.j)); ok('yönetici siteye dosya yükler (form)');
let g = await fetch(U + '/storage/v1/object/public/site/img/deneme.png'); assert.equal(g.status, 200); assert.equal(g.headers.get('content-type'), 'image/png'); assert.equal((await g.arrayBuffer()).byteLength, 7); ok('herkes dosyayı açar');
g = await fetch(U + '/storage/v1/object/public/site/img/deneme.png', { headers: { Range: 'bytes=2-4' } }); assert.equal(g.status, 206); assert.equal((await g.arrayBuffer()).byteLength, 3); ok('parça indirme (video için)');
r = await req('/storage/v1/object/site/img/x.png', { method: 'POST', token: ut, headers: { 'x-upsert': 'true' }, body: fd }); assert.equal(r.s, 403); ok('üye siteye dosya yükleyemez');
r = await req('/storage/v1/object/list/site', { method: 'POST', token: at, body: { prefix: 'img', limit: 200, sortBy: { column: 'name', order: 'asc' } } }); assert.deepEqual(r.j.map((x) => x.name), ['deneme.png', 'logo.png', 'manken-1.png']); ok('listeleme');
r = await req('/storage/v1/object/site', { method: 'DELETE', token: at, body: { prefixes: ['img/deneme.png'] } }); assert.equal(r.j.length, 1);
g = await fetch(U + '/storage/v1/object/public/site/img/deneme.png'); assert.equal(g.status, 400); ok('dosya silme');
r = await req(`/storage/v1/object/designs/${yeni.user.id}/t1.png`, { method: 'POST', token: ut, headers: { 'Content-Type': 'image/png' }, body: new Uint8Array([1, 2, 3, 4]) }); assert.equal(r.s, 200); ok('üye kendi klasörüne tasarım yükler');
r = await req('/storage/v1/object/designs/baskasi/t1.png', { method: 'POST', token: ut, headers: { 'Content-Type': 'image/png' }, body: new Uint8Array([1]) }); assert.equal(r.s, 403); ok('başkasının klasörüne yükleyemez');
r = await req(`/storage/v1/object/sign/designs/${yeni.user.id}/t1.png`, { method: 'POST', token: at, body: { expiresIn: 600 } }); assert.ok(r.j.signedURL);
g = await fetch(U + '/storage/v1' + r.j.signedURL); assert.equal(g.status, 200); assert.equal((await g.arrayBuffer()).byteLength, 4); ok('yönetici imzalı bağlantıyla özel dosyayı açar');
g = await fetch(U + `/storage/v1/object/public/designs/${yeni.user.id}/t1.png`); assert.equal(g.status, 400); ok('özel kova herkese açık değil');
r = await req(`/storage/v1/object/authenticated/designs/${yeni.user.id}/t1.png`, { token: ut }); assert.equal(r.s, 200); ok('üye kendi dosyasını okur');

// --- sunucu fonksiyonları ---
const cartKey = crypto.randomBytes(32).toString('hex');
r = await req('/functions/v1/sepet', { method: 'POST', headers: { 'x-wf-cart-key': cartKey }, body: { mail: 'misafir@ornek.com', items: [{ n: 'Tişört', q: 1, t: 750, id: 'p1' }] } }); assert.equal(r.s, 200, JSON.stringify(r.j)); ok('sepet fonksiyonu (bekleyen sepet)');
const order = { mail: 'misafir@ornek.com', ad: 'Misafir Müşteri', tel: '05001112233', adres: 'Örnek Mah. 1. Sokak No 2', il: 'İzmir', ilce: 'Konak', items: [{ id: 'p1~M', q: 1 }], total: 850, onay: { kvkk: true, sozlesme: true } };
r = await req('/functions/v1/order-create', { method: 'POST', headers: { 'x-wf-cart-key': cartKey }, body: order }); assert.equal(r.s, 200, JSON.stringify(r.j)); assert.match(r.j.code, /^WLF-/); ok('sipariş oluşturma: fiyat sunucuda doğrulandı ' + r.j.code);
r = await req('/rest/v1/orders?select=code,total,status&order=created_at.desc&limit=200', { token: at }); assert.equal(r.j.length, 1); assert.equal(+r.j[0].total, 850); ok('yönetici siparişi görür');
r = await req('/rest/v1/crm_customers?select=email,order_count', { token: at }); assert.equal(r.j[0].order_count, 1); ok('CRM müşterisi otomatik açıldı (tetikleyici)');
r = await req('/rest/v1/carts?select=status', { token: at }); assert.equal(r.j[0].status, 'sipariş verdi'); ok('bekleyen sepet "sipariş verdi" oldu');
r = await req('/functions/v1/order-create', { method: 'POST', headers: { 'x-wf-cart-key': cartKey }, body: { ...order, total: 10 } }); assert.equal(r.s, 409); ok('yanlış tutarla sipariş reddedilir');
r = await req('/functions/v1/kur', { method: 'POST', body: {} }); assert.equal(r.s, 401); ok('oturum isteyen fonksiyon anahtarsız reddedilir');
r = await req('/functions/v1/kur', { method: 'POST', token: ut, body: {} }); assert.equal(r.s, 403); ok('kur: yönetici olmayan reddedilir (fonksiyon içinden rpc çalışıyor)');
r = await req('/functions/v1/yok', { method: 'POST' }); assert.equal(r.s, 404); ok('olmayan fonksiyon 404');

// --- eski Supabase oturumu ---
r = await req('/rest/v1/profiles?select=*', { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc' }); assert.equal(r.s, 401); ok('geçersiz/eski oturum anahtarı 401');

console.log(`\n${pass} deneme geçti`);
await owner.end();
