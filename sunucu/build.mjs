// Sunucuyu tek dosyaya derler: app.cjs. Sunucuda "npm install" gerekmez; Plesk yalnız bu dosyayı çalıştırır.
// Supabase fonksiyonlarındaki "npm:paket@sürüm" içe aktarmaları normal paket adlarına çevrilir.
import { build } from 'esbuild';
import fs from 'fs';

const npmSpec = {
  name: 'npm-spec',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, async (a) => {
      const spec = a.path.slice(4);
      const name = spec.startsWith('@') ? spec.split('@').slice(0, 2).join('@') : spec.split('@')[0];
      const r = await b.resolve(name, { resolveDir: process.cwd(), kind: a.kind });
      return { path: r.path, external: false };
    });
  },
};

await build({
  entryPoints: ['src/sunucu.js'],
  outfile: 'app.cjs',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  legalComments: 'none',
  external: ['pg-native', 'cloudflare:sockets'],
  plugins: [npmSpec],
  logLevel: 'warning',
  banner: { js: '// Wolflano sunucusu — derlenmiş dosya. Kaynak: sunucu/src ve supabase/functions. Değiştirmek için kaynağı düzenle, "npm run build" çalıştır.' },
});
// Passenger bu dosyanın değiştiğini görünce uygulamayı kendiliğinden yeniden başlatır (Plesk Git dağıtımından sonra)
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/restart.txt', new Date().toISOString() + '\n');
console.log('app.cjs hazır');
