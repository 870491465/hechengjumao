const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.CATBOX_URL || 'http://localhost:8080/';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:720,height:1280}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(url);await page.waitForFunction(()=>!!window.__catGame,null,{timeout:60000});
    const result=await page.evaluate(async()=>{
      const cc=await System.import('cc');
      const frames=async(n=3)=>{for(let i=0;i<n;i++)await new Promise(requestAnimationFrame);};
      const checks=[],ok=(name,value)=>{if(!value)throw Error(name);checks.push(name);};
      const g=window.__catGame;g.enabled=false;g.restart();g.drop(0);
      const controls=g.controls,input=g.ui.inputArea,cat=[...g.cats.values()][0],map=g.cats;
      input.destroy();await frames();
      ok('input node destruction disposes input before controller cleanup',!cc.isValid(input)&&controls.disposed&&controls.touch===null);
      controls.dispose();controls.dispose();ok('input dispose is idempotent after event processor was destroyed',controls.inputNode===null);
      cat.node.destroy();await frames();cat.dispose();cat.dispose();
      ok('cat cleanup tolerates prior child/collider destruction',!cc.isValid(cat.node)&&cat.disposed);
      const visualRoots=[...g.ui.ownedNodes,g.home.node,g.audio.node];g.destroy();await frames(5);g.onDestroy();
      ok('controller cleanup tolerates dead input/cats and repeated teardown',map.size===0&&window.__catGame===undefined);
      ok('component-only teardown removes all owned visual roots',visualRoots.every(n=>!cc.isValid(n)));
      const load=async()=>{
        await new Promise((resolve,reject)=>cc.director.loadScene('CatBox',error=>error?reject(error):resolve()));
        for(let i=0;i<120;i++){if(window.__catGame&&cc.isValid(window.__catGame,true))return window.__catGame;await frames(1);}
        throw Error('Game did not finish scene initialization');
      };
      let current=await load();
      for(let i=0;i<5;i++){
        const previous=current,oldControls=previous.controls,oldInput=previous.ui.inputArea;
        previous.controls.start({getID:()=>42,getUILocation:()=>({x:360,y:640}),propagationStopped:false});
        previous.drop(0);current=await load();
        ok(`scene reload ${i+1} cleans pressed input and starts one fresh game`,!cc.isValid(previous)&&!cc.isValid(oldInput)
          &&oldControls.disposed&&oldControls.touch===null&&current.cats.size===0&&current.shake.remaining===2);
      }
      return checks;
    });
    result.forEach(x=>console.log('PASS '+x));
    // A separate page prevents already cached images from hiding the asynchronous-start race.
    const slow=await browser.newPage({viewport:{width:720,height:1280}});
    slow.on('pageerror',e=>errors.push(e.stack));slow.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    let release;const gate=new Promise(resolve=>{release=resolve;});let intercepted=0;
    await slow.route('**/assets/resources/native/**',async route=>{intercepted++;await gate;await route.continue().catch(()=>{});});
    const firstImage=slow.waitForRequest(request=>request.url().includes('/assets/resources/native/'),{timeout:60000});
    await slow.goto(url,{waitUntil:'domcontentloaded'});
    await firstImage;
    await slow.evaluate(async()=>{window.__lifecycleCC=await System.import('cc');});
    await slow.waitForFunction(()=>!!window.__lifecycleCC.director.getScene()?.getChildByName('Canvas')?.getComponent('GameController')?.loadingNode,null,{timeout:60000});
    await slow.evaluate(async()=>{
      const cc=window.__lifecycleCC,previous=cc.director.getScene();
      window.__loadingController=previous.getChildByName('Canvas').getComponent('GameController');
      cc.director.runSceneImmediate(new cc.Scene('InterruptedLoading'));
    });
    assert.ok(intercepted>0,'image request gate was exercised');release();
    await slow.waitForLoadState('networkidle');
    const stopped=await slow.evaluate(async()=>{
      const cc=await System.import('cc');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      return !cc.isValid(window.__loadingController)&&!window.__catGame&&cc.director.getScene().name==='InterruptedLoading'
        &&cc.director.getScene().children.length===0;
    });
    assert.ok(stopped,'late asset completion must not recreate a destroyed game');
    console.log('PASS destroying scene during image loading does not recreate UI after await');
    assert.deepEqual(errors,[],'lifecycle console/page errors');
    console.log(`${result.length+1} lifecycle checks passed.`);
    await slow.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
