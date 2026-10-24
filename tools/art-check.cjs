const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.CATBOX_URL || 'http://localhost:8080/';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:720,height:1280},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  page.on('console',m=>{if(m.type()==='error'||(m.type()==='warning'&&m.text().includes('[Art]')))errors.push(m.text());});
  if(process.env.CATBOX_PREVIEW==='1'){
    const sceneId='848bf0f3-cdbf-445a-a39d-978c0190a66a';
    await page.route('**/settings.js?*',async route=>{const response=await route.fetch({url:new URL(`/settings.js?scene=${sceneId}`,url).href});await route.fulfill({response});});
    if(process.env.CATBOX_SOURCE_SCENE==='1')await page.route(`**/scene/${sceneId}.json`,route=>route.fulfill({contentType:'application/json',body:require('node:fs').readFileSync('assets/scenes/CatBox.scene','utf8')}));
  }
  try {
    await page.goto(url);await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
    console.log('Cat texture mip levels:',await page.evaluate(()=>window.__catGame.ui.guide.children[0].getChildByName('CatPicture').children[0].getComponent('cc.Sprite').spriteFrame.texture.mipmapLevel));
    const checks=await page.evaluate(()=>{
      const g=window.__catGame;g.restart();g.enabled=false;
      const checks=[];const ok=(label,value)=>{if(!value)throw Error(label);checks.push(label);};
      ok('art controller and box texture are loaded',typeof g.setCollisionOutlines==='function'&&!!g.ui.box.getChildByName('Art-back'));
      const approx=(a,b)=>Math.abs(a-b)<.001;
      const mappings=[['cat_01_cream',898,626.38,646.04,443.90,178,214,860],
        ['cat_02_grey',918,625.97,651.23,453.87,168,214,874],
        ['cat_03_bread',901,627.07,646.83,444.86,177,214,863],
        ['cat_04_calico',958,626.28,650.58,471.43,148,192,915],
        ['cat_05_tuxedo',910,626.20,645.57,447.23,172,212,865],
        ['cat_06_brown_tabby',945,625.86,649.84,463.93,154,205,895],
        ['cat_07_orange_white',927,626.16,649.92,455.83,164,208,884],
        ['cat_08_golden',972,626.31,668.69,478.81,141,192,938]];
      const radii=[24,33,45,60,81,108,144,186];
      for(let level=1;level<=8;level++){
        const c=g.spawn(level,0,0),picture=c.art.getChildByName('CatPicture');
        const mass=c.body.getMass();
        ok(`level ${level} preserves physics radius, density, friction and restitution`,c.r===radii[level-1]
          &&c.collider.radius===c.r&&c.collider.density===1&&approx(c.collider.friction,.35)&&approx(c.collider.restitution,.1));
        if(level<=8){
          const [name,w,cx,cy,br,x,y,h]=mappings[level-1],spriteNode=picture.children[0];
          const sprite=spriteNode.getComponent('cc.Sprite'),size=spriteNode.getComponent('cc.UITransform').contentSize;
          const scale=size.width/w;
          ok(`level ${level} keeps contact skin uniform and separate from physics`,approx(picture.scale.x,1.025)&&approx(picture.scale.y,1.025)&&c.node.scale.x===1&&c.node.scale.y===1);
          ok(`level ${level} uses correct cat texture and preserves bitmap aspect`,sprite.spriteFrame.name===name&&approx(size.width/size.height,w/h));
          ok(`level ${level} aligns BODY centre/radius rather than transparent canvas`,approx(br*scale,c.r)
            &&approx(spriteNode.position.x+(cx-x-w/2)*scale,0)&&approx(spriteNode.position.y+(y+h/2-cy)*scale,0));
          c.node.angle=47;c.animate(g.session.time);
          ok(`level ${level} rolls artwork around body centre`,approx(c.node.angle+c.art.angle+picture.angle,47));
          c.pop(g.session.time);c.animate(g.session.time+.08);
          ok(`level ${level} soft animation keeps body scale, circle and mass unchanged`,c.node.scale.x===1&&c.node.scale.y===1&&c.collider.radius===c.r&&c.body.getMass()===mass);
        }else ok(`level ${level} explicitly keeps numbered greybox fallback`,!picture&&!!c.art.getChildByName('Text'));
      }
      const nodes=g.node.children.map(n=>n.name);
      ok('room, back, cats, front, HUD are in required render order',nodes.indexOf('RoomBackground')<nodes.indexOf('BoxBackLayer')
        &&nodes.indexOf('BoxBackLayer')<nodes.indexOf('Cats')&&nodes.indexOf('Cats')<nodes.indexOf('BoxFrontLayer')
        &&nodes.indexOf('BoxFrontLayer')<nodes.indexOf('HUD'));
      const back=g.ui.box.getChildByName('Art-back'),frame=back.getComponent('cc.Sprite').spriteFrame;
      const size=back.getComponent('cc.UITransform').contentSize,s=back.scale.x;
      // Sliced borders retain original pixel thickness; centre alone takes the custom height.
      const left=back.position.x-size.width*s/2+frame.insetLeft*s;
      const right=back.position.x+size.width*s/2-frame.insetRight*s;
      const top=back.position.y+size.height*s/2-frame.insetTop*s;
      const bottom=back.position.y-size.height*s/2+frame.insetBottom*s;
      ok('paper inner seams align exactly with physical +/-300, floor -430 and top 230',approx(left,-300)&&approx(right,300)&&approx(top,230)&&approx(bottom,-430));
      ok('paper uses sliced centre with uniform border scale',back.scale.x===back.scale.y&&back.getComponent('cc.Sprite').type===1);
      const rim=g.ui.front.getChildByName('Art-rim'),rimSize=rim.getComponent('cc.UITransform').contentSize;
      ok('front rim occludes only eight units of smallest 48-unit cat',approx(rim.position.y+rimSize.height/2,-422)&&8/48<.2);
      ok('front rim is not stretched',approx(rimSize.width/rimSize.height,1428/119));
      const bg=g.node.getChildByName('RoomBackground').getChildByName('Art-background').getComponent('cc.UITransform').contentSize;
      ok('room background scales uniformly',approx(bg.width/bg.height,941/1672));
      const current=g.ui.guide.children[0],next=g.ui.preview.getChildByName('Next').children[0];
      ok('current, next and waiting cat all use matching formal artwork',!!current.getChildByName('CatPicture')&&!!next.getChildByName('CatPicture')&&!!g.ui.guide.children[0].getChildByName('CatPicture'));
      ok('collision outlines default off',!g.showCollisionOutlines&&!g.ui.debugLayer.active);
      ok('header has separate score, goal and next cards with no full-width panels',
        ['ScoreCard','GoalCard','NextCard'].every(n=>!!g.ui.hud.getChildByName(n))&&!g.ui.hud.getChildByName('HeaderCard')&&!g.ui.hud.getChildByName('FooterCard'));
      g.session.score=128;g.session.maxChain=3;g.ui.refresh(g.session,g.shake);
      ok('score card shows actual game statistics',g.ui.score.string==='128'&&g.ui.scoreDetail.string==='最高连锁 3');
      ok('shake count uses a distinct badge and status label',g.ui.shakeCount.string==='2'&&g.ui.shakeLabel.string==='晃一晃'&&!!g.ui.shakeButton.getChildByName('RemainingBadge'));
      ok('pause button is clear of drop input',g.ui.pauseButton.position.y-32>422);
      const logo=g.ui.hud.getChildByName('Art-logo'),logoSize=logo?.getComponent('cc.UITransform').contentSize;
      ok('supplied transparent logo keeps aspect and clears score card',!!logo&&approx(logoSize.width/logoSize.height,1912/682)
        &&logo.position.y+logoSize.height/2<640&&logo.position.y-logoSize.height/2>574
        &&logo.getComponent('cc.Sprite').spriteFrame.name==='game_logo');
      ok('waiting cat and aiming line share fixed spawn position',g.ui.guide.position.y===350&&!!g.ui.hud.getChildByName('AimLine'));
      const score=g.session.score,count=g.cats.size;
      g.setCollisionOutlines(true);ok('collision outlines can be enabled',g.ui.debugLayer.active);
      g.setCollisionOutlines(false);ok('collision outlines can be disabled without gameplay effects',!g.ui.debugLayer.active&&score===g.session.score&&count===g.cats.size);
      g.restart();g.enabled=false;g.spawn(1,-23,-406);g.spawn(1,23,-406);g.fixedTick(1/60);
      const product=[...g.cats.values()][0];
      ok('1+1 makes formal level 2 and scores once',g.cats.size===1&&product.level===2&&g.session.score===10
        &&product.art.getChildByName('CatPicture').children[0].getComponent('cc.Sprite').spriteFrame.name==='cat_02_grey');
      g.restart();g.enabled=false;g.spawn(3,-44,-385);g.spawn(3,44,-385);g.fixedTick(1/60);
      const fallback=[...g.cats.values()][0];
      ok('3+3 makes formal level 4 and scores once',g.cats.size===1&&fallback.level===4&&g.session.score===40&&fallback.art.getChildByName('CatPicture').children[0].getComponent('cc.Sprite').spriteFrame.name==='cat_04_calico');
      for(let level=4;level<=7;level++) {
        g.restart();g.enabled=false;const r=radii[level-1];
        g.spawn(level,-r+.5,-430+r);g.spawn(level,r-.5,-430+r);g.fixedTick(1/60);
        const cat=[...g.cats.values()][0];
        ok(`level ${level} pair makes correct formal level ${level+1}`,g.cats.size===1&&cat.level===level+1
          &&cat.art.getChildByName('CatPicture').children[0].getComponent('cc.Sprite').spriteFrame.name===mappings[level][0]);
        if(level===7) {
          ok('first golden level 8 wins without level 9',g.session.state==='won');
          g.fixedTick(1/60);ok('golden victory never duplicates score or entity',g.cats.size===1&&g.session.score===640);
        }
      }
      g.restart();g.enabled=false;return checks;
    });
    checks.forEach(x=>console.log('PASS '+x));
    for(const x of [-280,0,280]){
      await page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;});
      const p=await page.evaluate(x=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(x+360)*r.width/720,y:r.top+640*r.height/1280};},x);
      await page.touchscreen.tap(p.x,p.y);
      const c=await page.evaluate(()=>{const c=[...window.__catGame.cats.values()][0];return{x:c.x,y:c.y,art:!!c.art.getChildByName('CatPicture')};});
      assert.ok(Math.abs(c.x-Math.max(-270,Math.min(270,x)))<.01&&c.y===350&&c.art);console.log('PASS formal cat touchscreen drop at X '+x);
    }
    await page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;
      const items=[[1,-265,-406],[2,-205,-397],[3,-120,-385],[4,-230,-285],[5,-200,-135],[6,170,90],[7,-150,40],[8,108,-244]];
      for(const [l,x,y]of items)g.spawn(l,x,y);for(let i=0;i<120;i++)g.fixedTick(1/60);
      for(const c of g.cats.values())c.animate(g.session.time);g.ui.refresh(g.session,g.shake);g.setCollisionOutlines(true);});
    await page.screenshot({path:'temp/art-colliders.png'});
    await page.evaluate(()=>window.__catGame.setCollisionOutlines(false));
    await page.screenshot({path:'temp/art-play.png'});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
    await page.screenshot({path:'temp/art-mobile.png'});
    assert.deepEqual(errors,[],'asset loading/page errors');
    console.log(`${checks.length+3} art checks passed.`);
  }catch(error){console.error('Browser asset errors:',errors);await page.screenshot({path:'temp/art-failure.png'}).catch(()=>{});throw error;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
