// Site kontrol robotunun raporu: GitHub'daki robot (Site kontrol) hata bulursa buraya gönderir, buradan e-posta gider.
// Alıcı sabittir (kodda), dışarıdan değiştirilemez. Giriş: GitHub Actions'ın imzalı kimlik belgesi (OIDC);
// yalnız bu deponun robotu gönderebilir, gizli anahtar gerekmez.
import { sendMail, frame, paras, smtpReady } from "../_shared/posta.ts";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const DEPO = "fotoince-sudo/wolflano-tasarim-sitesi";

const ALICI = "ergunince68@hotmail.com";
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ error: "POST gerekli" }, 405);
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
    const { payload } = await jwtVerify(tok, JWKS, { issuer: "https://token.actions.githubusercontent.com", audience: "wolflano-kontrol" });
    if (payload.repository !== DEPO) return j({ error: "yetki" }, 403);
  } catch (_) { return j({ error: "yetki" }, 403); }
  let b: any = {};
  try { b = await req.json(); } catch { return j({ error: "girdi" }, 400); }
  const subject = String(b.subject || "Wolflano site kontrolü").slice(0, 160);
  const text = String(b.text || "").slice(0, 20000);
  const link = /^https:\/\/github\.com\//.test(String(b.link || "")) ? String(b.link) : "";
  if (!text) return j({ error: "bos" }, 400);
  if (!smtpReady()) return j({ error: "smtp" }, 503);
  const html = frame({ title: subject, body: paras(text), btn: link ? { href: link, label: "Ekran görüntülerini aç" } : undefined, pre: text.slice(0, 90) });
  try { await sendMail({ to: ALICI, subject, text: text + (link ? "\n\nEkran görüntüleri: " + link : ""), html }); return j({ ok: true }); }
  catch (e) { console.error("kontrol-rapor", e); return j({ error: "gonderilemedi" }, 502); }
});
