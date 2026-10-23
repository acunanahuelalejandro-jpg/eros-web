# Vista previa de Eros Web

Admiten vista previa `plantillas/carta-para-vos/` y `plantillas/nuestra-historia/`. Las demos y el modelo Álbum de recuerdos conservan sus archivos. El armador restaurado usa `armador/pedido.js`; no necesita una segunda copia del estado ni de los precios.

## Mensajes

La carta, abierta dentro de un iframe con `?preview=1`, avisa al padre:

```js
{ type: "eros-preview-listo" }
```

El padre responde y actualiza los datos con:

```js
{
  type: "eros-preview-datos",
  datos: { version: 2 /* mismo contrato que datos.js */ },
  opciones: {
    saltarSobre: true,
    saltarJuego: true,
    repetir: null, // "apertura" o null
    irA: null // Carta: "contador", "carta", "fotos", "cierre". Historia: "contador", "recorrido", "cierre".
  }
}
```

Ambos lados comprueban el origen y la ventana de origen. No se reciben mensajes cuando la carta está abierta como página principal. Si no llega información del padre en dos segundos, se muestran los datos locales de `datos.js`.

`window.ErosPlantilla.render(datos, opciones)` reconstruye el contenido cuando cambia el JSON, conserva el scroll y libera el contador, sobre y juego anteriores. Si los datos no cambian, no reconstruye el DOM. Las acciones explícitas `repetir` e `irA` sí se ejecutan con los mismos datos. Los controles permanentes se registran una sola vez. `window.ErosPlantilla.destruir()` libera la instancia.

## Armador

`window.ErosArmador.vistaPrevia(resolverFoto)` devuelve el modelo, los datos versión 2, el paso, el juego y el contador. Reutiliza `buildTemplateData`, el mismo conversor que usa el pedido real. Sin resolver, conserva las rutas `imagenes/fotoN.jpg`; el puente le pasa un resolver que entrega URL de objetos locales, sin subir las fotos.

El evento local `eros-armador-cambio` anuncia una actualización. `armador/preview.js` agrupa los cambios durante 250 ms y vuelve a enviarlos cuando el iframe avisa que está listo. Las URL temporales se liberan al quitar las fotos, cambiar de modelo o destruir el iframe.

En escritorio, el iframe existe mientras la sección Pedido está visible. En celular y tablet, existe solo mientras el panel está abierto. El panel usa un dialog nativo: mantiene el foco, cierra con Escape y devuelve el foco al botón que lo abrió.

Los tres juegos se cargan desde sus módulos existentes en `plantillas/juegos-interactivos/juegos/`; no se duplican. Al reemplazar una instancia se llama a `destruir()`. La música y el flujo normal de la carta se conservan fuera de `?preview=1`.

## Prueba manual

1. Abrí la landing y elegí Carta para vos o Nuestra historia. En celular, tocá Ver vista previa.
2. Cambiá un texto y un tema; cargá hasta tres fotos en Carta o hasta ocho, una por momento, en Historia. Activá el contador con una fecha pasada.
3. Sin juego, el botón Ver el sobre muestra el sobre. Con juego, cambia a Probar el juego: al ganar se ve la carta directamente. Volvé con Ver contenido final.
4. Cambiá entre Carta y Nuestra historia: debe cargarse la vista correspondiente. Álbum todavía muestra el aviso de próxima vista previa.
5. Abrí `plantillas/carta-para-vos/index.html` o `plantillas/nuestra-historia/index.html` sin parámetros: después de la pantalla de inicio se muestra una sola apertura según la misma regla, conservando carta y música.

Para probar los mensajes desde archivos locales, ambos extremos verifican también el origen `null` y la ventana concreta. En publicación se usa el origen HTTPS exacto del sitio. Para desarrollo con un origen normal, podés servir la carpeta con un servidor local estático.

## Una sola apertura

La decisión está centralizada en `compartido/apertura.js`: `window.ErosApertura.elegirApertura(datos)` devuelve `"juego"` si `extras.juego` es un texto no vacío; en caso contrario devuelve `"sobre"`. Un juego siempre tiene prioridad sobre `extras.sobre`, incluso con datos antiguos que traigan ambos. Sin juego, se muestra el sobre aunque un archivo antiguo tenga `sobre: false`.

La regla se usa tanto en la página real como en la vista previa. El botón del armador ofrece solo la apertura elegida y Ver contenido final. En el JSON del pedido, `datos.extras.sobre` y `extras.sobre` son false con juego y true sin juego; el precio del sobre es cero y el juego conserva su adicional de $3.000.

La opción `repetir: "apertura"` ejecuta la apertura elegida. Los valores anteriores `"sobre"` y `"juego"` ya no son parte del contrato. Los indicadores `saltarSobre` y `saltarJuego` se conservan por compatibilidad: en false solo piden mostrar la única apertura elegida, nunca encadenar dos. Por defecto ambos son true y se ve el contenido final.

## Recorrido de Nuestra historia

`historia.js` conserva el camino SVG, el marcador ligado al scroll, las polaroids y el lightbox. Cada render libera el contador, la instancia del juego y los efectos, aborta los eventos de imágenes anteriores y cancela los cuadros pendientes del camino. Los controles y los eventos de scroll se registran una vez. Acepta hasta ocho momentos con foto opcional: cero fotos conserva el recorrido y sus textos.

El efecto común `NucleoEfectos.explotar()` devuelve ahora un controlador opcional `destruir()` que permite cancelar una explosión durante una actualización; quienes no usan ese retorno conservan el mismo efecto.
