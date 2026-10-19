// Stoğa gelince haber ver: bekleyen kayıtların ürünü stoğa girdiyse üyeye e-posta gönderir.
// Ürünler kaydedilince (site_content güncellenince) ve saatte bir kendiliğinden çalışır.
// Gerekli gizli ayarlar: SMTP_HOST, SMTP_USER (info@wolflano.com.tr), SMTP_PASS. İsteğe bağlı: SMTP_PORT (varsayılan 465).
import nodemailer from "npm:nodemailer@6.9.14";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://wolflano.com.tr/";
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const inStock = (p: any) => p && p.show !== false && !(p.stock !== null && p.stock !== undefined && p.stock !== "" && +p.stock <= 0);

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await sb.from("stok_haber").select("*").is("notified_at", null).limit(300);
  if (!rows || !rows.length) return j({ ok: true, sent: 0 });
  const { data: sc } = await sb.from("site_content").select("data").eq("id", "main").single();
  const d: any = sc?.data || {};
  const find = (r: any) => (r.kind === "baski" ? (d.blanks || []) : (d.products || [])).find((x: any) => x.id === r.product_id);
  const due = rows.filter((r: any) => inStock(find(r)));
  if (!due.length) return j({ ok: true, sent: 0 });

  const host = Deno.env.get("SMTP_HOST"), user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) return j({ ok: false, reason: "SMTP ayarları eksik", due: due.length }, 503);
  const port = +(Deno.env.get("SMTP_PORT") || 465);
  // TurkHosting sertifikası sunucunun kendi adına; mail.alanadi ile olmazsa sunucu adıyla bağlanılır
  const hosts = [host, Deno.env.get("SMTP_SERVER") || "static-159-253-45-63.sunucuhub.com"].filter((h, i, a) => h && a.indexOf(h) === i);
  const txs = hosts.map((h) => nodemailer.createTransport({ host: h, port, secure: port === 465, auth: { user, pass } }));
  let ti = 0;
  const send = async (m: any) => { for (;;) { try { return await txs[ti].sendMail(m); } catch (e) { if (ti < txs.length - 1 && /certificate|ESOCKET|ECONN|ETIMEDOUT/i.test(String((e as any)?.message) + String((e as any)?.code))) { ti++; continue; } throw e; } } };

  let sent = 0; const errs: string[] = [];
  for (const r of due) {
    const p = find(r), name = p?.name || r.product_name || "Beklediğin ürün";
    const link = r.kind === "baski" ? SITE + "#favoriler" : SITE + "#urun-" + encodeURIComponent(r.product_id);
    const what = r.kind === "baski" ? "Tasarımın favorilerinde kayıtlı; şimdi sepete ekleyebilirsin." : "Stoklar sınırlı, beğendiysen gecikme.";
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111">
      <h2 style="margin:0 0 12px">Beklediğin ürün stoğa geldi</h2>
      <p>Merhaba${r.name ? " " + esc(r.name) : ""},</p>
      <p><b>${esc(name)}</b> yeniden stokta. ${what}</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#3f8f55;color:#fff;border:2px solid #111;border-radius:10px;padding:12px 20px;text-decoration:none;font-weight:bold">Ürüne git</a></p>
      <p style="color:#666;font-size:13px">Bu e-postayı Wolflano'da “Gelince haber ver” dediğin için aldın.<br>Wolflano · İzmir · +90 530 764 17 17</p></div>`;
    try {
      await send({ from: `"Wolflano" <${user}>`, replyTo: user, to: r.contact, subject: `${name} stoğa geldi`, html,
        headers: { "List-Unsubscribe": `<mailto:${user}?subject=Haber%20listesinden%20cik>` },
        text: `${name} yeniden stokta. ${what}\n${link}\n\nWolflano` });
      await sb.from("stok_haber").update({ notified_at: new Date().toISOString() }).eq("id", r.id);
      sent++;
    } catch (e) { errs.push(String((e as any)?.code || "") + " " + String((e as any)?.message || e).slice(0, 200)); /* bir sonraki çalışmada yeniden denenir */ }
  }
  return j({ ok: true, sent, due: due.length, via: hosts[ti], port, errs: errs.slice(0, 3) });
});
