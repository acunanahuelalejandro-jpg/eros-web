# Keepalive y avisos de pedidos

## Archivos

- `.github/workflows/keepalive.yml`: consulta liviana los lunes y jueves a las 09:17 de Argentina. También tiene ejecución manual.
- `supabase/keepalive.sql`: crea `eros_keepalive()`, que devuelve únicamente `1`. No habilita lectura de pedidos ni fotos.
- `supabase/aviso-pedido.sql`: **copia privada local** con el tópico real de ntfy. Está en `.gitignore`. No la subas a GitHub ni la arrastres al cargador de archivos de GitHub; la carga manual no respeta `.gitignore`.
- `supabase/aviso-pedido.ejemplo.sql`: copia publicable sin el tópico real. Requiere reemplazar el marcador antes de ejecutarla.

## 1. Suscribirte desde el celular

1. Instalá **ntfy** desde la tienda de tu celular y abrí la app. No hace falta crear una cuenta.
2. Tocá **+** o **Suscribirse al tópico**.
3. Dejá como servidor `https://ntfy.sh`.
4. En **Tópico**, pegá el nombre largo que figura en el comentario `TOPICO PRIVADO` de tu archivo local `supabase/aviso-pedido.sql`. Pegá solo el nombre, sin `https://ntfy.sh/`.
5. Tocá **Suscribirse** y permití las notificaciones. Si aparece una opción de silencio, dejala desactivada.

El tópico actúa como una contraseña: cualquiera que lo conozca puede leer o mandar avisos. No lo publiques. Los avisos contienen solo código, modelo, duración y total; no incluyen nombres, textos, teléfono, fotos ni links del regalo.

## 2. Ejecutar los SQL en Supabase

