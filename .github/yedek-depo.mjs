// Supabase Storage dosyalarını ve Auth kullanıcı listesini yedek/ klasörüne indirir.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const URL_ = process.env.URL;
const KEY = process.env.KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const OUT = 'yedek';

async function j(path, opt = {}) {
  const r = await fetch(URL_ + path, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

async function listele(bucket, prefix = '') {
  const dosyalar = [];
  for (let offset = 0; ; offset += 1000) {
    const sayfa = await j(`/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    for (const o of sayfa) {
      const yol = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) dosyalar.push(...(await listele(bucket, yol)));
      else dosyalar.push(yol);
    }
    if (sayfa.length < 1000) break;
  }
  return dosyalar;
}

const buckets = await j('/storage/v1/bucket');
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, '_buckets.json'), JSON.stringify(buckets, null, 2));

let toplam = 0;
for (const b of buckets) {
  const liste = await listele(b.id);
  let ok = 0;
  for (const yol of liste) {
    const r = await fetch(`${URL_}/storage/v1/object/${b.id}/${yol.split('/').map(encodeURIComponent).join('/')}`, { headers: H });
    if (!r.ok) { console.log(`HATA ${r.status} ${b.id}/${yol}`); continue; }
    const hedef = join(OUT, 'storage', b.id, yol);
    await mkdir(dirname(hedef), { recursive: true });
    await writeFile(hedef, Buffer.from(await r.arrayBuffer()));
    ok++;
  }
  toplam += ok;
  console.log(`storage ${b.id}: ${ok}/${liste.length}`);
}
console.log(`storage toplam: ${toplam}`);

const kullanicilar = [];
for (let sayfa = 1; ; sayfa++) {
  const d = await j(`/auth/v1/admin/users?page=${sayfa}&per_page=1000`);
  kullanicilar.push(...d.users);
  if (d.users.length < 1000) break;
}
await writeFile(join(OUT, 'auth_users.json'), JSON.stringify(kullanicilar, null, 2));
console.log(`auth kullanıcı: ${kullanicilar.length}`);
