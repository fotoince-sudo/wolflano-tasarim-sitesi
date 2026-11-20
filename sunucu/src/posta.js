// Üyelik e-postaları (doğrulama, şifre sıfırlama): info@wolflano.com.tr adına TurkHosting SMTP.
const nodemailer = require('nodemailer');
const ayar = require('./ayar');

const GREEN = '#3f8f55';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hazir = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

async function gonder(m) {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw Object.assign(new Error('SMTP ayarları eksik'), { code: 'not_connected' });
  const port = +(process.env.SMTP_PORT || 465);
  const hosts = [host, process.env.SMTP_SERVER || 'static-159-253-45-63.sunucuhub.com'].filter((h, i, a) => h && a.indexOf(h) === i);
  let last = null;
  for (const h of hosts) {
    try {
      const t = nodemailer.createTransport({ host: h, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 15000 });
      return await t.sendMail({ from: { name: 'Wolflano', address: user }, to: m.to, subject: m.subject, text: m.text, html: m.html });
    } catch (e) {
      last = e;
      if (!/certificate|ESOCKET|ECONN|ETIMEDOUT|ENOTFOUND/i.test(String(e && e.message) + String(e && e.code))) break;
    }
  }
  throw last;
}

function kart(title, body, btn) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#eef3ef;font-family:Arial,Helvetica,sans-serif;color:#141816">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:4px 4px 16px;font:700 20px Arial,sans-serif;letter-spacing:.14em">WOLF<span style="color:${GREEN}">LANO</span></td></tr>
<tr><td style="background:#fff;border:1px solid #dde5df;border-radius:16px;padding:26px 24px;font-size:15px;line-height:1.6">
<h1 style="margin:0 0 14px;font:700 21px Arial,sans-serif">${esc(title)}</h1>${body}
<p style="margin:26px 0 6px"><a href="${esc(btn.href)}" style="display:inline-block;background:${GREEN};color:#fff;border:2px solid #111;border-radius:12px;padding:12px 22px;text-decoration:none;font-weight:bold">${esc(btn.label)}</a></p>
<p style="margin:14px 0 0;color:#6b746e;font-size:12px">Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>
</td></tr>
<tr><td style="padding:16px 6px;color:#6b746e;font-size:12px">Wolflano · İzmir, Türkiye · <a href="${ayar.siteUrl}/" style="color:#6b746e">wolflano.com.tr</a></td></tr>
</table></td></tr></table></body></html>`;
}

function dogrulama(to, link) {
  return gonder({
    to, subject: 'Wolflano üyeliğini doğrula',
    text: `Wolflano üyeliğini tamamlamak için bu bağlantıyı aç: ${link}`,
    html: kart('Üyeliğini doğrula', '<p style="margin:0 0 12px">Wolflano\'ya hoş geldin. Üyeliğini tamamlamak için aşağıdaki düğmeye dokun.</p>', { href: link, label: 'E-postamı doğrula' }),
  });
}

function sifirlama(to, link) {
  return gonder({
    to, subject: 'Wolflano şifre sıfırlama',
    text: `Yeni şifre belirlemek için bu bağlantıyı aç (1 saat geçerli): ${link}`,
    html: kart('Şifreni sıfırla', '<p style="margin:0 0 12px">Yeni şifre belirlemek için aşağıdaki düğmeye dokun. Bağlantı 1 saat geçerlidir.</p>', { href: link, label: 'Yeni şifre belirle' }),
  });
}

module.exports = { hazir, dogrulama, sifirlama };
