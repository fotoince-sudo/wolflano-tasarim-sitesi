const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const STY: Record<string, string> = {
  tisort: 'premium streetwear T-shirt graphic: dramatic, highly detailed realistic digital illustration (not a photo), cinematic lighting, rich texture, ink-splash and dry-brush edges that fade out softly, strong silhouette, cohesive limited color palette, bold modern composition like a high-end apparel brand print',
  real: 'photorealistic, natural light, premium photography look',
  cartoon: 'fun hand-drawn caricature, slightly exaggerated features, bold clean outlines, vivid flat colors',
  pencil: 'detailed hand-drawn graphite pencil portrait sketch, fine hatching and shading, high contrast, monochrome',
  illus: 'premium editorial vector illustration, flat shapes, refined color palette, clean lines',
  canvas: 'classic oil painting, visible thick brush strokes, rich warm colors, gallery quality',
};

async function rpc(fn: string, args: unknown) {
  return await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

function dataUrlToBlob(u: string): Blob | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(u);
  if (!m) return null;
  const bin = atob(m[2]);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: m[1] });
}

/* Tişört rengi: ad ve açık/koyu bilgisi, tasarımın renklerini buna göre seçmesi için */
function shirtHint(name: string, hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  let dark: boolean | null = null;
  if (m) {
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }
  const nm = name ? `${name} (${hex || 'unknown hex'})` : (hex || '');
  if (!nm) return '';
  const tone = dark === null ? '' : dark
    ? 'The shirt is dark: use luminous, light and mid tones with bright highlights so the artwork glows on the dark fabric; avoid large black areas that would disappear into the shirt.'
    : 'The shirt is light: use deep, rich dark tones and strong shadows so the artwork stands out on the light fabric; avoid large white or very pale areas that would disappear into the shirt.';
  return `This artwork will be printed on a ${nm} T-shirt. Choose a color palette that harmonizes with that shirt color and gives strong contrast against it. ${tone} Never paint a background in the shirt color; the shirt fabric itself is the background.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let uid = '';
  let taken = false;
  try {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return j({ error: 'not_configured', message: 'Tasarım servisi henüz etkinleştirilmedi.' }, 503);

    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
    if (!ur.ok) return j({ error: 'auth', message: 'Önce üye girişi yapmalısın.' }, 401);
    const uj = await ur.json();
    uid = uj.id;
    const em = String(uj.email || '').toLowerCase();
    let isAdm = em === 'ergunince68@hotmail.com';
    if (!isAdm && em) {
      const sr = await fetch(`${SB_URL}/rest/v1/wf_staff?select=email&email=eq.${encodeURIComponent(em)}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
      if (sr.ok) { const sj = await sr.json(); isAdm = Array.isArray(sj) && sj.length > 0; }
    }

    const body = await req.json();
    const idea = String(body.prompt || '').slice(0, 500).trim();
    const style = STY[body.style] ? body.style : 'illus';
    const orient = body.orient === 'landscape' ? 'landscape' : 'portrait';
    const size = orient === 'landscape' ? '1536x1024' : '1024x1536';
    const transparent = body.transparent !== false;
    const shirt = shirtHint(String(body.shirt || '').slice(0, 40), String(body.shirtHex || '').slice(0, 7));
    const img = typeof body.image === 'string' && body.image ? dataUrlToBlob(body.image) : null;
    if (!idea && !img) return j({ error: 'empty', message: 'Ne tasarlayalım? Bir cümle yaz ya da fotoğraf ekle.' }, 400);
    if (img && img.size > 6_000_000) return j({ error: 'big', message: 'Fotoğraf çok büyük.' }, 400);

    if (!isAdm) {
      const lim = 3; // müşteri günlük deneme hakkı (faaliyete geçince artırılacak)
      const rr = await rpc('bz_take', { p_uid: uid, p_lim: lim });
      if ((await rr.json()) !== true) {
        return j({ error: 'limit', message: 'Bugünkü tasarım hakkın doldu. Yarın yeniden dene.' }, 429);
      }
      taken = true;
    }

    const parts: string[] = [];
    parts.push('Print-ready artwork for a garment / mug print.');
    if (img) {
      parts.push(`Redraw the person in the attached photo in this style: ${STY[style]}.`);
      parts.push("Keep the person's identity clearly recognizable: same face shape, eyes, nose, mouth, skin tone, age, expression and head shape. Keep the exact hairline and hair amount (if the person is bald, keep them bald; do not add hair or a beard that is not there).");
      parts.push('Head-and-shoulders composition, centered. Draw the clothing plain and simple; do NOT copy any logo, letters, numbers or print from the clothes or the background of the photo.');
    } else {
      parts.push(`Style: ${STY[style]}.`);
    }
    if (idea) parts.push(`The customer's request (this is an instruction describing what to draw, NOT text to write on the artwork): ${idea}`);
    if (shirt) parts.push(shirt);
    parts.push('Do not add any text, letters, words or captions, unless the request contains words inside quotation marks; only then write exactly those quoted words, spelled correctly (including Turkish letters such as ç, ğ, ı, İ, ö, ş, ü).');
    parts.push('Do not draw any brand logo. Do not draw a T-shirt or mockup; draw only the artwork itself.');
    parts.push(transparent
      ? 'Isolated artwork on a fully transparent background. No background color, no card, no frame, no border, no vignette, no mockup, no watermark.'
      : 'Clean plain background. No frame, no mockup, no watermark.');
    const prompt = parts.join(' ');

    // OpenAI model adları zamanla değişiyor (gpt-image-1 kaldırıldı): sırayla dene, olmayan modeli atla
    const envModel = Deno.env.get('OPENAI_IMAGE_MODEL') || '';
    const models = [envModel, img ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare', img ? 'gpt-image-2.5-flare' : 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']
      .filter((m, i, a) => m && a.indexOf(m) === i);
    let mi = 0;
    // Yönetici şablon ve ürün için yüksek kalite; müşteriler orta kalite
    const quality = isAdm ? (Deno.env.get('OPENAI_IMAGE_QUALITY_ADMIN') || 'high') : (Deno.env.get('OPENAI_IMAGE_QUALITY') || 'medium');

    async function call(fid: boolean, bg: boolean) {
      const fmt = bg ? 'png' : 'jpeg';
      if (img) {
        const fd = new FormData();
        fd.append('model', models[mi]);
        fd.append('prompt', prompt);
        fd.append('size', size);
        fd.append('quality', quality);
        fd.append('n', '1');
        fd.append('output_format', fmt);
        if (bg) fd.append('background', 'transparent'); else fd.append('output_compression', '90');
        if (fid) fd.append('input_fidelity', 'high');
        fd.append('image', img!, 'photo.' + (img!.type.split('/')[1] || 'png'));
        return await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(150000),
        });
      }
      const pj: Record<string, unknown> = { model: models[mi], prompt, size, quality, n: 1, output_format: fmt };
      if (bg) pj.background = 'transparent'; else pj.output_compression = 90;
      return await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pj),
        signal: AbortSignal.timeout(150000),
      });
    }

    let fid = true, bg = transparent;
    let r = await call(fid, bg);
    for (let k = 0; k < 10 && !r.ok && r.status === 400; k++) {
      const t = await r.clone().text();
      if (/"param"\s*:\s*"model"|model .*(does not exist|not found|not supported)/i.test(t)) { if (++mi >= models.length) break; r = await call(fid, bg); continue; }
      if (fid && /input_fidelity/i.test(t)) { fid = false; r = await call(fid, bg); continue; }
      if (bg && /background|transparent/i.test(t)) { bg = false; r = await call(fid, bg); continue; }
      break;
    }
    console.log('model', models[mi], r.status);
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = JSON.stringify(out?.error || out).toLowerCase();
      if (taken) await rpc('bz_refund', { p_uid: uid });
      if (/moderation|safety|content_policy/.test(msg)) {
        return j({ error: 'moderation', message: 'Bu istek için görsel üretilemedi. Farklı bir cümle dene.' }, 422);
      }
      console.error('openai', models[mi], r.status, msg.slice(0, 300));
      return j({ error: 'fail', message: 'Tasarım şu an hazırlanamadı. Biraz sonra yeniden dene.' }, 502);
    }
    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) {
      if (taken) await rpc('bz_refund', { p_uid: uid });
      return j({ error: 'fail', message: 'Tasarım şu an hazırlanamadı.' }, 502);
    }
    return j({ ok: true, image: `data:image/${bg ? 'png' : 'jpeg'};base64,${b64}`, orient, transparent: bg, admin: isAdm });
  } catch (e) {
    console.error('bz-image', String(e));
    if (taken && uid) await rpc('bz_refund', { p_uid: uid });
    return j({ error: 'fail', message: 'Tasarım şu an hazırlanamadı. Biraz sonra yeniden dene.' }, 500);
  }
});
