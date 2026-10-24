const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:720,height:1280}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
 const measurements=await page.evaluate(async()=>{
   const cc=await System.import('cc'),g=window.__catGame;g.restart();g.enabled=false;g.audio.setMuted(true);g.audio.setMusicMuted(true);
   const left=g.spawn(5,-81,-349),right=g.spawn(5,81,-349),top=g.spawn(4,0,-233);
   for(const c of [left,right,top]){c.mergeAt=Infinity;c.body.fixedRotation=true;}
   for(let i=0;i<240;i++)g.fixedTick(1/60);
   left.node.angle=180;for(const c of g.cats.values())c.animate(g.session.time);
   const masses=[left,right,top].map(c=>c.body.getMass());
   const cache=new Map();
   function alpha(c,world) {
     const n=c.art.getChildByName('CatPicture').children[0],sprite=n.getComponent(cc.Sprite),ui=n.getComponent(cc.UITransform),frame=sprite.spriteFrame;
     const image=frame.texture.image.data;
     if(!cache.has(image)){const canvas=document.createElement('canvas');canvas.width=frame.texture.width;canvas.height=frame.texture.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);cache.set(image,{data:ctx.getImageData(0,0,canvas.width,canvas.height).data,w:canvas.width,h:canvas.height});}
     const pos=ui.convertToNodeSpaceAR(world),rect=frame.rect;
     const x=Math.floor(rect.x+(pos.x/ui.width+.5)*rect.width),y=Math.floor(rect.y+(.5-pos.y/ui.height)*rect.height),pixels=cache.get(image);
     return x<rect.x||x>=rect.x+rect.width||y<rect.y||y>=rect.y+rect.height?0:pixels.data[(y*pixels.w+x)*4+3];
   }
   function gap(a,b) {
     const p=a.node.worldPosition,q=b.node.worldPosition,dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);let endA=0,startB=d;
     for(let t=0;t<=d;t+=.1){const point=new cc.Vec3(p.x+dx*t/d,p.y+dy*t/d);if(alpha(a,point)>=180)endA=t;if(alpha(b,point)>=180)startB=Math.min(startB,t);}
     return +(startB-endA).toFixed(2);
   }
   for(const c of [left,right,top])c.art.getChildByName('CatPicture').setScale(1,1,1);
   const before=[gap(top,left),gap(top,right)];
   for(const c of [left,right,top])c.art.getChildByName('CatPicture').setScale(1.025,1.025,1);
   const after=[gap(top,left),gap(top,right)];g.ui.refresh(g.session,g.shake);
   const area=g.ui.cats.getComponent(cc.UITransform),mask=g.ui.cats.getComponent(cc.Mask);
   return {before,after,bodyUnchanged:[left,right,top].every((c,i)=>c.body.getMass()===masses[i]&&c.node.scale.x===1&&c.collider.radius===c.r),
     clipped:!!mask&&mask.enabled&&Math.abs(area.width-600)<.01&&Math.abs(-area.height*area.anchorY+430)<.01,
     radii:[left.r,right.r,top.r],positions:[left,right,top].map(c=>({x:c.x,y:c.y}))};
 });
 console.log(JSON.stringify(measurements));
 assert.ok(measurements.bodyUnchanged);assert.deepEqual(measurements.radii,[81,81,60]);
 assert.ok(measurements.clipped,'visual clipping stays at physical walls/floor');
 for(let i=0;i<2;i++)assert.ok(measurements.after[i]<measurements.before[i]&&measurements.after[i]<=1.5,'contact pixels close the contour gap');
 await page.screenshot({path:'temp/contact-skin-after.png'});
 await page.evaluate(()=>window.__catGame.setCollisionOutlines(true));await page.screenshot({path:'temp/contact-skin-debug.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:'temp/contact-skin-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS measured silhouette contact gaps, unchanged body geometry, inner-wall clipping and mobile render.');
 require('node:fs').writeFileSync('temp/contact-skin-measurements.json',JSON.stringify(measurements,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
