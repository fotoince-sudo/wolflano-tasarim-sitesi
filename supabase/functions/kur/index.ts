// TCMB günlük döviz kurlarını (today.xml) okuyup JSON olarak verir. Tarayıcı TCMB'yi doğrudan okuyamaz (CORS), bu yüzden aracı.
// Yalnız yönetici ve yetkililer kullanır (is_wf_admin): İthalat hesaplayıcı ve tedarikçi kurları.
// İstek: POST {} → { tarih:"09.11.2026", kaynak:"TCMB", kurlar:{ USD:{ad,alis,satis,efAlis,efSatis}, ... } } (1 birim için TL)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

let cache: { t: number; v: unknown } | null = null;
const num = (s: string | undefined) => { const n = parseFloat(String(s || "").trim()); return isFinite(n) && n > 0 ? n : null; };
const tag = (blk: string, t: string) => { const m = blk.match(new RegExp("<" + t + ">([^<]*)</" + t + ">")); return m ? m[1] : undefined; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: isAdm, error: aerr } = await sb.rpc("is_wf_admin");
  if (aerr || !isAdm) return j({ code: "yetki", message: "Yalnız yönetici kurları okuyabilir." }, 403);

  if (cache && Date.now() - cache.t < 30 * 60 * 1000) return j(cache.v);
  try {
    const r = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { headers: { "User-Agent": "Wolflano-kur/1.0" } });
    if (!r.ok) return j({ code: "tcmb", message: "TCMB kurları alınamadı (" + r.status + ")." }, 502);
    const x = await r.text();
    const tarih = (x.match(/Tarih="([^"]+)"/) || [])[1] || "";
    const kurlar: Record<string, unknown> = {};
    for (const m of x.matchAll(/<Currency[^>]*CurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g)) {
      const kod = m[1], b = m[2], birim = num(tag(b, "Unit")) || 1;
      const f = (t: string) => { const n = num(tag(b, t)); return n ? Math.round((n / birim) * 1e6) / 1e6 : null; };
      const satis = f("ForexSelling");
      if (!satis) continue;
      kurlar[kod] = { ad: (tag(b, "Isim") || kod).trim(), alis: f("ForexBuying"), satis, efAlis: f("BanknoteBuying"), efSatis: f("BanknoteSelling") };
    }
    if (!Object.keys(kurlar).length) return j({ code: "tcmb", message: "TCMB yanıtı okunamadı." }, 502);
    const v = { tarih, kaynak: "TCMB", kurlar };
    cache = { t: Date.now(), v };
    return j(v);
  } catch (e) {
    return j({ code: "tcmb", message: "TCMB'ye bağlanılamadı: " + String((e as Error)?.message || e) }, 502);
  }
});
