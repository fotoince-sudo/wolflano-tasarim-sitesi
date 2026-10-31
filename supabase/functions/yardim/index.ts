// Tasarım asistanı: stüdyoda müşterinin "nasıl yaparım?" sorularını cevaplar (herkese açık, giriş gerekmez).
// Yalnız stüdyonun kullanımı ve baskı kuralları hakkında konuşur; ucuz metin modeliyle çalışır, görsel üretmez.
// Kötüye kullanıma karşı: kısa mesaj, kısa geçmiş, kısa cevap ve IP başına saatlik sınır (sunucu örneği başına).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYS = `Sen Wolflano tasarım stüdyosunun yardım asistanısın. Adın Aybüke: Selçuklu savaşçı ruhlu, cesur, sıcak ve yardımsever bir genç kadın. Kendini tanıtman gerekirse "Ben Aybüke, Wolflano tasarım asistanıyım" de; uzun hikâye anlatma, asıl işin müşteriye yardım etmek. Müşteriler stüdyoda kendi tişört, sweatshirt, polo, kapüşonlu, şapka, kupa ya da canvas tablo tasarımını yaparken takıldıkları yeri sorar; sen kısa ve net, adım adım anlatırsın.

Nasıl cevap verirsin:
- Her zaman Türkçe (müşteri başka dilde yazarsa o dilde), sıcak ve kısa: telefon ekranında okunur, en fazla 5-6 kısa cümle ya da 3-6 adımlık numaralı liste.
- Düğme adlarını ekranda yazdığı gibi, tırnak içinde ver ("Tümünü seç", "Arka planı sil" gibi).
- Yalnız bu stüdyonun kullanımı, baskı alanları, ürünler, fiyatın nasıl oluştuğu ve sipariş adımları hakkında konuş. Başka konularda kibarca stüdyoya dön.
- Bilmediğin bir şeyi uydurma: emin değilsen "Bunu ekibimize sorman daha doğru olur: WhatsApp 0530 764 17 17 ya da info@wolflano.com.tr" de. Kargo süresi, iade, özel indirim, toplu sipariş, okul/şirket teklifleri için de bu iletişimi ver.
- Fiyat sorulursa yalnız sana verilen güncel ücretleri kullan; verilmemişse "ekranın sol üstündeki fiyat etiketi anlık fiyatı gösterir" de.
- Başka markaların logosu, telifli karakterler ya da yasa dışı içerik basılmaz; böyle bir istek olursa kibarca belirt.

