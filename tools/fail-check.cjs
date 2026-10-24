const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:720,height:1280},hasTouch:true}),errors=[];let count=0;
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'||m.text().includes('[Art] Missing'))errors.push(m.text());});
 const open=async()=>{await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});};
 await open();
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);count++;console.log('PASS '+name);};
 const overflow=async(score,best)=>page.evaluate(({score,best})=>{
   const g=window.__catGame;g.restart();g.enabled=false;g.homeRecord.best=best;g.session.score=score;
   const c=g.spawn(1,0,220);c.touched=true;c.protectionUntil=0;c.body.gravityScale=0;
   for(let i=0;i<180&&g.session.state==='playing';i++)g.fixedTick(1/60);
 },{score,best});
 const tap=async(field)=>{const p=await page.evaluate(async field=>{const cc=await System.import('cc'),s=cc.view.getVisibleSize(),n=window.__catGame.fail[field],r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(n.position.x+s.width/2)*r.width/s.width,y:r.top+(s.height/2-n.position.y)*r.height/s.height};},field);await page.touchscreen.tap(p.x,p.y);};
 await overflow(1280,2680);
 await check('three seconds of eligible overflow opens failure result',()=>{const g=window.__catGame;return g.session.state==='lost'&&g.resultShown&&g.fail&&g.fail.result==='lost'&&!g.win&&g.session.danger>=2.999;});
 await check('new WebP title and hero decode with correct artwork and aspect',()=>{const n=window.__catGame.fail.node,h=n.getChildByName('Art-failHero'),t=n.getChildByName('Art-failTitle');const size=h.getComponent('cc.UITransform').contentSize;return h.getComponent('cc.Sprite').spriteFrame.name==='fail-hero'&&t.getComponent('cc.Sprite').spriteFrame.name==='fail-title'&&Math.abs(size.width/size.height-1437/931)<.001;});
 await check('failure displays actual score and stored best',()=>{const f=window.__catGame.fail;return f.score===1280&&f.best===2680&&f.node.getChildByName('RoundScore').getComponent('cc.Label').string==='1280'&&f.node.getChildByName('BestScore').getComponent('cc.Label').string==='2680';});
 await check('failure creates no celebration, record badge or physics components',()=>{const n=window.__catGame.fail.node;return !n.getChildByName('Art-winCelebration')&&!n.getChildByName('Art-winRecord')&&n.getComponentsInChildren('cc.RigidBody2D').length===0;});
 await check('shared background, score panel and blank button assets are reused',()=>{const f=window.__catGame.fail;return !!f.node.getChildByName('Art-winBackground')&&!!f.node.getChildByName('Art-winScore')&&!!f.replayButton.getChildByName('Art-homeStart')&&!!f.homeButton.getChildByName('Art-homeHelp')&&f.replayButton.getChildByName('Text').getComponent('cc.Label').string==='再试一次';});
 await page.waitForTimeout(100);await page.screenshot({path:'temp/fail.png'});
 await check('failure cannot settle twice or accept gameplay input',()=>{const g=window.__catGame,f=g.fail;g.finish('lost');g.showResult();return f===g.fail&&g.session.score===1280&&!g.drop(0)&&!g.useShake()&&g.node.children.filter(n=>n.name==='FailResult').length===1;});
 await check('gameplay stays frozen while only failure jingle may finish',()=>{const g=window.__catGame,t=g.session.time;g.update(.1);return g.session.time===t&&!g.ui.hud.active&&g.audio.scene==='result'&&g.audio.voices.every(v=>!v.key||v.key==='game_lose');});
 await check('background return requires continue',()=>{const g=window.__catGame,t=g.fail.elapsed;g.onHide();g.update(.1);g.onShow();g.update(.1);return t===g.fail.elapsed&&g.fail.awaitingContinue&&g.fail.pauseLayer.active;});
 await page.evaluate(()=>{const g=window.__catGame,n=g.fail.pauseLayer.children.find(n=>n.name==='Dialog').children.find(n=>n.name==='Continue'),e={getID:()=>9,propagationStopped:false};n.emit('touch-start',e);n.emit('touch-end',e);});
 await tap('replayButton');
 await check('retry clears old result and enters empty game without click-through drop',()=>{const g=window.__catGame;return !g.fail&&!g.atHome&&g.session.state==='playing'&&g.session.score===0&&g.cats.size===0&&g.ui.hud.active;});
 await overflow(3000,2680);
 await check('failed round still saves a higher best but hides record badge by specification',()=>{const g=window.__catGame;return g.homeRecord.best===3000&&g.fail.best===3000&&!g.fail.node.getChildByName('Art-winRecord')&&localStorage.getItem('catbox.best.v1')==='3000';});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'temp/fail-mobile.png'});
 await tap('homeButton');
 await check('long-screen home button is reachable and cleans failed round',()=>{const g=window.__catGame;return !g.fail&&g.atHome&&g.home.node.active&&g.cats.size===0;});
 await open();await check('highest score remains after reload',()=>window.__catGame.homeRecord.best===3000);
 await page.evaluate(()=>{const g=window.__catGame;g.enabled=false;for(let i=0;i<20;i++){g.restart();g.finish('lost');g.restart();}});await page.waitForTimeout(100);
 await check('20 fail/retry cycles leave no old result nodes',()=>{const g=window.__catGame;return !g.fail&&g.cats.size===0&&g.node.children.every(n=>n.name!=='FailResult');});
 await overflow(100,3000);
 await page.evaluate(async()=>{const g=window.__catGame;window.__deadFailNode=g.fail.node;g.destroy();for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 await check('controller destruction also disposes active failure view',async()=>{const cc=await System.import('cc');return !cc.isValid(window.__deadFailNode)&&!window.__catGame;});
 assert.deepEqual(errors,[]);console.log(`${count} failure checks passed; no page errors.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
