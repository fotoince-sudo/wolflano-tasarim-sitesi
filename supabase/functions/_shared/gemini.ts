// Google Gemini (AI Studio anahtarı: GEMINI_API_KEY). Wolf, Aybüke, tasarım ve manken görselleri bunu kullanır.
// Model adları zamanla değişiyor: sırayla denenir, olmayan model (404) atlanır. Ortam değişkeniyle değiştirilebilir.
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** Modelin JSON cevabı: bozuksa (kaçışsız tırnak vb.) alanlar tek tek kurtarılır */
export function looseJson(raw: string): any {
  try { return JSON.parse(raw); } catch (_) { /* aşağıda */ }
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* aşağıda */ } }
  const src = m ? m[0] : raw, out: any = {};
  const keys = [...src.matchAll(/"([a-zA-Z_]+)"\s*:/g)].map((x) => ({ k: x[1], i: x.index!, e: x.index! + x[0].length }));
  if (!keys.length) return null;
  keys.forEach((k, n) => {
    const end = n + 1 < keys.length ? keys[n + 1].i : src.length;
    let v = src.slice(k.e, end).trim().replace(/[,}\s]+$/, '');
    if (/^"/.test(v)) out[k.k] = v.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
    else { try { out[k.k] = JSON.parse(v); } catch (_) { out[k.k] = v; } }
  });
  return out;
}

export const gKey = () => Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '';

type GMsg = { role: 'user' | 'assistant'; text?: string; image?: string };
export type GOut = { ok: boolean; status: number; text: string; err: string; model: string };

function parseDataUrl(u: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(u || '');
  return m ? { mimeType: m[1], data: m[2] } : null;
}

