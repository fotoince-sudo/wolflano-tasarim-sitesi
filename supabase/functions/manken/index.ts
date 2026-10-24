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
  sol: 'Exact left side profile, the left sleeve facing the camera, arms relaxed, framed from just above the knees to the top of the head, camera at chest height',
  sag: 'Exact right side profile, the right sleeve facing the camera, arms relaxed, framed from just above the knees to the top of the head, camera at chest height',
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
    const mk = MK[String(b.mk)];
    if (!mk) return j({ error: 'bad', message: 'Manken seçilmedi.' }, 400);
    const pr = mk.kid ? 'the child' : (mk.he ? 'He' : 'She');
    const style = mk.kid ? KIDSTYLE : STYLE;
    const mode = b.mode === 'ref' ? 'ref' : 'photo';

    let prompt = '';
    let size = '1024x1536';
    let refBlob: Blob | null = null;

    if (mode === 'ref') {
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

    const model = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-1';
    async function call(fid: boolean) {
      if (refBlob) {
        const fd = new FormData();
        fd.append('model', model);
        fd.append('prompt', prompt);
        fd.append('size', size);
        fd.append('quality', 'high');
        fd.append('n', '1');
        fd.append('output_format', 'jpeg');
        fd.append('output_compression', '90');
        if (fid) fd.append('input_fidelity', 'high');
        fd.append('image', refBlob, 'ref.' + ((refBlob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg')));
        return await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(140000) });
      }
      return await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, size, quality: 'high', n: 1, output_format: 'jpeg', output_compression: 90 }),
        signal: AbortSignal.timeout(140000),
      });
    }
    let r = await call(true);
    if (!r.ok && r.status === 400 && refBlob) {
      const t = await r.clone().text();
      if (/input_fidelity/i.test(t)) r = await call(false);
    }
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = JSON.stringify(out?.error || out).toLowerCase();
      console.error('openai', r.status, msg.slice(0, 300));
      if (/moderation|safety|content_policy/.test(msg)) return j({ error: 'moderation', message: 'Bu fotoğraf üretilemedi, başka bir mekân ya da poz dene.' }, 422);
      if (/billing|quota|insufficient/.test(msg)) return j({ error: 'quota', message: 'OpenAI hesabında bakiye yok. Hesaba bakiye yüklenince çalışır.' }, 402);
      return j({ error: 'fail', message: 'Fotoğraf şu an üretilemedi, biraz sonra yeniden dene.' }, 502);
    }
    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) return j({ error: 'fail', message: 'Fotoğraf şu an üretilemedi.' }, 502);

    // Sonucu site kovasına kaydet, panel yalnız adresi saklar
    const path = `img/manken-${String(b.mk)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
    const up = await fetch(`${SB_URL}/storage/v1/object/site/${path}`, {
      method: 'POST',
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '31536000' },
      body: blobFromB64(b64, 'image/jpeg'),
    });
    if (!up.ok) {
      console.error('upload', up.status, (await up.text()).slice(0, 200));
      return j({ ok: true, image: `data:image/jpeg;base64,${b64}`, saved: false });
    }
    return j({ ok: true, url: `${SB_URL}/storage/v1/object/public/site/${path}`, saved: true });
  } catch (e) {
    console.error('manken', String(e));
    return j({ error: 'fail', message: 'Fotoğraf şu an üretilemedi, biraz sonra yeniden dene.' }, 500);
  }
});
