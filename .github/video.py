# Baskı Atölyesi tanıtım videosu (1080 x 1350, 30 fps, sessiz): sahne görselleri + yazılı anlatım.
# Kullanım: python3 .github/video.py <görsel klasörü> <çıktı.mp4> [--kare saniye cikti.png]
# Görseller: studyo.jpg, baski.jpg, kontrol.jpg, paket.jpg  ·  Yazı: Manrope (yoksa Inter)
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1350, 30
YESIL = (63, 143, 85)
MINT = (119, 184, 145)
KOYU = (20, 24, 22)
ZEMIN = (238, 243, 239)
D = sys.argv[1]


def font(agirlik, boy):
    # Manrope (değişken yazı tipi, GitHub işinde indirilir); yoksa Inter
    if os.path.exists("fonts/Manrope.ttf"):
        f = ImageFont.truetype("fonts/Manrope.ttf", boy)
        try:
            f.set_variation_by_axes([agirlik])
        except Exception:
            pass
        return f
    yedek = {800: "Inter-ExtraBold", 600: "Inter-SemiBold", 500: "Inter-Medium"}[agirlik]
    p = f"/usr/share/fonts/opentype/inter/{yedek}.otf"
    return ImageFont.truetype(p, boy) if os.path.exists(p) else ImageFont.load_default(boy)


def kirp(im, w, h):
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    l, t = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((l, t, l + w, t + h))


def yumusak(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def satirlar(d, metin, f, gen):
    out, sat = [], ""
    for k in metin.split():
        dene = (sat + " " + k).strip()
        if d.textlength(dene, font=f) <= gen:
            sat = dene
        else:
            out.append(sat)
            sat = k
    out.append(sat)
    return out


def kart(cv, no, baslik, metin, a):
    """Alttaki yazı kartı; a: 0..1 giriş oranı (aşağıdan kayar, belirir)."""
    if a <= 0:
        return
    ust = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ust)
    fn, fb, fm = font(800, 34), font(800, 50), font(500, 34)
    sat = satirlar(d, metin, fm, W - 2 * 96)
    kh = 80 + 64 + len(sat) * 46 + 50
    x0, x1 = 48, W - 48
    y1 = H - 48 + round((1 - yumusak(a)) * 60)
    y0 = y1 - kh
    al = round(248 * yumusak(a))
    d.rounded_rectangle((x0 + 4, y0 + 10, x1 + 4, y1 + 10), 36, fill=(0, 0, 0, round(40 * yumusak(a))))
    ust = ust.filter(ImageFilter.GaussianBlur(12))
    d = ImageDraw.Draw(ust)
    d.rounded_rectangle((x0, y0, x1, y1), 36, fill=(255, 255, 255, al))
    ta = round(255 * yumusak(a))
    # adım rozeti
    d.rounded_rectangle((96, y0 + 44, 96 + 96, y0 + 44 + 52), 26, fill=YESIL + (ta,))
    tw = d.textlength(no, font=fn)
    d.text((96 + 48 - tw / 2, y0 + 44 + 26), no, font=fn, fill=(255, 255, 255, ta), anchor="lm")
    d.text((96 + 96 + 22, y0 + 44 + 28), baslik, font=fb, fill=KOYU + (ta,), anchor="lm")
    y = y0 + 44 + 52 + 34
    for s in sat:
        d.text((96, y), s, font=fm, fill=(70, 78, 74, ta))
        y += 46
    cv.alpha_composite(ust)


def logo_kose(cv, a=1.0):
    d = ImageDraw.Draw(cv)
    f = font(800, 30)
    t = "WOLF"
    x, y = 56, 54
    d.text((x, y), t, font=f, fill=KOYU + (round(230 * a),))
    d.text((x + d.textlength(t, font=f), y), "LANO", font=f, fill=YESIL + (round(255 * a),))


def foto_sahne(ad, no, baslik, metin, sure, z0=1.0, z1=1.12, odak=(0.5, 0.5), giris=0.6, cikis=0.6):
    im = Image.open(os.path.join(D, ad)).convert("RGB")
    im = kirp(im, W, H)
    n = round(sure * FPS)

    def kare(i):
        t = i / FPS
        p = yumusak(t / sure) * 0.85 + (t / sure) * 0.15
        z = z0 + (z1 - z0) * p
        cw, ch = W / z, H / z
        cx = odak[0] * W + (W / 2 - odak[0] * W) * (1 - (z - 1) / max(1e-6, z1 - 1 if z1 > 1 else 1)) if False else odak[0] * W
        cy = odak[1] * H
        l = min(max(cx - cw / 2, 0), W - cw)
        u = min(max(cy - ch / 2, 0), H - ch)
        fr = im.resize((W, H), Image.BICUBIC, box=(l, u, l + cw, u + ch)).convert("RGBA")
        kart(fr, no, baslik, metin, (t - 0.35) / 0.7)
        logo_kose(fr)
        a = min(1.0, t / giris if giris else 1.0, (sure - t) / cikis if cikis else 1.0)
        if a < 1:
            bg = Image.new("RGBA", (W, H), ZEMIN + (255,))
            fr = Image.blend(bg, fr, max(0.0, a))
        return fr.convert("RGB")

    return n, kare


