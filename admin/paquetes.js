/* Exporta los modelos existentes: no genera diseños alternativos ni incluye credenciales. */
(() => {
  'use strict';
  const base = new URL('../', location.href);
  const modelos = Object.freeze({
    'carta-para-vos': ['index.html', 'carta.js'],
    'nuestra-historia': ['index.html', 'historia.js'],
    'album-recuerdos': ['index.html', 'album.js']
  });
  const temas = ['eros','dorado','azul-cielo','rosa','atardecer','bosque','lavanda','medianoche','galaxia'];
  const texto = (v, max = 1000) => typeof v === 'string' ? v.slice(0, max) : '';
  function modelo(pedido) { const clave = window.ErosPrecios.modelo(pedido.modelo); if (!clave) throw new Error('Modelo desconocido.'); return window.ErosPrecios.tabla.models[clave].slug; }
  function codigo(pedido) { if (!/^[a-z0-9]{6}$/i.test(pedido.codigo || '')) throw new Error('Código de pedido inválido.'); return pedido.codigo.toLowerCase(); }
  function nombreFoto(ruta) { const p = texto(ruta, 200).replace(/\\/g, '/'); return /^(?:imagenes|fotos)\/[a-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(p) ? p.split('/').pop() : ''; }
  function crearDatos(pedido, resolver = p => p) {
    const origen = pedido.datos && typeof pedido.datos === 'object' ? pedido.datos : {};
    const extra = pedido.extras && typeof pedido.extras === 'object' ? pedido.extras : (origen.extras || {});
    const juego = extra.juego === 'pintar' ? 'pintar-corazon' : texto(extra.juego, 40);
    if (juego && !['pintar-corazon','margarita','laberinto'].includes(juego)) throw new Error('Juego desconocido. Revisá el pedido antes de publicarlo.');
    const foto = p => nombreFoto(p) ? resolver(p) || '' : '';
    const data = {
      version:2, para:texto(pedido.para_quien,120), de:texto(pedido.de_parte,120),
      tema:temas.includes(pedido.tema) ? pedido.tema : 'eros',
      extras:{ juego, sobre:!juego, contador:{ desde:texto(extra.contador?.desde,10), etiqueta:texto(extra.contador?.etiqueta,120) || 'Juntos desde hace' } },
      inicio:{ titulo:texto(origen.inicio?.titulo,200), boton:texto(origen.inicio?.boton,80) || 'Tocá para empezar' },
      firma:texto(origen.firma,200), musica:texto(origen.musica,300),
      colorPrincipal:/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(origen.colorPrincipal || '') ? origen.colorPrincipal : ''
    };
    if (juego === 'laberinto') data.extras.laberinto = {
      fotoQuienJuega:foto(extra.laberinto?.fotoQuienJuega || origen.extras?.laberinto?.fotoQuienJuega),
      fotoQuienRegala:foto(extra.laberinto?.fotoQuienRegala || origen.extras?.laberinto?.fotoQuienRegala)
    };
    const slug = modelo(pedido);
    if (slug === 'carta-para-vos') {
      let n = 0;
      data.carta = { titulo:texto(origen.carta?.titulo,200), bloques:(Array.isArray(origen.carta?.bloques) ? origen.carta.bloques : []).slice(0,20).flatMap(b => {
        if (typeof b?.texto === 'string') return [{ texto:texto(b.texto,600) }];
        if (b?.foto && n++ < 3) return [{ foto:foto(b.foto), alt:texto(b.alt,200) }];
        return [];
      }) };
    } else {
      data.principal = { titulo:texto(origen.principal?.titulo,200), subtitulo:texto(origen.principal?.subtitulo,500) };
      data.cierre = { mensaje:texto(origen.cierre?.mensaje,2000) };
      if (slug === 'nuestra-historia') data.momentos = (Array.isArray(origen.momentos) ? origen.momentos : []).slice(0,8).map(m => ({ fecha:texto(m?.fecha,80), titulo:texto(m?.titulo,200), texto:texto(m?.texto,1000), foto:foto(m?.foto), alt:texto(m?.alt,200) }));
      else {
        data.fotos = (Array.isArray(origen.fotos) ? origen.fotos : []).slice(0,12).map(f => ({ src:foto(f?.src), alt:texto(f?.alt,200), epigrafe:texto(f?.epigrafe,80) }));
        data.automatico = Number.isInteger(origen.automatico) ? Math.max(0,Math.min(3600,origen.automatico)) : 0;
      }
    }
    return data;
  }
  function referencias(pedido) {
    const nombres = new Set(); crearDatos(pedido, p => { const n = nombreFoto(p); if (n) nombres.add(n); return p; }); return [...nombres];
  }
  async function recurso(ruta, binario = false) {
    const r = await fetch(new URL(ruta, base), { cache:'no-cache', credentials:'same-origin' });
    if (!r.ok) throw new Error('No se pudo cargar ' + ruta + ' (' + r.status + ').');
    return binario ? r.blob() : r.text();
  }
  async function musica(pedido) {
    const ruta = texto(pedido.datos?.musica,300);
    if (!ruta) return null;
    if (!/^[a-z0-9_./-]+\.(mp3|ogg|wav|m4a)$/i.test(ruta) || ruta.startsWith('/') || ruta.split('/').includes('..')) throw new Error('La música debe ser un archivo propio con ruta relativa. El link del cliente se muestra en el detalle.');
    let ultimo;
    for (const p of [ruta, 'plantillas/' + modelo(pedido) + '/' + ruta]) {
      try { const blob = await recurso(p,true); if (!blob.size || blob.type.includes('text/html')) throw new Error('Archivo de música inválido.'); return { blob, nombre:'musica.' + ruta.split('.').pop().toLowerCase() }; } catch (e) { ultimo = e; }
    }
    throw new Error('Falta el archivo de música elegido: ' + ruta + '. Agregalo al sitio antes de descargar el paquete. ' + ultimo.message);
  }
  async function jpeg(blob) {
    let imagen, temporal = '';
    try {
      if (window.createImageBitmap) imagen = await createImageBitmap(blob, { imageOrientation:'from-image' });
      else {
        temporal = URL.createObjectURL(blob); imagen = new Image(); imagen.src = temporal; await imagen.decode();
      }
      const escala = Math.min(1,1600 / Math.max(imagen.width,imagen.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(imagen.width * escala)); canvas.height = Math.max(1,Math.round(imagen.height * escala));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fffaf6'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(imagen,0,0,canvas.width,canvas.height);
      const resultado = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.92));
      if (!resultado) throw new Error('No se pudo convertir una foto a JPEG.'); return resultado;
    } finally { imagen?.close?.(); if (temporal) URL.revokeObjectURL(temporal); }
  }
  const guardar = (blob,nombre) => {
    const url = URL.createObjectURL(blob), enlace = document.createElement('a'); enlace.href = url; enlace.download = nombre; enlace.click(); setTimeout(() => URL.revokeObjectURL(url),60000);
  };
  async function generar(pedido, descargar, avisar, vigente = () => true, archivos = []) {
    if (!window.JSZip) throw new Error('No se cargó la biblioteca ZIP local. Recargá la página.');
    const code = codigo(pedido), slug = modelo(pedido), zip = new JSZip(), carpeta = zip.folder('p/' + code);
    const mapa = new Map(); const nombres = [...new Set([...referencias(pedido), ...archivos.filter(n => /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(n))])];
    for (const [i,nombre] of nombres.entries()) {
      if (!vigente()) throw new Error('La sesión o el pedido cambió.');
      avisar('Descargando foto ' + (i+1) + ' de ' + nombres.length + '…');
      const especial = /^juego-/.test(nombre), destino = especial ? 'fotos/' + nombre.replace(/\.(png|webp|jpeg)$/i,'.jpg') : 'fotos/' + ([...mapa.keys()].filter(n => !/^juego-/.test(n)).length + 1) + '.jpg';
      const imagen = await jpeg(await descargar(nombre)); carpeta.file(destino,await imagen.arrayBuffer()); mapa.set(nombre,destino);
    }
    const data = crearDatos(pedido,p => mapa.get(nombreFoto(p)) || '');
    const audio = await musica(pedido);
    if (audio) { carpeta.file(audio.nombre,await audio.blob.arrayBuffer()); data.musica = audio.nombre; } else data.musica = '';
    // JSON.stringify escapa las comillas: el contenido no se ejecuta como código.
    carpeta.file('datos.js','/* Datos del pedido. No incluye tokens ni enlaces firmados. */\nwindow.DATOS = ' + JSON.stringify(data,null,2).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029') + ';\n');
    const juego = data.extras.juego;
    for (const archivo of modelos[slug]) {
      let fuente = await recurso('plantillas/' + slug + '/' + archivo);
      if (archivo === 'index.html' && juego) {
        const doc = new DOMParser().parseFromString(fuente,'text/html');
        doc.querySelectorAll('script[src="../../compartido/sobre.js"]').forEach(n => n.remove());
        fuente = '<!doctype html>\n' + doc.documentElement.outerHTML;
      }
      carpeta.file(archivo,fuente);
    }
    const comunes = ['temas.js','contador.js','apertura.js','preview.js'];
    if (!juego) comunes.push('sobre.js');
    for (const archivo of comunes) zip.file('compartido/' + archivo,await recurso('compartido/' + archivo));
    const modulos = ['nucleo/efectos.js','nucleo/musica.js'];
    if (juego) modulos.push('juegos/' + juego + '.js');
    for (const archivo of modulos) zip.file('plantillas/juegos-interactivos/' + archivo,await recurso('plantillas/juegos-interactivos/' + archivo));
    zip.file('leeme.txt','Pedido ' + code + '\n\nPara probar: descomprimí todo y abrí p/' + code + '/index.html.\nPara publicar: copiá la carpeta ' + code + ' desde p/ a la carpeta p/ de tu sitio. Conservá compartido/ y plantillas/juegos-interactivos/ actualizados.\nEl ZIP incluye estas dependencias para la prueba local. No incluye el panel ni claves.\nEl estado Publicado no sube archivos ni da de baja páginas automáticamente.\n');
    if (!vigente()) throw new Error('La sesión o el pedido cambió.');
    avisar('Preparando ZIP…'); const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{ level:6 } });
    if (!vigente()) throw new Error('La sesión o el pedido cambió.');
    guardar(blob,code + '.zip'); return { datos:data, url:finalURL(pedido) };
  }
  function finalURL(pedido) { return 'https://acunanahuelalejandro-jpgi.github.io/eros-web/p/' + codigo(pedido) + '/'; }
  window.ErosPaquetes = Object.freeze({ modelo, codigo, nombreFoto, crearDatos, referencias, generar, musica, guardar, finalURL });
})();
