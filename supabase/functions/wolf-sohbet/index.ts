// Wolf'la konuş: yalnız yönetici (site sahibi ve yetkili kişiler) için sohbet.
// Wolf mesajı okur, eklenen görseli (ör. az önceki tasarım) yorumlar, önce ne çizeceğini yazıyla anlatır.
// Çizim yalnız yönetici açıkça onay verince istenir; çizimi istemci bz-image ile yaptırır.
// Sohbet ucuz bir metin modeliyle çalışır; ücretli olan yalnız çizimdir.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYS = `Sen Wolf'sun: Wolflano markasının tasarım asistanı. Yalnızca Wolflano'nun sahibiyle (yönetici) konuşuyorsun; müşterilerle asla konuşmazsın.

Wolflano: İzmir'de, sportif-günlük erkek/kadın/çocuk giyim ve kişiye özel baskı markası (tişört, polo, sweatshirt, kapüşonlu, şapka, süblimasyon kupa, canvas tablo). Marka ruhu: "Sessiz Güç", "Sabır ve Adalet", "İtalyan Estetiği"; kurt figürü, Türkiye'nin tarihi ve kökleri, minimalist-lüks çizgi. Marka rengi logodaki kurdun açık nane yeşili. Kalite değişmez kuraldır.

Nasıl konuşursun:
- Her zaman Türkçe, kısa ve sıcak yaz; telefon ekranında okunacak, en fazla 4-5 kısa cümle.
- Görsel eklenmişse önce ne gördüğünü bir-iki cümleyle söyle (konu, renkler, tarz, güçlü ve zayıf yanı).
- Tasarım istendiğinde önce planını yaz: ne çizeceksin, hangi tarzda, hangi renklerde, hangi ürün ve baskı alanı için. Sonra "Çizeyim mi?" diye sor.
- Yönetici açıkça onay vermeden ("çiz", "tamam", "olur", "evet", "onaylıyorum", "başla" gibi) ASLA çizim isteme; çünkü her çizim para tutar. Sohbet, soru ve fikir alışverişi ücretsizdir.
- Onay gelince "ciz" alanını doldur ve cevapta kısaca "Çiziyorum" de.
- Kaydetme, ürün yapma ve baskıya gönderme işlerini yönetici aynı kutuya "şablon olarak kaydet", "ürün yap", "baskıya gönder" yazarak yaptırır; sorulursa bunu hatırlat.
- Marka logosu çizmezsin; başka markaların logosunu, karakterlerini ya da telifli eserlerini kopyalamazsın.

