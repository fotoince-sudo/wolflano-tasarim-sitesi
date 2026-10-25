// Yönetim panelinden e-posta gönderir (info@wolflano.com.tr adına, TurkHosting SMTP üzerinden).
// Yalnız yönetici ve yetkililer kullanabilir (is_wf_admin). Şifre kodda değil, Supabase gizli ayarlarındadır.
// brand:{title,btn?} gelirse düz metin Wolflano tarzı e-posta şablonuna yerleştirilir.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMail, frame, paras, smtpReady } from "../_shared/posta.ts";

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
  let html = b.html ? String(b.html).slice(0, 500000) : undefined;
  if (!html && b.brand && text) {
    const br = b.brand || {};
    const btn = br.btn && /^https:\/\//.test(String(br.btn.href || "")) ? { href: String(br.btn.href), label: String(br.btn.label || "Aç").slice(0, 40) } : undefined;
    html = frame({ title: String(br.title || subject).slice(0, 120), body: paras(text), btn, pre: text.slice(0, 90) });
  }
  if (!text && !html) return j({ code: "icerik", message: "E-posta içeriği boş." }, 400);
  if (!smtpReady()) return j({ code: "not_connected", message: "E-posta ayarları (SMTP) henüz girilmemiş." }, 503);

  try {
    const info = await sendMail({ to, subject, text: text || undefined, html, replyTo: b.replyTo && mailOk(String(b.replyTo)) ? String(b.replyTo) : undefined });
    return j({ ok: true, id: info.messageId });
  } catch (e) {
    const m = String((e as any)?.message) + String((e as any)?.code);
    if (/EAUTH|Invalid login|535/i.test(m)) return j({ code: "sifre", message: "E-posta kullanıcı adı ya da şifresi hatalı." }, 502);
    console.error("mail-gonder", e);
    return j({ code: "gonderilemedi", message: "E-posta gönderilemedi: " + String((e as any)?.message || "bilinmeyen hata").slice(0, 200) }, 502);
  }
});
