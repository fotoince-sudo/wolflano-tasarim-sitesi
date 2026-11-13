const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{const original=fs.readFileSync('studyo.html','utf8');const marker='function chooseProduct(p,c,skipTransferPrompt){';assert(original.includes(marker),'studio function marker missing');const instrumented=original.replace(marker,'window.__studioTest={state:state,view:view,chooseProduct:chooseProduct,ctxClick:ctxClick};\n'+marker);const testPath=path.join(process.cwd(),'studyo.browser-test.html');fs.writeFileSync(testPath,instrumented);const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>console.log('PAGE ERROR:',e.message));await page.goto('file://'+testPath,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(1500);const r=await page.evaluate(()=>{const {state,view,chooseProduct,ctxClick}=window.__studioTest||{};const out=[];function run(name,fn){try{fn();out.push({name,ok:true})}catch(e){out.push({name,ok:false,error:String(e)})}};run('studio boot',()=>{if(typeof chooseProduct!=='function'||typeof ctxClick!=='function')throw Error('handlers missing')});run('cross-group switch clean',()=>{state.product='mug';state.cut='regular';state.front.objs=[{id:'test1',type:'image',slot:true},{id:'test2',type:'image',lock:true,thru:true}];window.confirm=()=>false;chooseProduct('tee','erkek');if(state.front.objs.length)throw Error('objects carried over')});run('same-group switch isolated and previous draft restored',()=>{state.product='tee';state.cut='erkek';state.front.objs=[{id:'keep',type:'text'}];chooseProduct('sweat','erkek');if(state.front.objs.length)throw Error('tee objects leaked into sweatshirt');chooseProduct('tee','erkek');if(!state.front.objs.some(x=>x.id==='keep'))throw Error('tee draft not restored')});run('template group delete removes frame',()=>{state.product='mug';state.front.objs=[{id:'slot',type:'image',slot:true},{id:'frame',type:'image',lock:true,thru:true},{id:'locked',type:'text',lock:true}];view.side='front';view.gdel=true;ctxClick({target:document.querySelector('[data-c="gdel"]')});if(state.front.objs.some(x=>x.id==='frame'||x.id==='slot'))throw Error('template remains');if(state.front.objs.length)throw Error('locked background or other layers remain')});return out});console.log(JSON.stringify(r));if(r.some(x=>!x.ok))process.exitCode=1;}finally{await browser.close();fs.unlinkSync(testPath)}})().catch(e=>{console.error(e);process.exitCode=1});

// Exercise the microphone transcript entry point with a deterministic Turkish
// transcript. Only speech recognition, audio output and background removal are
// stubbed. The template, print rendering and cart use the studio's real handlers.
async function testAybuke(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.addInitScript(()=>{
      localStorage.setItem('wf_studio_guide','1');
      Object.defineProperty(window,'speechSynthesis',{value:undefined});
      window.SpeechRecognition=class{
        start(){window.activeMicrophone=this;}
        stop(){if(window.activeMicrophone===this)window.activeMicrophone=null;}
      };
      window.speakToAybuke=transcript=>{
        const mic=window.activeMicrophone;
        mic.onresult({resultIndex:0,results:[Object.assign([{transcript}],{isFinal:true})]});
        mic.onend();
      };
    });
    const html=fs.readFileSync('studyo.html','utf8').replace('  async function askSend(t){',
      '  window.aybukeTest={cart:function(){return cartItems.length;},faces:ayFaces,objects:function(){return cur().objs;}};\n  async function askSend(t){');
    await page.route('http://studio.test/**',route=>route.request().isNavigationRequest()
      ?route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.route('https://**/*',route=>route.abort());
    await page.goto('http://studio.test/studyo.html',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      aiRemoveBg=async()=>{
        const canvas=document.createElement('canvas');canvas.width=286;canvas.height=150;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#234';ctx.fillRect(15,35,256,85);
        return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      };
    });
    await page.locator('#helpBtn').click();
    await page.locator('[data-gd="mic"]').click();
    async function speak(text,reply){
      await page.waitForFunction(()=>!!window.activeMicrophone);
      await page.evaluate(text=>window.speakToAybuke(text),text);
      await page.locator('#gdMsgs .as').filter({hasText:reply}).last().waitFor();
    }
    await speak('Babamın arabasıyla kupa yap','Kupa şablonunu hazırladım');
    const photo=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=300;c.height=180;
      const x=c.getContext('2d');x.fillStyle='#765';x.fillRect(0,0,300,180);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#gdPhoto').setInputFiles({name:'araba.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await page.locator('#gdPreview').waitFor();
    assert.equal(await page.evaluate(()=>{
      const faces=aybukeTest.faces();return faces.length===2&&faces.every(f=>!f.phEmpty&&f.assetId===faces[0].assetId);
    }),true);
    await speak('Üstüne Babamın Arabası yaz','Yazıyı ekledim');
    await speak('Yazı tipini Manrope İnce yap','Manrope İnce yaptım');
    await speak('Zemini mavi yap','Zemini güncelledim');
    assert.equal(await page.evaluate(()=>aybukeTest.objects().filter(o=>o.mugVehicleText&&o.font==='Manrope İnce'&&o.value==='Babamın Arabası').length),2);
    await speak('Bu hali tamam','Bir adet süblimasyon kupa');
    assert.equal(await page.evaluate(()=>aybukeTest.cart()),0);
    await speak('Sepete ekle','Bir adet kupayı sepete ekledim');
    assert.equal(await page.evaluate(()=>aybukeTest.cart()),1);
    console.log('PASS: Aybüke voice transcript → double-sided mug → edited design → confirmed cart');
  }finally{await browser.close();}
}
testAybuke().catch(error=>{console.error(error);process.exitCode=1;});
