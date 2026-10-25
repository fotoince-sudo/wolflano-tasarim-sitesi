// Doğum günü maili: her sabah (cron 09:05 TR) bugün doğum günü olan üyelere ve CRM müşterilerine kutlama maili gönderir.
// Her kişiye yılda bir kez (dogum_yil). Tekrar çağrılsa da aynı kişiye ikinci kez gitmez.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMail, frame, esc, SITE, smtpReady } from "../_shared/posta.ts";

const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  if (!smtpReady()) return j({ ok: false, reason: "SMTP ayarları eksik" }, 503);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }); // YYYY-MM-DD
  const year = +ymd.slice(0, 4), today = ymd.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = today === "02-28" && !leap ? ["02-28", "02-29"] : [today]; // 29 Şubat doğanlar artık olmayan yılda 28'inde kutlanır

  const sent = new Set<string>(); let n = 0; const errs: string[] = [];
  const mail = (ad: string) => {
    const first = String(ad || "").trim().split(/\s+/)[0];
    return frame({
      title: "İyi ki doğdun" + (first ? ", " + first : ""),
      pre: "Wolflano ailesinden doğum günü kutlaması",
      body: `<p style="margin:0 0 12px">Merhaba${first ? " " + esc(first) : ""},</p>` +
        `<p style="margin:0 0 12px">Bugün senin günün. Wolflano ailesi olarak doğum gününü kutlar; sağlık, huzur ve sessiz bir güçle dolu bir yıl dileriz.</p>` +
        `<p style="margin:0 0 12px">Yeni yaşında kendini şımartmak istersen koleksiyonumuz ve kendi tasarımını yapabileceğin baskı atölyemiz seni bekliyor.</p>`,
      btn: { href: SITE, label: "Wolflano'ya göz at" },
    });
  };
  const send = async (to: string, ad: string) => {
    const k = to.toLowerCase(); if (!to || sent.has(k)) return false;
    await sendMail({ to, subject: "İyi ki doğdun! 🎂 Wolflano", html: mail(ad), text: `İyi ki doğdun${ad ? " " + ad.split(" ")[0] : ""}! Wolflano ailesi olarak doğum gününü kutlarız. ${SITE}` });
    sent.add(k); n++; return true;
  };

  // Üyeler (Hesabım'da doğum gününü girenler)
  const { data: ps } = await sb.from("profiles").select("id,ad,dogum,dogum_yil").in("dogum", days).or(`dogum_yil.is.null,dogum_yil.lt.${year}`).limit(500);
  for (const p of ps || []) {
    try {
      const { data: u } = await sb.auth.admin.getUserById(p.id);
      const em = u?.user?.email; if (!em) continue;
      await send(em, p.ad || u.user.user_metadata?.name || "");
      await sb.from("profiles").update({ dogum_yil: year }).eq("id", p.id);
      await sb.from("crm_customers").update({ dogum_yil: year }).ilike("email", em);
    } catch (e) { errs.push(String((e as any)?.message || e).slice(0, 120)); }
  }
  // CRM müşterileri (yönetimden doğum günü girilenler)
  const { data: cs } = await sb.from("crm_customers").select("email,ad,dogum,dogum_yil").in("dogum", days).or(`dogum_yil.is.null,dogum_yil.lt.${year}`).limit(500);
  for (const c of cs || []) {
    try {
      await send(c.email, c.ad || "");
      await sb.from("crm_customers").update({ dogum_yil: year }).eq("email", c.email);
    } catch (e) { errs.push(String((e as any)?.message || e).slice(0, 120)); }
  }
  if (errs.length) console.error("dogum-gunu", errs);
  return j({ ok: true, sent: n, errors: errs.length });
});
