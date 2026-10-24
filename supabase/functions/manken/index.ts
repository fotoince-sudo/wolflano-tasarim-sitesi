// Manken stüdyosu: yalnız yönetici ve yetkililer. Seçilen manken, mekân, poz ve alt kıyafetle
// "Wolflano Sanal Manken Kadrosu" kurallarına uygun fotoğraf üretir (OpenAI görsel API).
// Kural metinleri burada sabit durur; panelden yalnız seçim yapılır, kimse mesaj yazmaz.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

type Mk = { he: boolean; kid?: boolean; desc: string };
const MK: Record<string, Mk> = {
  kerem: { he: true, desc: 'an original fictional Turkish man, 25 years old, athletic build, 182 cm, Mediterranean features, olive tanned skin, hazel eyes, short dark-brown hair with faded sides, short neatly trimmed beard, confident friendly smile' },
  emre: { he: true, desc: 'an original fictional Turkish man, 35 years old, lean tall build, 185 cm, wheat-toned skin, dark-brown eyes, black wavy hair combed back, well-groomed stubble, calm confident expression' },
  murat: { he: true, desc: 'an original fictional Turkish man, 45 years old, broad-shouldered strong build, 180 cm, sun-weathered light-olive skin, grey-green eyes, short dark hair greying at the temples, full salt-and-pepper beard, serious charismatic expression with a slight warm smile' },
  elif: { he: false, desc: 'an original fictional Turkish woman, 24 years old, slim athletic build, 170 cm, light wheat skin with a few freckles, green-hazel eyes, light-brown hair in a high ponytail, natural minimal makeup, bright natural smile' },
  deniz: { he: false, desc: 'an original fictional Turkish woman, 29 years old, medium build, 167 cm, warm tan skin, dark-brown eyes, straight black shoulder-length bob haircut, light everyday makeup, relaxed confident half-smile' },
  selin: { he: false, desc: 'an original fictional Turkish woman, 34 years old, tall slender build, 175 cm, fair skin, blue-grey eyes, dark-blonde hair in a low sleek bun, refined minimal makeup, calm elegant expression' },
  leyla: { he: false, desc: 'an original fictional Turkish woman, 42 years old, fit curvy build, 166 cm, warm wheat skin with natural smile lines, brown eyes, wavy dark-chestnut hair below the shoulders, natural makeup, warm strong confident smile' },
  ada: { he: false, kid: true, desc: 'an original fictional Turkish girl, 7 years old, small build, light wheat skin, brown eyes, light-brown hair in two braids, cheerful natural smile, no makeup' },
  can: { he: true, kid: true, desc: 'an original fictional Turkish boy, 9 years old, slim build, tanned skin, hazel eyes, short messy brown hair, playful natural grin' },
  arda: { he: true, kid: true, desc: 'an original fictional Turkish teenage boy, 14 years old, tall and lanky, wheat skin, dark-brown eyes, short black hair with shorter sides, calm confident expression' },
};

const SAHNE: Record<string, { t: string; kid?: boolean; adult?: boolean }> = {
  studyo: { t: 'On a seamless light-grey studio background, soft even light from both sides, very soft shadow' },
  bodrum: { t: 'On a stone harbor quay in Bodrum at golden hour, the castle and wooden gulets softly blurred in the background' },
  balik: { t: 'At a seaside fish restaurant table at sunset, string lights, the sea behind, relaxed atmosphere', adult: true },
  bogaz: { t: 'On the Bosphorus waterfront at Ortaköy in the early evening, the bridge lit softly in the background' },
  galata: { t: 'On a historic cobblestone street in Galata, Istanbul, pastel old buildings and the Galata Tower softly blurred in the background, soft afternoon light' },
  kapadokya: { t: 'On a rocky viewpoint at sunrise in Cappadocia, fairy chimneys below and hot-air balloons in the sky' },
  antik: { t: 'Walking between ancient marble columns at Side at sunset, warm light' },
  plaj: { t: 'On a pebble beach with turquoise water and mountains behind, bright midday light' },
  sokak: { t: 'On a stylish city street with cafés, soft overcast daylight' },
  bozkir: { t: 'On a windswept Anatolian steppe hill with mountains in the distance, dramatic evening sky', adult: true },
  spor: { t: 'In a modern minimalist gym with soft window light' },
  okul: { t: 'In a sunny schoolyard with trees, family-friendly atmosphere' },
  park: { t: 'In a green city park on a sunny day, family-friendly atmosphere' },
};