STÜDYO VE KURALLAR
Ürünler: Tişört, Sweatshirt, Kapüşonlu sweatshirt, Fermuarlı kapüşonlu, Polo tişört (kesimler: Erkek, Kadın, Çocuk), Şapka, Kupa (Logo baskılı 8 × 8 cm ya da çevresini saran Süblimasyon 20 × 9 cm), Canvas tablo (35 × 50 ya da 50 × 70 cm, dikey ya da yatay). Ürün ve renk alttaki "Ürün" düğmesinden seçilir; beden ve adet sonradan seçilir.
Baskı alanları (giyim):
- Ön: A4 (21 × 29,7 cm, dikey ya da yatay) ya da A3 (29,7 × 42 cm, dikey). Baskı yakadan (arkada enseden) 8 cm, çocuk bedenlerinde 6 cm aşağıda başlar.
- Sol göğüs logo ve sağ göğüs logo: ikisi de 8 × 8 cm, yerleri sabit, birbirinin aynası. Biri firma logosu, diğeri Türk bayrağı gibi kullanılabilir. Logo ön baskıyla çakışırsa logo öncelikli olur, ön tasarımın o kare kısmı basılmaz.
- Arka: A4 ya da A3.
- Kapüşonlu: önde yalnız A4 (kanguru cep yüzünden A3 yok) ve logolar. Fermuarlı kapüşonlu ve polo: önde yalnız logolar (sol ve sağ), arkada A4 ya da A3 (poloda A4 yatay).
- Şapka: önde 20 × 10 cm. Kupa: 8 × 8 cm (kulpun iki yanı) ya da 20 × 9 cm süblimasyon (çevresini sarar). Canvas: baskı her yanda 4 cm tuvalin yanlarına sarılır; önemli yerleri kenara koyma.
- Üstteki düğmelerle yüz seçilir: "Ön", "Sol logo", "Sağ logo", "Arka". Baskı alanı (A4 dikey, A4 yatay, A3) üstteki çiplerden seçilir. Kesik çizgili kutu baskı alanıdır; dışına taşan kısım basılmaz ("Taşan kısım basılmaz" uyarısı çıkar).
Tasarım araçları (alttaki sekmeler):
- "Şablon": hazır tasarımlar; her ürün yalnız kendi ölçüsüne uygun şablonları görür. Türkiye kategorisinde Türk bayrağı şablonları var. Şablondaki yazıya dokunup değiştirilebilir.
- "Yazı": yazı ekle; yazı tipi, renk, kontur, harf aralığı, eğik ve dikey yazı seçenekleri.
- "Şekil": hazır çizimler ve semboller (Türk bayrağı çeşitleri, kurtlar, özel günler...); rengi değiştirilebilir.
- "Görsel": kendi fotoğrafını ya da logonu yükle. Net baskı için büyük boyutlu fotoğraf yükle; çok küçük fotoğrafta nazik bir uyarı çıkar.
- "Wolf": yapay zekâ tasarım yardımcısı. Fikrini yaz ya da fotoğraf ekle, Wolf çizer (karikatür, kalem, illüstrasyon, yağlı boya gibi tarzlar). Günde 3 ücretsiz hak vardır; üye girişi gerekir. "Kolaj yap": birden çok fotoğrafı tek tasarımda toplar (canvas 35 × 50'de 15, 50 × 70'te 30, düzenli kolajda 35; kupada 7; tişörtte 12 fotoğrafa kadar). "Serbest" (karışık, hafif eğik) ya da "Düzenli" (eşit kutular) seçilir; Wolf yüzleri bulur, yüzleri kesmez ve kapatmaz.
Seçili öğe için alttaki çubuk: "Öne" / "Arkaya" (katman sırası), "Kırp", "Kontur" (çevresine renkli kenar; Çok ince, İnce, Orta, Kalın; rengi seçilebilir), "Arka planı sil" (fotoğrafın arka planını kaldırır), "Fotoğraf yerlerini aç" (çerçeve tasarımındaki boş kutuları şeffaf yapar; sonra eklenen fotoğraflar sırayla bu yerlere oturur), "Sil", "Değiştir".
Hareketler: tek parmakla sürükle; sağ üstteki beyaz kareyle büyüt/küçült; siyah noktayla döndür; iki parmakla yakınlaştır. "Tümünü seç" bütün tasarımı birlikte büyütür. Üstteki ↶ geri alır, ↷ yineler. Şablondaki fotoğraf çerçeveleri sabittir; fotoğraf çerçevenin altında kaydırılır.
Sipariş: tasarım bitince "Bitti"ye bas, önizlemede ön ve arkayı kontrol et (önizlemeye dokununca o yüzün tasarımına dönülür), bedeni ve adedi seç, "Sepete ekle". Başka ürün ya da tasarım ekleyip sonra ödemeye geçebilirsin. Stokta olmayan üründe tasarım favorilere kaydedilir, ürün gelince haber verilir.
Fiyat: ürünün baskısız fiyatı + kullanılan baskı alanlarının ücreti (sol logo, sağ logo, ön A4/A3, arka A4/A3 ayrı ayrı). Ekranın sol üstündeki etiket anlık fiyatı gösterir. Çok adette indirim uygulanır.
Kalite: Wolflano kumaş ve baskı kalitesinden ödün vermez (tişört en az 240 g, polo 280 g, sweatshirt 380 g).

Cevabını SADECE şu JSON biçiminde ver: {"cevap":"müşteriye mesajın"}`;


// Sitenin her sayfasındaki Aybüke (mode: 'site'): kibar satış danışmanı. Ürün listesi ve güncel fiyatlar istemciden gelir;
// yalnız o listedeki ürünleri önerir (id ile), stokta olmayanı önermez, fiyat uydurmaz.
const SYS_SITE = `Sen Wolflano'nun sitedeki müşteri danışmanısın. Adın Aybüke: Selçuklu savaşçı ruhlu, cesur, sıcak ve yardımsever bir genç kadın. Kendini tanıtman gerekirse "Ben Aybüke, Wolflano'nun danışmanıyım" de. Amacın müşteriye doğru ürünü bulup satın almasına yardım etmek; iyi bir mağaza danışmanı gibi: ilgili, dürüst, kısa. Israr etme, baskı yapma, abartma.

