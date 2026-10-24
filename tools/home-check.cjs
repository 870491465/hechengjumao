const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:720,height:1280},hasTouch:true});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const open=async()=>{await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});};
 await open();await page.evaluate(()=>{localStorage.removeItem('catbox.best.v1');localStorage.removeItem('catbox.muted.v1');});await open();
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);console.log('PASS '+name);};
 const tap=async(field)=>{const p=await page.evaluate(async field=>{const cc=await System.import('cc'),size=cc.view.getVisibleSize(),n=window.__catGame.home[field],c=document.querySelector('canvas').getBoundingClientRect();return{x:c.left+(n.position.x+size.width/2)*c.width/size.width,y:c.top+(size.height/2-n.position.y)*c.height/size.height};},field);await page.touchscreen.tap(p.x,p.y);};
 await check('launch shows homepage, real initial record, and no playable drop',()=>{const g=window.__catGame;return g.atHome&&g.home.node.active&&!g.ui.hud.active&&g.home.record.best===0&&!g.drop(0)&&!g.useShake();});
 await page.screenshot({path:'temp/home.png'});
 await page.waitForTimeout(300);await check('homepage freezes game clock and physics',()=>window.__catGame.session.time===0&&window.__catGame.cats.size===0);
 await tap('helpButton');await check('help opens without dropping a cat',()=>{const g=window.__catGame;return g.home.modal.active&&g.cats.size===0;});
 await page.screenshot({path:'temp/home-help.png'});await page.evaluate(()=>window.__catGame.home.close());
 await tap('soundButton');await check('sound control changes preference without starting game',()=>window.__catGame.home.record.muted&&window.__catGame.atHome);
 await tap('settingsButton');await check('settings opens a working modal',()=>window.__catGame.home.modal.active);await page.evaluate(()=>window.__catGame.home.close());
 await tap('startButton');await check('start enters clean game once with no click-through drop',()=>{const g=window.__catGame;return !g.atHome&&!g.home.node.active&&g.ui.hud.active&&g.cats.size===0&&g.session.score===0;});
 await page.evaluate(()=>{const g=window.__catGame;g.enabled=false;g.session.score=128;g.drop(0);g.pause();g.returnHome();});
 await check('return home clears round and displays actual best score',()=>{const g=window.__catGame;return g.atHome&&g.cats.size===0&&g.session.score===0&&g.home.record.best===128&&g.home.score.string==='最高分 128';});
 await open();await check('highest score and sound preference survive reload',()=>window.__catGame.home.record.best===128&&window.__catGame.home.record.muted);
 await page.evaluate(()=>{const g=window.__catGame;for(let i=0;i<20;i++){g.restart();g.drop(0);g.returnHome();}});
 await check('20 start/home cycles leave one homepage and no old cats',()=>{const g=window.__catGame;return g.atHome&&g.cats.size===0&&g.node.children.filter(n=>n.name==='Home').length===1&&g.session.time===0;});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'temp/home-mobile.png'});
 await tap('startButton');await check('mobile start button remains reachable and never drops a cat',()=>!window.__catGame.atHome&&window.__catGame.cats.size===0);
 assert.deepEqual(errors,[]);console.log('10 homepage checks passed; no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
