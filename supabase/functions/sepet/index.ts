// Bekleyen sepet kaydı: site, e-postası bilinen müşterinin sepetini buraya gönderir (üye ya da ödeme ekranında e-posta yazılmış).
// Sepet boşalınca kayıt "boş" olur; sipariş verilince order-create kaydı "sipariş verdi" yapar. Yönetim → Bekleyen sepetler.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const s = (v: unknown, n: number) => String(v ?? '').slice(0, n).trim();
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    let mail = s(b.mail, 200).toLowerCase(), member = false;
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    if (tok.split('.').length === 3) {
      const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
      if (ur.ok) { const u = await ur.json(); if (u.email) { mail = String(u.email).toLowerCase(); member = true; } }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return j({ error: 'mail' }, 400);
    const items = (Array.isArray(b.items) ? b.items.slice(0, 40) : []).map((x: any) => ({ n: s(x.n, 160), q: Math.max(0, Math.min(999, Math.round(Number(x.q) || 0))), t: Math.max(0, Math.round((Number(x.t) || 0) * 100) / 100), img: s(x.img, 300), id: s(x.id, 80) }));
    const total = Math.round(items.reduce((a: number, x: any) => a + x.t, 0) * 100) / 100;
    const row: Record<string, unknown> = { mail, items, total, member, status: items.length ? 'bekliyor' : 'boş', updated_at: new Date().toISOString() };
    if (s(b.ad, 120)) row.ad = s(b.ad, 120);
    if (/^05\d{9}$/.test(s(b.tel, 20))) row.tel = s(b.tel, 20);
    if (typeof b.izin === 'boolean') row.izin = b.izin;
    const r = await fetch(`${SB_URL}/rest/v1/carts?on_conflict=mail`, { method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) { console.error('carts', r.status, (await r.text()).slice(0, 200)); return j({ error: 'fail' }, 500); }
    return j({ ok: true });
  } catch (e) { console.error('sepet', String(e)); return j({ error: 'fail' }, 500); }
});