Cevabını SADECE şu JSON biçiminde ver:
{"cevap":"yöneticiye Türkçe mesajın","ciz":null}
Onay geldiyse:
{"cevap":"...","ciz":{"istem":"çizecek ressama İNGİLİZCE, en fazla 900 karakterlik tarif. Yöneticinin söylediği HER ayrıntıyı (konu, yerleşim, renkler, tarz, yazı) eksiksiz ve aynen aktar; kendinden konu, nesne, çerçeve ya da süs EKLEME. Tasarıma yazılacak yazı tırnak içinde ve Türkçe harfleriyle","tarz":"illus|cartoon|pencil|canvas|real|tisort|kurt|tarih","yon":"portrait|landscape","gorseli_kullan":true}}
"gorseli_kullan": yönetici son çizimde ya da eklediği görselde DEĞİŞİKLİK istiyorsa (ör. "rengini değiştir", "kurdu büyüt", "yazıyı düzelt") MUTLAKA true: böylece çizim baştan değil, son hâlinin üzerinden yalnız istenen yer değiştirilerek yapılır. Tamamen yeni bir tasarım isteniyorsa false.
- Plan yazarken yöneticinin istediğinden sapma; kendi fikrini ancak sorulursa öner. Talimat belirsizse çizmeden önce bir kısa soru sor.
"tarz" seçimi: tişört grafiği için çoğunlukla "tisort"; kurtla insan portresi "kurt"; kurt ve tarihi yer "tarih"; sade vektör "illus"; karikatür "cartoon"; kalem "pencil"; yağlı boya/tablo "canvas".`;

type Msg = { role: 'user' | 'assistant'; text?: string; image?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return j({ error: 'not_configured', message: 'Wolf henüz etkinleştirilmedi.' }, 503);

    // Yalnız yönetici: site sahibi ya da wf_staff tablosundaki yetkili kişiler
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SRK, Authorization: `Bearer ${tok}` } });
    if (!ur.ok) return j({ error: 'auth', message: 'Önce yönetici girişi yapmalısın.' }, 401);
    const uj = await ur.json();
    const em = String(uj.email || '').toLowerCase();
    let isAdm = em === 'ergunince68@hotmail.com';
    if (!isAdm && em) {
      const sr = await fetch(`${SB_URL}/rest/v1/wf_staff?select=email&email=eq.${encodeURIComponent(em)}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
      if (sr.ok) { const sj = await sr.json(); isAdm = Array.isArray(sj) && sj.length > 0; }
    }
    if (!isAdm) return j({ error: 'forbidden', message: 'Wolf sohbeti yalnız yönetici içindir.' }, 403);

    const body = await req.json();
    const list: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-14) : [];
    if (!list.length) return j({ error: 'empty', message: 'Bir şey yaz.' }, 400);
    const ctx = String(body.context || '').slice(0, 400);

    // Maliyeti düşük tutmak için yalnız son görsel modele gönderilir (düşük çözünürlükte)
    let lastImg = -1;
    list.forEach((m, i) => { if (m && m.role === 'user' && typeof m.image === 'string' && /^data:image\//.test(m.image)) lastImg = i; });
    const msgs: unknown[] = [{ role: 'system', content: SYS + (ctx ? `\n\nŞu anki stüdyo durumu: ${ctx}` : '') }];
    list.forEach((m, i) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const text = String(m.text || '').slice(0, 2000) || (i === lastImg ? '(görsel ekledim)' : '');
      if (i === lastImg) {
        if ((m.image as string).length > 8_000_000) return;
        msgs.push({ role, content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: m.image, detail: 'low' } }] });
      } else if (text) msgs.push({ role, content: text });
    });

    const envModel = Deno.env.get('OPENAI_CHAT_MODEL') || '';
    const models = [envModel, 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'].filter((m, i, a) => m && a.indexOf(m) === i);
    let r: Response | null = null, out: any = null;
    for (const model of models) {
      r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs, response_format: { type: 'json_object' }, max_completion_tokens: 1500 }),
        signal: AbortSignal.timeout(60000),
      });
      out = await r.json().catch(() => ({}));
      if (r.ok) { console.log('model', model); break; }
      const t = JSON.stringify(out?.error || out).toLowerCase();
      console.error('openai', model, r.status, t.slice(0, 200));
      if (!(r.status === 404 || (r.status === 400 && /model/.test(t)))) break;
    }
    if (!r || !r.ok) return j({ error: 'fail', message: 'Wolf şu an cevap veremedi. Biraz sonra yeniden dene.' }, 502);

    const raw = String(out?.choices?.[0]?.message?.content || '');
    let p: any = null;
    try { p = JSON.parse(raw); } catch (_) { const m = /\{[\s\S]*\}/.exec(raw); if (m) { try { p = JSON.parse(m[0]); } catch (_) { /* yok */ } } }
    const cevap = String(p?.cevap || raw || '').slice(0, 3000).trim() || 'Anlayamadım, biraz daha açık yazar mısın?';
    let ciz = null;
    const c = p?.ciz;
    if (c && typeof c === 'object' && String(c.istem || '').trim()) {
      const ok = ['illus', 'cartoon', 'pencil', 'canvas', 'real', 'tisort', 'kurt', 'tarih'];
      ciz = {
        istem: String(c.istem).slice(0, 1000).trim(),
        tarz: ok.includes(c.tarz) ? c.tarz : 'tisort',
        yon: c.yon === 'landscape' ? 'landscape' : 'portrait',
        gorseli_kullan: c.gorseli_kullan === true && lastImg >= 0,
      };
    }
    return j({ ok: true, cevap, ciz });
  } catch (e) {
    console.error('wolf-sohbet', String(e));
    return j({ error: 'fail', message: 'Wolf şu an cevap veremedi. Biraz sonra yeniden dene.' }, 500);
  }
});
