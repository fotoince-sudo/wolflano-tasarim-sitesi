# Ürün fotoğraflarının zeminini temizler (GitHub Actions'ta çalışır).
# Yönetim panelinde "Ürün fotoğrafları (otomatik)" bölümüne yüklenen her fotoğraf için:
#   1) yapay zekâ modeli (ISNet) ile ürünü zeminden ayırır, kenarı pürüzsüzleştirir, kenardaki zemin rengini arındırır,
#   2) bütün fotoğrafları aynı ölçüde (1200 × 1500) ortalar ki renk değişince ürün yerinden oynamasın,
#   3) rengini 5 standart renkten birine eşler ve ön/arka ayrımı için bir puan hesaplar,
#   4) sonucu cut/<ad>.webp olarak kaydeder, cut/index.json listesine yazar.
# Ön/arka kararı sitede verilir: aynı renkten iki fotoğraf varsa puanı yüksek olan ön sayılır.
import io, json, os, sys, urllib.request
import numpy as np, cv2
from PIL import Image
import onnxruntime as ort

SB_URL = 'https://wgovwmeirlzwalelazfj.supabase.co'
SB_KEY = 'sb_publishable_PP5xFd7ga61xaDOCHeET_Q_zfMaE_4G'
MODEL = os.environ.get('KES_MODEL', 'isnet.onnx')
OUT = 'cut'
CW, CH = 1200, 1500
# Standart renkler (sitedeki STDC ile aynı sırada ve adla)
STD = [('Beyaz', (244, 244, 242)), ('Lacivert', (35, 42, 74)), ('Siyah', (27, 27, 29)), ('Mavi', (42, 100, 196)), ('Yeşil', (45, 90, 67))]

_S = None
def sess():
    global _S
    if _S is None:
        _S = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
    return _S

def guided(I, p, r, eps):
    # Kenar koruyan yumuşatma: maske kenarı fotoğraftaki gerçek ürün kenarına oturur
    k = (2 * r + 1, 2 * r + 1)
    f = lambda x: cv2.boxFilter(x, -1, k)
    mI, mp = f(I), f(p)
    cov = f(I * p) - mI * mp
    var = f(I * I) - mI * mI
    A = cov / (var + eps)
    B = mp - A * mI
    return f(A) * I + f(B)

