# Canva'da üretilen şehir/şablon görsellerini baskıya hazırlar (GitHub Actions'ta çalışır).
# sablon/is.json içindeki her iş için: Canva dışa aktarma bağlantısından indir, kenardaki boş beyazı kırp,
# Real-ESRGAN (x4, ücretsiz) ile büyütüp keskinleştir, beyaz zemini saydam yap, A3 300 dpi tuvale ortala.
#   baski/<ad>.png  -> tam boy (dikey 3508 x 4961, yatay 4961 x 3508), "baski" dalına yazılır (siteye gitmez)
#   sablon/web/<ad>.webp -> stüdyoda kullanılan saydam önizleme (uzun kenar 1600 px)
#   sablon/rapor.json -> her işin kaynak ölçüsü ve sonucu
import io, json, os, sys, traceback, urllib.request
import numpy as np
from PIL import Image
import torch
from spandrel import ModelLoader

A3 = (3508, 4961)
os.makedirs('sablon/web', exist_ok=True); os.makedirs('baski', exist_ok=True)
jobs = json.load(open('sablon/is.json'))
rp = 'sablon/rapor.json'
rap = json.load(open(rp)) if os.path.exists(rp) else {}
model = None

def up4(im):
    global model
    if model is None:
        model = ModelLoader().load_from_file('RealESRGAN_x4plus.pth').eval()
    x = torch.from_numpy(np.asarray(im, dtype=np.float32) / 255.).permute(2, 0, 1)[None]
    T, P = 384, 16
    _, _, h, w = x.shape
    out = torch.zeros(1, 3, h * 4, w * 4)
    with torch.no_grad():
        for y0 in range(0, h, T):
            for x0 in range(0, w, T):
                ya, yb = max(0, y0 - P), min(h, y0 + T + P)
                xa, xb = max(0, x0 - P), min(w, x0 + T + P)
                o = model(x[:, :, ya:yb, xa:xb]).clamp(0, 1)
                oy, ox = (y0 - ya) * 4, (x0 - xa) * 4
                th, tw = min(T, h - y0) * 4, min(T, w - x0) * 4
                out[:, :, y0 * 4:y0 * 4 + th, x0 * 4:x0 * 4 + tw] = o[:, :, oy:oy + th, ox:ox + tw]
    return Image.fromarray((out[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8))

for j in jobs:
    ad = j['ad']
    if rap.get(ad, {}).get('tamam') and not j.get('yeniden'):
        continue
    try:
        data = urllib.request.urlopen(j['url'], timeout=120).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        src = im.size
        a = np.asarray(im).astype(np.int16)
        d = (255 - a.min(axis=2))
        ys, xs = np.where(d > 18)
        im = im.crop((max(0, xs.min() - 8), max(0, ys.min() - 8), min(im.width, xs.max() + 9), min(im.height, ys.max() + 9)))
        crop = im.size
        big = up4(im)
        land = big.width > big.height
        W, H = (A3[1], A3[0]) if land else A3
        s = min(W * .96 / big.width, H * .96 / big.height)
        big = big.resize((round(big.width * s), round(big.height * s)), Image.LANCZOS)
        f = np.asarray(big).astype(np.float32)
        dist = 255 - f.min(axis=2)
        al = np.clip((dist - 6) / 38, 0, 1)
        safe = np.maximum(al, 1e-3)[..., None]
        rgb = np.clip((f - (1 - al[..., None]) * 255) / safe, 0, 255)
        rgba = np.dstack([rgb, al * 255]).round().astype(np.uint8)
        can = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        can.paste(Image.fromarray(rgba, 'RGBA'), ((W - big.width) // 2, (H - big.height) // 2))
        can.save(f'baski/{ad}.png', dpi=(300, 300), optimize=True)
        k = 1600 / max(W, H)
        can.resize((round(W * k), round(H * k)), Image.LANCZOS).save(f'sablon/web/{ad}.webp', 'WEBP', quality=88, method=6, alpha_quality=95)
        rap[ad] = {'tamam': True, 'kaynak': src, 'kirpilmis': crop, 'buyutulmus': [crop[0] * 4, crop[1] * 4],
                   'baski': [W, H], 'dpi': 300, 'yon': 'yatay' if land else 'dikey', 'ad': j.get('baslik', ad), 'kat': j.get('kat', '')}
        print(ad, 'kaynak', src, '->', W, 'x', H)
    except Exception as e:
        rap[ad] = {'tamam': False, 'hata': traceback.format_exc()[-1500:]}
        print('HATA', ad, e)
json.dump(rap, open(rp, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
