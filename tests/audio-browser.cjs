/* Perfil aislado, MP3 silencioso generado para pruebas y Supabase interceptado. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const site=process.env.EROS_TEST_URL||'http://127.0.0.1:8768/';
function mp3(frames=40){const bytes=Buffer.alloc(frames*417);for(let i=0;i<frames;i++)bytes.set([255,251,144,0],i*417);return bytes;}
const audio=mp3();
const base={version:2,para:'Nombre de prueba',de:'Firma de prueba',tema:'eros',extras:{juego:'',sobre:true,contador:{desde:''}},inicio:{titulo:'Un regalo de prueba'},
  audio:{src:'audio/cancion.mp3'},carta:{titulo:'Una carta de prueba',bloques:[{texto:'Contenido de prueba para revisar el diseño.'}]},
  principal:{titulo:'Recuerdos de prueba',subtitulo:'Un recorrido de prueba'},momentos:[{fecha:'Un día especial',titulo:'Un recuerdo',texto:'Un mensaje de prueba.'}],
  fotos:[],cierre:{mensaje:'Un cierre de prueba.'},firma:'Firma de prueba'};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2']});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
 page.setDefaultTimeout(12000);let data={...base};const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/datos.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DATOS='+JSON.stringify(data)+';'}));
 await page.route('**/audio/cancion.mp3',route=>route.fulfill({contentType:'audio/mpeg',body:audio}));
 await context.route('**/*.supabase.co/**',route=>{requests.push(new URL(route.request().url()).pathname);return route.abort();});
 let cases=0;
 try{
  if(!process.env.ONLY_ARMADOR&&!process.env.ONLY_GESTOS)for(const model of ['carta-para-vos','nuestra-historia','album-recuerdos'])for(const width of [320,390,1280])for(const theme of ['eros','galaxia']){
   data={...base,tema:theme};await page.setViewportSize({width,height:844});
   await page.goto(site+'plantillas/'+model+'/?preview=1',{waitUntil:'domcontentloaded'});
   await page.locator('#musicToggle').waitFor();
   assert.equal(await page.locator('audio#backgroundMusic').count(),1);
   assert.equal(await page.locator('audio[controls],#youtubeMusic').count(),0);
   await page.waitForFunction(()=>document.getElementById('backgroundMusic').readyState>=1);
   assert.equal(await page.locator('#backgroundMusic').evaluate(a=>a.paused),true);
   await page.locator('#musicToggle').click();await page.waitForFunction(()=>!document.getElementById('backgroundMusic').paused);
   await page.locator('#musicToggle').click();assert.equal(await page.locator('#backgroundMusic').evaluate(a=>a.paused),true);
   const box=await page.locator('#musicToggle').boundingBox();assert.ok(box.width>=44&&box.height>=44);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.evaluate(d=>window.ErosPlantilla.render(d),{...data,audio:null,musica:'musica.mp3',musicaYoutube:'https://youtu.be/M7lc1UVf-VE'});
   assert.ok(await page.locator('#musicToggle').isHidden());
   assert.equal(await page.locator('#backgroundMusic').getAttribute('src'),null);
   cases++;
  }
  if(!process.env.ONLY_ARMADOR)for(const model of ['carta-para-vos','nuestra-historia','album-recuerdos']){
   data={...base};await page.setViewportSize({width:390,height:844});await page.goto(site+'plantillas/'+model+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#startButton').click();await page.waitForFunction(()=>!document.getElementById('backgroundMusic').paused);
   await page.evaluate(()=>{
    document.getElementById('backgroundMusic').pause();window.__audioEnGesto=false;
    document.addEventListener('click',event=>{if(event.target.closest('.envelope-button'))window.__audioEnGesto=!document.getElementById('backgroundMusic').paused;},{once:true});
   });
   await page.locator('.envelope-button').click();assert.equal(await page.evaluate(()=>window.__audioEnGesto),true);
   await page.locator('#musicToggle').waitFor();
   assert.equal(await page.locator('#backgroundMusic').evaluate(a=>a.paused),false);
  }
  let publicados=0;
  if(!process.env.ONLY_ARMADOR){
   let modeloPublicado='carta-para-vos';
   await context.unroute('**/*.supabase.co/**');
   await context.route('**/*.supabase.co/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/functions/v1/obtener-pagina'){
     const signed=url.origin+'/storage/v1/object/sign/audios/11111111-1111-4111-8111-111111111111/cancion.mp3?token=prueba-local';
     return route.fulfill({contentType:'application/json',body:JSON.stringify({modelo:modeloPublicado,datos:{...base,audio:{src:signed}},audio:signed,fotos:[],vence_en:new Date(Date.now()+60000).toISOString()})});
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/audios/'))return route.fulfill({contentType:'audio/mpeg',body:audio});
    return route.abort();
   });
   for(const model of ['carta-para-vos','nuestra-historia','album-recuerdos']){
    modeloPublicado=model;data={...base};await page.setViewportSize({width:390,height:844});
    await page.goto(site+'plantillas/'+model+'/?c=23456789abcdefgh23456789abcdefgh',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('eros-pagina-bloqueada'));
    await page.waitForFunction(()=>document.getElementById('backgroundMusic').readyState>=1);
    const src=await page.locator('#backgroundMusic').getAttribute('src');assert.match(src,/^blob:/);
    assert.equal(await page.evaluate(value=>window.ErosPagina.esAudioPermitido(value),src),true);
    assert.equal(await page.evaluate(value=>window.ErosPagina.esRecursoPermitido(value),src),false);
    await page.locator('#startButton').click();await page.waitForFunction(()=>!document.getElementById('backgroundMusic').paused);
    await page.locator('.envelope-button').click();await page.locator('#musicToggle').waitFor();
    if(model==='carta-para-vos')await page.screenshot({path:'/tmp/eros-audio-regalo-390.png'});
    publicados++;
   }
  }
  console.log('Modelos y aperturas verificados: '+cases+'; regalos con enlace privado simulado: '+publicados);
  const submission={inserts:0,uploads:0,validations:0};
  await context.unroute('**/*.supabase.co/**');
  await context.route('**/*.supabase.co/**',async route=>{
   const path=new URL(route.request().url()).pathname;requests.push(path);
   if(path==='/rest/v1/pedidos'){submission.inserts++;return route.fulfill({status:201,contentType:'application/json',body:''});}
   if(path.startsWith('/storage/v1/object/audios/')){submission.uploads++;return route.fulfill({contentType:'application/json',body:'{"Key":"audios/prueba/cancion.mp3"}'});}
   if(path==='/functions/v1/validar-audio'){submission.validations++;return route.fulfill({status:submission.validations===1?503:200,contentType:'application/json',body:submission.validations===1?'{}':'{"ok":true}'});}
   if(path==='/functions/v1/estado-pedido')return route.fulfill({contentType:'application/json',body:JSON.stringify({estado:'nuevo',codigo:'AUD234',slug:'23456789abcdefgh23456789abcdefgh',total:5000})});
   throw new Error('Petición no prevista en la prueba: '+path);
  });
  await page.goto(new URL('armador/',site).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   localStorage.removeItem('erosweb-ultimo-pedido');
   sessionStorage.setItem('erosweb-pedido-v2',JSON.stringify({model:'carta',duration:'day',game:'',theme:'eros',counter:false,recipient:'Nombre de prueba',sender:'Firma de prueba',step:9,
    content:{carta:{title:'Una carta',paragraphs:['Un mensaje de prueba.'],signature:'Firma de prueba'}}}));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#pedido').scrollIntoViewIfNeeded();
  await page.locator('#audio-upload-input').setInputFiles({name:'incorrecto.wav',mimeType:'audio/wav',buffer:Buffer.from('no es MP3')});
  await page.waitForFunction(()=>document.getElementById('audio-upload-status').textContent.includes('Elegí'));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eros-audio-prueba-')),grande=path.join(temp,'grande.mp3');
  try{fs.writeFileSync(grande,Buffer.alloc(10485761));await page.locator('#audio-upload-input').setInputFiles(grande,{timeout:30000});}
  finally{fs.rmSync(temp,{recursive:true,force:true});}
  await page.waitForFunction(()=>document.getElementById('audio-upload-status').textContent.includes('10 MB'));
  await page.locator('#audio-upload-input').setInputFiles({name:'cancion.mp3',mimeType:'audio/mpeg',buffer:audio});
  await page.waitForFunction(()=>document.getElementById('audio-upload-status').textContent.includes('listo'));
  console.log('Validación del archivo en el navegador verificada');
  const preview=page.frameLocator('#preview-frame-host > iframe');
  await preview.locator('#musicToggle').waitFor();
  assert.match(await preview.locator('#backgroundMusic').getAttribute('src'),/^blob:/);
  await page.locator('.preview-enlarge').click();
  await preview.locator('#musicToggle').click();
  assert.equal(await preview.locator('#backgroundMusic').evaluate(a=>a.paused),false);
  await page.locator('#preview-close').click();
  await page.locator('#order-next').click();assert.match(await page.locator('#order-error').innerText(),/derecho/);
  await page.locator('#audio-consent').check();
  await page.screenshot({path:'/tmp/eros-audio-selector-390.png'});await page.locator('#order-next').click();
  await page.locator('#privacy-consent').check();await page.locator('#send-order').click();
  await page.waitForFunction(()=>document.getElementById('order-error').textContent.includes('quedó guardado'));
  await page.locator('#send-order').click();await page.locator('#order-success').waitFor();
  assert.deepEqual(submission,{inserts:1,uploads:1,validations:2});
  await page.screenshot({path:'/tmp/eros-audio-390.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({casos:cases,modelos:3,anchos:[320,390,1280],temas:['eros','galaxia'],aperturas:process.env.ONLY_ARMADOR?0:3,publicados,subida:true,consentimiento:true,reintentoSinDuplicar:submission,errores:errors}));
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
