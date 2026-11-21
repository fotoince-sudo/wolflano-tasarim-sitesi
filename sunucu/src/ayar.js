// Wolflano sunucu ayarları. Hepsi Plesk > Node.js > "Özel ortam değişkenleri" bölümünden verilir.
// Zorunlu olanlar: DB_PASS (veritabanı sahibi şifresi) ve API_DB_PASS (site kullanıcısı şifresi).
const os = require('os');
const path = require('path');

const e = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

const ayar = {
  port: e('PORT', '3000'),
  // Sunucunun dışarıdan görünen adresi (sonunda / olmadan). Eski Supabase adresleri buna çevrilir.
  publicUrl: String(e('PUBLIC_URL', 'https://api.wolflano.com.tr')).replace(/\/+$/, ''),
  // Siteler: e-posta bağlantıları ve CORS için
  siteUrl: String(e('SITE_URL', 'https://wolflano.com.tr')).replace(/\/+$/, ''),
  origins: String(e('CORS_ORIGINS', 'https://wolflano.com.tr,https://www.wolflano.com.tr,https://ince-tasarim.wolflano.com.tr,https://wolflano.com,https://www.wolflano.com'))
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
  oldUrl: 'https://wgovwmeirlzwalelazfj.supabase.co',
  db: {
    host: e('DB_HOST', '127.0.0.1'),
    port: +e('DB_PORT', '5433'),
    database: e('DB_NAME', 'unpcpgdk_wolflano'),
    user: e('DB_USER', 'wolflano_usr'),
    password: e('DB_PASS', ''),
  },
  // Sitenin kullandığı ikinci veritabanı kullanıcısı: tabloların sahibi değildir, bu yüzden erişim kuralları (RLS) ona uygulanır.
  apiDb: {
    user: e('API_DB_USER', 'wolflano_api'),
    password: e('API_DB_PASS', ''),
  },
  // Dosyalar: <depo>/<kova>/<yol>. Önceki gece dosyalar ~/wolflano-yedek/site altına alındı.
  depo: e('DEPO_DIR', path.join(os.homedir(), 'wolflano-yedek')),
  publicBuckets: ['site'],
  ownerEmail: e('OWNER_EMAIL', ''),
  smtp: {
    host: e('SMTP_HOST', 'mail.wolflano.com.tr'),
    user: e('SMTP_USER', 'info@wolflano.com.tr'),
    pass: e('SMTP_PASS', ''),
    port: e('SMTP_PORT', '465'),
  },
  jwtExp: 3600,
};

// Fonksiyonların (Supabase'den gelen kod) beklediği ortam değişkenleri
process.env.SMTP_HOST = ayar.smtp.host;
process.env.SMTP_USER = ayar.smtp.user;
if (!process.env.SMTP_PORT) process.env.SMTP_PORT = ayar.smtp.port;

module.exports = ayar;
