const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:720,height:1280},hasTouch:true}),errors=[];let count=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);count++;console.log('PASS '+name);};
 const win=async(best=100)=>page.evaluate(best=>{
   const g=window.__catGame;g.restart();g.enabled=false;g.homeRecord.best=best;g.session.score=2040;
   g.spawn(7,-143.5,-286);g.spawn(7,143.5,-286);g.fixedTick(1/60);
 },best);
 const reveal=async()=>page.evaluate(()=>{const g=window.__catGame;for(let i=0;i<30;i++)g.update(.1);});
 const tap=async(name)=>{const p=await page.evaluate(async name=>{const cc=await System.import('cc'),size=cc.view.getVisibleSize(),n=window.__catGame.win[name],r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(n.position.x+size.width/2)*r.width/size.width,y:r.top+(size.height/2-n.position.y)*r.height/size.height};},name);await page.touchscreen.tap(p.x,p.y);};
 await win();
 await check('real 7+7 commits victory and record before presentation',()=>{const g=window.__catGame;return g.session.state==='won'&&g.session.score===2680&&g.homeRecord.best===2680&&!g.resultShown&&g.cats.size===1;});
 await reveal();
 await check('success page reads committed round and highest scores',()=>{const g=window.__catGame;return g.resultShown&&g.win.score===2680&&g.win.best===2680&&g.win.node.getChildByName('RoundScore').getComponent('cc.Label').string==='2680';});
 await check('new record badge only appears on a strictly higher score',()=>{const w=window.__catGame.win;return w.newRecord&&!!w.node.getChildByName('Art-winRecord');});
 await check('result render layers follow supplied asset instructions',()=>{const a=window.__catGame.win.node.children.map(n=>n.name);return a.indexOf('Art-winBackground')<a.indexOf('Art-winCelebration')&&a.indexOf('Art-winCelebration')<a.indexOf('Art-winHero')&&a.indexOf('Art-winHero')<a.indexOf('Art-winTitle');});
 await page.screenshot({path:'temp/win.png'});
 await check('repeated result or failure cannot duplicate winner or points',()=>{const g=window.__catGame,w=g.win;g.showResult();g.finish('lost');return w===g.win&&g.session.state==='won'&&g.session.score===2680&&g.node.children.filter(n=>n.name==='WinResult').length===1;});
 await check('result blocks drops and shake',()=>{const g=window.__catGame;return !g.drop(0)&&!g.useShake()&&g.shake.remaining===2;});
 await check('returning from background pauses result animation until explicit continue',()=>{const g=window.__catGame;g.onHide();const t=g.win.elapsed;g.update(.1);g.onShow();g.update(.1);return g.win.elapsed===t&&g.win.awaitingContinue&&g.win.pauseLayer.active;});
 await page.evaluate(()=>{const g=window.__catGame;const btn=g.win.pauseLayer.children.find(n=>n.name==='Dialog').children.find(n=>n.name==='Continue');const e={getID:()=>9,propagationStopped:false};btn.emit('touch-start',e);btn.emit('touch-end',e);g.update(.1);});
 await check('explicit continue releases result pause',()=>!window.__catGame.win.awaitingContinue);
 await tap('replayButton');
 await check('replay enters clean game without click-through cat',()=>{const g=window.__catGame;return !g.win&&!g.atHome&&g.session.state==='playing'&&g.session.score===0&&g.cats.size===0&&g.ui.hud.active;});
 await win(5000);await reveal();
 await check('below existing record does not display new record badge',()=>{const w=window.__catGame.win;return w.best===5000&&!w.newRecord&&!w.node.getChildByName('Art-winRecord');});
 await page.screenshot({path:'temp/win-no-record.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'temp/win-mobile.png'});
 await tap('homeButton');
 await check('result home button clears old round and opens homepage',()=>{const g=window.__catGame;return !g.win&&g.atHome&&g.home.node.active&&g.cats.size===0;});
 await win(2680);await reveal();
 await check('equal highest score is not a new record',()=>!window.__catGame.win.newRecord);
 await page.evaluate(()=>{const g=window.__catGame;for(let i=0;i<12;i++){g.restart();g.session.score=2040;g.spawn(7,-143.5,-286);g.spawn(7,143.5,-286);g.fixedTick(1/60);g.showResult();g.restart();}});
 await page.waitForTimeout(100);
 await check('12 win/replay cycles remove all old result nodes',()=>{const g=window.__catGame;return !g.win&&g.node.children.every(n=>n.name!=='WinResult')&&g.cats.size===0&&g.session.score===0;});
 assert.deepEqual(errors,[]);console.log(`${count} success checks passed; no page errors.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
