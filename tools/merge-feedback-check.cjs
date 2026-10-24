const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:720,height:1280}}),errors=[];let count=0;
 page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);count++;console.log('PASS '+name);};
 await page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;g.audio.setMuted(true);g.spawn(1,-173,-406);g.spawn(1,-127,-406);g.fixedTick(1/60);});
 await check('source physics disappears and score commits in same step before gather finishes',()=>{const g=window.__catGame;return g.cats.size===1&&g.session.score===10&&g.ui.effects.sources.children.length===2;});
 await check('gather snapshots have no physics components',()=>window.__catGame.ui.effects.sources.children.every(n=>n.getComponentsInChildren('cc.RigidBody2D').length===0&&n.getComponentsInChildren('cc.Collider2D').length===0));
 await page.evaluate(()=>{const g=window.__catGame;g.spawn(1,127,-406);g.spawn(1,173,-406);g.fixedTick(1/60);g.ui.effects.tick(.03);for(const c of g.cats.values())c.animate(g.session.time,0,.03);g.ui.refresh(g.session,g.shake);});
 await check('second genuine merge labels product with 2连合 above its body',()=>{const b=window.__catGame.ui.effects.bubbles[0];return b.node.getComponent('cc.Label').string==='2连合'&&b.node.position.y>b.product.node.position.y+b.product.r;});
 await check('source pictures briefly gather inward and compress',()=>window.__catGame.ui.effects.ghosts.every(g=>g.node.scale.x<1&&g.node.scale.y<1&&Math.hypot(g.node.position.x-g.from.x,g.node.position.y-g.from.y)>0));
 await page.screenshot({path:'temp/merge-gather.png'});
 await check('pause freezes source gather, product reveal and local chain text',()=>{const g=window.__catGame,age=g.ui.effects.ghosts[0].age,b=g.ui.effects.bubbles[0].age,c=[...g.cats.values()][0],t=c.mergeElapsed;g.pause();g.update(.1);const same=age===g.ui.effects.ghosts[0].age&&b===g.ui.effects.bubbles[0].age&&t===c.mergeElapsed;g.resume();return same;});
 await page.evaluate(()=>{const g=window.__catGame;g.ui.effects.tick(.11);for(const c of g.cats.values())c.animate(g.session.time,0,.11);});
 await check('newborn overshoots gently with no change to circle, body scale or score',()=>{const g=window.__catGame;return g.ui.effects.ghosts.length===0&&g.session.score===22&&[...g.cats.values()].every(c=>c.art.scale.x>1&&c.art.scale.x<1.07&&c.node.scale.x===1&&c.node.scale.y===1&&c.collider.radius===33);});
 await page.screenshot({path:'temp/merge-rebound.png'});
 await page.evaluate(()=>{const g=window.__catGame;g.ui.effects.tick(.14);for(const c of g.cats.values())c.animate(g.session.time,0,.14);});
 await check('merge appearance settles within .26 seconds',()=>[...window.__catGame.cats.values()].every(c=>Math.abs(c.art.scale.x-1)<.001&&c.art.getComponent('cc.UIOpacity').opacity===255));
 await page.evaluate(()=>window.__catGame.ui.effects.tick(.2));
 await check('chain text fades locally then removes itself',()=>{const e=window.__catGame.ui.effects,b=e.bubbles[0],fading=b.node.getComponent('cc.UIOpacity').opacity<255;e.tick(.3);return fading&&e.bubbles.length===0;});
 await page.evaluate(()=>{const g=window.__catGame;g.restart();for(const x of [-210,-70,70,210]){g.spawn(1,x-23,-406);g.spawn(1,x+23,-406);g.fixedTick(1/60);}g.ui.effects.tick(.14);for(const c of g.cats.values())c.animate(g.session.time,0,.14);g.ui.refresh(g.session,g.shake);});
 await check('four committed merges display 4连合',()=>window.__catGame.ui.effects.bubbles.some(b=>b.node.getComponent('cc.Label').string==='4连合'));
 await page.screenshot({path:'temp/merge-chain4.png'});
 await page.evaluate(()=>{const g=window.__catGame;g.restart();g.ui.cats.setPosition(37,-19);g.spawn(1,-23,20);g.spawn(1,23,20);g.fixedTick(1/60);});
 await check('source snapshots correctly convert a translated physical parent',()=>{const e=window.__catGame.ui.effects;return e.ghosts.length===2&&Math.abs((e.ghosts[0].from.x+e.ghosts[1].from.x)/2-37)<.5;});
 await page.evaluate(()=>{const g=window.__catGame;g.ui.cats.setPosition(0,0);g.restart();g.spawn(1,-270,-406);g.spawn(1,-270,-359);g.fixedTick(1/60);for(const c of g.cats.values())c.animate(g.session.time,0,.15);});
 await check('wall merge rebound stays within visual boundaries',()=>[...window.__catGame.cats.values()].every(c=>c.x+c.art.position.x-c.r*c.art.scale.x>=-300&&c.x+c.art.position.x+c.r*c.art.scale.x<=300));
 await page.evaluate(()=>{const g=window.__catGame;g.restart();g.spawn(7,-143.5,-286);g.spawn(7,143.5,-286);g.fixedTick(1/60);window.__winTime=g.session.time;for(let i=0;i<3;i++)g.update(.1);});
 await check('winning merge finishes visually while physical clock stays frozen',()=>{const g=window.__catGame,c=[...g.cats.values()][0];return g.session.state==='won'&&g.session.score===640&&g.session.time===window.__winTime&&Math.abs(c.art.scale.x-1)<.001&&c.art.getComponent('cc.UIOpacity').opacity===255&&g.ui.effects.ghosts.length===0;});
 await page.evaluate(()=>{const g=window.__catGame;for(let i=0;i<30;i++){g.restart();g.spawn(1,-23,-406);g.spawn(1,23,-406);g.fixedTick(1/60);}g.restart();});
 await check('30 restart cycles clear snapshots and floating labels',()=>{const g=window.__catGame;return g.cats.size===0&&g.ui.effects.sources.children.length===0&&g.ui.effects.ghosts.length===0&&g.ui.effects.bubbles.length===0;});
 assert.deepEqual(errors,[]);console.log(`${count} merge feedback checks passed.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
