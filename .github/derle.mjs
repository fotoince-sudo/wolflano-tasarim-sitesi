// Yayın paketi: siteyi küçültür ve kodu okunması zor hâle getirir (dist/ klasörüne).
// Kaynak kod main dalında kalır; yayın sürümü "yayin" dalına konur ve TurkHosting oradan çeker.
import { minify } from 'html-minifier-terser';
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['.git', '.github', 'supabase', 'node_modules', 'dist', 'README.md', 'wrangler.jsonc', '.assetsignore', 'package.json', 'package-lock.json']);
const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

function copy(src, dst) {
  for (const n of fs.readdirSync(src)) {
    if (SKIP.has(n)) continue;
    const a = path.join(src, n), b = path.join(dst, n);
    if (fs.statSync(a).isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); }
    else fs.copyFileSync(a, b);
  }
}
copy('.', out);

const opts = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: {
    compress: { passes: 2 },
    mangle: { toplevel: false },
    format: { comments: false }
  }
};

for (const f of ['index.html', 'studyo.html']) {
  const src = fs.readFileSync(f, 'utf8');
  const res = await minify(src, opts);
  fs.writeFileSync(path.join(out, f), res);
  console.log(f, (src.length / 1024).toFixed(0) + ' KB ->', (res.length / 1024).toFixed(0) + ' KB');
}
