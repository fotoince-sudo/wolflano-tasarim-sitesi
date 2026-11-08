// Toptan başvurusu: üye firma; unvan, vergi no (10 hane VKN ya da şahıs şirketinde 11 hane TCKN), vergi dairesi ve vergi levhası belgesi.
// Belge özel "belgeler" deposuna (toptan/<kullanıcı>) yazılır, başvuru "bekliyor" olur; yönetici onaylayınca toptan fiyatlar açılır.
import { sendMail, smtpReady, esc } from "../_shared/posta.ts";
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const s = (v: unknown, n: number) => String(v ?? '').slice(0, n).trim();
function vknOk(v: string) { // GİB vergi kimlik no algoritması
  if (!/^\d{10}$/.test(v)) return false;
  const d = v.split('').map(Number); let sum = 0;
  for (let i = 0; i < 9; i++) { const t = (d[i] + 9 - i) % 10; let p = (t * Math.pow(2, 9 - i)) % 9; if (t !== 0 && p === 0) p = 9; sum += p; }
  return (10 - (sum % 10)) % 10 === d[9];
}
function tcknOk(v: string) {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = v.split('').map(Number), o = d[0] + d[2] + d[4] + d[6] + d[8], e = d[1] + d[3] + d[5] + d[7];
  return ((o * 7 - e) % 10 + 10) % 10 === d[9] && d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
    if (!ur.ok) return j({ error: 'auth', message: 'Önce üye girişi yap.' }, 401);
    const u = await ur.json();
    const fd = await req.formData();
    const firma = s(fd.get('firma'), 200), vkn = s(fd.get('vkn'), 11).replace(/\D/g, ''), vd = s(fd.get('vd'), 80);
    if (firma.length < 3 || !vd) return j({ error: 'bad', message: 'Firma unvanı ve vergi dairesi gerekli.' }, 400);
    if (!(vknOk(vkn) || tcknOk(vkn))) return j({ error: 'vkn', message: 'Vergi numarası geçersiz (10 haneli vergi no ya da şahıs şirketinde 11 haneli T.C. kimlik no).' }, 400);
    if (fd.get('kvkk') !== '1') return j({ error: 'kvkk', message: 'KVKK onayı gerekli.' }, 400);
    const f = fd.get('levha');
    if (!(f instanceof File) || f.size < 1000 || f.size > 12_000_000 || !/^(image\/|application\/pdf)/.test(f.type)) return j({ error: 'levha', message: 'Vergi levhasının fotoğrafını ya da PDF\'ini ekle (en çok 12 MB).' }, 400);
    const ext = f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `toptan/${u.id}.${ext}`;
    const up = await fetch(`${SB_URL}/storage/v1/object/belgeler/${path}`, { method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': f.type, 'x-upsert': 'true' }, body: f });
    if (!up.ok) return j({ error: 'upload', message: 'Belge yüklenemedi, tekrar dene.' }, 500);
    const tel = s(fd.get('tel'), 20);
    const row = { user_id: u.id, mail: String(u.email || '').toLowerCase(), firma, vkn, vergi_dairesi: vd, yetkili: s(fd.get('yetkili'), 120), tel: /^05\d{9}$/.test(tel) ? tel : '', il: s(fd.get('il'), 60), adres: s(fd.get('adres'), 400), faaliyet: s(fd.get('faaliyet'), 160), notu: s(fd.get('notu'), 500), levha_path: path, status: 'bekliyor', created_at: new Date().toISOString(), decided_at: null };
    const r = await fetch(`${SB_URL}/rest/v1/toptan_basvuru?on_conflict=user_id`, { method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) { console.error('toptan', r.status, (await r.text()).slice(0, 200)); return j({ error: 'fail', message: 'Başvuru kaydedilemedi.' }, 500); }
    if (smtpReady()) {
      const p = sendMail({ to: Deno.env.get('SMTP_USER')!, replyTo: row.mail, subject: `Yeni toptan başvurusu · ${firma}`, html: `<p><b>${esc(firma)}</b> toptan başvurusu yaptı.</p><p>Vergi no: ${vkn} · ${esc(vd)}<br>${esc(row.yetkili)} · ${row.tel} · ${esc(row.mail)}</p><p>Yönetim → Siparişler ve müşteriler → Toptan sekmesinden onaylayabilirsin.</p>`, text: `${firma} toptan başvurusu yaptı. Vergi no ${vkn}. Yönetimden onaylayabilirsin.` }).catch(() => {});
      try { (globalThis as any).EdgeRuntime?.waitUntil(p); } catch { /* */ }
    }
    return j({ ok: true });
  } catch (e) { console.error('toptan-basvuru', String(e)); return j({ error: 'fail', message: 'Başvuru kaydedilemedi.' }, 500); }
});
