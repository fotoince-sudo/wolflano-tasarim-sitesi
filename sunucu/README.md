# Wolflano sunucusu

Supabase'in yerine TurkHosting'de (Plesk, Node.js) çalışan sunucu. Site aynı adresleri kullanır:

| Adres | Görevi |
|---|---|
| `/rest/v1/...` | Veritabanı (PostgREST'in sitenin kullandığı kısmı) |
| `/auth/v1/...` | Üyelik: kayıt, giriş, şifre sıfırlama |
| `/storage/v1/...` | Dosyalar (`site`, `designs`, `belgeler`, `kasa`) |
| `/functions/v1/...` | `supabase/functions` içindeki 14 fonksiyon, kodu değişmeden |
| `/wf/durum` | Sunucunun durumu (gizli bilgi içermez) |
| `/wf/uyan` | Zamanlanmış işleri (stok haberi, doğum günü) kontrol eder |

## Güvenlik
- Veritabanına iki kullanıcıyla bağlanır. `wolflano_usr` tabloların sahibidir; kurulum ve sunucu fonksiyonları onu kullanır.
  Sitenin istekleri `wolflano_api` ile çalışır. Tabloların sahibi olmadığı için Supabase'deki erişim kuralları (RLS) ona birebir uygulanır.
- Şifreler `scrypt` ile saklanır. Oturum anahtarı (JWT) sırrı ilk açılışta üretilir ve veritabanında durur.

## Plesk ortam değişkenleri
Zorunlu: `DB_PASS`, `API_DB_PASS`. Önerilen: `SMTP_PASS` (info@ şifresi), `OPENAI_API_KEY`.
İsteğe bağlı (varsayılanlar `src/ayar.js` içinde): `API_DB_USER`, `DB_USER`, `DB_NAME`, `DB_PORT`, `PUBLIC_URL`, `SITE_URL`, `DEPO_DIR`.

## Geliştirme
```
npm install
npm run build        # app.cjs üretir (sunucuya giden tek dosya)
./test/calistir.sh   # yerel Postgres ile uçtan uca denemeler
```
`app.cjs` derlenmiş dosyadır; değişiklik `src/` ya da `supabase/functions/` içinde yapılır, sonra yeniden derlenir.
