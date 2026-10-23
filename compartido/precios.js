/* Única tabla de precios del armador y del panel. Importar antes de usarlos. */
(() => {
  'use strict';
  const tabla = {
    models: {
      carta: { name:'Carta para vos', slug:'carta-para-vos', limit:3, prices:{ day:5000, week:8000, month:12000 } },
      historia: { name:'Nuestra historia', slug:'nuestra-historia', limit:8, prices:{ day:7500, week:12000, month:18000 } },
      album: { name:'Álbum de recuerdos', slug:'album-recuerdos', limit:12, prices:{ day:10000, week:16000, month:24000 } }
    },
    durations:{ day:'1 día', week:'1 semana', month:'1 mes' },
    extras:{ game:3000, counter:2000 }
  };
  function congelar(objeto) { Object.values(objeto).forEach(v => { if (v && typeof v === 'object') congelar(v); }); return Object.freeze(objeto); }
  congelar(tabla);
  const normalizar = v => String(v || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '');
  function modelo(valor) { return Object.keys(tabla.models).find(k => [k, tabla.models[k].slug, tabla.models[k].name].some(v => normalizar(v) === normalizar(valor))) || ''; }
  function duracion(valor) { return Object.keys(tabla.durations).find(k => [k, tabla.durations[k]].some(v => normalizar(v) === normalizar(valor))) || ''; }
  function calcular(pedido) {
    const m = modelo(pedido.modelo), d = duracion(pedido.duracion), extras = pedido.extras || {};
    if (!m || !d) throw new Error('Modelo o duración desconocidos. Revisá el pedido.');
    const juego = extras.juego || '';
    if (juego && !['pintar', 'pintar-corazon', 'margarita', 'laberinto'].includes(juego)) throw new Error('El juego del pedido no está en la tabla de precios.');
    const conContador = extras.contador === true || extras.contador?.activo === true || !!extras.contador?.desde;
    const base = tabla.models[m].prices[d], game = juego ? tabla.extras.game : 0, counter = conContador ? tabla.extras.counter : 0;
    return { modelo:m, duracion:d, base, juego:game, contador:counter, total:base + game + counter };
  }
  const formato = valor => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits:0 }).format(valor);
  window.ErosPrecios = Object.freeze({ tabla, modelo, duracion, calcular, formato });
})();
