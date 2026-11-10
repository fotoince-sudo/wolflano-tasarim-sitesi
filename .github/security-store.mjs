// Offline browser regression: every request is intercepted; no live Supabase/site calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.WF_TEST_MODULES ? pathToFileURL(path.join(process.env.WF_TEST_MODULES,'playwright/index.mjs')).href : 'playwright');
const root=process.cwd(), origin='http://localhost:8890';
const catalog={v:1,vat:{mode:'excl',ready:20,blank:20,print:20},ship:{fee:120,free:2500},products:[{id:'safe-mug',name:'Test Kupa',type:'KUPA',price:100,show:true,stock:20,cat:['erkek'],imgs:[]}],blanks:[]};
const browser=await chromium.launch({executablePath:process.env.WF_CHROME||'/usr/bin/chromium',args:['--no-sandbox']});
const contexts=[];
try{
 async function run(fail=false, requote=false){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
  const sent=[],carts=[],errors=[];
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname.includes('/functions/v1/order-create')){
    const b=r.postDataJSON();sent.push({b,key:r.headers()['x-wf-cart-key']});
    if(requote&&sent.length===1)return json({error:'price_changed',message:'Fiyatlar güncellendi.',total:300,ship:120,items:[{id:'tasarim',n:'Tasarım: Kupa',q:1,t:180,unit:180}]},409);
    return fail?json({message:'Fiyatlar güncellendi; sepetini yenile.'},409):json({ok:true,code:'WLF-TEST01',total:b.total,subtotal:b.total-120,ship:120,items:b.items,studioUnits:{0:180}});
   }
   if(u.pathname.includes('/functions/v1/sepet')){carts.push({b:r.postDataJSON(),key:r.headers()['x-wf-cart-key']});return json({ok:true});}
   if(u.pathname.includes('/rest/v1/site_content'))return json([{data:catalog}]);
   if(u.hostname!=='localhost')return json([]);
   const file=path.join(root,decodeURIComponent(u.pathname));
   if(!file.startsWith(root+path.sep))return route.abort();
   try{
    const body=await fs.readFile(file);
    const type={'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({status:200,contentType:type,body});
   }catch{return route.fulfill({status:404,body:''});}
  });
  await context.addInitScript((rq)=>{
   localStorage.setItem('wf_cart',JSON.stringify(rq?{}:{'safe-mug':1}));
   localStorage.setItem('wf_studio_guide','1');
   if(rq)localStorage.setItem('wf_studio_cart',JSON.stringify([{sig:JSON.stringify(['mug','sub','#fff',null,true,0,{area:'mugw',objs:[{}]},0,0,{area:'mug',objs:[{}]}]),szList:['Std'],sizes:{Std:1},unit:120,label:'Kupa',pk:[]}]));
  },requote);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const dialogs=[];if(requote)page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.goto(origin+'/index.html#odeme');
  await page.waitForFunction(()=>document.getElementById('oMail'));
  for(const [id,value] of Object.entries({oMail:'guest@example.invalid',oTel:'05301234567',oAd:'Test Müşteri',oAdr:'Test açık adresi 123',oIl:'İzmir',oIlce:'Konak'}))await page.locator('#'+id).fill(value);
  await page.locator('#coGo').click();assert.equal(sent.length,0,'consent missing must not send');
  await page.locator('#oKvkk').check();await page.locator('#oSoz').check();
  await page.waitForTimeout(1700);
  await page.locator('#coGo').click();
  await page.waitForFunction(()=>{try{return !!JSON.parse(localStorage.getItem('wf_last')||'null')?.code || /Fiyatlar güncellendi/.test(document.getElementById('coMsg')?.textContent||'');}catch{return false;}});
  assert.equal(sent.length,requote?2:1);const {b,key}=sent[0];assert.match(key,/^[a-f0-9]{64}$/);assert.equal(b.onay.kvkk,true);assert.equal(b.onay.sozlesme,true);assert.equal(b.onay.izin,false);assert.equal(b.delivery,'kargo');assert.equal(b.items[0].id,requote?'tasarim':'safe-mug');assert.equal(b.total,240);
  if(requote){
   assert.deepEqual(b.items[0].design.areas,{front:'mugw'});
   assert.deepEqual(sent[1].b.items[0].design,b.items[0].design);
   assert.equal(sent[1].b.total,300);
   assert.equal(dialogs.length,1);assert.match(dialogs[0],/300/);
  }
  assert.ok(carts.length>0);assert.equal(carts[0].key,key);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wf_last')||'null'));
  if(fail){assert.equal(saved,null);assert.ok((await page.locator('#coMsg').textContent()).includes('Fiyatlar güncellendi'));}
  else{assert.equal(saved.code,'WLF-TEST01');assert.equal(saved.total,requote?300:240);}
  assert.deepEqual(errors,[]);return key;
 }
 await run(false,true);
 const a=await run(),b=await run(true);assert.notEqual(a,b,'different guest browsers must have different capabilities');
 // Exercise exactly the store's adapter against the unchanged studio signature format.
 const source=await fs.readFile('index.html','utf8');const adapter=source.slice(source.indexOf('function scCheckout(it)'),source.indexOf('async function crmSend(o)'));
 const scCheckout=new Function(adapter+';return scCheckout;')();
 const signature=JSON.stringify(['tee','erkek','#fff',null,true,0,{area:'a4',objs:[{}]},{area:'logo',objs:[{}]},0,{area:'a3',objs:[]},null]);
 assert.deepEqual(scCheckout({sig:signature,sizes:{M:2}}),{product:'tee',cut:'erkek',sizes:{M:2},areas:{front:'a4',logo:'logo'}});
 for(const [product,cut,area] of [['hat','std','hat'],['canvas','c3550','cv3550']]){
  const old=JSON.parse(signature);
  old[0]=product;old[1]=cut;old[6].area=area;old[9]={area:'a3',objs:[{}]};
  assert.deepEqual(scCheckout({sig:JSON.stringify(old),sizes:{Std:1}}).areas,{front:area});
 }
 console.log('PASS: mobile guest checkout, consent, cart ownership, server errors, approved studio requote, active studio surfaces');
}finally{for(const c of contexts)await c.close();await browser.close();}