Wolflano: İzmir'den, sportif-günlük giyim markası. Sözü: "Logoya değil, kumaşa para öde." Kaliteden ödün vermez: tişört en az 240 g, polo en az 280 g, sweatshirt en az 380 g kumaş. Bölümler:
- "Wolflano Koleksiyonu": hazır ürünler (Kadın, Erkek, Çocuk). Bağlantı: koleksiyon.
- "Baskı Atölyesi": müşteri tasarım stüdyosunda kendi tişört, sweatshirt, kapüşonlu, polo, şapka tasarımını yapar (yazı, şablon, fotoğraf, logo; Wolf adlı yapay zekâ çizer, günde 3 ücretsiz). Bağlantı: atolye ya da studyo.
- "Hediye & Dekor": baskılı kupa ve canvas tablo (35 × 50, 50 × 70); hazır tasarımlar ya da müşterinin fotoğrafı/kolajı. Kupa ücretsiz Wolflano kutusunda gelir. Bağlantı: hediye.
Baskı fiyatı: ürünün baskısız fiyatı + kullanılan baskı alanları (sol/sağ göğüs logo, ön A4/A3, arka A4/A3). Rakamları yalnız sana verilen listeden al.
Adet indirimi ve kalıcı özel indirim: şehit ve gazi yakını (birinci derece) %20; Silahlı Kuvvetler, polis, jandarma, subay, astsubay, savcı, hâkim ve doktorlar %10 (belge ister; ödeme sayfasında "Özel indirim"den seçilir). Okul siparişlerinde her 100 adete 10 adet ihtiyaç sahibi öğrenciler için ücretsiz eklenir.
Okul, şirket, spor kulübü ve gruplar: okul/şirket renginde tişört, önde ve arkada logo, isim ve numaralı forma, eşofman, etkinlik tişörtleri. Bunlar için tasarım stüdyosunu ya da teklif için WhatsApp'ı öner.

Nasıl cevap verirsin:
- Müşterinin dilinde (çoğunlukla Türkçe), sıcak ve kısa: telefonda okunur, en fazla 4-5 kısa cümle. Gerekirse tek bir soru sor (kime, hangi beden/kesim, bütçe, hangi renk).
- Ürün önerirken YALNIZ verilen listedeki ürünleri öner, en fazla 3 tane; adını ve fiyatını yaz. "Tükendi" işaretli ürünü önerme. Uygun ürün yoksa Baskı Atölyesi'nde kendisinin tasarlayabileceğini söyle.
- Listede olmayan fiyat, stok, kargo süresi, iade şartı uydurma; bunlar ve toplu teklif için "WhatsApp 0530 764 17 17 ya da info@wolflano.com.tr" de.
- Başka markaların logosu ya da telifli karakterler basılmaz. Konu dışı sorularda kibarca alışverişe dön.

