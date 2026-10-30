# Yönetim panelinde yüklenmiş ama zemini henüz temizlenmemiş ürün fotoğrafı sayısını yazar.
import json, os, urllib.request
k = 'sb_publishable_PP5xFd7ga61xaDOCHeET_Q_zfMaE_4G'
q = urllib.request.Request('https://wgovwmeirlzwalelazfj.supabase.co/rest/v1/site_content?select=data&id=eq.main', headers={'apikey': k})
try:
    d = json.loads(urllib.request.urlopen(q, timeout=60).read())[0]['data']
except Exception:
    print(0); raise SystemExit
man = json.load(open('cut/index.json')) if os.path.exists('cut/index.json') else {}
print(len([r for b in d.get('blanks') or [] for r in (b.get('raw') or []) if r and r not in man]))
