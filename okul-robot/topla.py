# Okul iletişim robotu (GitHub Actions'ta çalışır).
# meb.k12.tr okul siteleri yurtdışı bağlantılarını kabul etmediği için okul sitelerini Wolflano'nun Türkiye'deki sunucusu
# (wolflano.com.tr/api/okul-iletisim.php) okur; robot sonuçları toplayıp yönetim panelindeki Kasa'ya tek kayıt olarak yazar.
# Yalnız okulların kendi sitelerinde yayımlanmış bilgi alınır; adres tahmin edilmez, hiçbir okula ileti gönderilmez.
import csv, io, json, os, sys, time, secrets, urllib.request, concurrent.futures as cf

API = "https://wolflano.com.tr/api/okul-iletisim.php"
PROJE = os.environ.get("PROJE", "wgovwmeirlzwalelazfj")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
rows = list(csv.reader(open(sys.argv[1], encoding="utf-8")))[1:]
lim = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 0
if lim:
    rows = rows[:lim]
byweb = {r[2]: r for r in rows}


def call(batch):
    body = json.dumps({"urls": [r[2] for r in batch]}).encode()
    for deneme in range(3):
        try:
            req = urllib.request.Request(API, data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": "Wolflano-okul-robotu/1.0"})
            return json.loads(urllib.request.urlopen(req, timeout=100).read().decode())["sonuc"]
        except Exception as e:
            print("tekrar", deneme, e, flush=True)
            time.sleep(10 * (deneme + 1))
    return [{"web": r[2], "eposta": "", "tum": "", "kaynak": "", "durum": "Sunucu yanıt vermedi", "telefon": ""} for r in batch]


def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{PROJE}/database/query", data=json.dumps({"query": q}).encode(),
                                 method="POST", headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "User-Agent": "Wolflano-okul-robotu/1.0"})
    return urllib.request.urlopen(req, timeout=60).read().decode()


batches = [rows[i:i + 12] for i in range(0, len(rows), 12)]
out = []
with cf.ThreadPoolExecutor(max_workers=3) as ex:
    for n, res in enumerate(ex.map(call, batches), 1):
        for x in res:
            r = byweb.get(x["web"], ["", "", x["web"]])
            out.append([r[0], r[1], x["web"], x["eposta"], x["tum"], x["kaynak"], x["durum"], x["telefon"]])
        if n % 10 == 0:
            print(n * 12, "/", len(rows), "e-posta:", sum(1 for o in out if o[3]), flush=True)

bul = sum(1 for o in out if o[3])
acil = sum(1 for o in out if o[6].startswith("Site açılmadı") or o[6] == "Sunucu yanıt vermedi")
print("bitti", bul, "e-posta /", len(out), "| açılmayan site:", acil, flush=True)
buf = io.StringIO()
w = csv.writer(buf, delimiter=";")
w.writerow(["kayit_no", "kurum", "web", "eposta", "tum_epostalar", "kaynak_sayfa", "durum", "telefon_sitede"])
w.writerows(sorted(out, key=lambda o: int(o[0] or 0)))
tag = "x" + secrets.token_hex(6)
title = "Okul iletişim sonuçları"
note = f"{time.strftime('%Y-%m-%d %H:%M')} UTC · {len(out)} okul · {bul} e-posta bulundu · {acil} site açılmadı\n\n" + buf.getvalue()
if not TOKEN:
    print(note[:2000]); sys.exit(0)
q = (f"delete from public.wf_kasa where title = ${tag}${title}${tag}$ and folder = 'Diğer';"
     f"insert into public.wf_kasa(folder, title, note, created_by) values ('Diğer', ${tag}${title}${tag}$, ${tag}${note}${tag}$, 'okul-robotu');")
print(sql(q)[:200])