const POZ: Record<string, string> = {
  on: 'Front view, standing straight facing the camera, arms relaxed slightly away from the body, framed from just above the knees to the top of the head, camera at chest height',
  arka: 'Back view: the person stands with their back fully to the camera, arms relaxed slightly away from the body, framed from just above the knees to the top of the head, camera at chest height; the whole back of the T-shirt is clearly visible',
  sol: 'Exact 90-degree side profile: the person has turned so their LEFT shoulder and LEFT arm are nearest the camera, nose and chest pointing toward the LEFT edge of the image, the left sleeve fully visible, arms relaxed, framed from just above the knees to the top of the head, camera at chest height',
  sag: 'Exact 90-degree side profile: the person has turned so their RIGHT shoulder and RIGHT arm are nearest the camera, nose and chest pointing toward the RIGHT edge of the image, the right sleeve fully visible, arms relaxed, framed from just above the knees to the top of the head, camera at chest height',
  rahat: 'Standing relaxed, looking at the camera, full face clearly visible, framed from the knees up',
  yuru: 'Walking toward the camera, mid-step, full face clearly visible, framed from the knees up',
  otur: 'Sitting on a low wall, smiling, full face clearly visible',
  yan: 'Side profile, looking at the view, the sleeve clearly visible',
  omuz: 'Back to the camera, looking over the shoulder, the back of the T-shirt clearly visible',
};

const ALT: Record<string, string> = {
  lsort: 'plain dark navy shorts',
  ssort: 'plain black shorts',
  lpan: 'plain dark navy trousers',
  span: 'plain black trousers',
};

const STYLE = 'Photorealistic premium fashion e-commerce photo, shot on a full-frame camera with an 85mm lens, natural skin texture, soft diffused light, subtle realistic shadows, true-to-life colors, sharp focus on the clothing, no text, no logos, no watermark.';
const KIDSTYLE = 'Family-friendly children\'s clothing catalog photo, photorealistic, fully and modestly dressed, age-appropriate natural pose and expression, no makeup, soft diffused light, true-to-life colors, no text, no logos, no watermark.';
const TEE = 'a plain white crew-neck cotton T-shirt, perfectly ironed, no print, no logo, realistic fabric texture and natural folds, worn untucked';

// Ürün fotoğrafı (baskısız, görünmez manken): ürün türü, kesim ve standart renkler
const URUN: Record<string, string> = {
  tee: 'a plain premium heavyweight 240 gsm cotton crew-neck T-shirt with short sleeves and a ribbed collar',
  polo: 'a plain premium 280 gsm cotton piqué polo shirt with short sleeves, a ribbed flat-knit collar and a two-button placket',
  sweat: 'a plain premium heavyweight 380 gsm cotton fleece crew-neck sweatshirt with long sleeves, ribbed collar, cuffs and hem',
};
const KESIM: Record<string, string> = {
  erkek: "men's regular fit",
  kadin: "women's regular fit, slightly shaped at the waist, slightly shorter body",
  cocuk: "children's size for about an 8-year-old, child proportions",
};
const RENK: Record<string, string> = {
  Beyaz: 'clean optical white (#f4f4f2)',
  Lacivert: 'deep classic navy blue (#1f2a4f)',
  Siyah: 'deep jet black (#1b1b1d)',
  Mavi: 'royal blue (#2a64c4)',
  'Yeşil': 'deep forest green (#2d5a43)',
};
const URUN_STYLE = 'Professional premium e-commerce product photo in ghost-mannequin (invisible mannequin) style: the garment looks worn, with natural 3D volume and soft realistic folds, the inside of the back neck visible through the collar opening; no person, no mannequin, no hanger visible. Perfectly straight-on and symmetrical, centered, sleeves relaxed, the whole garment visible with a generous empty margin on all sides. Seamless plain light-grey (#d6d6d6) background, soft even studio lighting, very soft shadow, sharp fabric texture, true-to-life color. Completely blank garment: no print, no logo, no label, no tag, no text, no watermark. Vertical 2:3 composition.';

