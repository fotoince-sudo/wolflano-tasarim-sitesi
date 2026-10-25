// Hoş geldin maili: üye ilk kez oturum açınca (kayıt ya da ilk giriş) bir kez gönderilir.
// Yalnız oturum sahibinin kendi adresine gider; tekrar çağrılsa da ikinci kez göndermez (user_metadata.welcomed).
// 7 günden eski hesaplara (sistem kurulmadan önceki üyeler) mail atılmaz, yalnız işaretlenir.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMail, frame, esc, SITE, smtpReady } from "../_shared/posta.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ud, error } = await sb.auth.getUser(tok);
  const u = ud?.user;
  if (error || !u || !u.email) return j({ ok: false }, 401);
  const meta = u.user_metadata || {};
  if (meta.welcomed) return j({ ok: true, skipped: true });
  const fresh = Date.now() - new Date(u.created_at).getTime() < 7 * 86400000;
  if (fresh) {
    if (!smtpReady()) return j({ ok: false, reason: "smtp" }, 503);
    const first = String(meta.name || "").trim().split(/\s+/)[0];
    const html = frame({
      title: "Wolflano'ya hoş geldin" + (first ? ", " + first : ""),
      pre: "Hesabın hazır.",
      body: `<p style="margin:0 0 12px">Merhaba${first ? " " + esc(first) : ""},</p>` +
        `<p style="margin:0 0 12px">Aramıza katıldığın için teşekkürler. Wolflano'da logoya değil kumaşa para ödersin: 240 gram tişört, 280 gram polo, 380 gram sweatshirt ve kalıcı baskı.</p>` +
        `<p style="margin:0 0 6px">Hesabınla:</p><ul style="margin:0 0 12px;padding-left:20px"><li>Siparişlerini ve favorilerini takip edebilir,</li><li>Baskı Atölyesi'nde kendi tasarımını yapıp kaydedebilir,</li><li>Tükenen ürünler gelince haber alabilirsin.</li></ul>` +
        `<p style="margin:0 0 12px">Doğum gününü Hesabım sayfasına eklersen o gün seni unutmayız.</p>`,
      btn: { href: SITE + "#hesabim", label: "Hesabıma git" },
    });
    try {
      await sendMail({ to: u.email, subject: "Wolflano'ya hoş geldin", html, text: `Wolflano'ya hoş geldin${first ? " " + first : ""}! Hesabın hazır: ${SITE}` });
    } catch (e) { console.error("hosgeldin", String((e as any)?.message || e)); return j({ ok: false }, 502); }
  }
  await sb.auth.admin.updateUserById(u.id, { user_metadata: { ...meta, welcomed: true } });
  return j({ ok: true, sent: fresh });
});
