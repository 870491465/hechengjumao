const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:720,height:1280}}),errors=[];let count=0;
 page.on('pageerror',e=>errors.push(e.stack));
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);console.log('PASS '+name);count++;};
 try{
  await page.goto('http://localhost:8080/?catTest=1');await page.waitForFunction(()=>!!window.__catGame?.ui?.guideBall);
  await page.evaluate(()=>{
   const g=window.__catGame;g.enabled=false;g.audio.setMuted(true);g.drop(0);window.cat=[...g.cats.values()][0];
   window.step=n=>{for(let i=0;i<n;i++){g.fixedTick(1/60);for(const c of g.cats.values())c.animate(g.session.time,g.shake.visualX,1/60);}};
   step(300);
  });
  await check('recently landed cat is idle and has not stretched early',()=>cat.rig.state==='idle'&&cat.rig.stretchCount===0&&cat.rig.quietTime<10&&cat.rig.stretchAt>=10&&cat.rig.stretchAt<=16);
  await page.evaluate(()=>{window.threshold=cat.rig.stretchAt;for(let i=0;i<1100&&cat.rig.state!=='stretch';i++)step(1);window.startedAt=cat.rig.quietTime;});
  await check('real supported uncollided cat eventually stretches at configured interval',()=>cat.rig.state==='stretch'&&cat.rig.stretchCount===1&&startedAt>=threshold&&startedAt<threshold+.4);
  await page.evaluate(()=>{window.mass=cat.body.getMass();window.point=cat.node.position.clone();step(33);});
  await check('stretch only scales artwork mildly, with no blink or physical size change',()=>cat.rig.state==='stretch'&&cat.art.scale.y>1.03&&cat.art.scale.y<=1.041&&cat.rig.eye==='closed'&&cat.rig.blinkAge<0&&cat.collider.radius===24&&cat.body.getMass()===mass&&cat.node.scale.x===1&&cat.node.position.equals(point));
  await page.screenshot({path:'temp/v11-stretch.png'});
  await page.evaluate(async()=>{const {instantiate}=await System.import('cc');window.detail=instantiate(cat.art);detail.setParent(window.__catGame.ui.hud);detail.setPosition(0,0);detail.setScale(cat.art.scale.x*6,cat.art.scale.y*6,1);});
  await page.screenshot({path:'temp/v11-stretch-detail.png'});await page.evaluate(()=>{detail.removeFromParent();detail.destroy();});
  await check('pause freezes stretch and its quiet timer',()=>{const g=window.__catGame,r=cat.rig;g.pause();const values=[r.age,r.quietTime,r.clock].join();for(let i=0;i<10;i++)g.update(.1);g.resume();return values===[r.age,r.quietTime,r.clock].join();});
  await page.evaluate(()=>step(43));
  await check('one stretch returns to round idle and schedules another long rest',()=>cat.rig.state==='idle'&&cat.rig.stretchCount===1&&cat.rig.quietTime<1&&cat.rig.stretchAt>=10&&Math.abs(cat.art.scale.y-1)<.009&&cat.rig.contactCount===1);
  await check('resting contact refresh does not reset the quiet interval',()=>{const r=cat.rig;r.quietTime=9;cat.contactVisual([...cat.supportContacts][0],true,0);return r.state==='idle'&&r.quietTime===9;});
  await check('even gentle effective contact resets no-collision interval',()=>{const r=cat.rig;r.quietTime=9;cat.contactVisual([...cat.supportContacts][0],true,10);return r.state==='round'&&r.quietTime===0;});
  await check('support loss and shake interrupt stretch without replaying landing',()=>{const r=cat.rig;r.state='stretch';r.age=.5;r.motion(1/60,0,0,false,false);const rolled=r.state==='round'&&r.quietTime===0;r.state='stretch';r.motion(1/60,0,0,true,true);return rolled&&r.state==='round'&&r.contactCount===1;});
  await check('ordinary impact immediately cancels stretch',()=>{const r=cat.rig;r.state='stretch';r.age=.5;r.impact();return r.state==='round'&&r.quietTime===0;});
  await check('ongoing blink finishes before a stretch begins',()=>{const r=cat.rig;r.state='idle';r.quietTime=20;r.blinkAt=0;r.blinkAge=.05;r.advance(.01,0);const delayed=r.state==='idle';r.advance(.3,0);r.advance(.01,0);return delayed&&r.state==='stretch';});
  await page.evaluate(()=>{const g=window.__catGame;g.spawn(1,cat.x+46,cat.y);step(1);});
  await check('stretching source still merges in the contact step and scores once',()=>{const g=window.__catGame;return !cat.rig&&g.cats.size===1&&[...g.cats.values()][0].level===2&&g.session.score===10;});
  await check('restart clears old stretching state',()=>{const g=window.__catGame;g.restart();const c=g.spawn(1,0,0),r=c.rig;r.state='stretch';g.restart();return r.state==='stopped'&&g.cats.size===0;});
  assert.deepEqual(errors,[]);fs.writeFileSync('temp/v11-stretch-check.json',JSON.stringify({count,errors},null,2));console.log(`${count} stretch checks passed.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