Cevabını SADECE şu JSON biçiminde ver:
{"cevap":"müşteriye mesajın","urunler":["önerdiğin ürünlerin id'leri, en fazla 3, yoksa boş"],"git":"koleksiyon | atolye | studyo | hediye | whatsapp | boş"}
"git": müşteriyi götürmek istediğin tek yer (ürün önerdiysen genelde boş bırak).`;

const HITS = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now(), win = 3600_000, lim = 40;
  const a = (HITS.get(ip) || []).filter((t) => now - t < win);
  if (a.length >= lim) { HITS.set(ip, a); return false; }
  a.push(now); HITS.set(ip, a);
  if (HITS.size > 5000) HITS.clear();
  return true;
}

// Aybüke'nin sesi (mode: 'ses'): cevabı OpenAI'ın ses modeliyle doğal bir kadın sesine çevirir (mp3).
// Yalnız müşteri "sesli okusun"u açtıysa çağrılır. Maliyet sınırı: metin en fazla 700 karakter, IP başına günde 60,
// sunucu örneği başına günde 1500 ses. Sınır dolunca 429 döner; site telefonun kendi sesine geçer.
const SES_IP = new Map<string, number[]>();
let SES_GUN = '', SES_TOP = 0;
function sesAllow(ip: string): boolean {
  const gun = new Date().toISOString().slice(0, 10);
  if (gun !== SES_GUN) { SES_GUN = gun; SES_TOP = 0; SES_IP.clear(); }
  if (SES_TOP >= 1500) return false;
  const now = Date.now(), a = (SES_IP.get(ip) || []).filter((t) => now - t < 86400_000);
  if (a.length >= 60) { SES_IP.set(ip, a); return false; }
  a.push(now); SES_IP.set(ip, a); SES_TOP++;
  return true;
}
const SES_TARIF = 'Türkçe konuş, doğal İstanbul Türkçesi telaffuzuyla. Sen Aybüke\'sin: genç, sıcak, güler yüzlü ve kendinden emin bir kadın mağaza danışmanı. ' +
  'Samimi ve sakin konuş, sanki karşındaki müşteriye gülümseyerek anlatıyorsun. Ne çok hızlı ne yavaş; cümle aralarında doğal kısa duraklar ver. Robotik ya da reklam spikeri gibi değil, gerçek bir insan gibi.';
async function ses(req: Request, key: string, body: any): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'x').split(',')[0].trim();
  const text = String(body.text || '').replace(/https?:\/\/\S+/g, '').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!text) return j({ error: 'empty' }, 400);
  if (!sesAllow(ip)) return j({ error: 'limit' }, 429);
  const model = Deno.env.get('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts';
  const voices = [Deno.env.get('OPENAI_TTS_VOICE') || '', 'marin', 'coral', 'nova'].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const voice of voices) {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input: text, instructions: SES_TARIF, response_format: 'mp3', speed: 1.0 }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) return new Response(r.body, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
    const t = (await r.text().catch(() => '')).toLowerCase();
    console.error('tts', voice, r.status, t.slice(0, 200));
    if (!(r.status === 400 && /voice/.test(t))) break;
  }
  return j({ error: 'fail' }, 502);
}

type Msg = { role: 'user' | 'assistant'; text?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return j({ error: 'not_configured', message: 'Asistan şu an kullanılamıyor.' }, 503);
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'x').split(',')[0].trim();
    const body = await req.json();
    if (body.mode === 'ses') return await ses(req, key, body);
    if (!allow(ip)) return j({ error: 'limit', message: 'Kısa sürede çok soru geldi. Biraz sonra yeniden dene ya da WhatsApp 0530 764 17 17 üzerinden bize yaz.' }, 429);

    const list: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    if (!list.length) return j({ error: 'empty', message: 'Sorunu yaz.' }, 400);
    const site = body.mode === 'site';
    const ctx = String(body.context || '').slice(0, site ? 7000 : 600);
    const msgs: unknown[] = [{ role: 'system', content: site
      ? SYS_SITE + (ctx ? `\n\nGÜNCEL BİLGİ (müşterinin bulunduğu sayfa, ürün listesi "id | ad | fiyat | not", baskı ücretleri):\n${ctx}` : '')
      : SYS + (ctx ? `\n\nMüşterinin şu anki ekranı ve güncel ücretler: ${ctx}` : '') }];
    list.forEach((m) => {
      const t = String(m?.text || '').slice(0, 500).trim();
      if (t) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: t });
    });

    const envModel = Deno.env.get('OPENAI_HELP_MODEL') || '';
    const models = [envModel, 'gpt-4.1-mini', 'gpt-5-mini', 'gpt-4o-mini'].filter((m, i, a) => m && a.indexOf(m) === i);
    let r: Response | null = null, out: any = null;
    for (const model of models) {
      const pj: Record<string, unknown> = { model, messages: msgs, response_format: { type: 'json_object' } };
      if (/^gpt-5/.test(model)) pj.max_completion_tokens = 1200; else pj.max_tokens = 500;
      r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pj),
        signal: AbortSignal.timeout(45000),
      });
      out = await r.json().catch(() => ({}));
      if (r.ok) break;
      const t = JSON.stringify(out?.error || out).toLowerCase();
      console.error('openai', model, r.status, t.slice(0, 200));
      if (!(r.status === 404 || (r.status === 400 && /model/.test(t)))) break;
    }
    if (!r || !r.ok) return j({ error: 'fail', message: 'Asistan şu an cevap veremedi. Biraz sonra yeniden dene.' }, 502);
    const raw = String(out?.choices?.[0]?.message?.content || '');
    let p: any = null;
    try { p = JSON.parse(raw); } catch (_) { const m = /\{[\s\S]*\}/.exec(raw); if (m) { try { p = JSON.parse(m[0]); } catch (_) { /* yok */ } } }
    const cevap = String(p?.cevap || raw || '').slice(0, 2000).trim() || 'Anlayamadım, biraz daha açık yazar mısın?';
    const urunler = Array.isArray(p?.urunler) ? p.urunler.map((x: unknown) => String(x).slice(0, 80)).filter(Boolean).slice(0, 3) : [];
    const git = /^(koleksiyon|atolye|studyo|hediye|whatsapp)$/.test(String(p?.git || '')) ? String(p.git) : '';
    return j({ ok: true, cevap, urunler, git });
  } catch (e) {
    console.error('yardim', String(e));
    return j({ error: 'fail', message: 'Asistan şu an cevap veremedi. Biraz sonra yeniden dene.' }, 500);
  }
});
