# Okulların kendi resmî sitelerinden (meb.k12.tr) yayımlanmış kurumsal e-posta ve telefonları toplar.
# Yalnız okulun kendi sitesinde yazan bilgi alınır; hiçbir adres tahmin edilmez, hiçbir okula ileti gönderilmez.
import csv, re, sys, concurrent.futures as cf, urllib.request, urllib.parse, html

UA = {"User-Agent": "Mozilla/5.0 (compatible; Wolflano-okul-rehberi/1.0)"}
EM = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
TEL = re.compile(r"\(?0?\s?\(?232\)?[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}")


def get(u, retry=True):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20)
        b = r.read(800000)
        cs = r.headers.get_content_charset() or "utf-8"
        return r.geturl(), b.decode(cs, "replace")
    except Exception:
        # Sertifikası sorunlu okul sitelerinde düz http adresi denenir (doğrulama kapatılmaz)
        if retry and u.startswith("https://"):
            return get("http://" + u[8:], False)
        return None, ""


def mails(t):
    t = html.unescape(t).replace("[at]", "@").replace("(at)", "@")
    out = []
    for e in EM.findall(t):
        e = e.strip(".").lower()
        if e.endswith((".png", ".jpg", ".gif", ".webp", ".svg")) or "example" in e or "sentry" in e:
            continue
        if e not in out:
            out.append(e)
    return out


def one(row):
    no, ad, web = row
    base, home = get(web)
    if not base:
        return [no, ad, web, "", "", "", "Site açılmadı", ""]
    pages = [(base, home)]
    links = re.findall(r'href=["\']([^"\']*(?:iletisim|iletişim|contact)[^"\']*)["\']', home, re.I)
    for u in ["tema/iletisim.php"] + links[:3]:
        full = urllib.parse.urljoin(base, u)
        if full not in [p[0] for p in pages]:
            fu, tx = get(full)
            if tx:
                pages.append((fu, tx))
    allm, src, tels = [], "", []
    for u, tx in pages:
        for e in mails(tx):
            if e not in allm:
                allm.append(e)
                src = src or u
        for t in TEL.findall(html.unescape(tx)):
            t = re.sub(r"\D", "", t)[-10:]
            if len(t) == 10 and t not in tels:
                tels.append(t)
    okul = [e for e in allm if e.endswith("meb.k12.tr")]
    diger = [e for e in allm if not e.endswith("meb.gov.tr")]
    best = (okul or diger or [""])[0]
    return [no, ad, web, best, ";".join(allm[:5]), src, "Bulundu" if best else "E-posta yayımlanmamış", ";".join(tels[:2])]


rows = list(csv.reader(open(sys.argv[1], encoding="utf-8")))[1:]
out = []
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for i, r in enumerate(ex.map(one, rows)):
        out.append(r)
        if i % 100 == 0:
            print(i, "/", len(rows), flush=True)
with open(sys.argv[2], "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["no", "ad", "web", "eposta", "tum_epostalar", "kaynak_sayfa", "durum", "telefon_sitede"])
    w.writerows(out)
print("bitti", sum(1 for r in out if r[3]), "e-posta /", len(out))
