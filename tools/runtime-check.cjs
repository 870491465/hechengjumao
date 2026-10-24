/* Optional browser integration checks. Set PLAYWRIGHT_MODULE and CHROMIUM_PATH if not installed via npm. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.CATBOX_URL || 'http://localhost:7456/';
const preview = process.env.CATBOX_PREVIEW === '1';
const sceneId = '848bf0f3-cdbf-445a-a39d-978c0190a66a';
const stressSeconds = Number(process.env.CATBOX_STRESS_SECONDS || 30);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Preview server normally uses the editor's currently open scene. Select the committed scene explicitly.
  if (preview) {
    await page.route('**/settings.js?*', async route => {
      const response = await route.fetch({ url: new URL(`/settings.js?scene=${sceneId}`, url).href });
      await route.fulfill({ response });
    });
    if (process.env.CATBOX_SOURCE_SCENE === '1') {
      await page.route(`**/scene/${sceneId}.json`, route => route.fulfill({
        contentType: 'application/json', body: fs.readFileSync('assets/scenes/CatBox.scene', 'utf8') }));
    }
  }
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.__catGame, { timeout: 60000 });
    const results = await page.evaluate(async (stressSeconds) => {
      const g = window.__catGame; g.enabled = false;
      const results = [];
      const check = (name, predicate) => { if (!predicate) throw Error(name + ' ' + JSON.stringify({
        score:g.session.score, time:g.session.time, state:g.session.state,
        cats:[...g.cats.values()].map(c=>({id:c.id,level:c.level,x:c.x,y:c.y,touched:c.touched,v:c.body.linearVelocity})),
        contacts:[...g.mergeSystem.contacts.values()]})); results.push(name); };
      const step = n => { for (let i = 0; i < n && g.session.state === 'playing'; i++) g.fixedTick(1 / 60); };
      const reset = () => { g.restart(); g.enabled = false; };
      const add = (l, x, y) => g.spawn(l, x, y);
      reset();
      g.drop(0); const spawnY = [...g.cats.values()][0].y; reset();
      check('shorter box leaves a clear waiting and falling area', g.walls[0].position.y-g.walls[0].getComponent('cc.BoxCollider2D').size.y/2 === -430 && spawnY === 350);
      check('first drop accepted, immediate repeats rejected', g.drop(0) && !g.drop(0) && !g.drop(120) && g.cats.size === 1);
      step(36); check('cooldown ends at .6 seconds', g.canDrop());
      check('normal falling cat never starts danger before box contact', g.session.danger === 0 && ![...g.cats.values()][0].touched);
      g.drop(0); step(180);
      check('real Box2D contact merges exactly once', g.cats.size === 1 && [...g.cats.values()][0].level === 2 && g.session.score === 10);
      reset(); add(1, -46, -406); add(1, 0, -406); add(1, 46, -406); step(1);
      check('three simultaneous contacting cats consume one pair', g.cats.size === 2 && g.session.score === 10 && [...g.cats.values()].some(c => c.level === 1));
      reset(); add(1, -275, -406); add(1, -229, -406); step(120);
      check('wall-adjacent merge stays inside container', g.cats.size === 1 && [...g.cats.values()].every(c => c.x - c.r >= -301 && c.y - c.r >= -431));
      reset(); const high = add(3, 350, 620);
      high.body.linearVelocity = high.body.linearVelocity.clone().set(20, 0); step(1);
      check('high cats cannot bypass wall ends; open top is not capped', high.x + high.r <= 300.75 && high.y > 600);
      const below = add(2, -100, -520); step(1);
      check('out-of-bounds floor correction recovers body and removes outward velocity', below.y - below.r >= -430.75 && below.body.linearVelocity.y >= -.1);
      reset(); const soft = add(3, 0, -140);
      for(let i=0;i<120 && !Number.isFinite(soft.jellyAt);i++) step(1);
      check('real floor collision triggers jelly feedback', Number.isFinite(soft.jellyAt) && soft.touched);
      soft.animate(soft.jellyAt + .045);
      check('impact squashes only artwork with area preserved', Math.abs(soft.art.scale.y - 1) > .08 &&
        Math.abs(soft.art.scale.x * soft.art.scale.y - 1) < .001 && soft.node.scale.x === 1 && soft.node.scale.y === 1 && soft.collider.radius === soft.r);
      check('landing squash remains planted on floor', Math.abs(soft.y + soft.art.position.y - soft.r * soft.art.scale.y + 430) < 1);
      soft.animate(soft.jellyAt + .7);
      check('jelly settles back to round without collision-size drift', soft.art.scale.x === 1 && soft.art.scale.y === 1);
      reset(); const edgeSoft = add(4, -240, -370);
      edgeSoft.impact(600, 0, -1, g.session.time, true); edgeSoft.animate(g.session.time + .045);
      const theta=edgeSoft.jellyAngle*Math.PI/180;
      const ex=edgeSoft.r*Math.hypot(edgeSoft.art.scale.x*Math.cos(theta),edgeSoft.art.scale.y*Math.sin(theta));
      const ey=edgeSoft.r*Math.hypot(edgeSoft.art.scale.x*Math.sin(theta),edgeSoft.art.scale.y*Math.cos(theta));
      check('jelly bulge stays inside wall and floor', edgeSoft.x+edgeSoft.art.position.x-ex>=-300.001 && edgeSoft.y+edgeSoft.art.position.y-ey>=-430.001);
      edgeSoft.animate(g.session.time + .045, 9);
      check('artwork also stays inside shaking visual wall', edgeSoft.x+edgeSoft.art.position.x-ex>=-291.001);
      reset(); const a = add(1, 0, spawnY); const before = [g.session.current, g.session.next];
      check('occupied spawn does not consume queue', !g.drop(0) && before[0] === g.session.current && before[1] === g.session.next && g.cats.size === 1);
      reset();
      check('shake consumes one and refuses reentry', g.useShake() && !g.useShake() && g.shake.remaining === 1 && !g.drop(0));
      step(48); check('shake ends after .8s, cooldown refuses use', !g.shake.active && !g.useShake() && g.shake.remaining === 1);
      step(180); check('shake usable after end plus 3s', g.useShake() && g.shake.remaining === 0);
      reset(); g.drop(0); g.session.danger = .5; g.pause();
      const time = g.session.time, y = [...g.cats.values()][0].y, ready = g.session.dropReady;
      g.update(5);
      check('pause freezes physical motion, cooldown and danger', g.session.time === time && g.session.danger === .5 && [...g.cats.values()][0].y === y && g.session.dropReady === ready);
      g.resume(); check('explicit continue resumes', g.session.state === 'playing');
      g.onHide(); g.onShow(); check('foreground return remains paused', g.session.state === 'paused' && !g.hidden); g.resume();
      reset(); const dangerCat = add(1, 0, 330); dangerCat.touched = true; dangerCat.protectionUntil = 0; dangerCat.body.gravityScale = 0;
      g.session.danger = 2.99; step(1); check('persistent overflow produces one failure', g.session.state === 'lost' && g.resultShown);
      const modal = g.fail.node; g.finish('lost'); check('repeated settlement does not recreate popup', g.fail.node === modal&&g.node.children.filter(n=>n.name==='FailResult').length===1);
      reset(); const p = add(7, -140, 120), q = add(7, 140, 120);
      p.touched = q.touched = true; p.protectionUntil = q.protectionUntil = 0; g.session.danger = 2.999;
      step(1); check('level-8 merge wins over failure in same physical step', g.session.state === 'won' && g.session.score === 640 && g.cats.size === 1);
      g.finish('lost'); check('victory cannot be overwritten', g.session.state === 'won'); g.update(2);
      reset();
      for (let i = 0; i < 30; i++) { g.drop(0); step(2); g.restart(); }
      check('30 restarts leave no old cats, contacts, score, cooldown or shake state', g.cats.size === 0 && g.colliders.size === 0 && g.mergeSystem.contacts.size === 0
        && g.ui.cats.children.length === 0 && g.session.score === 0 && g.session.time === 0 && g.shake.remaining === 2 && g.session.current === 1 && g.session.next === 1);
      // Accelerated simulation only: this does not measure real-device frame rate.
      for (let i=0;i<60;i++) { const c=add(1,-234+(i%10)*52,-405+Math.floor(i/10)*52);
        c.mergeAt=Infinity; c.protectionUntil=Infinity; }
      step(Math.ceil(stressSeconds * 60));
      check(`60 bodies survive ${stressSeconds} simulated seconds without escape or growth`, g.cats.size === 60 &&
        [...g.cats.values()].every(c=>Number.isFinite(c.x+c.y) && c.x-c.r>=-302 && c.x+c.r<=302 && c.y-c.r>=-432));
      reset();
      g.enabled = true; return results;
    }, stressSeconds);
    results.forEach(r => console.log(`PASS ${r}`));
    // Real input dispatch checks (not direct controller calls).
    const location = async (x, y) => page.evaluate(({x,y}) => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      const scale=Math.min(r.width/720,r.height/1280);
      return { x:r.left+(r.width-720*scale)/2+(x+360)*scale,
        y:r.top+(r.height-1280*scale)/2+(640-y)*scale };
    }, {x,y});
    const spawnCases=[];
    for(const y of [-350,160,390]) {
      await page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;});
      const tap=await location(120,y);await page.touchscreen.tap(tap.x,tap.y);
      spawnCases.push(await page.evaluate(()=>{const g=window.__catGame,c=[...g.cats.values()][0];
        return {x:c.x,y:c.y,vx:c.body.linearVelocity.x,vy:c.body.linearVelocity.y,
          waiting:g.ui.guide.active,level:Number(g.ui.guideBall.name),current:g.session.current,
          waitingY:g.ui.guide.position.y,physicalCount:g.cats.size};}));
    }
    for(const c of spawnCases) {assert.ok(Math.abs(c.x-120)<.01);assert.equal(c.y,350);assert.equal(c.vx,0);assert.equal(c.vy,0);
      assert.equal(c.waiting,true);assert.equal(c.level,c.current);assert.equal(c.waitingY,350);assert.equal(c.physicalCount,1);}
    console.log('PASS three touch heights select only X; fixed Y and zero launch velocity');
    console.log('PASS next current cat waits above box without becoming a physical entity');
    await page.evaluate(()=>{const g=window.__catGame,c=[...g.cats.values()][0],y=c.y;g.fixedTick(1/60);
      if(!(c.y<y&&c.y>y-2&&c.body.linearVelocity.y<0))throw Error('drop must fall naturally by gravity');});
    console.log('PASS released cat starts falling naturally instead of teleporting to click or floor');
    const conversion=await page.evaluate(()=>{const g=window.__catGame;g.restart();g.ui.cats.setPosition(73,-41);
      const p=g.controls.position({getUILocation:()=>({x:g.node.worldPosition.x+73+120,y:g.node.worldPosition.y-41+50})});
      g.ui.cats.setPosition(0,0);return{x:p.x,y:p.y};});
    assert.ok(Math.abs(conversion.x-120)<.001&&Math.abs(conversion.y-50)<.001);
    console.log('PASS input conversion targets translated physical parent local coordinates');
    await page.evaluate(() => window.__catGame.restart());
    let p = await location(0, 0); await page.touchscreen.tap(p.x, p.y);
    assert.equal(await page.evaluate(() => window.__catGame.cats.size), 1, 'touch drop');
    p = await location(307,603); await page.touchscreen.tap(p.x,p.y);
    assert.equal(await page.evaluate(() => window.__catGame.session.state), 'paused', 'pause button hit');
    assert.equal(await page.evaluate(() => window.__catGame.cats.size), 1, 'button never drops cat');
    console.log('PASS actual touchscreen drop and pause button isolation');
    await page.screenshot({path:'temp/runtime-paused.png'});
    await page.evaluate(() => {window.__catGame.restart();window.__catGame.enabled=false;});
    p=await location(0,0);
    for(let i=0;i<10;i++) await page.touchscreen.tap(p.x,p.y);
    assert.equal(await page.evaluate(()=>window.__catGame.cats.size),1,'rapid taps respect cooldown');
    console.log('PASS ten touchscreen taps respect cooldown');
    await page.evaluate(()=>window.__catGame.restart());
    const cdp=await page.context().newCDPSession(page);
    const second=await location(130,0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1},{x:second.x,y:second.y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:second.x,y:second.y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(()=>window.__catGame.cats.size),1,'multitouch creates once');
    console.log('PASS simultaneous touchscreen fingers create one cat');
    await page.evaluate(()=>window.__catGame.restart());
    const shakePoint=await location(0,-542); await page.touchscreen.tap(shakePoint.x,shakePoint.y);
    assert.deepEqual(await page.evaluate(()=>({cats:window.__catGame.cats.size,remaining:window.__catGame.shake.remaining})),{cats:0,remaining:1});
    console.log('PASS shake button never drops cat');
    for(const viewport of [{width:390,height:844},{width:360,height:640}]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(250);
      await page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;});
      const mobileTap=await location(-130,-300);await page.touchscreen.tap(mobileTap.x,mobileTap.y);
      const actual=await page.evaluate(()=>{const g=window.__catGame,c=[...g.cats.values()][0];return{x:c.x,y:c.y};});
      assert.ok(Math.abs(actual.x+130)<1.5&&actual.y===350,`mobile coordinates ${viewport.width}x${viewport.height}`);
      await page.screenshot({path:`temp/drop-area-${viewport.width}x${viewport.height}.png`});
      console.log(`PASS touch coordinates and fixed spawn on ${viewport.width}x${viewport.height} screen`);
    }
    await page.setViewportSize({width:720,height:1280});await page.waitForTimeout(250);
    await page.evaluate(() => { const g=window.__catGame; g.restart(); g.enabled=false;
      for(let l=1;l<=8;l++) g.spawn(l, l<=4 ? -210+(l-1)*135 : -200+(l-5)*130, l<=4 ? -330 : -30);
      g.ui.refresh(g.session,g.shake); });
    await page.screenshot({path:'temp/runtime-levels.png'});
    assert.deepEqual(errors, [], 'runtime errors');
    console.log(`${results.length + 10} runtime checks passed; screenshots in temp/.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
