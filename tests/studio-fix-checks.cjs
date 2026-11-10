const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('studyo.html','utf8');
function check(label,fn){fn();console.log('PASS:',label)}
check('group delete clears every layer on current face',()=>assert.match(html,/if\(c==='gdel'\)[\s\S]{0,250}cur\(\)\.objs=\[\]/));
check('product change prompts only across product groups',()=>assert.match(html,/state\.product!==p&&oldGroup!==newGroup/));
check('saved design load bypasses transfer prompt',()=>assert.match(html,/chooseProduct\(d\.product,cs\.indexOf\(d\.cut\)>=0\?d\.cut:cs\[0\],true\)/));
check('product switch can start with blank objects',()=>assert.match(html,/if\(state\[k\]\)state\[k\]\.objs=\[\]/));
// Compile inline classic scripts to catch syntax errors without executing browser APIs.
const blocks=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(x=>!(/\bsrc\s*=|\btype\s*=\s*['\"]module/i.test(x[1]))&&x[2].trim());
for(let i=0;i<blocks.length;i++){try{new Function(blocks[i][2]);}catch(e){throw new Error('inline script '+(i+1)+': '+e.message)}}
console.log('PASS: '+blocks.length+' inline scripts parse');
