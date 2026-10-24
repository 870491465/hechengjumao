const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();await page.goto('http://localhost:8080/');
 await page.waitForFunction(()=>!!window.__catGame);
 const results=[];
 for(const baseline of [true,false]){
 if(!baseline){await page.reload();await page.waitForFunction(()=>!!window.__catGame);}
 const result=await page.evaluate(baseline=>{
  const g=window.__catGame;g.restart();g.enabled=false;g.audio.setMuted(true);
  if(baseline)g.shake.tick=function(dt,now,apply,ids){
   if(!this.active)return;
   const sign=Math.floor((this.elapsed+1e-8)/.1)%2===0?1:-1;
   for(const id of ids){const old=this.contributions.get(id)||0;const value=Math.max(-150,Math.min(150,old+sign*600*2.5*dt));apply(id,value-old);this.contributions.set(id,value);}
   this.elapsed+=dt;if(this.elapsed+1e-8>=.8){this.stop();this.readyAt=now+3;}
  };
  // Alternating levels prevent merging so displacement measures the same bodies throughout.
  [[3,-160,-385],[4,-55,-370],[3,50,-385],[4,155,-370],[2,-105,-285],[1,40,-295]].forEach(([l,x,y])=>{
   const c=g.spawn(l,x,y);c.mergeAt=Infinity;
  });
  for(let i=0;i<240;i++)g.fixedTick(1/60);
  const start=[...g.cats.values()].map(c=>({id:c.id,x:c.x,y:c.y}));
  const max=new Map(start.map(c=>[c.id,0])),last=new Map(start.map(c=>[c.id,c.x]));let safe=true,travel=0;
  const started=g.useShake();
  for(let i=0;i<48;i++){
   g.fixedTick(1/60);
   for(const s of start){const c=g.cats.get(s.id);max.set(s.id,Math.max(max.get(s.id),Math.abs(c.x-s.x)));
    travel+=Math.abs(c.x-last.get(s.id));last.set(s.id,c.x);
    safe=safe&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.x-c.r>=-300.8&&c.x+c.r<=300.8&&c.y-c.r>=-430.8;}
  }
  return {started,safe,remaining:g.shake.remaining,active:g.shake.active,meanTravel:travel/start.length,meanMax:[...max.values()].reduce((a,b)=>a+b,0)/max.size,displacements:[...max.values()]};
 },baseline);
 assert.ok(result.started&&result.safe&&!result.active&&result.remaining===1);
 fs.writeFileSync(`temp/shake-motion-${baseline?'before':'after'}.json`,JSON.stringify(result,null,2));results.push(result);
 console.log(JSON.stringify(result));
 }
 assert.ok(results[1].meanTravel>results[0].meanTravel*1.15,'settled pile travels at least 15% more horizontally');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
