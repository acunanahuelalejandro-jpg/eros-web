const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const root=path.resolve(__dirname,'..');
const prefix='/eros-web/';
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript',
  '.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};

async function main(){
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
    let file=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length))||'index.html');
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{
      if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!fs.statSync(file).isFile())throw new Error('Recurso no encontrado');
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
      fs.createReadStream(file).pipe(res);
    }catch(_){res.writeHead(404);res.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const site=origin+prefix;
  let browser;
  const passed=[];
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2']});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
      reducedMotion:'reduce'});
    const backend=[];
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/')){
        return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient(){return {};}};'});
      }
      backend.push(url.hostname);
      return route.abort();
    });
    const page=await context.newPage();page.setDefaultTimeout(5000);
    const errors=[],failedAssets=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{
      if(response.url().startsWith(origin)&&response.status()>=400)failedAssets.push(new URL(response.url()).pathname);
    });

    await page.goto(site,{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#order-builder').count(),0,'la landing todavía incluye el armador');
    assert.equal(await page.locator('script[src$="armador/armador.js"]').count(),0);
    if(process.env.EROS_ROUTE_SCREENSHOTS)await page.screenshot({path:'/tmp/ui-route-landing-390.png'});
    const cta=page.locator('a[href*="armador/"]').first();
    assert.ok(await cta.count(),'debe haber un enlace de navegación al armador');
    await cta.click();await page.waitForURL(url=>url.pathname===prefix+'armador/');
    assert.ok(await page.locator('#order-builder').isVisible());
    passed.push('landing sin editor; CTA navega a armador/');
    assert.equal(await page.locator('.order-layout').evaluate(el=>getComputedStyle(el).position==='fixed'),false);
    assert.equal(await page.locator('.order-step-viewport').evaluate(el=>getComputedStyle(el).overflowY==='auto'),false);
    if(process.env.EROS_ROUTE_SCREENSHOTS)await page.screenshot({path:'/tmp/ui-route-armador-390.png'});
    const scrollBefore=await page.evaluate(()=>scrollY);
    const touch=await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:220,y:650,id:1}]});
    for(let y=630;y>=350;y-=20){
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y,id:1}]});
      await page.waitForTimeout(20);
    }
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(initial=>scrollY>initial+40,scrollBefore);
    const scrollAfter=await page.evaluate(()=>scrollY);
    assert.ok(scrollAfter>scrollBefore+40,'el gesto debe desplazar el documento del armador');
    if(process.env.EROS_ROUTE_SCREENSHOTS)await page.screenshot({path:'/tmp/ui-route-armador-scroll-390.png'});
    await touch.detach();
    passed.push('el gesto táctil desplaza el documento, sin formulario fijo ni scroll anidado');

    for(const model of ['carta','historia','album']){
      await page.goto(site,{waitUntil:'domcontentloaded'});
      const link=page.locator('[data-order-model="'+model+'"]');
      assert.equal(await link.count(),1);
      await link.click();
      await page.waitForURL(url=>url.pathname===prefix+'armador/'&&url.searchParams.get('modelo')===model);
      assert.equal(await page.locator('input[name="order-model"]:checked').inputValue(),model);
      await page.waitForFunction(()=>typeof window.ErosArmador?.vistaPrevia==='function');
      assert.equal(await page.locator('#order-next').isVisible(),true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    passed.push('los tres modelos llegan preseleccionados; scripts y recursos funcionan bajo /eros-web/');

    for(const hash of ['#pedido','#armar']){
      await page.goto(site+hash,{waitUntil:'domcontentloaded'});
      await page.waitForURL(url=>url.pathname===prefix+'armador/');
      assert.ok(await page.locator('#order-builder').isVisible());
    }
    passed.push('los enlaces antiguos #pedido y #armar llegan al armador');

    for(const route of ['admin/','pedido/','p/']){
      const response=await context.request.get(site+route);
      assert.equal(response.status(),200,'se perdió la ruta '+route);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(failedAssets,[]);
    assert.deepEqual(backend,[],'el recorrido no debe consultar servicios reales');
    passed.push('rutas compartidas conservadas; sin errores, recursos ausentes ni peticiones externas');
    await context.close();
    console.log(JSON.stringify({pasaron:passed,viewport:[390,844],tactilEmulado:true,
      desplazamiento:{antes:scrollBefore,despues:scrollAfter},errores:errors},null,2));
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