def yazi_sahne(sure, ust, buyuk, alt, alt2=None):
    n = round(sure * FPS)

    def kare(i):
        t = i / FPS
        cv = Image.new("RGBA", (W, H), ZEMIN + (255,))
        d = ImageDraw.Draw(cv)
        # ince yeşil çerçeve çizgisi ve küçük kurt izi yerine marka şeridi
        d.rectangle((0, H - 22, W, H), fill=MINT + (255,))
        def yaz(metin, f, y, renk, t0):
            a = yumusak((t - t0) / 0.6)
            if a <= 0:
                return
            k = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            kd = ImageDraw.Draw(k)
            kd.text((W / 2, y + (1 - a) * 24), metin, font=f, fill=renk + (round(255 * a),), anchor="mm")
            cv.alpha_composite(k)
        f1 = font(800, 92)
        ww = d.textlength("WOLF", font=f1) + d.textlength("LANO", font=f1)
        a = yumusak((t - 0.1) / 0.6)
        if a > 0:
            k = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            kd = ImageDraw.Draw(k)
            x = W / 2 - ww / 2
            y = 470 + (1 - a) * 24
            kd.text((x, y), "WOLF", font=f1, fill=KOYU + (round(255 * a),), anchor="lm")
            kd.text((x + kd.textlength("WOLF", font=f1), y), "LANO", font=f1, fill=YESIL + (round(255 * a),), anchor="lm")
            cv.alpha_composite(k)
        yaz(ust, font(600, 34), 560, YESIL, 0.5)
        for j, s in enumerate(buyuk):
            yaz(s, font(800, 66), 700 + j * 84, KOYU, 0.9 + j * 0.15)
        yaz(alt, font(500, 36), 720 + len(buyuk) * 84 + 30, (80, 88, 84), 1.5)
        if alt2:
            yaz(alt2, font(800, 40), 720 + len(buyuk) * 84 + 110, YESIL, 1.8)
        out = min(1.0, (sure - t) / 0.5)
        if out < 1:
            cv = Image.blend(Image.new("RGBA", (W, H), ZEMIN + (255,)), cv, max(0.0, out))
        return cv.convert("RGB")

    return n, kare


SAHNELER = [
    yazi_sahne(3.6, "BASKI ATÖLYESİ", ["Baskın nasıl", "hazırlanıyor?"], "Tasarımdan kapına, adım adım."),
    foto_sahne("studyo.jpg", "1", "Tasarla", "Stüdyoda kendin tasarla ya da hazır şablonlardan birini seç. Baskı alanını gerçek ölçüsünde görürsün.", 5.6, 1.45, 1.75, (0.5, 0.6)),
    foto_sahne("baski.jpg", "2", "Doğrudan kumaşa baskı", "Brother GTX DTG makinemiz tasarımını 1200 dpi çözünürlükle doğrudan kumaşa basar. Su bazlı, sağlığa zararsız mürekkep; yıkamaya dayanıklı.", 6.6, 1.0, 1.12, (0.45, 0.6)),
    foto_sahne("kontrol.jpg", "3", "Kalite kontrol", "Her ürün ölçüsüyle ve numaralı renk kartımızla tek tek kontrol edilir.", 5.4, 1.08, 1.0, (0.5, 0.45)),
    foto_sahne("paket.jpg", "4", "Özenle paketlenir", "Ürünün Wolflano kutusunda, kargoya hazır şekilde yola çıkar.", 5.4, 1.0, 1.1, (0.45, 0.5)),
    yazi_sahne(4.0, "BASKI ATÖLYESİ", ["Tasarımın,", "kumaşına işlensin."], "wolflano.com.tr", "Kendin tasarla →"),
]

if "--kare" in sys.argv:
    i = sys.argv.index("--kare")
    s, cikti = float(sys.argv[i + 1]), sys.argv[i + 2]
    for n, f in SAHNELER:
        if s * FPS < n:
            f(round(s * FPS)).save(cikti, quality=90)
            break
        s -= n / FPS
    sys.exit(0)

cikti = sys.argv[2]
gecici = cikti + ".yapiliyor.mp4"
p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", gecici], stdin=subprocess.PIPE)
for n, f in SAHNELER:
    for i in range(n):
        p.stdin.write(f(i).tobytes())
p.stdin.close()
if p.wait() != 0:
    sys.exit("ffmpeg hata verdi")
os.replace(gecici, cikti)
print("tamam", cikti)