1. Entrá a [tu proyecto de Supabase](https://supabase.com/dashboard/project/jnkxaujpfogrfqkuewlh).
2. En el menú izquierdo, tocá **SQL Editor** y luego **New query** o **+**.
3. Abrí `supabase/keepalive.sql` en tu computadora, copiá todo, pegalo en la consulta y tocá **Run**.
4. Creá otra consulta nueva. Copiá todo el archivo **local privado** `supabase/aviso-pedido.sql`, pegalo y tocá **Run**.
5. Ambas consultas deben terminar sin errores. Se pueden ejecutar otra vez: no duplican el trigger ni borran pedidos.

Si pg_net no pudiera habilitarse desde SQL, abrí **Database → Extensions**, buscá **pg_net**, habilitalo y volvé a ejecutar la consulta privada. No hace falta modificar propietarios, permisos ni RLS de tablas de Storage o del sistema.

No pegues la clave pública ni una clave privilegiada en estos SQL: no necesitan claves de Supabase.

## 3. Cargar los dos Secrets en GitHub

1. Entrá al [repositorio eros-web](https://github.com/acunanahuelalejandro-jpg/eros-web).
2. Arriba, tocá **Settings**. Si no aparece, buscá en el menú **…**.
3. En el menú izquierdo: **Secrets and variables → Actions**.
4. En la pestaña **Secrets**, tocá **New repository secret**.
5. En **Name**, escribí `SUPABASE_URL`. En **Secret**, pegá el valor de `supabaseUrl` de `armador/config.js`, sin comillas. Tocá **Add secret**.
6. Volvé a **New repository secret**. En **Name**, escribí `SUPABASE_ANON_KEY`. En **Secret**, pegá el valor de `supabaseKey` de ese mismo archivo, sin comillas. Puede empezar con `sb_publishable_` o ser una anon antigua. Tocá **Add secret**.
7. En la lista deben aparecer los dos nombres. GitHub no vuelve a mostrar sus valores.

Solo se usa la clave pública. El workflow valida su formato, no la imprime y no acepta claves privilegiadas. No la escribas directamente en el YAML. Una clave publishable se envía como `apikey`; una anon antigua también se envía como JWT.

## 4. Ejecutar el workflow a mano

1. En el repositorio, tocá **Actions**.
2. En la izquierda, elegí **Supabase keepalive**.
3. Tocá **Run workflow**, dejá **Branch: main** y tocá el botón verde **Run workflow**.
4. Abrí la ejecución nueva. Debe terminar con una tilde verde.
5. Entrá al trabajo **consultar** y al paso **Consultar la función pública que devuelve 1**. El mensaje esperado es: `OK: eros_keepalive devolvió 1. No se consultaron pedidos ni fotos.`

Si no aparece el workflow, revisá que `.github/workflows/keepalive.yml` esté en `main`. Para crearlo desde la web si no podés subir la carpeta oculta: **Code → Add file → Create new file**, escribí `.github/workflows/keepalive.yml` como nombre, pegá el contenido del YAML local y tocá **Commit changes**. No subas toda la carpeta local del proyecto para este cambio.

Si sale rojo, revisá los Secrets, que hayas ejecutado `keepalive.sql` y que el proyecto no esté pausado. Un proyecto ya pausado se reanuda desde Supabase con **Resume project**; el workflow no puede reanudarlo solo.

### Avisos de errores por email

En tu repositorio, comprobá que **Watch** no esté en **Ignore**; para recibir estas actualizaciones elegí **All Activity**. Después, en GitHub, tocá **tu foto → Settings → Notifications**. En **System → Actions**, abrí el desplegable, activá **Email** y **Only notify for failed workflows**, y tocá **Save**. Usá un email verificado. Hacé al menos una ejecución manual desde tu cuenta. La recepción de emails depende de esta configuración de GitHub y no del YAML.

## 5. Probar un pedido y su aviso

1. Primero suscribite al tópico y ejecutá el SQL privado.
2. Abrí la landing y armá un pedido ficticio. Usá `PRUEBA AVISO — NO PUBLICAR` como destinatario y texto de prueba. Podés dejarlo sin fotos; no uses material de un cliente.
3. Enviá el pedido. Anotá el código que devuelve el armador.
4. En el celular debe llegar, por ejemplo: `Nuevo pedido ABC123 · Carta para vos · 1 día · $5.000`, con el código real de tu prueba.
5. Abrí el panel de administración, actualizá y comprobá que ese pedido exista. No lo publiques ni pagues nada para esta prueba.

Si no llega el aviso, revisá el tópico exacto, permisos de notificaciones y que hayas ejecutado la copia privada. En Supabase SQL Editor podés ver las respuestas recientes de pg_net con:

```sql
select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 5;
```

Un `200` significa que ntfy recibió el aviso; para confirmar la entrega al celular hay que verlo en la app. pg_net envía después del COMMIT: ejecutá la consulta de diagnóstico aparte, unos segundos después del pedido. No hace falta dar acceso a esta tabla al público.

Si `timed_out` aparece en `true` y el error dice `Timeout of 5000 ms reached`, volvé a ejecutar el archivo privado local `supabase/aviso-pedido.sql` actualizado. El límite de envío ahora es de 30 segundos; esto da más margen a la conexión, sin demorar el guardado del pedido. No reenvía los avisos fallidos: después hay que crear otro pedido ficticio y esperar hasta 35 segundos antes de consultar el resultado. Si vuelve a agotarse el tiempo, compartí el nuevo error para revisar la conexión; ampliar el límite no garantiza la entrega.

El trigger nunca impide que se guarde un pedido si falla ntfy. Eso también significa que una caída del servicio puede dejar un aviso sin entregar; la lista de pedidos del panel sigue siendo el registro principal. No se reenvía nada al cambiar el estado ni al volver a ejecutar el SQL.

## Límites de la alternativa gratuita

El cron está configurado dos veces por semana, como se pidió. Supabase evalúa la actividad de los últimos siete días y no garantiza que dos consultas semanales eviten toda pausa. Si llega un aviso de pausa de Supabase, revisá el proyecto; no lo ignores por tener este cron.

En repositorios públicos, GitHub puede desactivar las ejecuciones programadas después de 60 días sin actividad del repositorio. Las propias ejecuciones no sustituyen esa actividad. Podés reactivarlo desde **Actions → Supabase keepalive → Enable workflow** si aparece deshabilitado. Los horarios programados también pueden demorarse.

ntfy.sh sin cuenta tiene límites y no garantiza la entrega. No hay cargos configurados por estos archivos ni se activa una suscripción de pago.

## Referencias oficiales

- [Pausas del plan Free de Supabase](https://supabase.com/docs/guides/platform/free-project-pausing).
- [pg_net y su envío asíncrono](https://supabase.com/docs/guides/database/extensions/pg_net).
- [Publicar JSON en ntfy](https://docs.ntfy.sh/publish/#publish-as-json).
- [Crear Secrets del repositorio](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
- [Notificaciones de GitHub Actions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).
- [Desactivación de workflows por inactividad](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow).
