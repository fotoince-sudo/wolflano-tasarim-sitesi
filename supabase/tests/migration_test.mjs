// In-memory Postgres only. Vault, pg_net and pg_cron interfaces are local test doubles.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.WF_TEST_MODULES?pathToFileURL(path.join(process.env.WF_TEST_MODULES,'@electric-sql/pglite/dist/index.js')).href:'@electric-sql/pglite');
const db=new PGlite();
try{
 await db.exec(`
 create role anon; create role authenticated;
 create table public.carts(mail text primary key,items jsonb default '[]',status text default 'bekliyor',created_at timestamptz default now());
 create table public.orders(code text primary key, created_at timestamptz default now());
 create table public.stok_haber(notified_at timestamptz);
 insert into carts(mail,items) values ('legacy@example.invalid','[{"q":2}]');
 insert into orders(code) values ('WLF-OLD001');
 create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values ('wf_job_token',repeat('s',64));
 create schema net;create table net.calls(url text,body jsonb,headers jsonb);
 create function net.http_post(url text,body jsonb,headers jsonb) returns bigint language sql as $$insert into net.calls values(url,body,headers) returning 1::bigint$$;
 create schema cron;create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text);
 create function cron.schedule(n text,s text,c text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(n,s,c) on conflict(jobname) do update set schedule=s,command=c returning jobid$$;
 create function cron.alter_job(job_id bigint,command text) returns void language sql as $$update cron.job set command=$2 where jobid=job_id$$;
 insert into cron.job(jobname,schedule,command) values('birthday','5 6 * * *','select net.http_post(url := ''https://example.invalid/functions/v1/dogum-gunu'')');
 `);
 const before=(await db.query('select mail,items,status,created_at from carts')).rows;
 await db.exec(await fs.readFile('supabase/migrations/20261110020848_checkout_security.sql','utf8'));
 assert.deepEqual((await db.query('select mail,items,status,created_at from carts')).rows,before);
 assert.equal((await db.query('select checkout_owner from orders')).rows[0].checkout_owner,null);
 // Same-email browser sessions coexist, and an upsert can only match its owner key.
 await db.query("insert into carts(mail,owner_key) values($1,$2),($1,$3)",['legacy@example.invalid','g:'+'a'.repeat(64),'g:'+'b'.repeat(64)]);
 await db.query("insert into carts(mail,owner_key,status) values($1,$2,'boş') on conflict(owner_key) do update set status=excluded.status",['legacy@example.invalid','g:'+'a'.repeat(64)]);
 const rows=(await db.query('select id,owner_key,status from carts order by owner_key nulls first')).rows;
 assert.equal(rows.length,3);assert.equal(rows[0].status,'bekliyor');assert.equal(rows[1].status,'boş');assert.equal(rows[2].status,'bekliyor');
 assert.equal(new Set(rows.map((row)=>row.id)).size,3);
 await db.query("update carts set status='kapatıldı' where id=$1 and status='bekliyor'",[rows[0].id]);
 const closed=(await db.query("select id from carts where status='kapatıldı'")).rows;
 assert.deepEqual(closed,[{id:rows[0].id}]); // The legacy cart is addressed independently by its id.

 await assert.rejects(db.query("insert into carts(mail,owner_key) values('x','victim@example.invalid')"));
 assert.equal((await db.query("select has_function_privilege('anon','wf_jobs_private.wf_run_job(text)','execute') as ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','wf_jobs_private.wf_run_job(text)','execute') as ok")).rows[0].ok,false);
 await db.query("select wf_jobs_private.wf_run_job('stok-haber')");
 const call=(await db.query('select * from net.calls')).rows[0];assert.equal(call.headers['x-wf-job-token'],'s'.repeat(64));assert.ok(call.url.endsWith('/stok-haber'));
 await assert.rejects(db.query("select wf_jobs_private.wf_run_job('arbitrary-function')"));
 const birthday=(await db.query("select schedule,command from cron.job where jobname='birthday'")).rows[0];assert.equal(birthday.schedule,'5 6 * * *');assert.ok(birthday.command.includes('wf_jobs_private.wf_run_job'));
 assert.equal((await db.query("select count(*)::int n from cron.job where jobname='stok-haber-saatlik'")).rows[0].n,1);
 console.log('PASS: migration syntax, legacy data preservation, separate same-email carts, owner upsert, constraints, job privileges, Vault header and cron compatibility');
}finally{await db.close();}
