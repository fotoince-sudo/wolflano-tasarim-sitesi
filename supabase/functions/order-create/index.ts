import { sendMail, frame, esc, tl, SITE, smtpReady } from "../_shared/posta.ts";

import { CheckoutError, quoteItems, shipping, requireConsent } from "../_shared/checkout.ts";
import { cartOwner } from "../_shared/request-security.ts";

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wf-cart-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const s = (v: unknown, n: number) => String(v ?? '').slice(0, n).trim();
const r2 = (x: number) => Math.round(x * 100) / 100;

// Postgres JSONB can return object keys in a different order. Preserve array order.
function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
      : item
  );
}

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

// Baskı dosyası imzası: müşteri bu imzayla siparişine baskı dosyalarını yükler (sunucu: baski-dosya)
async function baskiSig(code: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SRK), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('baski:' + code)));
  return Array.from(b.slice(0, 16)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

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
  return items.map((x) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eef1ee">${esc(x.n)}${x.itemNote ? "<br>" + esc(x.itemNote) : ""}<br><span style="color:#6b746e;font-size:13px">${x.q} adet</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef1ee;white-space:nowrap">${x.pricePending ? "Fiyat belirlenecek" : tl(x.t)}</td></tr>`).join('');
}
function totalsRows(row: any) {
  const sp = row.special as any, pricePending = row.items.some((x: any) => x.pricePending);
  return (sp ? `<tr><td style="padding:6px 0">Özel indirim (${esc(sp.label)})</td><td align="right">−${tl(sp.discount)}</td></tr>` : '') +
    `<tr><td style="padding:6px 0">Kargo</td><td align="right">${row.ship ? tl(row.ship) : 'Ücretsiz'}</td></tr>` +
    `<tr><td style="padding:8px 0;font-weight:bold;font-size:16px">Toplam</td><td align="right" style="font-weight:bold;font-size:16px"> ${pricePending ? (row.total ? tl(row.total) + ' + fiyatı belirlenecek kalemler' : 'Fiyat belirlenecek') : tl(row.total)}</td></tr>`;
}
async function orderMails(row: any) {
  if (!smtpReady()) return;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:14px">${itemRows(row.items)}${totalsRows(row)}</table>`;
  const sp = row.special as any, sc = row.school as any;
  const wholesale = row.onay?.delivery === 'toptan';
  const notes = (sp ? `<p style="margin:0 0 10px;color:#6b746e;font-size:13px">Özel indirim belgen kontrol edildikten sonra siparişin hazırlanmaya başlar.</p>` : '') +
    (sc && sc.free ? `<p style="margin:0 0 10px;color:#6b746e;font-size:13px">Okul siparişi: ${sc.free} adet ücretsiz ürün ihtiyaç sahibi öğrenciler için eklenecek.</p>` : '');
  const legal = `<p style="margin:14px 0 0;color:#6b746e;font-size:12px">Siparişini onaylarken kabul ettiğin <a href="${SITE}#mesafeli">Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi</a>, <a href="${SITE}#iade">Cayma ve İade Koşulları</a> ve <a href="${SITE}#kvkk">KVKK Aydınlatma Metni</a> bu bağlantılarda; bu e-posta sözleşmenin bir örneğidir. Kişiye özel baskılı ürünlerde yasa gereği cayma hakkı yoktur.</p>`;
  const cust = frame({
    title: wholesale ? 'Toptan sipariş talebini aldık' : 'Siparişini aldık',
    pre: `${row.code} numaralı siparişin alındı.`,
    body: `<p style="margin:0 0 12px">Merhaba ${esc(row.ad)},</p><p style="margin:0 0 12px">Wolflano'yu seçtiğin için teşekkürler. <b>${esc(row.code)}</b> numaralı siparişin elimize ulaştı. ${wholesale ? 'Toptan sipariş talebin için seninle iletişime geçeceğiz.' : 'Siparişler 2-4 iş gününde kargoya verilir; kargoya verildiğinde takip numarasını ayrıca göndereceğiz.'}</p>${table}${notes}` +
      `<p style="margin:0 0 4px;color:#6b746e;font-size:13px">Teslimat adresi</p><p style="margin:0 0 12px">${esc(row.adres)}${row.ilce || row.il ? '<br>' + esc([row.ilce, row.il].filter(Boolean).join(' / ')) : ''}</p>` +
      `<p style="margin:0;color:#6b746e;font-size:13px">Sorun olursa bu e-postayı yanıtlaman ya da WhatsApp'tan yazman yeterli.</p>` + legal,
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
  if (req.method !== 'POST') return j({ error: 'method' }, 405);
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return j({ error: 'invalid' }, 400);
    if (body.website) return j({ ok: true, code: 'WLF-OK' }); // bot tuzağı

    requireConsent(body);
    const mail = s(body.mail, 200).toLowerCase();
    const ad = s(body.ad, 120);
    const tel = s(body.tel, 30);
    const adres = s(body.adres, 500);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || !ad || !/^05\d{9}$/.test(tel) || adres.length < 10) {
      return j({ error: 'invalid', message: 'Bilgiler eksik ya da hatalı.' }, 400);
    }
    // Verify identity before pricing wholesale or assigning cart ownership.
    let uid: string | null = null;
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    if (tok) {
      const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
      if (!ur.ok) return j({ error: 'auth', message: 'Oturumunu yenileyip tekrar dene.' }, 401);
      uid = (await ur.json()).id || null;
      if (!uid) return j({ error: 'auth' }, 401);
    }
    const owner = await cartOwner(req, uid);
    if (!owner) return j({ error: 'cart_owner', message: 'Sepet kimliği eksik; sayfayı yenile.' }, 400);
    const headers = { apikey: SRK, Authorization: `Bearer ${SRK}` };
    const cr = await fetch(`${SB_URL}/rest/v1/site_content?select=data&id=eq.main`, { headers });
    if (!cr.ok) throw new CheckoutError('Fiyatlar şu an doğrulanamıyor.', 503);
    const catalog = (await cr.json())[0]?.data;
    if (!catalog) throw new CheckoutError('Fiyatlar şu an doğrulanamıyor.', 503);
    let wholesale = null;
    if (Array.isArray(body.items) && body.items.some((x: any) => x?.id === 'toptan')) {
      if (!uid) throw new CheckoutError('Toptan sipariş için giriş gerekli.', 403);
      const ar = await fetch(`${SB_URL}/rest/v1/toptan_basvuru?select=status&user_id=eq.${encodeURIComponent(uid)}`, { headers });
      if (!ar.ok || (await ar.json())[0]?.status !== 'onaylandı') throw new CheckoutError('Onaylı firma girişi gerekli.', 403);
      const wr = await fetch(`${SB_URL}/rest/v1/toptan_ayar?select=data&id=eq.main`, { headers });
      if (!wr.ok) throw new CheckoutError('Toptan fiyatları okunamadı.', 503);
      wholesale = (await wr.json())[0]?.data;
    }
    const priced = quoteItems(catalog, body.items, wholesale);
    const items = priced.items.map((x: any) => ({ ...x, r: roster(x.r) }));
    if (priced.pricePending && body.wholesaleRequest !== true) {
      throw new CheckoutError('Fiyatı belirlenecek ürünler için toptan sipariş talebi gönder.', 409);
    }
    const itemsSum = priced.sum, qty = priced.qty;
    const ship = shipping(catalog, itemsSum, body.delivery, priced.wholesale);

    // Özel indirim (belge zorunlu)
    let special: Record<string, unknown> | null = null;
    let doc: ReturnType<typeof decodeImage> = null;
    const spKey = s(body.special?.type, 20);
    const sp = body.special && Object.hasOwn(SPECIAL, spKey) ? SPECIAL[spKey] : null;
    if (body.special && !sp) throw new CheckoutError('Özel indirim türü geçersiz.');
    if (sp && priced.wholesale) throw new CheckoutError('Toptanda özel indirim birleştirilemez.');
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
    // Reject a stale quote before any write; don't silently charge a different amount.
    if (typeof body.total !== 'number' || !Number.isFinite(body.total) || r2(body.total) !== total) {
      return j({
        error: 'price_changed',
        message: 'Fiyatlar güncellendi; yeni tutarı onayla.',
        total,
        ship,
        discount: special?.discount,
        items: items.map((item, i) => ({ id: item.id, n: item.n, q: item.q, t: item.t, unit: priced.studioUnits[i] })),
      }, 409);
    }

    const row: Record<string, unknown> = {
      code: makeCode(), checkout_owner: owner, user_id: uid, guest: !uid, ad, tel, mail, adres,
      il: s(body.il, 60), ilce: s(body.ilce, 60), items, subtotal, ship, total,
      note: s(body.note, 500) || null, special, school,
      doc_status: special ? 'bekliyor' : null,
      // KVKK ve sözleşme onayı (ödeme ekranında işaretlenen kutular), zaman ve IP ile
      onay: { kvkk: true, sozlesme: true, izin: body.onay.izin === true, delivery: priced.wholesale ? 'toptan' : body.delivery || 'kargo', at: new Date().toISOString(), ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60) },
    };
    // Çift gönderim: aynı kişi 3 dakika içinde aynı tutarda aynı ürünlerle tekrar gönderirse yeni sipariş açılmaz, ilki döner
    try {
      const since = new Date(Date.now() - 180e3).toISOString();
      const dr = await fetch(`${SB_URL}/rest/v1/orders?select=code,items,adres,il,ilce,special,onay&checkout_owner=eq.${encodeURIComponent(owner)}&mail=eq.${encodeURIComponent(mail)}&total=eq.${total}&created_at=gte.${since}&order=created_at.desc&limit=5`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
      if (dr.ok) {
        const sig = stableJson(items);
        const hit = ((await dr.json()) as any[]).find((o) => stableJson(o.items || []) === sig && o.adres === adres && o.il === row.il && o.ilce === row.ilce && stableJson(o.special) === stableJson(special) && o.onay?.delivery === (row.onay as any).delivery);
        if (hit) return j({ ok: true, code: hit.code, items, subtotal, ship, total, special, studioUnits: priced.studioUnits, up: await baskiSig(String(hit.code)), dup: true });
      }
    } catch { /* kontrol edilemezse normal devam */ }
    for (let i = 0; i < 3; i++) {
      if (doc) {
        const path = `${row.code}.${doc.ext}`;
        const up = await fetch(`${SB_URL}/storage/v1/object/belgeler/${path}`, {
          method: 'POST',
          headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': doc.type, 'x-upsert': 'true' },
          body: new Blob([new Uint8Array(doc.bytes)], { type: doc.type }),
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
        // bekleyen sepet: sipariş verdi
        try { await fetch(`${SB_URL}/rest/v1/carts?owner_key=eq.${encodeURIComponent(owner)}`, { method: 'PATCH', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'sipariş verdi', updated_at: new Date().toISOString() }) }); } catch { /* yoksa sorun değil */ }
        return j({ ok: true, code: row.code, items, subtotal, ship, total, special, studioUnits: priced.studioUnits, up: await baskiSig(String(row.code)) });
      }
      const t = await r.text();
      if (/duplicate|unique/i.test(t)) { row.code = makeCode(); continue; }
      console.error('orders insert', r.status, t.slice(0, 300));
      break;
    }
    return j({ error: 'fail', message: 'Sipariş kaydedilemedi.' }, 500);
  } catch (e) {
    if (e instanceof CheckoutError) return j({ error: 'validation', message: e.message }, e.status);
    if (e instanceof SyntaxError) return j({ error: 'invalid' }, 400);
    console.error('order-create', String(e));
    return j({ error: 'fail', message: 'Sipariş kaydedilemedi.' }, 500);
  }
});
