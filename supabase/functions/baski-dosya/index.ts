// Sipariş baskı dosyaları: müşteri siparişi verdikten hemen sonra stüdyo her tasarımın baskı dosyasını (300 dpi PNG) buraya gönderir.
// Dosya özel "designs" deposuna siparis/<sipariş no>/ altına kaydedilir; yalnız yönetici görür (Yönetim → Siparişler → Baskı dosyaları).
// Güvenlik: order-create her siparişe bir imza (HMAC) verir; imzası tutmayan ya da 3 saatten eski siparişe dosya eklenemez.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sig(code: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SRK), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('baski:' + code)));
  return Array.from(b.slice(0, 16)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const fd = await req.formData();
    const code = String(fd.get('code') || '');
    if (!/^WLF-[A-Z0-9]{6}$/.test(code)) return j({ error: 'bad' }, 400);
    if (String(fd.get('sig') || '') !== await sig(code)) return j({ error: 'sig' }, 403);
    const i = Math.max(1, Math.min(40, Number(fd.get('i')) || 1));
    const side = String(fd.get('side') || '').replace(/[^a-z0-9]/g, '').slice(0, 10) || 'on';
    const file = fd.get('file');
    if (!(file instanceof File) || file.size < 100 || file.size > 45_000_000 || !/png/.test(file.type)) return j({ error: 'file' }, 400);
    // sipariş var mı ve yeni mi
    const or = await fetch(`${SB_URL}/rest/v1/orders?select=created_at&code=eq.${code}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
    const rows = or.ok ? await or.json() : [];
    if (!rows.length || Date.now() - new Date(rows[0].created_at).getTime() > 3 * 3600e3) return j({ error: 'order' }, 404);
    const base = `siparis/${code}/${String(i).padStart(2, '0')}-${side}`;
    const put = (path: string, body: BodyInit, type: string) => fetch(`${SB_URL}/storage/v1/object/designs/${path}`, {
      method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': type, 'x-upsert': 'true' }, body,
    });
    const up = await put(base + '.png', file, 'image/png');
    if (!up.ok) { console.error('baski upload', up.status, (await up.text()).slice(0, 200)); return j({ error: 'upload' }, 500); }
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(String(fd.get('meta') || '{}')); } catch { meta = {}; }
    const m = { urun: String(meta.urun || '').slice(0, 120), yuz: String(meta.yuz || '').slice(0, 30), alan: String(meta.alan || '').slice(0, 60), cm: String(meta.cm || '').slice(0, 40), dpi: Number(meta.dpi) || 0, renk: String(meta.renk || '').slice(0, 60), bedenler: String(meta.bedenler || '').slice(0, 200), adet: Number(meta.adet) || 0, renkler: String(meta.renkler || '').slice(0, 300) };
    await put(base + '.json', JSON.stringify(m), 'application/json');
    return j({ ok: true });
  } catch (e) {
    console.error('baski-dosya', String(e));
    return j({ error: 'fail' }, 500);
  }
});