function blobFromB64(b64: string, type: string) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return j({ error: 'not_configured', message: 'Görsel servisi etkin değil.' }, 503);

    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
    if (!ur.ok) return j({ error: 'auth', message: 'Oturum süresi doldu, yeniden giriş yap.' }, 401);
    const em = String((await ur.json()).email || '').toLowerCase();
    let isAdm = em === 'ergunince68@hotmail.com';
    if (!isAdm && em) {
      const sr = await fetch(`${SB_URL}/rest/v1/wf_staff?select=email&email=eq.${encodeURIComponent(em)}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
      if (sr.ok) { const sj = await sr.json(); isAdm = Array.isArray(sj) && sj.length > 0; }
    }
    if (!isAdm) return j({ error: 'forbidden', message: 'Bu bölüm yalnız yöneticiye açık.' }, 403);

    const b = await req.json();
    const isUrun = b.mode === 'urun';
    const mk = isUrun ? MK.kerem : MK[String(b.mk)];
    if (!mk) return j({ error: 'bad', message: 'Manken seçilmedi.' }, 400);
    const pr = mk.kid ? 'the child' : (mk.he ? 'He' : 'She');
    const style = mk.kid ? KIDSTYLE : STYLE;
    const mode = isUrun ? 'urun' : b.mode === 'ref' ? 'ref' : b.mode === 'mask' ? 'mask' : 'photo';

    let prompt = '';
    let size = '1024x1536';
    let refBlob: Blob | null = null;

    if (mode === 'urun') {
      // ref yoksa: beyaz ön sıfırdan; ref varsa: aynı ürünün arkası (yuz=back) ya da başka rengi (aynı yüz)
      const gar = URUN[String(b.tur)];
      const fit = KESIM[String(b.kesim)] || KESIM.erkek;
      const col = RENK[String(b.renk)];
      const back = b.yuz === 'back';
      if (!gar || !col) return j({ error: 'bad', message: 'Ürün türü ya da renk geçersiz.' }, 400);
      const u = String(b.ref || '');
      if (u) {
        if (!u.startsWith(`${SB_URL}/storage/v1/object/public/site/`)) return j({ error: 'bad', message: 'Kaynak fotoğraf geçersiz.' }, 400);
        const rr = await fetch(u);
        if (!rr.ok) return j({ error: 'bad', message: 'Kaynak fotoğraf okunamadı.' }, 400);
        refBlob = new Blob([await rr.arrayBuffer()], { type: rr.headers.get('content-type') || 'image/jpeg' });
      }
      const g = `${gar}, ${fit}`;
      if (!refBlob) {
        prompt = `${URUN_STYLE} The product: ${g}, color ${col}. ${back ? 'Back view of the garment.' : 'Front view of the garment.'}`;
      } else if (b.ref_yuz === 'front' && back) {
        prompt = `The reference image is the FRONT of a garment (${g}). Create the BACK view of exactly the same garment: same fabric, same color and exact same tone (${col}), same fit and proportions, same size and position in the frame, same lighting, same shadow and the same plain light-grey background. Straight-on back view: the back neckline sits higher than the front, the whole back is smooth and fully visible${String(b.tur) === 'polo' ? ', the collar seen from behind, no placket or buttons on the back' : ''}. ${URUN_STYLE}`;
      } else {
        prompt = `Edit this product photo: change ONLY the garment's fabric color to ${col}, with natural realistic shading for that color. Keep everything else exactly identical: garment shape, folds, collar, seams, stitching, sleeves, size and position in the frame, lighting, shadow and the plain light-grey background. Do not move, crop, zoom or redraw anything. No print, no logo, no label, no text.`;
      }
    } else if (mode === 'mask') {
      // Giydirme için tişört haritası: aynı fotoğrafta yalnız tişört saf yeşile boyanır, panel bundan maskeyi çıkarır
      const u = String(b.url || '');
      if (!u.startsWith(`${SB_URL}/storage/v1/object/public/site/`)) return j({ error: 'bad', message: 'Fotoğraf geçersiz.' }, 400);
      const rr = await fetch(u);
      if (!rr.ok) return j({ error: 'bad', message: 'Fotoğraf okunamadı.' }, 400);
      refBlob = new Blob([await rr.arrayBuffer()], { type: rr.headers.get('content-type') || 'image/jpeg' });
      size = ['1024x1536', '1536x1024', '1024x1024'].includes(String(b.size)) ? String(b.size) : 'auto';
      prompt = 'Edit this photo: recolor ONLY the T-shirt the person is wearing (body, both sleeves, collar and every fold) to a flat, fully saturated pure chroma-key green (#00FF00), keeping its exact shape and outline. Everything else must stay exactly identical and in exactly the same position: same person, face, skin, hair, arms, hands, trousers or shorts, background, framing, lighting and image size. Do not move, crop, zoom or redraw anything except the T-shirt color.';
    } else if (mode === 'ref') {
      size = '1536x1024';
      prompt = `Create a reference portrait sheet of ${mk.desc}. Show the same person three times side by side on a plain light-grey background: front view, three-quarter view, side profile, from chest up. ${mk.he ? 'He' : 'She'} wears ${TEE}. ${style}`;
    } else {
      const sk = String(b.sahne);
      const sc = SAHNE[sk];
      const pz = POZ[String(b.poz)];
      if (!sc || !pz) return j({ error: 'bad', message: 'Mekân ve poz seç.' }, 400);
      if (mk.kid && sc.adult) return j({ error: 'bad', message: 'Bu mekân çocuk mankenler için uygun değil.' }, 400);
      if (!mk.kid && sk === 'okul') return j({ error: 'bad', message: 'Okul bahçesi yalnız çocuk mankenler için.' }, 400);
      const alt = ALT[String(b.alt)] || ALT.lsort;
      const refUrl = String(b.ref || '');
      const okPrefix = `${SB_URL}/storage/v1/object/public/site/`;
      if (refUrl) {
        if (!refUrl.startsWith(okPrefix)) return j({ error: 'bad', message: 'Kimlik fotoğrafı geçersiz.' }, 400);
        const rr = await fetch(refUrl);
        if (!rr.ok) return j({ error: 'bad', message: 'Kimlik fotoğrafı okunamadı.' }, 400);
        const ab = await rr.arrayBuffer();
        refBlob = new Blob([ab], { type: rr.headers.get('content-type') || 'image/jpeg' });
      }
      const who = refBlob
        ? `Same person as the reference image: keep the exact same face, hair, skin tone and body (${mk.desc}).`
        : `The person is ${mk.desc}.`;
      const subj = mk.kid ? 'The child' : pr;
      prompt = `${who} ${sc.t}. ${subj} wears ${TEE}, with ${alt}. ${pz}. Use only the person from the reference; do not copy any other clothing from it. ${style} Vertical 2:3 composition.`;
    }

    // OpenAI model adları zamanla değişiyor: sırayla dene, olmayan modeli ve desteklenmeyen ayarı atla
    const envModel = Deno.env.get('OPENAI_IMAGE_MODEL') || '';
    const models = [envModel, refBlob ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare', refBlob ? 'gpt-image-2.5-flare' : 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']
      .filter((m, i, a) => m && a.indexOf(m) === i);
    const opts: Record<string, string> = { size: mode === 'urun' ? '1024x1536' : size, quality: mode === 'mask' ? 'medium' : 'high', output_format: mode === 'urun' ? 'png' : 'jpeg', output_compression: '90' };
    if (mode === 'urun') delete opts.output_compression;
    if (refBlob) opts.input_fidelity = 'high';
    async function call(model: string) {
      if (refBlob) {
        const fd = new FormData();
        fd.append('model', model);
        fd.append('prompt', prompt);
        fd.append('n', '1');
        for (const k in opts) fd.append(k, opts[k]);
        fd.append('image', refBlob, 'ref.' + ((refBlob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg')));
        return await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(140000) });
      }
      const pj: Record<string, unknown> = { model, prompt, n: 1 };
      for (const k in opts) pj[k] = k === 'output_compression' ? Number(opts[k]) : opts[k];
      return await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pj),
        signal: AbortSignal.timeout(140000),
      });
    }
    let mi = 0;
    let r = await call(models[mi]);
    for (let k = 0; k < 10 && !r.ok && r.status === 400; k++) {
      const e = (await r.clone().json().catch(() => ({})))?.error || {};
      const m = String(e.message || '').toLowerCase();
      const p = String(e.param || '');
      if (p === 'model' || /model .*(does not exist|not found|not supported)/.test(m)) {
        if (++mi >= models.length) break;
        r = await call(models[mi]);
        continue;
      }
      const drop = p && p in opts ? p : Object.keys(opts).find((o) => m.includes(o));
      if (drop && drop !== 'size') { delete opts[drop]; r = await call(models[mi]); continue; }
      if (drop === 'size' || p === 'size') { opts.size = 'auto'; r = await call(models[mi]); continue; }
      break;
    }
    // Art arda üretimde OpenAI "çok sık istek" (429) ya da geçici sunucu hatası verebilir: kısa bekleyip yeniden dene
    for (let k = 0; k < 2 && (r.status === 429 || r.status >= 500); k++) {
      const ra = Number(r.headers.get('retry-after')) || 0;
      await new Promise((ok) => setTimeout(ok, Math.min(Math.max(ra, 8), 20) * 1000));
      r = await call(models[mi]);
    }
    console.log('model', models[mi], r.status);
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = JSON.stringify(out?.error || out).toLowerCase();
      console.error('openai', r.status, msg.slice(0, 300));
      if (/moderation|safety|content_policy/.test(msg)) return j({ error: 'moderation', message: 'Bu fotoğraf üretilemedi, başka bir mekân ya da poz dene.' }, 422);
      if (r.status === 429 && !/billing|insufficient/.test(msg)) return j({ error: 'rate', message: 'OpenAI kısa süreli yoğunluk dedi, birazdan yeniden denenecek.' }, 429);
      if (/billing|quota|insufficient/.test(msg)) return j({ error: 'quota', message: 'OpenAI hesabında bakiye yok. Hesaba bakiye yüklenince çalışır.' }, 402);
      return j({ error: 'fail', message: 'Fotoğraf şu an üretilemedi, biraz sonra yeniden dene.' }, 502);
    }
    let blob: Blob | null = null;
    const b64 = out?.data?.[0]?.b64_json;
    if (b64) blob = blobFromB64(b64, 'application/octet-stream');
    else if (out?.data?.[0]?.url) { const ir = await fetch(out.data[0].url); if (ir.ok) blob = await ir.blob(); }
    if (!blob) { console.error('no image', JSON.stringify(out).slice(0, 300)); return j({ error: 'fail', message: 'Fotoğraf şu an üretilemedi.' }, 502); }
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    const isWebp = head[0] === 0x52 && head[1] === 0x49;
    const ct = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';

    // Sonucu site kovasına kaydet, panel yalnız adresi saklar
    const path = mode === 'urun' ? `img/urun-${String(b.tur)}-${String(b.kesim)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}` : `img/manken-${String(b.mk)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const up = await fetch(`${SB_URL}/storage/v1/object/site/${path}`, {
      method: 'POST',
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': ct, 'x-upsert': 'true', 'cache-control': '31536000' },
      body: blob,
    });
    if (!up.ok) {
      console.error('upload', up.status, (await up.text()).slice(0, 200));
      return j({ error: 'fail', message: 'Fotoğraf üretildi ama kaydedilemedi, yeniden dene.' }, 500);
    }
    return j({ ok: true, url: `${SB_URL}/storage/v1/object/public/site/${path}`, tok: path, saved: true });
  } catch (e) {
    console.error('manken', String(e));
    return j({ error: 'fail', message: 'Fotoğraf şu an üretilemedi, biraz sonra yeniden dene.' }, 500);
  }
});
