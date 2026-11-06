# Koleksiyon fotoğraflarının zeminini taş grisi stüdyo zeminine çevirir (bir kerelik; GitHub Actions'ta çalışır).
# Stüdyo eskiden giyim ürünü görsellerini düz açık zeminde (#f1f3f2) üretiyordu; beyaz ürünler kayboluyordu.
# Her eski görsel için: ürünü zeminden ayırır (ISNet + düz zemin anahtarı), taş grisi zemine ve altına yumuşak gölgeyle koyar,
# sonucu zemin/<ad>.webp olarak kaydeder ve zemin/index.json listesine yazar. Site bu listeyi okuyup yeni görseli gösterir.
# Yeni ürünler stüdyoda zaten bu zeminle üretilir (studyo.html stoneBg ile aynı görünüm).
import io, json, os, re, subprocess, sys, urllib.request
import numpy as np, cv2
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import kes

SB = 'https://wgovwmeirlzwalelazfj.supabase.co'
OUT = 'zemin'
MAXS = 1400
BG = np.array([241, 243, 242], np.float32)


def stone(w, h):
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    top, bot = np.array([222, 224, 221], np.float32), np.array([196, 199, 195], np.float32)
    a = np.broadcast_to(top * (1 - t) + bot * t, (h, w, 3)).copy()
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r0, r1 = min(w, h) * .25, max(w, h) * .8
    d = np.sqrt((xx - w / 2) ** 2 + (yy - h * .42) ** 2)
    v = np.clip((d - r0) / (r1 - r0), 0, 1) * .10
    return a * (1 - v[..., None])


def convert(data):
    rgb = np.array(Image.open(io.BytesIO(data)).convert('RGB'))
    h, w = rgb.shape[:2]
    s = min(1.0, MAXS / max(w, h))
    if s < 1:
        rgb = cv2.resize(rgb, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
        h, w = rgb.shape[:2]
    a = kes.matte(rgb)
    # Düz zemin anahtarı: kenardan başlayıp zemin rengine çok yakın olan bölge kesin zemin
    diff = np.abs(rgb.astype(np.float32) - BG).max(2)
    near = (diff <= 5).astype(np.uint8)
    n, lab = cv2.connectedComponents(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(edge)) if edge else np.zeros_like(near, bool)
    bgm = cv2.erode(bgm.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    a[bgm] = 0
    if (a > .5).mean() < .02:
        raise ValueError('ürün bulunamadı')
    f = rgb.astype(np.float32)
    # kenardaki eski zemin rengini arındır
    al = a[..., None]
    fg = np.where(al > .02, (f - (1 - al) * BG) / np.maximum(al, .02), f).clip(0, 255)
    fg = np.where((a > .97)[..., None], f, fg)
    out = stone(w, h)
    # gölge: ürünün altında yumuşak elips
    ys, xs = np.where(a > .4)
    l, r, b = xs.min(), xs.max(), ys.max()
    sh = np.zeros((h, w), np.float32)
    cv2.ellipse(sh, (int((l + r) / 2), int(min(h - w * .02, b + w * .025))), (max(1, int((r - l) * .36)), max(1, int(w * .03))), 0, 0, 360, 1, -1)
    k = max(3, int(w * .06)) | 1
    sh = cv2.GaussianBlur(sh, (k, k), 0) * .30
    out = out * (1 - sh[..., None])
    out = out * (1 - al) + fg * al
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'apikey': kes.SB_KEY}), timeout=60) as r:
        return r.read()


def push(msg):
    subprocess.run(['git', 'add', OUT], check=False)
    if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode == 0:
        return
    subprocess.run(['git', 'commit', '-q', '-m', msg], check=False)
    for _ in range(3):
        if subprocess.run('git pull -q --rebase origin main && git push -q origin HEAD:main', shell=True).returncode == 0:
            break


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = os.path.join(OUT, 'index.json')
    man = json.load(open(mp)) if os.path.exists(mp) else {}
    d = json.loads(get(SB + '/rest/v1/site_content?select=data&id=eq.main'))[0]['data']
    todo = []
    for p in d.get('products') or []:
        for i in p.get('imgs') or []:
            if re.match(r'^img/tas-(?!hq-)', i or '') and i not in man and i not in todo:
                todo.append(i)
    print('işlenecek:', len(todo))
    done = 0
    for n, i in enumerate(todo):
        try:
            im = convert(get(SB + '/storage/v1/object/public/site/' + i))
            name = os.path.splitext(os.path.basename(i))[0] + '.webp'
            im.save(os.path.join(OUT, name), 'WEBP', quality=84, method=6)
            man[i] = OUT + '/' + name
            done += 1
        except Exception as e:
            print('HATA', i, e)
            man[i] = ''
        if (n + 1) % 40 == 0:
            json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
            push('Koleksiyon zemini: %d/%d' % (n + 1, len(todo)))
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
    push('Koleksiyon zemini: taş grisi stüdyo (%d görsel)' % done)
    print('tamam:', done)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--dosya':
        for f in sys.argv[2:]:
            convert(open(f, 'rb').read()).save(os.path.splitext(f)[0] + '-zemin.jpg', quality=90)
    else:
        main()
