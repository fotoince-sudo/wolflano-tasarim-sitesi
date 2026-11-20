#!/usr/bin/env bash
# Yerel deneme: veritabanını sıfırla, sunucuyu derle ve başlat, uçtan uca denemeleri çalıştır.
set -e
cd "$(dirname "$0")/.."
pkill -f "node app.cjs" 2>/dev/null || true
psql -h 127.0.0.1 -p 5433 -U postgres -q -c "drop database if exists unpcpgdk_wolflano with (force)" -c "create database unpcpgdk_wolflano" >/dev/null
psql -h 127.0.0.1 -p 5433 -U postgres -q -d unpcpgdk_wolflano -c "grant create, usage on schema public to wolflano_usr" >/dev/null
PGPASSWORD=test psql -h 127.0.0.1 -p 5433 -U wolflano_usr -d unpcpgdk_wolflano -q -v ON_ERROR_STOP=1 -f test/plesk-durumu.sql
rm -rf /tmp/wfdepo && mkdir -p /tmp/wfdepo/site/img && printf 'PNGDATA' > /tmp/wfdepo/site/img/logo.png && printf 'm' > /tmp/wfdepo/site/img/manken-1.png
node build.mjs >/dev/null
DB_PASS=test API_DB_PASS=apitest DEPO_DIR=/tmp/wfdepo PORT=3999 PUBLIC_URL=http://127.0.0.1:3999 SITE_URL=http://127.0.0.1:8080 nohup node app.cjs > /tmp/wf.log 2>&1 &
sleep 3
node test/uctan-uca.mjs
