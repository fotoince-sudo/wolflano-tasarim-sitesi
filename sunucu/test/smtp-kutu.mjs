// Deneme için sahte e-posta sunucusu: gelen her e-postayı /tmp/wf-posta/ altına yazar.
import net from 'node:net';
import fs from 'node:fs';
fs.mkdirSync('/tmp/wf-posta', { recursive: true });
let n = 0;
net.createServer((s) => {
  let data = false, buf = '';
  s.write('220 kutu ESMTP\r\n');
  s.on('data', (d) => {
    buf += d.toString('latin1');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) {
        if (line === '.') { data = false; fs.writeFileSync(`/tmp/wf-posta/${Date.now()}-${n++}.eml`, s.msg); s.write('250 tamam\r\n'); }
        else s.msg += line + '\n';
        continue;
      }
      const c = line.slice(0, 4).toUpperCase();
      if (c === 'EHLO') s.write('250-kutu\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (c === 'AUTH') s.write('235 ok\r\n');
      else if (c === 'DATA') { data = true; s.msg = ''; s.write('354 yaz\r\n'); }
      else if (c === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
      else s.write('250 ok\r\n');
    }
  });
}).listen(2525, '127.0.0.1');