async function call(model: string, body: unknown, timeout: number) {
  const r = await fetch(API + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': gKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}

const skip = (status: number, t: string) => status === 404 || (status === 400 && /model/.test(t) && /not (found|supported)|unknown|invalid/.test(t));

/** Metin sohbeti. msgs: kullanıcı/asistan sırası; son kullanıcı mesajında görsel (data URL) olabilir. */
export async function geminiChat(sys: string, msgs: GMsg[], o: { json?: boolean; maxTokens?: number; timeout?: number; env?: string } = {}): Promise<GOut> {
  const contents: any[] = [];
  for (const m of msgs) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];
    if (m.text) parts.push({ text: m.text });
    const im = m.image ? parseDataUrl(m.image) : null;
    if (im) parts.push({ inlineData: im });
    if (!parts.length) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else contents.push({ role, parts });
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (!contents.length) return { ok: false, status: 400, text: '', err: 'empty', model: '' };
  const models = [Deno.env.get(o.env || 'GEMINI_CHAT_MODEL') || '', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash']
    .filter((m, i, a) => m && a.indexOf(m) === i);
  let last: GOut = { ok: false, status: 0, text: '', err: '', model: '' };
  for (const model of models) {
    // Yeni modeller önce "düşünür"; düşünme de çıktı sınırından yer, bu yüzden sınır geniş tutulur
    const gc: Record<string, unknown> = { maxOutputTokens: (o.maxTokens || 1200) + (/^gemini-2\.5/.test(model) ? 0 : 3000), temperature: 0.7 };
    if (o.json) gc.responseMimeType = 'application/json';
    if (/^gemini-2\.5-flash/.test(model)) gc.thinkingConfig = { thinkingBudget: 0 };
    let r: Response, j: any;
    try { ({ r, j } = await call(model, { systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: gc }, Math.min(o.timeout || 60000, 25000))); }
    catch (e) { console.error('gemini', model, String(e)); last = { ok: false, status: 504, text: '', err: 'timeout', model }; continue; }
    const err = JSON.stringify(j?.error || '').toLowerCase();
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
    last = { ok: r.ok && !!text, status: r.status, text, err, model };
    if (last.ok) { console.log('gemini', model); return last; }
    console.error('gemini', model, r.status, (err || JSON.stringify(j?.promptFeedback || j?.candidates?.[0]?.finishReason || '')).slice(0, 200));
    if (!(skip(r.status, err) || r.status === 503 || r.status === 429 || r.status >= 500)) break;
  }
  return last;
}

/** Sesli okuma (Aybüke). 24 kHz PCM gelir, tarayıcının çalabileceği WAV'a çevrilir. */
export async function geminiTts(text: string, tarif: string): Promise<Uint8Array | null> {
  const models = [Deno.env.get('GEMINI_TTS_MODEL') || '', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'].filter((m, i, a) => m && a.indexOf(m) === i);
  const voices = [Deno.env.get('GEMINI_TTS_VOICE') || '', 'Sulafat', 'Kore'].filter((v, i, a) => v && a.indexOf(v) === i);
  // Toplam süre sınırı: sunucunun önündeki vekil (Plesk/nginx) ~60 sn'de isteği keser; ses ondan önce dönmeli.
  const bitis = Date.now() + 50000;
  for (const model of models) {
    for (const voice of voices) {
      const kalan = bitis - Date.now();
      if (kalan < 4000) { console.error('gemini-tts sure doldu'); return null; }
      // Uzun yönerge metnin önüne eklenince model bazen yönergeyi de sesli okuyordu.
      // Gemini'nin önerdiği biçim: tek satırlık kısa yönetmen notu + iki nokta + okunacak metin.
      let r: Response, j: any;
      try {
        ({ r, j } = await call(model, {
          contents: [{ parts: [{ text: `${tarif}:\n${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        }, Math.min(30000, kalan)));
      } catch (e) { console.error('gemini-tts', model, voice, 'zaman aşımı/bağlantı', String(e).slice(0, 120)); break; } // sonraki model
      const part = (j?.candidates?.[0]?.content?.parts || []).find((p: any) => p?.inlineData?.data);
      if (r.ok && part) {
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
        const bin = atob(part.inlineData.data), pcm = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
        // Ses metne göre çok uzunsa yönerge de okunmuştur: bu sesi kullanma, sıradakini dene.
        const sn = pcm.length / (rate * 2), limit = 3 + text.length / 7;
        if (sn <= limit) return wav(pcm, rate);
        console.error('gemini-tts too long', model, voice, sn.toFixed(1), limit.toFixed(1));
        continue;
      }
      const err = JSON.stringify(j?.error || '').toLowerCase();
      console.error('gemini-tts', model, voice, r.status, err.slice(0, 200));
      if (skip(r.status, err)) break; // sonraki model
      if (!(r.status === 400 && /voice/.test(err))) return null;
    }
  }
  return null;
}

function wav(pcm: Uint8Array, rate: number): Uint8Array {
  const b = new Uint8Array(44 + pcm.length), v = new DataView(b.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length, true);
  b.set(pcm, 44);
  return b;
}

/** "1024x1536" gibi bir boyuttan Gemini'nin kabul ettiği en yakın en-boy oranı */
export function aspectOf(size: string): string {
  const m = /(\d+)\s*x\s*(\d+)/.exec(size || '');
  if (!m) return '';
  const t = Number(m[1]) / Number(m[2]);
  const opts = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  let best = '1:1', d = 9;
  for (const o of opts) { const [a, c] = o.split(':').map(Number); const e = Math.abs(Math.log(a / c) - Math.log(t)); if (e < d) { d = e; best = o; } }
  return best;
}

async function blobPart(b: Blob) {
  const u = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return { inlineData: { mimeType: b.type || 'image/png', data: btoa(s) } };
}

/** Görsel üretimi / düzenleme. Ücretsiz katmanda kapalıdır (faturalandırma gerekir): o zaman status 429/403 döner. */
export async function geminiImage(prompt: string, images: Blob[], aspect: string, timeout = 150000):
  Promise<{ ok: boolean; status: number; b64: string; mime: string; err: string; model: string }> {
  const parts: any[] = [{ text: prompt }];
  for (const b of images) parts.push(await blobPart(b));
  const models = [Deno.env.get('GEMINI_IMAGE_MODEL') || '', 'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
    .filter((m, i, a) => m && a.indexOf(m) === i);
  let last = { ok: false, status: 0, b64: '', mime: '', err: '', model: '' };
  for (const model of models) {
    const { r, j } = await call(model, {
      contents: [{ role: 'user', parts }],
      generationConfig: aspect ? { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } : { responseModalities: ['IMAGE'] },
    }, timeout);
    const err = JSON.stringify(j?.error || j?.promptFeedback || j?.candidates?.[0]?.finishReason || '').toLowerCase();
    const p = (j?.candidates?.[0]?.content?.parts || []).find((x: any) => x?.inlineData?.data);
    last = { ok: r.ok && !!p, status: r.status, b64: p?.inlineData?.data || '', mime: p?.inlineData?.mimeType || 'image/png', err, model };
    if (last.ok) { console.log('gemini-image', model); return last; }
    console.error('gemini-image', model, r.status, err.slice(0, 300));
    if (!(skip(r.status, err) || (r.status === 400 && /aspect/.test(err)))) break;
  }
  return last;
}
