# Görev 1 — Güvenlik düzeltmeleri (taslak, dağıtılmadı)

Kaynak: `1e3884cbdc6792f00d783749ad27c749115a4632`. Çalışma dalı: `security/gorev-1`.
`studyo.html` ve tasarım motoru değiştirilmedi. Canlı Supabase'e hiçbir istek yapılmadı.
Bu çalışma yayın/dağıtım onayı değildir. Mevcut otomatik main yayınları nedeniyle PR,
Copilot incelemesi ve proje sahibi onayından önce birleştirilmemelidir.

## Değişiklikler

- `functions/_shared/checkout.ts`: sunucu katalog verisiyle fiyat/KDV, baskı ücreti,
  miktar/beden, toplu miktar indirimi, toptan başvuru/ayar ve kargo doğrulaması.
  Ürün tutarları istemcinin `t`, `unit`, `ship`, `discount` alanlarından alınmaz.
  `total` yalnızca fiyatın kullanıcıya gösterilen teklif ile uyuşmasını kontrol eder;
  farklıysa herhangi bir yazmadan önce 409 döner. Stok aynı ürüne ait satırlar arasında
  toplanarak kontrol edilir; bu işlem stok rezervasyonu/değişikliği yapmaz.
- `functions/order-create/index.ts`: zorunlu onaylar gerçek boolean `true` olmalı.
  Pazarlama isteğe bağlı. Toptan fiyat yalnız doğrulanmış, onaylı hesaba verilir.
  Tekrar sipariş kontrolü ve sipariş sonrası sepet durumu sahibine bağlıdır;
  e-posta/tutar bilen kişiye başka siparişin baskı yükleme imzası verilmez.
- `functions/_shared/request-security.ts`, `functions/sepet/index.ts`: misafir
  tarayıcısı 256 bit rastgele capability taşır; sunucu yalnız SHA-256 özetini saklar.
  Üye sahipliği Auth tarafından doğrulanmış kullanıcı kimliğinden gelir. E-posta
  sahiplik anahtarı değildir. Geçersiz login misafir yetkisine düşürülmez.
- `functions/dogum-gunu/index.ts`, `functions/stok-haber/index.ts`: yalnız POST ve
  en az 32 karakterli sunucu gizlisi `WF_JOB_TOKEN` kabul edilir. Header:
  `x-wf-job-token`. Genel apikey/anon JWT görev yetkisi vermez. Kontrol veri/SMTP
  erişiminden önce yapılır. Eksik gizli ayarda kapalı kalırlar.
- `index.html`: mevcut sepet/checkout aynı capability'yi taşır. Mevcut stüdyo
  sepetindeki imzadan yalnız ürün/kesim/baskı seçimi okunur; çizim değişmez.
  Toptan ürün anahtarı sunucuya korunarak gönderilir. Gerçek onay kutuları gönderilir;
  toptan talebe de zorunlu onay kutusu eklendi. Sunucu reddi artık yutulmaz ve
  başarılı sipariş gibi kaydedilmez.
- `functions/_shared/posta.ts`: mevcut unknown → sayı dönüşümü TypeScript kontrolü
  için `Number(n)` olarak yazıldı; çalışma davranışı aynı.
- `.github/workflows/fonksiyon.yml`: mevcut --no-verify-jwt listesi korunur;
  görevlerin artık kendi sunucu tokenını kontrol ettiği yorumda açıklanır.

## Önerilen migration ve geçiş etkileri

`migrations/20261110020848_checkout_security.sql` **uygulanmadı**.

1. `carts.owner_key` nullable ve unique eklenir; e-posta primary key'i kaldırılır.
   Eski satırların içerikleri değiştirilmez/silinmez; owner_key NULL kalır ve yeni
   kullanıcı istekleri tarafından sahiplenilmez. Aynı e-posta birden fazla bağımsız
   sepet satırında bulunabilir. Yönetim eski kayıtları okumaya devam eder.
   Bilinmeyen foreign key `carts_pkey` bağımlılığı varsa migration RESTRICT ile durur;
   CASCADE yoktur. Böyle bir bağımlılık onaydan sonra ayrıca değerlendirilmelidir.
2. `orders.checkout_owner` nullable ve indeks eklenir; eski siparişler sahiplenilmez.
   Erişim politikaları gevşetilmez. Mevcut `carts` admin-only RLS korunur.
3. `wf_jobs_private.wf_run_job()` Vault'tan gizliyi okuyup yalnız iki sabit görevi çağırır.
   Public/anon/authenticated EXECUTE yetkisi yoktur. `stok_haber_kick()` bunu kullanır.
   Saatlik stok görevinin adı/saati korunur. URL ile çağıran mevcut doğum günü
   görevlerinin yalnız komutu değiştirilir; saat korunur, yeni ikinci görev yaratılmaz.
4. Migration önkoşulları: `vault`, `net`, `cron` mevcut olmalı; Vault'ta
   `wf_job_token`, Edge secrets'ta aynı değerde `WF_JOB_TOKEN` hazırlanmalıdır.
   Gizli değer kaynak koda, cron komutuna veya tarayıcıya konmamalıdır.
   Ön kontrol Vault gizlisi yoksa transaction'ı iptal eder. İndeks/constraint DDL'i
   kilit alabilir; gerçek şema ve boyutlar canlıya dokunmadan doğrulanamadı.

