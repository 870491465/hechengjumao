const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:720,height:1280},hasTouch:true}),errors=[];let count=0;
 page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
 const prepare=()=>page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;g.audio.setMuted(true);g.audio.setMusicMuted(true);g.session.current=4;g.session.next=4;g.ui.refresh(g.session,g.shake);});
 const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);count++;console.log('PASS '+name);};
 await check('built runtime preserves opener and samples all four configured levels',()=>{const C=window.__catGame.session.constructor,s=new C(42),opening=[];for(let i=0;i<4;i++){opening.push(s.current);s.acceptDrop();}const counts=[0,0,0,0],expected=[.55,.30,.10,.05];for(let i=0;i<20000;i++){const level=s.draw();if(level<1||level>4)return false;counts[level-1]++;}return opening.join(',')==='1,1,2,1'&&counts.every((n,i)=>Math.abs(n/20000-expected[i])<.015)&&counts[3]>0;});
 await prepare();
 await check('level 4 uses formal calico art for waiting cat and next preview',()=>{const g=window.__catGame;const name=n=>n.getChildByName('CatPicture').children[0].getComponent('cc.Sprite').spriteFrame.name;return name(g.ui.guideBall)==='cat_04_calico'&&name(g.ui.preview.getChildByName('Next').children[0])==='cat_04_calico';});
 await check('largest waiting cat clears header cards and the box opening',()=>{const g=window.__catGame,top=g.ui.guide.position.y+60,bottom=n=>n.position.y-n.getComponent('cc.UITransform').height/2;return top<bottom(g.ui.hud.getChildByName('GoalCard'))&&top<bottom(g.ui.hud.getChildByName('NextCard'))&&g.ui.guide.position.y-60>230;});
 await page.screenshot({path:'temp/drop-four-wait.png'});
 for(const x of [-280,0,280]) {
   await prepare();
   const p=await page.evaluate(x=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(x+360)*r.width/720,y:r.top+r.height/2};},x);
   await page.touchscreen.tap(p.x,p.y);
   await check(`level 4 real touch at X ${x} clamps to its 60-unit radius`,()=>{const g=window.__catGame,c=[...g.cats.values()][0];return g.cats.size===1&&c.level===4&&c.r===60&&c.collider.radius===60&&c.x-60>=-294.01&&c.x+60<=294.01&&c.y===350&&c.body.linearVelocity.length()===0&&c.node.scale.x===1;});
 }
 await check('cooldown cannot generate another level 4',()=>{const g=window.__catGame;return !g.drop(0)&&g.cats.size===1;});
 await prepare();
 await page.evaluate(()=>{const g=window.__catGame;g.spawn(1,0,350);});
 await check('occupied spawn refuses level 4 without consuming queue',()=>{const g=window.__catGame,before=g.session.randomState;return !g.drop(0)&&g.session.current===4&&g.session.next===4&&g.session.dropReady===0&&g.session.randomState===before&&g.cats.size===1;});
 await prepare();
 await page.evaluate(()=>{const g=window.__catGame;g.drop(0);for(let i=0;i<10;i++)g.fixedTick(1/60);});
 await check('level 4 falls naturally and keeps original body radius',()=>{const g=window.__catGame,c=[...g.cats.values()][0];return c.y<350&&c.y>230&&c.body.linearVelocity.y<0&&c.r===60&&c.node.scale.x===1;});
 await page.evaluate(()=>{const g=window.__catGame;for(let i=0;i<140;i++)g.fixedTick(1/60);});
 await check('normal level 4 descent does not cause danger or failure',()=>{const g=window.__catGame;return g.session.state==='playing'&&g.session.danger===0&&g.cats.size===1;});
 await page.evaluate(()=>{const g=window.__catGame;g.restart();g.enabled=false;g.spawn(4,-59,-370);g.spawn(4,59,-370);g.fixedTick(1/60);});
 await check('two level 4 cats merge once into level 5 using existing score',()=>{const g=window.__catGame,c=[...g.cats.values()][0];return g.cats.size===1&&c.level===5&&g.session.score===80;});
 assert.deepEqual(errors,[]);console.log(`${count} level-4 drop checks passed.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
