# Canvas ve büyük baskı görsellerini Real-ESRGAN general-x4v3 ile (ücretsiz) 4 kat büyütüp netleştirir.
# sablon/buyut.json içindeki her iş: url indir, x4 büyüt (uzun kenar en çok 7200 px), "baski" dalına baski/buyuk/<ad>.(jpg|png) yaz.
# Sonuç listesi sablon/buyut-rapor.json; yönetim panelindeki tasarım bu dosyayı "hi" (baskı dosyası) olarak kullanır.
import io, json, os, traceback, urllib.request
import numpy as np, torch
from PIL import Image
from spandrel import ModelLoader
os.makedirs('baski/buyuk', exist_ok=True)
jobs = json.load(open('sablon/buyut.json'))
rp = 'sablon/buyut-rapor.json'
rap = json.load(open(rp)) if os.path.exists(rp) else {}
model = ModelLoader().load_from_file('realesr-general-x4v3.pth').eval()
torch.set_num_threads(os.cpu_count() or 4)
def up4(im):
    x = torch.from_numpy(np.asarray(im, dtype=np.float32) / 255.).permute(2, 0, 1)[None]
    T, P = 384, 16; _, _, h, w = x.shape; out = torch.zeros(1, 3, h * 4, w * 4)
    with torch.no_grad():
        for y0 in range(0, h, T):
            for x0 in range(0, w, T):
                ya, yb = max(0, y0 - P), min(h, y0 + T + P); xa, xb = max(0, x0 - P), min(w, x0 + T + P)
                o = model(x[:, :, ya:yb, xa:xb]).clamp(0, 1)
                oy, ox = (y0 - ya) * 4, (x0 - xa) * 4; th, tw = min(T, h - y0) * 4, min(T, w - x0) * 4
                out[:, :, y0*4:y0*4+th, x0*4:x0*4+tw] = o[:, :, oy:oy+th, ox:ox+tw]
    return Image.fromarray((out[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8))
for j in jobs:
    ad = j['ad']
    if rap.get(ad, {}).get('tamam'): continue
    try:
        src = Image.open(io.BytesIO(urllib.request.urlopen(j['url'], timeout=120).read()))
        alpha = src.mode in ('RGBA', 'LA') or (src.mode == 'P' and 'transparency' in src.info)
        rgba = src.convert('RGBA'); rgb = rgba.convert('RGB')
        big = up4(rgb)
        if alpha: big.putalpha(rgba.getchannel('A').resize(big.size, Image.LANCZOS))
        k = min(1, 7200 / max(big.size))
        if k < 1: big = big.resize((round(big.width * k), round(big.height * k)), Image.LANCZOS)
        fn = f'baski/buyuk/{ad}.' + ('png' if alpha else 'jpg')
        if alpha: big.save(fn, optimize=True)
        else: big.convert('RGB').save(fn, quality=93, subsampling=0, optimize=True)
        rap[ad] = {'tamam': True, 'kaynak': list(src.size), 'buyuk': list(big.size), 'dosya': fn, 'url': j['url']}
        print(ad, src.size, '->', big.size)
    except Exception as e:
        rap[ad] = {'tamam': False, 'hata': traceback.format_exc()[-800:]}; print('HATA', ad, e)
json.dump(rap, open(rp, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
