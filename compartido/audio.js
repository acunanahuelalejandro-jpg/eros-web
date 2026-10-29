/* Una instancia de audio por modelo; no acepta catálogos ni enlaces externos. */
(() => {
  'use strict';
  const montados=new WeakMap();
  function fuente(value){
    if(typeof value!=='string'||!value)return '';
    if(window.ErosPagina?.activa)return window.ErosPagina.esAudioPermitido?.(value)?value:'';
    if(new URLSearchParams(location.search).get('preview')==='1'&&value.startsWith('blob:')){
      try{return new URL(value).origin===location.origin?value:'';}catch(_){return '';}
    }
    return value==='audio/cancion.mp3'?value:'';
  }
  function montar(audio,button,value){
    if(!audio||!button)return null;
    montados.get(audio)?.destruir();
    const src=fuente(value),controller=new AbortController();
    const label=button.querySelector('#musicText')||button;
    let active=true,usable=Boolean(src);
    const on=(node,event,fn)=>node.addEventListener(event,fn,{signal:controller.signal});
    function actualizar(){
      if(!active)return;
      const text=audio.paused?'Reproducir música':'Pausar música';
      label.textContent=text;button.setAttribute('aria-label',text);
      button.setAttribute('aria-pressed',String(!audio.paused));button.hidden=!usable;
    }
    function pausar(){if(!active)return;audio.pause();actualizar();}
    function ocultar(){if(!active)return;usable=false;audio.pause();button.hidden=true;}
    function reproducir(){
      if(!active||!usable||document.hidden)return;
      if(!audio.paused){actualizar();return;}
      try{
        // Se llama directamente desde el gesto; no se espera a cargar metadatos.
        const intento=audio.play();
        intento?.catch(error=>{
          if(!active)return;
          if(error?.name==='NotAllowedError'||error?.name==='AbortError')actualizar();
          else ocultar();
        });
      }catch(_){ocultar();}
    }
    audio.preload='metadata';audio.loop=true;
    if(src)audio.src=src;else audio.removeAttribute('src');
    on(button,'click',()=>audio.paused?reproducir():pausar());
    on(audio,'play',actualizar);on(audio,'pause',actualizar);on(audio,'error',ocultar);
    on(document,'visibilitychange',()=>{if(document.hidden)pausar();});
    on(window,'pagehide',pausar);
    actualizar();
    function escucharApertura(root){
      if(root)on(root,'click',event=>{
        if(event.isTrusted&&event.target?.closest?.('.envelope-button'))reproducir();
      });
    }
    const api=Object.freeze({reproducir,pausar,actualizar,ocultar,escucharApertura,destruir(){
      if(!active)return;active=false;controller.abort();audio.pause();audio.removeAttribute('src');audio.load();button.hidden=true;
      if(montados.get(audio)===api)montados.delete(audio);
    }});
    montados.set(audio,api);return api;
  }
  const api=Object.freeze({montar,fuente});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.ErosAudio=api;
})();
