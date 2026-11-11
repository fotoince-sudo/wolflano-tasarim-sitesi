// Exercise the shared one-photo layout before the release branch is published.
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const marker='function chooseProduct(p,c,skipTransferPrompt){';
const source=fs.readFileSync('studyo.html','utf8');
assert(source.includes(marker));
const instrumented=source.replace(marker,'window.__oilTest={state,view,TPLS,OIL_ART,assets,applyTemplate,chooseProduct,areaBox,cur,select,ctxClick,deleteSel,grpObjs,zemPick,renderZem,renderTpl,renderTplPreviews,openTab,drawObj};\n'+marker);
const types={'.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.js':'text/javascript','.json':'application/json'};
const root=process.cwd();
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/oil-test.html'){res.setHeader('Content-Type','text/html');res.end(instrumented);return;}
const p=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
await new Promise(resolve=>server.listen(8898,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.fulfill({status:200,contentType:'application/json',body:'[]'}));
await page.goto('http://127.0.0.1:8898/oil-test.html',{waitUntil:'load'});await page.waitForTimeout(700);
await page.evaluate(async()=>{const T=window.__oilTest;T.chooseProduct('mug','sub',true);T.view.side='front';if(T.OIL_ART.length!==20)throw Error('Catalog must have 20 artworks');
if(T.OIL_ART.filter(z=>z.background).length!==5)throw Error('Five free backgrounds expected');
for(const t of T.TPLS.filter(t=>t.oil)){if(t.items.filter(x=>x.t==='ph').length!==1)throw Error('Exactly one slot per artwork');const im=new Image();im.src=t.items[0].u;await im.decode();if(im.naturalWidth<1700)throw Error('Missing artwork');}
const standalone=T.TPLS.filter(t=>t.c==='Zemin');if(standalone.length!==5||standalone.some(t=>t.items.some(i=>i.t==='ph')))throw Error('Standalone backgrounds must not require a photo');
await T.applyTemplate(standalone[0],true);if(T.cur().objs.some(o=>o.slot))throw Error('Background asked for a photograph');
T.renderZem(true);if(document.querySelectorAll('[data-zem^="oil:"]').length!==5)throw Error('Background picker missing');
await T.applyTemplate(T.TPLS.find(t=>t.oil==='kediler'),true);
});
// Use the real file-input handler, not a test-only fill shortcut.
const photo=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#4686ad"/><circle cx="400" cy="350" r="180" fill="#e9b98b"/><path d="M100 1200V800Q400 500 700 800V1200Z" fill="#20364c"/></svg>');
await page.locator('#fileIn').setInputFiles({name:'portrait.svg',mimeType:'image/svg+xml',buffer:photo});
await page.waitForFunction(()=>window.__oilTest.cur().objs.some(o=>o.oilSlot&&!o.phEmpty),{},{timeout:20000});
await page.evaluate(async()=>{const T=window.__oilTest;const original=T.cur().objs.find(o=>o.oilSlot).base;
for(const t of T.TPLS.filter(t=>t.oil)){await T.applyTemplate(t,true);const L=T.cur().objs,bg=L.find(o=>o.oilBg),ph=L.find(o=>o.oilSlot),A=T.areaBox('front',T.cur().area);
if(L.filter(o=>o.slot).length!==1||L.length!==2)throw Error(t.n+': layered remnants');if(ph.base!==original||ph.phEmpty)throw Error(t.n+': photo lost');if(!bg.lock||!bg.thru)throw Error('Backdrop not protected');
for(const o of L)if(o.x-o.w/2<A.l-.01||o.x+o.w/2>A.r+.01||o.y-o.h/2<A.t-.01||o.y+o.h/2>A.b+.01)throw Error(t.n+': art cropped');
if(ph.x-ph.w/2<bg.x-bg.w/2||ph.x+ph.w/2>bg.x+bg.w/2)throw Error('Photo leaves artwork');
if(T.grpObjs().some(o=>o.oilSlot||o.oilBg))throw Error('Fixed slot can move in a group');
T.select(ph.id);const before=JSON.stringify([ph.x,ph.y,ph.w,ph.h,ph.rot]);for(const c of ['center','zin','zout','fwd','bwd','dup','lock']){const el=document.querySelector('[data-c="'+c+'"]');T.ctxClick({target:el});}if(JSON.stringify([ph.x,ph.y,ph.w,ph.h,ph.rot])!==before||L.length!==2)throw Error('Fixed slot can transform');
}
await T.zemPick('oil:kizil-guller');if(T.cur().objs.find(o=>o.oilSlot).base!==original)throw Error('Background switch lost photo');
const c=document.createElement('canvas');c.width=1200;c.height=600;const ctx=c.getContext('2d'),L=T.cur().objs,bg=L.find(o=>o.oilBg);for(const o of L)await T.drawObj(ctx,o,1200/bg.w,bg.x-bg.w/2,bg.y-bg.h/2,false);if(!ctx.getImageData(600,300,1,1).data[3])throw Error('Export blank');
T.deleteSel();if(!T.cur().objs.find(o=>o.oilSlot)?.phEmpty)throw Error('Delete must reset the photo slot');
T.view.tplCat='Yağlı boya';T.renderTpl();T.renderTplPreviews();if(document.querySelectorAll('#tplGrid .tpl').length!==20)throw Error('Mobile gallery incomplete');
T.chooseProduct('tee','erkek',true);if(T.cur().objs.some(o=>o.oilBg||o.oilSlot))throw Error('Mug art leaked to clothing');
});
assert.deepEqual(errors,[]);console.log('PASS: 20 oil artworks, 5 backgrounds, upload, 20 automatic placements, fixed geometry, photo retention, export, mobile gallery and product isolation');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
