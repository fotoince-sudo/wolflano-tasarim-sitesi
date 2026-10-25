import { sendMail, frame, esc, tl, SITE, smtpReady } from "../_shared/posta.ts";

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const s = (v: unknown, n: number) => String(v ?? '').slice(0, n).trim();
const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 && x < 10_000_000 ? Math.round(x * 100) / 100 : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

// Özel indirimler: süresiz, kampanya/adet indiriminden SONRA ayrıca uygulanır. Oranlar sunucuda sabit, istemciden gelen oran kullanılmaz.
const SPECIAL: Record<string, { label: string; rate: number }> = {
  sehit: { label: 'Şehit yakını (birinci derece)', rate: 0.20 },
  gazi: { label: 'Gazi veya gazi yakını (birinci derece)', rate: 0.20 },
  tsk: { label: 'Silahlı Kuvvetler, polis, jandarma (subay, astsubay dahil)', rate: 0.10 },
  yargi: { label: 'Hâkim veya savcı', rate: 0.10 },
  doktor: { label: 'Doktor', rate: 0.10 },
};
// Okul siparişi: her ücretli 100 adete 10 adet ücretsiz (ihtiyaç sahibi öğrenciler için)
const SCHOOL = { per: 100, free: 10 };

function makeCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  const r = crypto.getRandomValues(new Uint8Array(6));
  for (const b of r) c += a[b % a.length];
  return 'WLF-' + c;
}

function decodeImage(dataUrl: string): { bytes: Uint8Array; type: string; ext: string } | null {
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const bin = atob(m[3]);
  if (bin.length > 3_000_000) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2] };
}

// Takım listesi (isim/numara): her ürün için beden, isim ve numara. Yoksa alan hiç eklenmez.
const roster = (v: unknown) =>
  Array.isArray(v) && v.length
    ? v.slice(0, 999).map((y: any) => ({ s: s(y?.s, 10), n: s(y?.n, 30), k: s(y?.k, 4) }))
    : undefined;

