// Ortak e-posta yardımcıları: info@wolflano.com.tr adına TurkHosting SMTP (465) ile gönderim ve Wolflano tarzı e-posta şablonu.
// Gizli ayarlar: SMTP_HOST, SMTP_USER, SMTP_PASS (isteğe bağlı SMTP_PORT, SMTP_SERVER).
import nodemailer from "npm:nodemailer@6.9.14";

export const SITE = "https://wolflano.com.tr/";
export const GREEN = "#3f8f55";
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const tl = (n: unknown) => "₺" + (Math.round((+n || 0) * 100) / 100).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function smtpReady() {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));
}

export async function sendMail(m: { to: string | string[]; subject: string; text?: string; html?: string; replyTo?: string }) {
  const host = Deno.env.get("SMTP_HOST"), user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) throw Object.assign(new Error("SMTP ayarları eksik"), { code: "not_connected" });
  const port = +(Deno.env.get("SMTP_PORT") || 465);
  // TurkHosting sertifikası sunucunun kendi adına; mail.alanadi ile olmazsa sunucu adıyla bağlanılır
  const hosts = [host, Deno.env.get("SMTP_SERVER") || "static-159-253-45-63.sunucuhub.com"].filter((h, i, a) => h && a.indexOf(h) === i);
  let last: unknown = null;
  for (const h of hosts) {
    try {
      const tx = nodemailer.createTransport({ host: h, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 15000 });
      return await tx.sendMail({ from: { name: "Wolflano", address: user }, replyTo: m.replyTo || user, to: m.to, subject: m.subject, text: m.text, html: m.html });
    } catch (e) {
      last = e;
      const s = String((e as any)?.message) + String((e as any)?.code);
      if (!/certificate|ESOCKET|ECONN|ETIMEDOUT|ENOTFOUND/i.test(s)) break;
    }
  }
  throw last;
}

/** Wolflano tarzı e-posta: üstte marka, beyaz kart, isteğe bağlı yeşil düğme, altta iletişim. body HTML'dir (önceden kaçırılmış olmalı). */
export function frame(o: { title: string; body: string; btn?: { href: string; label: string }; pre?: string }) {
  const btn = o.btn
    ? `<p style="margin:26px 0 6px"><a href="${esc(o.btn.href)}" style="display:inline-block;background:${GREEN};color:#fff;border:2px solid #111;border-radius:12px;padding:12px 22px;text-decoration:none;font-weight:bold">${esc(o.btn.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>
<body style="margin:0;background:#eef3ef;font-family:Arial,Helvetica,sans-serif;color:#141816">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.pre || "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:4px 4px 16px;font:700 20px Arial,sans-serif;letter-spacing:.14em">WOLF<span style="color:${GREEN}">LANO</span></td></tr>
<tr><td style="background:#fff;border:1px solid #dde5df;border-radius:16px;padding:26px 24px;font-size:15px;line-height:1.6">
<h1 style="margin:0 0 14px;font:700 21px Arial,sans-serif;color:#141816">${esc(o.title)}</h1>
${o.body}${btn}
</td></tr>
<tr><td style="padding:16px 6px;color:#6b746e;font-size:12px;line-height:1.6">Wolflano · İzmir, Türkiye<br>
<a href="${SITE}" style="color:#6b746e">wolflano.com.tr</a> · <a href="mailto:info@wolflano.com.tr" style="color:#6b746e">info@wolflano.com.tr</a> · WhatsApp +90 530 764 17 17</td></tr>
</table></td></tr></table></body></html>`;
}

/** Düz metni paragraflara çevirir (kaçırarak). */
export const paras = (t: string) => String(t || "").trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
