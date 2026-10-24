// One deterministic, legal round: normal drops/cooldowns, ordinary two shakes, actual Box2D until settlement.
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:694}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(process.env.CATBOX_URL||'http://localhost:8080/');await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
 await page.evaluate(()=>{
   const g=window.__catGame;g.restart();g.enabled=false;g.audio.setMuted(true);
   g.session=new g.session.constructor(0x20261023);
   window.__round={drops:0,shakeUses:0,samples:[],first:[],attempts:0,random:0x811c9dc5};
 });
 let state='playing',early=false,middle=false,late=false,danger=false;
 for(let batch=0;batch<60&&state==='playing';batch++) {
   const snapshot=await page.evaluate(()=>{
     const g=window.__catGame,d=window.__round,dt=1/60;
     const step=n=>{for(let i=0;i<n&&g.session.state==='playing';i++){
       g.fixedTick(dt);g.ui.effects.tick(dt);for(const c of g.cats.values())c.animate(g.session.time,g.shake.visualX,dt);
     }};
     const random=()=>{let x=d.random;x^=x<<13;x^=x>>>17;x^=x<<5;d.random=x>>>0;return d.random/4294967296;};
     for(let k=0;k<8&&g.session.state==='playing';k++) {
       d.attempts++;
       if(g.session.danger>0&&g.shake.remaining>0&&g.useShake()){d.shakeUses++;step(54);}
       if(g.session.state!=='playing')break;
       const level=g.session.current,r=[0,24,33,45,60][level],options=[];
       for(let x=-264;x<=264;x+=24) {
         const px=Math.max(-300+r+6,Math.min(300-r-6,x));let y=-430+r,support=null;
         for(const c of g.cats.values()) {
           const dx=Math.abs(c.x-px),sum=c.r+r;
           if(dx<sum){const top=c.y+Math.sqrt(sum*sum-dx*dx);if(top>y){y=top;support=c;}}
         }
         options.push({x:px,rank:y-(support?.level===level?r*3:0)+random()*8});
       }
       options.sort((a,b)=>a.rank-b.rank);
       let placed=false;for(const p of options)if(g.drop(p.x)){placed=true;break;}
       if(placed){d.drops++;if(d.first.length<4)d.first.push(level);step(43);}else step(18);
       const grounded=[...g.cats.values()].filter(c=>c.touched&&g.session.time>=c.protectionUntil);
       const top=grounded.length?Math.max(...grounded.map(c=>c.y+c.r)):-430;
       d.samples.push({drop:d.drops,time:+g.session.time.toFixed(2),score:g.session.score,cats:g.cats.size,maxLevel:g.session.maxLevel,
         heightRatio:+((top+430)/660).toFixed(3),areaRatio:+([...g.cats.values()].reduce((v,c)=>v+Math.PI*c.r*c.r,0)/(600*660)).toFixed(3),danger:+g.session.danger.toFixed(3)});
     }
     for(const c of g.cats.values())c.animate(g.session.time,g.shake.visualX);
     g.ui.refresh(g.session,g.shake);
     return {...d.samples[d.samples.length-1],state:g.session.state,shakeUses:d.shakeUses,attempts:d.attempts};
   });
   state=snapshot.state;console.log(JSON.stringify(snapshot));
   if(!early){await page.screenshot({path:'temp/round-early.png'});early=true;}
   if(!middle&&snapshot.drop>=32){await page.screenshot({path:'temp/round-middle.png'});middle=true;}
   if(!late&&snapshot.heightRatio>=.8){await page.screenshot({path:'temp/round-late.png'});late=true;}
   if(!danger&&snapshot.danger>0&&state==='playing'){await page.screenshot({path:'temp/round-danger.png'});danger=true;}
 }
 if(state==='playing')throw Error('No settlement within 480 legal action attempts; do not claim a complete round.');
 if(state==='won')await page.evaluate(()=>{for(let i=0;i<20;i++)window.__catGame.update(.1);});
 await page.screenshot({path:'temp/round-result.png'});
 const result=await page.evaluate(()=>({seed:'0x20261023',...window.__round,state:window.__catGame.session.state,score:window.__catGame.session.score,maxLevel:window.__catGame.session.maxLevel}));
 if(result.first.join(',')!=='1,1,2,1')throw Error('Opening queue changed.');
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync('temp/full-round.json',JSON.stringify(result,null,2));
 console.log(`COMPLETE ${result.state}: ${result.drops} normal drops, ${result.shakeUses} shakes, score ${result.score}, level ${result.maxLevel}.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
