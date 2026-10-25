const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:720,height:1280}}),errors=[];let checks=0;
 page.on('pageerror',e=>errors.push(e.stack));
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);console.log('PASS '+name);checks++;};
 try{
 await page.goto('http://localhost:8080/?catTest=1');await page.waitForFunction(()=>window.__catGame?.ui?.guideBall);
 await page.evaluate(()=>{
  const g=window.__catGame;g.enabled=false;g.audio.setMuted(true);
  window.step=(n)=>{for(let i=0;i<n;i++){g.fixedTick(1/60);for(const c of g.cats.values())c.animate(g.session.time,g.shake.visualX,1/60);g.ui.animatePreviews(1/60);}};
 });
 await check('waiting preview is layered, half-eyed and has no physics components',()=>{
  const g=window.__catGame,p=g.ui.guideBall.getChildByName('CatPicture').getChildByName('LevelOneRig');
  return p.children.length===12&&p.getChildByName('eye_left_half').active&&!p.getChildByName('eye_left_closed').active&&g.cats.size===0;
 });
 await page.screenshot({path:'temp/v11-wait.png'});
 await page.evaluate(()=>{const g=window.__catGame;g.drop(0);window.cat=[...g.cats.values()][0];step(8);});
 await check('real drop enters modest stretched fall; physical radius, density, root scale unchanged',()=>{
  const c=window.cat;return c.rig.state==='fall'&&c.art.scale.y>1&&c.art.scale.y<1.06&&c.collider.radius===24&&c.collider.density===1&&c.node.scale.x===1;
 });
 await check('fall facing stays upright while rigid body rotates',()=>{
  const c=window.cat;c.node.angle=35;c.animate(window.__catGame.session.time,0,0);
  const ok=Math.abs(c.art.angle+c.node.angle)<.001;c.node.angle=0;return ok;
 });
 await page.screenshot({path:'temp/v11-fall.png'});
 await page.evaluate(()=>{for(let i=0;i<200&&!window.cat.rig.firstContact;i++)step(1);});
 await check('real floor contact triggers first landing exactly once',()=>window.cat.rig.firstContact&&window.cat.rig.state==='contact'&&window.cat.rig.contactCount===1);
 await page.evaluate(()=>step(4));await page.screenshot({path:'temp/v11-contact.png'});
 await check('first compression is small and does not scale the rigid body',()=>window.cat.art.scale.y<1&&window.cat.art.scale.y>.94&&window.cat.node.scale.y===1);
 await page.evaluate(()=>step(20));
 await check('landing finishes within .25s and rolls with body after rounding',()=>{const c=window.cat;return c.rig.state==='round'&&Math.abs(c.art.scale.x-1)<.001&&Math.abs(c.art.angle)<.001;});
 await check('unstable speed prevents idle',()=>{const r=window.cat.rig;r.motion(1,100,0,true,false);return r.state!=='idle'&&r.stableTime===0;});
 await page.evaluate(()=>step(180));
 await check('continuous stable support enters idle without retriggering landing',()=>window.cat.rig.state==='idle'&&window.cat.rig.contactCount===1);
 await check('blink has randomized 4-8 second delay',()=>window.cat.rig.blinkAt>0&&window.cat.rig.blinkAt<=8);
 await check('closed artwork micro-opens half/open/half/closed',()=>{
  const r=window.cat.rig;r.blinkAt=.001;const a=[];for(const dt of [.01,.08,.09,.10]){r.advance(dt,0);a.push(r.eye);}return a.join(',')==='half,open,half,closed';
 });
 await page.screenshot({path:'temp/v11-idle.png'});
 await page.evaluate(async()=>{const {instantiate}=await System.import('cc');window.proof=instantiate(window.cat.art);proof.setParent(window.__catGame.ui.hud);proof.setPosition(0,0);proof.setScale(6,6,1);});
 await page.screenshot({path:'temp/v11-assembly-detail.png'});await page.evaluate(()=>{proof.removeFromParent();proof.destroy();});
 await check('pause freezes animation clock, phase and blink countdown',()=>{
  const g=window.__catGame,r=window.cat.rig;g.pause();const before=[r.clock,r.age,r.blinkAt,r.blinkAge].join();for(let i=0;i<20;i++)g.update(.1);return before===[r.clock,r.age,r.blinkAt,r.blinkAge].join();
 });
 await check('background and return require continue; no random catch-up',()=>{
  const g=window.__catGame,r=window.cat.rig;g.resume();g.onHide();const clock=r.clock;g.onShow();g.update(.1);return g.session.state==='paused'&&clock===r.clock;
 });
 await page.evaluate(()=>{const g=window.__catGame;g.resume();g.useShake();step(2);});
 await check('shake leaves idle and never repeats first landing',()=>window.cat.rig.state==='round'&&window.cat.rig.contactCount===1);
 await check('losing support keeps round pose',()=>{const r=window.cat.rig;r.motion(.1,100,50,false,false);return r.state==='round'&&r.firstContact;});
 await page.evaluate(async()=>{
  const g=window.__catGame;g.restart();const {Vec2}=await System.import('cc');
  window.wallCat=g.spawn(1,-275,0);wallCat.body.linearVelocity=new Vec2(-4,-1);step(8);
 });
 await check('side wall contact alone does not trigger landing',()=>!window.wallCat.rig.firstContact&&window.wallCat.rig.state==='fall');
 await page.evaluate(()=>{
  const g=window.__catGame;g.restart();g.spawn(3,0,-385);window.topCat=g.spawn(1,0,-260);step(50);
 });
 await check('landing on another level triggers first contact',()=>window.topCat.rig.firstContact&&window.topCat.rig.contactCount===1);
 await page.evaluate(()=>{
  const g=window.__catGame;g.restart();window.a=g.spawn(1,-23,-406);window.b=g.spawn(1,23,-406);step(1);
 });
 await check('same-level pair merges immediately, scoring once; only snapshots remain',()=>{
  const g=window.__catGame;return g.cats.size===1&&[...g.cats.values()][0].level===2&&g.session.score===10&&!a.rig&&!b.rig&&g.ui.effects.ghosts.length===2;
 });
 await check('visual snapshots have no rigid bodies or colliders',()=>window.__catGame.ui.effects.ghosts.every(g=>!g.node.getComponentInChildren('cc.RigidBody2D')&&!g.node.getComponentInChildren('cc.CircleCollider2D')));
 await page.evaluate(()=>{
  const g=window.__catGame;g.restart();window.old=g.spawn(1,-100,0);window.other=g.spawn(2,100,0);
  window.mass=old.body.getMass();window.v=old.body.linearVelocity.clone();window.p=old.node.position.clone();g.setLevelOneAnimation(false);
 });
 await check('debug switch restores V1.0 art without touching physics or rules',()=>{
  const g=window.__catGame,c=window.old;return !c.rig&&c.art.getChildByName('CatPicture').getChildByName('Art-cream')&&c.body.getMass()===mass&&c.collider.radius===24&&c.node.position.equals(p)&&c.body.linearVelocity.equals(v)&&g.session.score===0;
 });
 await check('enabling new visuals leaves level 2 unchanged',()=>{
  const g=window.__catGame,child=other.art.children[0];g.setLevelOneAnimation(true);return old.rig&&other.art.children[0]===child&&!other.rig;
 });
 await page.evaluate(()=>{
  const g=window.__catGame;g.restart();window.rigs=[-200,-100,0,100,200].map(x=>g.spawn(1,x,0).rig);
 });
 await check('multiple cats stagger visual blink timers',()=>new Set(rigs.map(r=>r.blinkAt.toFixed(3))).size>1);
 await check('settlement stops own animation',()=>{const g=window.__catGame;g.finish('lost');return [...g.cats.values()].every(c=>!c.rig||c.rig.state==='stopped');});
 await check('30 restarts stop old rigs and leave no old entity or effects',()=>{
  const g=window.__catGame,oldRigs=[];for(let i=0;i<30;i++){g.restart();oldRigs.push(g.spawn(1,0,0).rig);}g.restart();
  return oldRigs.every(r=>r.state==='stopped')&&g.cats.size===0&&g.ui.cats.children.length===0&&g.ui.effects.ghosts.length===0;
 });
 const traces=[];
 for(const enabled of [false,true]){
  await page.goto(`http://localhost:8080/?catAnim=${enabled?1:0}`);await page.waitForFunction(()=>!!window.__catGame?.ui);
  traces.push(await page.evaluate(()=>{
   const g=window.__catGame;g.restart();g.enabled=false;g.audio.setMuted(true);g.session=new g.session.constructor(20261024);
   const trace=[];let drops=0;
   for(let i=0;i<1800&&g.session.state==='playing';i++){
    if(i%60===0&&g.drop([-150,-150,0,0,150,150][drops%6]))drops++;
    if(i===1000)g.useShake();g.fixedTick(1/60);
    for(const c of g.cats.values())c.animate(g.session.time,g.shake.visualX,1/60);
    if(i%60===59)trace.push({score:g.session.score,state:g.session.state,current:g.session.current,next:g.session.next,remaining:g.shake.remaining,
     cats:[...g.cats.values()].map(c=>[c.id,c.level,c.x,c.y,c.node.angle,c.collider.radius,c.body.getMass()])});
   }
   return trace;
  }));
 }
 assert.deepEqual(traces[1],traces[0],'new/old visuals keep identical physical trajectories, queue, mass, scoring and shake uses');checks++;
 console.log('PASS identical seeded 30-second new/old physics replay');
 fs.writeFileSync('temp/v11-physics-replay.json',JSON.stringify(traces[1],null,2));
 assert.deepEqual(errors,[]);console.log(`${checks} level-one animation checks passed.`);
 fs.writeFileSync('temp/v11-animation-check.json',JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
