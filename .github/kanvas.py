"""ambientCG (CC0) kumaş/kanvas dokusunu indirip 50 farklı tonda dokular/kanvas/ altına yazar."""
import colorsys
import io
import json
import os
import urllib.parse
import urllib.request
import zipfile

from PIL import Image, ImageOps

OUT = "dokular/kanvas"
UA = {"User-Agent": "Mozilla/5.0 wolflano-dokular"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def adaylar():
    bulunan = []
    for q in ("canvas", "fabric", "linen", "burlap"):
        url = "https://ambientcg.com/api/v2/full_json?" + urllib.parse.urlencode(
            {"q": q, "type": "Material", "limit": 40, "sort": "Popular"})
        for a in json.loads(get(url)).get("foundAssets", []):
            if a["assetId"] not in bulunan:
                bulunan.append(a["assetId"])
    return bulunan


def renk_al(asset_id):
    veri = get(f"https://ambientcg.com/get?file={asset_id}_1K-JPG.zip")
    with zipfile.ZipFile(io.BytesIO(veri)) as z:
        for ad in z.namelist():
            if ad.endswith("_Color.jpg"):
                return Image.open(io.BytesIO(z.read(ad))).convert("RGB")
    return None


def tonlar():
    t = []
    for i in range(10):  # nötr: beyazdan antrasite
        v = 0.97 - i * 0.09
        t.append(colorsys.hls_to_rgb(0, v, 0))
    for i in range(8):  # sıcak krem/bej/kahve
        t.append(colorsys.hls_to_rgb(0.09, 0.88 - i * 0.07, 0.35))
    for i in range(32):  # renkli tonlar
        h = (i * 11.25) / 360
        t.append(colorsys.hls_to_rgb(h, 0.62 if i % 2 else 0.42, 0.38))
    return t[:50]


def boya(gri, rgb):
    koyu = tuple(int(c * 255 * 0.55) for c in rgb)
    acik = tuple(min(255, int(c * 255 * 1.12) + 8) for c in rgb)
    return ImageOps.colorize(gri, black=koyu, white=acik)


os.makedirs(OUT, exist_ok=True)
sec = []
for aid in adaylar():
    if not aid.lower().startswith("fabric"):
        continue
    try:
        img = renk_al(aid)
    except Exception as e:
        print("atla", aid, e)
        continue
    if img:
        sec.append((aid, img))
    if len(sec) >= 3:
        break

if not sec:
    raise SystemExit("doku bulunamadı")
print("kaynaklar:", [a for a, _ in sec])

n = 0
for i, rgb in enumerate(tonlar(), 1):
    aid, img = sec[(i - 1) % len(sec)]
    gri = ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=1)
    boya(gri, rgb).save(f"{OUT}/kanvas-{i:02d}.jpg", quality=85, optimize=True)
    n += 1

with open(f"{OUT}/KAYNAK.txt", "w") as f:
    f.write("Kaynak: ambientCG (CC0 1.0) - " + ", ".join(a for a, _ in sec) + "\nTonlandırılmış türevlerdir.\n")
print("üretilen:", n)
