// Yönetim panelinden e-posta gönderir (info@wolflano.com.tr adına, TurkHosting SMTP üzerinden).
// Yalnız yönetici ve yetkililer kullanabilir (is_wf_admin). Şifre kodda değil, Supabase gizli ayarlarındadır.
// Gerekli gizli ayarlar: SMTP_HOST, SMTP_USER (info@wolflano.com.tr), SMTP_PASS. İsteğe bağlı: SMTP_PORT (varsayılan 465), SMTP_SERVER.
// Not: Supabase 25 ve 587 numaralı portlardan dışarı bağlantıya izin vermez; 465 (SSL) kullanılır.
import nodemailer from "npm:nodemailer@6.9.14";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const mailOk = (s: string) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ error: "POST gerekli" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: isAdm, error: aerr } = await sb.rpc("is_wf_admin");
  if (aerr || !isAdm) return j({ code: "yetki", message: "Yalnız yönetici e-posta gönderebilir." }, 403);

  let b: any = {};
  try { b = await req.json(); } catch { return j({ code: "girdi", message: "İstek okunamadı." }, 400); }
  const to = (Array.isArray(b.to) ? b.to : String(b.to || "").split(/[,;\s]+/)).map((x: string) => String(x).trim()).filter(Boolean);
  if (!to.length || to.length > 20 || !to.every(mailOk)) return j({ code: "alici", message: "Alıcı e-posta adresi geçersiz." }, 400);
  const subject = String(b.subject || "").slice(0, 200).trim();
  if (!subject) return j({ code: "konu", message: "Konu boş olamaz." }, 400);
  const text = String(b.text || "").slice(0, 100000);
  const html = b.html ? String(b.html).slice(0, 500000) : undefined;
  if (!text && !html) return j({ code: "icerik", message: "E-posta içeriği boş." }, 400);

  const host = Deno.env.get("SMTP_HOST"), user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) return j({ code: "not_connected", message: "E-posta ayarları (SMTP) henüz girilmemiş." }, 503);
  const port = +(Deno.env.get("SMTP_PORT") || 465);
  // TurkHosting sertifikası sunucunun kendi adına; mail.alanadi ile olmazsa sunucu adıyla bağlanılır
  const hosts = [host, Deno.env.get("SMTP_SERVER") || "static-159-253-45-63.sunucuhub.com"].filter((h, i, a) => h && a.indexOf(h) === i);
  let last: any = null;
  for (const h of hosts) {
    try {
      const tx = nodemailer.createTransport({ host: h, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 15000 });
      const info = await tx.sendMail({
        from: { name: "Wolflano", address: user },
        replyTo: b.replyTo && mailOk(String(b.replyTo)) ? String(b.replyTo) : user,
        to, subject, text: text || undefined, html,
      });
      return j({ ok: true, id: info.messageId, via: h });
    } catch (e) {
      last = e;
      const m = String((e as any)?.message) + String((e as any)?.code);
      if (/EAUTH|Invalid login|535/i.test(m)) return j({ code: "sifre", message: "E-posta kullanıcı adı ya da şifresi hatalı." }, 502);
      if (!/certificate|ESOCKET|ECONN|ETIMEDOUT|ENOTFOUND/i.test(m)) break;
    }
  }
  console.error("mail-gonder", last);
  return j({ code: "gonderilemedi", message: "E-posta gönderilemedi: " + String(last?.message || "bilinmeyen hata").slice(0, 200) }, 502);
});