/* ---- Sipariş e-postaları: müşteriye özet, Wolflano'ya (info@) bildirim. Hata olursa sipariş etkilenmez. ---- */
function itemRows(items: any[]) {
  return items.map((x) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eef1ee">${esc(x.n)}<br><span style="color:#6b746e;font-size:13px">${x.q} adet</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef1ee;white-space:nowrap">${tl(x.t)}</td></tr>`).join('');
}
function totalsRows(row: any) {
  const sp = row.special as any;
  return (sp ? `<tr><td style="padding:6px 0">Özel indirim (${esc(sp.label)})</td><td align="right">−${tl(sp.discount)}</td></tr>` : '') +
    `<tr><td style="padding:6px 0">Kargo</td><td align="right">${row.ship ? tl(row.ship) : 'Ücretsiz'}</td></tr>` +
    `<tr><td style="padding:8px 0;font-weight:bold;font-size:16px">Toplam</td><td align="right" style="font-weight:bold;font-size:16px">${tl(row.total)}</td></tr>`;
}
async function orderMails(row: any) {
  if (!smtpReady()) return;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:14px">${itemRows(row.items)}${totalsRows(row)}</table>`;
  const sp = row.special as any, sc = row.school as any;
  const notes = (sp ? `<p style="margin:0 0 10px;color:#6b746e;font-size:13px">Özel indirim belgen kontrol edildikten sonra siparişin hazırlanmaya başlar.</p>` : '') +
    (sc && sc.free ? `<p style="margin:0 0 10px;color:#6b746e;font-size:13px">Okul siparişi: ${sc.free} adet ücretsiz ürün ihtiyaç sahibi öğrenciler için eklenecek.</p>` : '');
  const cust = frame({
    title: 'Siparişini aldık',
    pre: `${row.code} numaralı siparişin alındı.`,
    body: `<p style="margin:0 0 12px">Merhaba ${esc(row.ad)},</p><p style="margin:0 0 12px">Wolflano'yu seçtiğin için teşekkürler. <b>${esc(row.code)}</b> numaralı siparişin elimize ulaştı. Siparişler 2-4 iş gününde kargoya verilir; kargoya verildiğinde takip numarasını ayrıca göndereceğiz.</p>${table}${notes}` +
      `<p style="margin:0 0 4px;color:#6b746e;font-size:13px">Teslimat adresi</p><p style="margin:0 0 12px">${esc(row.adres)}${row.ilce || row.il ? '<br>' + esc([row.ilce, row.il].filter(Boolean).join(' / ')) : ''}</p>` +
      `<p style="margin:0;color:#6b746e;font-size:13px">Sorun olursa bu e-postayı yanıtlaman ya da WhatsApp'tan yazman yeterli.</p>`,
    btn: { href: SITE, label: "Wolflano'ya dön" },
  });
  const adm = frame({
    title: 'Yeni sipariş: ' + row.code,
    pre: `${row.ad} · ${tl(row.total)}`,
    body: `<p style="margin:0 0 10px"><b>${esc(row.ad)}</b> · ${esc(row.tel)} · ${esc(row.mail)}<br>${esc(row.adres)} ${esc([row.ilce, row.il].filter(Boolean).join(' / '))}</p>${table}` +
      (sp ? `<p style="margin:0 0 8px;color:#b4232a"><b>Özel indirim belgesi kontrol bekliyor:</b> ${esc(sp.label)}</p>` : '') +
      (sc ? `<p style="margin:0 0 8px"><b>Okul:</b> ${esc(sc.name)} · ${sc.qty} adet${sc.free ? ' · +' + sc.free + ' ücretsiz' : ''}${sc.sizes ? ' · ' + esc(sc.sizes) : ''}</p>` : '') +
      (row.note ? `<p style="margin:0 0 8px"><b>Müşteri notu:</b> ${esc(row.note)}</p>` : ''),
    btn: { href: SITE + '#crm', label: 'Yönetimde aç' },
  });
  const res = await Promise.allSettled([
    sendMail({ to: row.mail, subject: `Siparişini aldık · ${row.code}`, html: cust, text: `Merhaba ${row.ad}, ${row.code} numaralı siparişin alındı. Toplam: ${tl(row.total)}. Wolflano` }),
    sendMail({ to: Deno.env.get('SMTP_USER')!, replyTo: row.mail, subject: `Yeni sipariş ${row.code} · ${row.ad} · ${tl(row.total)}`, html: adm, text: `Yeni sipariş ${row.code}: ${row.ad}, ${tl(row.total)}` }),
  ]);
  res.forEach((r) => { if (r.status === 'rejected') console.error('order mail', String((r as any).reason?.message || r.reason)); });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    if (body.website) return j({ ok: true, code: 'WLF-OK' }); // bot tuzağı

    const mail = s(body.mail, 200).toLowerCase();
    const ad = s(body.ad, 120);
    const tel = s(body.tel, 30);
    const adres = s(body.adres, 500);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || !ad || !/^05\d{9}$/.test(tel) || adres.length < 10) {
      return j({ error: 'invalid', message: 'Bilgiler eksik ya da hatalı.' }, 400);
    }
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
    if (!rawItems.length) return j({ error: 'empty', message: 'Sepet boş.' }, 400);
    const items = rawItems.map((x: any) => ({ id: s(x.id, 80), n: s(x.n, 200), q: Math.max(1, Math.min(999, Math.round(Number(x.q) || 1))), t: num(x.t), r: roster(x.r) }));
    const ship = num(body.ship);
    const itemsSum = r2(items.reduce((a: number, x: any) => a + x.t, 0));
    const qty = items.reduce((a: number, x: any) => a + x.q, 0);

    // Özel indirim (belge zorunlu)
    let special: Record<string, unknown> | null = null;
    let doc: ReturnType<typeof decodeImage> = null;
    const sp = body.special && SPECIAL[s(body.special.type, 20)];
    if (sp) {
      doc = decodeImage(String(body.special.document || ''));
      if (!doc) return j({ error: 'doc', message: 'Özel indirim için belge fotoğrafı gerekli.' }, 400);
      special = { type: s(body.special.type, 20), label: sp.label, rate: sp.rate, discount: r2(itemsSum * sp.rate) };
    }
    // Okul siparişi
    let school: Record<string, unknown> | null = null;
    if (body.school && s(body.school.name, 160)) {
      school = { name: s(body.school.name, 160), qty, free: Math.floor(qty / SCHOOL.per) * SCHOOL.free, sizes: s(body.school.sizes, 200) || null };
    }
    const subtotal = r2(itemsSum - (special ? (special.discount as number) : 0));
    const total = r2(subtotal + ship);

    // oturum varsa kullanıcıyı bul
    let uid: string | null = null;
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    if (tok && tok.split('.').length === 3) {
      const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
      if (ur.ok) uid = (await ur.json()).id || null;
    }

    const row: Record<string, unknown> = {
      code: makeCode(), user_id: uid, guest: !uid, ad, tel, mail, adres,
      il: s(body.il, 60), ilce: s(body.ilce, 60), items, subtotal, ship, total,
      note: s(body.note, 500) || null, special, school,
      doc_status: special ? 'bekliyor' : null,
    };
    for (let i = 0; i < 3; i++) {
      if (doc) {
        const path = `${row.code}.${doc.ext}`;
        const up = await fetch(`${SB_URL}/storage/v1/object/belgeler/${path}`, {
          method: 'POST',
          headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': doc.type, 'x-upsert': 'true' },
          body: doc.bytes,
        });
        if (!up.ok) { console.error('doc upload', up.status, (await up.text()).slice(0, 200)); return j({ error: 'doc', message: 'Belge yüklenemedi, tekrar dene.' }, 500); }
        row.doc_path = path;
      }
      const r = await fetch(`${SB_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      if (r.ok) {
        // E-postalar arka planda gider; müşteri sipariş onayını beklemez
        const p = orderMails(row).catch((e) => console.error('order mails', String(e)));
        try { (globalThis as any).EdgeRuntime?.waitUntil(p); } catch { /* yoksa sorun değil */ }
        return j({ ok: true, code: row.code, total });
      }
      const t = await r.text();
      if (/duplicate|unique/i.test(t)) { row.code = makeCode(); continue; }
      console.error('orders insert', r.status, t.slice(0, 300));
      break;
    }
    return j({ error: 'fail', message: 'Sipariş kaydedilemedi.' }, 500);
  } catch (e) {
    console.error('order-create', String(e));
    return j({ error: 'fail', message: 'Sipariş kaydedilemedi.' }, 500);
  }
});