def matte(rgb):
    h, w = rgb.shape[:2]
    s = sess()
    x = cv2.resize(rgb, (1024, 1024), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    x = (x - 0.5).transpose(2, 0, 1)[None]
    o = s.run(None, {s.get_inputs()[0].name: x})[0][0, 0]
    o = (o - o.min()) / (o.max() - o.min() + 1e-8)
    a = cv2.resize(o, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    a = guided(g, a, max(2, w // 400), 1e-4)
    a = np.clip((a - 0.08) / 0.84, 0, 1)
    m = (a > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        k = 1 + int(np.argmax(st[1:, 4]))
        keep = cv2.dilate((lab == k).astype(np.uint8), np.ones((15, 15), np.uint8))
        a = a * keep
    return a

def decont(rgb, a):
    f = rgb.astype(np.float32)
    solid = (a > 0.97).astype(np.float32)
    k = max(5, rgb.shape[1] // 150) | 1
    num = cv2.blur(f * solid[..., None], (k, k))
    den = cv2.blur(solid, (k, k))[..., None]
    fill = np.where(den > 1e-3, num / np.maximum(den, 1e-3), f)
    edge = ((a > 0.02) & (a < 0.97))[..., None]
    return np.where(edge, fill, f).clip(0, 255).astype(np.uint8)

def lab(c):
    return cv2.cvtColor(np.uint8([[list(c)]]), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)

def classify(rgb, a):
    ys, xs = np.where(a > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    hh, ww = y1 - y0, x1 - x0
    # gövdenin ortası (göğüs-bel): baskı, gölge ve yaka etkilemesin
    reg = (slice(y0 + int(hh * .35), y0 + int(hh * .75)), slice(x0 + int(ww * .3), x0 + int(ww * .7)))
    px = rgb[reg][a[reg] > 0.98]
    if len(px) < 50:
        px = rgb[a > 0.98]
    med = np.median(px, axis=0)
    L = lab(med.astype(np.uint8))
    d = [float(np.linalg.norm(L - lab(c))) for _, c in STD]
    color = STD[int(np.argmin(d))][0]
    # Ön/arka puanı: önde yaka daha derin oyulur ve yakanın içinden ürünün iç yüzü/gölgesi görünür (daha koyu).
    top = np.full(ww + 1, np.nan)
    for i, x in enumerate(range(x0, x1 + 1)):
        col = np.where(a[y0:y1 + 1, x] > 0.5)[0]
        if len(col):
            top[i] = col[0]
    c0, c1 = int(ww * .42), int(ww * .58)
    s0, s1 = int(ww * .22), int(ww * .32)
    s2, s3 = int(ww * .68), int(ww * .78)
    neck = np.nanmedian(top[c0:c1 + 1])
    sh = np.nanmedian(np.concatenate([top[s0:s1 + 1], top[s2:s3 + 1]]))
    notch = float((neck - sh) / max(hh, 1))
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gm = float(np.median(g[reg][a[reg] > 0.98])) if (a[reg] > 0.98).any() else float(np.median(g[a > 0.98]))
    nr = (slice(y0, y0 + int(hh * .2)), slice(x0 + int(ww * .38), x0 + int(ww * .62)))
    ng = g[nr][a[nr] > 0.9]
    dark = float(np.mean(ng < gm - max(12, gm * .18))) if len(ng) else 0.0
    return color, round(notch * 4 + dark, 4), [int(v) for v in med]

def place(rgba):
    a = rgba[..., 3]
    ys, xs = np.where(a > 12)
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    s = min(CW * .9 / w, CH * .92 / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    im = Image.fromarray(crop, 'RGBA').resize((nw, nh), Image.LANCZOS)
    can = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    can.paste(im, ((CW - nw) // 2, (CH - nh) // 2))
    return can

def process(data):
    im = Image.open(io.BytesIO(data))
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    arr = np.array(im)
    if arr.shape[2] == 4 and (arr[..., 3] < 250).mean() > 0.05:
        a = arr[..., 3].astype(np.float32) / 255.0
        rgb = arr[..., :3]
    else:
        rgb = arr[..., :3]
        a = matte(rgb)
        rgb = decont(rgb, a)
    color, ns, med = classify(rgb, a)
    out = place(np.dstack([rgb, (a * 255).astype(np.uint8)]))
    return out, color, ns, med

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'apikey': SB_KEY}), timeout=60) as r:
        return r.read()

def main():
    os.makedirs(OUT, exist_ok=True)
    mp = os.path.join(OUT, 'index.json')
    man = json.load(open(mp)) if os.path.exists(mp) else {}
    d = json.loads(get(SB_URL + '/rest/v1/site_content?select=data&id=eq.main'))[0]['data']
    todo = []
    for b in d.get('blanks') or []:
        for r in b.get('raw') or []:
            if r and r not in man and r not in todo:
                todo.append(r)
    print('işlenecek:', len(todo))
    done = 0
    for r in todo:
        try:
            data = get(SB_URL + '/storage/v1/object/public/site/' + r)
            out, color, ns, med = process(data)
            name = os.path.splitext(os.path.basename(r))[0] + '.webp'
            out.save(os.path.join(OUT, name), 'WEBP', quality=92, method=6, alpha_quality=100)
            man[r] = {'file': OUT + '/' + name, 'color': color, 'ns': ns, 'rgb': med}
            done += 1
            print(r, '->', color, ns)
        except Exception as e:
            print('HATA', r, e)
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
    print('tamam:', done)

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--dosya':
        for p in sys.argv[3:]:
            out, color, ns, med = process(open(p, 'rb').read())
            n = os.path.join(sys.argv[2], os.path.splitext(os.path.basename(p))[0] + '.webp')
            out.save(n, 'WEBP', quality=92, method=6, alpha_quality=100)
            print(p, color, ns, med)
    else:
        main()
