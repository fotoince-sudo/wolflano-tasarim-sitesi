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
    const canvas = body.canvas === true; // canvas tablo: tam dolu resim, tişört rengi yok
    const mug = body.mug === 'wrap' || body.mug === 'logo' ? body.mug : ''; // kupa: çevresini saran baskı ya da tek taraflı logo
    const full = canvas || mug === 'wrap'; // arka planı dolu, kenardan kenara resim
    const transparent = !full && body.transparent !== false;
    const shirt = canvas || mug ? '' : shirtHint(String(body.shirt || '').slice(0, 40), String(body.shirtHex || '').slice(0, 7));
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
    parts.push(canvas ? 'Print-ready artwork for a stretched canvas wall painting that will hang in a home.'
      : mug === 'wrap' ? 'Print-ready wide panoramic artwork for a sublimation print that wraps all the way around a white ceramic mug.'
      : mug === 'logo' ? 'Print-ready compact artwork for a small print on one side of a white ceramic mug.'
      : 'Print-ready artwork for a garment print.');
    if (img) {
      parts.push(`Redraw the attached photo in this style: ${STY[style]}.`);
      parts.push('First look at what the photo shows: one person, a couple, a family or group, a pet or other animal, or a place or object. Draw exactly that, nothing less.');
      parts.push("If there are people, include EVERY person in the photo, in the same arrangement, and keep each one clearly recognizable: same face shape, eyes, nose, mouth, skin tone, age, expression and head shape. Keep each person's exact hairline and hair amount (if someone is bald, keep them bald; do not add hair or a beard that is not there).");
      parts.push('If there is an animal, keep its species, breed, coat colors and markings exactly. If it is a place or object, keep it recognizable.');
      parts.push('Draw clothing plain and simple; do NOT copy any logo, letters, numbers or print from the clothes or the background of the photo.');
      parts.push(mug === 'wrap'
        ? 'Composition for a mug that is wrapped all around: put the main subject in the center of the wide image, which is the side people see. Extend the scene of the photo naturally to the left and right in its own setting (for example the sea, a park, a garden or a cosy room, matching the photo) so it continues all the way around the mug without looking like a pasted rectangle.'
        : mug === 'logo'
          ? 'Composition for a small print on a mug: isolate the main subject from its background as a compact, centered portrait (people from the chest up, an animal whole or its head), optionally inside a soft round shape; nothing else around it.'
          : canvas
            ? 'Composition for a wall painting: keep the subject where it looks natural and paint a complete, matching background that fills the whole canvas.'
            : 'Composition for a garment print: centered, people from the chest up (a whole animal or object), isolated from the photo background.');
    } else {
      parts.push(`Style: ${STY[style]}.`);
    }
    if (idea) parts.push(`The customer's request (this is an instruction describing what to draw, NOT text to write on the artwork): ${idea}`);
    /* Şehir kısayolu: yalnız "Çeşme", "Antalya" ya da "Kapadokya kurt" gibi kısa bir yer adı yazılırsa, o yere özel şehir tasarımı yapılır */
    const words = idea.split(/\s+/).filter(Boolean);
    let topic = '';
    if (!img && words.length >= 1 && words.length <= 4 && !/["“”']/.test(idea)) {
      const extra = /^(kurt|kurtlu|wolf|rozet|madalyon|logo|gece|gün|batımı|retro)$/i;
      const nameWords = words.filter((w) => !extra.test(w));
      if (nameWords.length) topic = nameWords.join(' ').toLocaleUpperCase('tr-TR');
    }
    if (topic) {
      const place = canvas
        ? 'paint a beautiful scenic wall painting of that place: its most iconic view or landmark in its natural setting (sea, coast, mountains, streets, historic architecture, boats, trees), atmospheric light such as golden hour, rich depth and a complete sky and landscape, like a fine art piece for a living room'
        : mug === 'wrap'
          ? 'paint a wide panoramic scene of that place that flows around the mug: its most iconic landmarks spread from left to right with its sea, coast, nature or streets connecting them'
          : 'create a premium city souvenir design: its single most iconic landmark with its local character (sea, coast, mountains, nature, historic architecture, typical boats, trees), elegant balanced composition like a luxury travel brand print, limited refined color palette';
      const day = canvas
        ? 'paint a warm, heartfelt artwork for that day with its well-known symbols and feelings (for example flowers and a mother and child for Mother\'s Day, an apple and books for Teachers\' Day, hearts for Valentine\'s Day), suitable as a meaningful gift'
        : 'create a warm, heartfelt gift design for that day with its well-known symbols (for example flowers and a mother and child silhouette for Mother\'s Day, a father and child or a tie for Father\'s Day, an apple, books and a chalkboard for Teachers\' Day, hearts for Valentine\'s Day, balloons and a cake for a birthday, a pine tree and stars for New Year, a graduation cap for graduation)';
      const job = 'create a proud, stylish design that celebrates that profession with its typical tools and symbols (for example a stethoscope and heart for a doctor, a nurse cap and cross for a nurse, a chalkboard and books for a teacher, a hard hat, gears and blueprints for an engineer, a chef hat and knives for a cook, a scissors and comb for a hairdresser, scales of justice for a lawyer), with a touch of warm humor and respect, suitable as a gift for someone in that job';
      const writeIt = canvas
        ? 'Do not write the topic as text on the painting.'
        : `Write the topic once, elegant and well integrated, spelled exactly "${topic}".`;
      const badge = canvas ? '' : ' If the request mentions a badge (rozet, madalyon, logo), make it a round emblem with the text around the edge.';
      parts.push(`If the request is just a short topic, first decide what it is. If it is a place in Türkiye or elsewhere (city, town, district, region, island or landmark), ${place}. If it is a special day or occasion (Anneler Günü, Babalar Günü, Öğretmenler Günü, Sevgililer Günü, doğum günü, yılbaşı, mezuniyet, bayram, düğün, emeklilik and similar), ${day}. If it is a profession or job (öğretmen, doktor, hemşire, mühendis, aşçı, avukat, polis, itfaiyeci, kuaför and similar), ${job}. If it is anything else (a hobby, sport, animal, team or idea), design around it in the same spirit. ${writeIt} If the request also mentions a wolf (kurt), place a noble wolf naturally in the design.${badge} If the request is a full description rather than a short topic, ignore this paragraph and draw what was asked.`);
    }
    if (shirt) parts.push(shirt);
    parts.push(topic && !canvas
      ? `Do not add any other text, letters or captions except the topic "${topic}" or words inside quotation marks in the request; spell them exactly, including Turkish letters such as ç, ğ, ı, İ, ö, ş, ü.`
      : 'Do not add any text, letters, words or captions, unless the request contains words inside quotation marks; only then write exactly those quoted words, spelled correctly (including Turkish letters such as ç, ğ, ı, İ, ö, ş, ü).');
    parts.push(full ? 'Do not draw any brand logo.' : 'Do not draw any brand logo. Do not draw a T-shirt, mug or mockup; draw only the artwork itself.');
    if (mug) parts.push(mug === 'wrap'
      ? 'The mug is white and glossy. Use a rich, cheerful color palette that looks good on white ceramic. The image will wrap around the mug: let the left and right edges blend softly into each other, and keep the outer 8% at both left and right ends calm with no important details, because the handle covers the seam there.'
      : 'The mug is white and glossy: use deep, rich colors with strong contrast against white; avoid very pale areas. Keep the artwork compact and centered, readable at a small size of about 8 cm.');
    if (mug === 'wrap') parts.push('Full-bleed panoramic image: the scene fills the entire image edge to edge with a complete background; no empty or transparent areas. No frame, no border, no mug, no mockup, no watermark.');
    else if (canvas) parts.push('Full-bleed painting: the scene fills the entire image edge to edge with a complete background (sky, landscape, sea or interior); no empty, white or transparent areas. Keep important details and any text away from the outer 7% because those parts wrap around the canvas edges. No frame, no border, no wall, no mockup, no watermark.');
    else parts.push(transparent
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