Onay sonrası geçiş tek planla yapılmalıdır: migration + dört endpoint + mağaza
birbiriyle uyumludur, eski önbellekli mağaza yeni API ile sepet kimliği göndermeyeceği
 için yenileme gerektirir. Bu PR hiçbir geçişi otomatik başlatmaz.
Görev tokenı hazırlanmadan yalnız görev kodunu dağıtmak bildirimleri durdurur.
Mevcut Vault tokenı ile Edge tokenı eşleşmesi ayrıca doğrulanmalıdır.

## GitHub Actions ve zamanlanmış görevler

Depodaki hiçbir workflow bu iki bildirim işlevini doğrudan çağırmıyor. Mevcut
fonksiyon dağıtım workflow'undaki --no-verify-jwt bu sunucular arası header için
korundu; handler kendi kontrolünü yapar. Workflow çalıştırılmadı.

İleride yetkili bir GitHub Actions çağrısı gerekiyorsa aynı tokenı Actions secret
`WF_JOB_TOKEN` olarak saklayıp yalnız güvenilen workflow'da header olarak gönderin.
Örnek (bu PR'da yeni workflow/schedule eklenmedi):

```yaml
- name: Stok bildirimlerini çağır
  env:
    WF_JOB_TOKEN: ${{ secrets.WF_JOB_TOKEN }}
  run: |
    curl --fail --silent --show-error --request POST \
      --header "x-wf-job-token: $WF_JOB_TOKEN" \
      --header 'Content-Type: application/json' --data '{}' \
      'https://wgovwmeirlzwalelazfj.supabase.co/functions/v1/stok-haber'
```

Doğum günü cron'unun canlı tanımı depoda yok. Migration URL içeren komutları
uyarlayabilir; başka bir wrapper kullanan canlı cron varsa ayrıca incelenmelidir.

## Testler

- `tests/security_test.ts`: 24 Deno testi; saf hesaplar ve gerçek endpoint handlerları.
  Fetch taklit edilir; `--allow-net` verilmez, canlı erişim teknik olarak engellenir.
- `tests/migration_test.mjs`: PGlite bellek içi Postgres; migration SQL'i, eski satırların
  korunması, aynı e-posta için ayrı sahiplik, unique upsert, format constraint,
  job EXECUTE yetkileri ve cron/Vault header uyumu. Vault/pg_net/pg_cron yerel taklit;
  gerçek Supabase extension entegrasyon testi değildir.
- `.github/security-store.mjs`: gerçek Chromium, mobil ekran; tüm ağ istekleri
  yakalanır. Misafir siparişi, onaylar, ayrı tarayıcı anahtarları, API reddi ve mevcut
  stüdyo sepet biçimini okuyan adaptör kontrol edilir. Canlıya istek göndermez.

Tekrar çalıştırma (geliştirme araçları; projeye servis/uygulama eklenmez):

```sh
deno test --no-lock --allow-read --allow-env supabase/tests/security_test.ts
deno check --no-lock supabase/functions/order-create/index.ts supabase/functions/sepet/index.ts supabase/functions/dogum-gunu/index.ts supabase/functions/stok-haber/index.ts
# Playwright 1.48.2 ve @electric-sql/pglite 0.3.14 geliştirme ortamında kurulu olmalı.
node .github/security-store.mjs
node supabase/tests/migration_test.mjs
```

Araçlar repo dışında kuruluysa `WF_TEST_MODULES=/.../node_modules` kullanılabilir.
Chromium yolu `WF_CHROME` ile değiştirilebilir. Test verileri tamamen sentetiktir.

## Kalan riskler / açık uyumluluk sınırları

- Stok kontrolü rezervasyon değildir; eşzamanlı iki sipariş için atomik rezervasyon
  hâlâ gerekir. Bu görevde mevcut stok verisi değiştirilmedi.
- Eski stüdyo sepeti `bid` model kimliğini saklamaz. Aynı ürün/kesime uyan birden
  fazla model varsa güvenli fiyat seçilemez ve 409 döner. Geçersiz/eksik katalog
  fiyatları da reddedilir. Bu sınır studyo.html'e dokunmadan tamamen giderilemez;
  model bilgisi taşınması için ayrı proje sahibi kararı gerekir.
- Tarayıcının bildirdiği baskı seçimi sipariş seçimidir; yüklenen PNG'nin bu seçime
  uyduğu üretimde kontrol edilmelidir. Tasarım motoru/çıktı doğrulaması kapsam dışıdır.
- Özel indirim belgeleri manuel kontrol bekler. Sunucu sabit oranı uygular ama
  belgenin gerçekliğini otomatik onaylamaz; `doc_status=bekliyor` korunur.
- Misafir e-postası doğrulanmış sayılmaz. Capability başka sepeti değiştirmeyi
  engeller; sahte e-postayla yeni kayıt/spam veya e-posta sahipliği sorununu çözmez.
  Mevcut SMTP/endpoint maliyet sınırları ve XSS/capability çalınması ayrı risklerdir.
- Yetkili görevlerin paralel çalışmasında e-posta tekrarını kesin önleyen atomik
  claim/lock yok; token kimlik doğrular, exactly-once teslim garantisi vermez.
- Canlı Auth/RLS, gerçek extension/cron, SMTP ve ödeme/üretim uçtan uca test edilmedi.
  Canlıya dokunmama kuralı korundu. Tam canlı şema depoda bulunmuyor.
