// Supabase'deki 14 sunucu fonksiyonu (supabase/functions/*) olduğu gibi burada çalışır.
// Deno'ya özel iki şeyin (Deno.env, Deno.serve) karşılığı verilir; kod derlenirken (build.mjs) pakete gömülür.
const KAYNAK = {
  'baski-dosya': () => require('../../supabase/functions/baski-dosya/index.ts'),
  'bz-image': () => require('../../supabase/functions/bz-image/index.ts'),
  'dogum-gunu': () => require('../../supabase/functions/dogum-gunu/index.ts'),
  hosgeldin: () => require('../../supabase/functions/hosgeldin/index.ts'),
  'kontrol-rapor': () => require('../../supabase/functions/kontrol-rapor/index.ts'),
  kur: () => require('../../supabase/functions/kur/index.ts'),
  'mail-gonder': () => require('../../supabase/functions/mail-gonder/index.ts'),
  manken: () => require('../../supabase/functions/manken/index.ts'),
  'order-create': () => require('../../supabase/functions/order-create/index.ts'),
  sepet: () => require('../../supabase/functions/sepet/index.ts'),
  'stok-haber': () => require('../../supabase/functions/stok-haber/index.ts'),
  'toptan-basvuru': () => require('../../supabase/functions/toptan-basvuru/index.ts'),
  'wolf-sohbet': () => require('../../supabase/functions/wolf-sohbet/index.ts'),
  yardim: () => require('../../supabase/functions/yardim/index.ts'),
};
// Supabase'de "verify_jwt: true" olanlar: geçerli bir oturum anahtarı olmadan çağrılamaz
const JWT_GEREK = new Set(['bz-image', 'wolf-sohbet', 'manken', 'kur', 'mail-gonder', 'hosgeldin', 'toptan-basvuru']);

const cache = new Map();
let yakalanan = null;
globalThis.Deno = {
  env: { get: (k) => process.env[k], toObject: () => ({ ...process.env }) },
  serve: (a, b) => { yakalanan = typeof a === 'function' ? a : typeof b === 'function' ? b : (a && a.handler) || null; return { finished: Promise.resolve() }; },
};

function fonksiyon(ad) {
  if (!Object.hasOwn(KAYNAK, ad)) return null;
  if (!cache.has(ad)) {
    yakalanan = null;
    KAYNAK[ad]();
    if (!yakalanan) throw new Error(ad + ': Deno.serve çağrılmadı');
    cache.set(ad, yakalanan);
  }
  return cache.get(ad);
}

module.exports = { fonksiyon, JWT_GEREK, ADLAR: Object.keys(KAYNAK) };
