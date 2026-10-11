# Arquitectura v0.2

## Piezas

- `src/game.js`: motor y filtrado de vistas según permisos.
- `src/http.js`: handler Web Request/Response compartido entre Vercel y desarrollo local.
- `src/storage.js`: Neon por HTTP, inicialización idempotente, compare-and-swap y límites persistentes.
- `src/sqlite.js`: almacenamiento local con la misma interfaz y actualización condicional.
- `src/server.js`: servidor de desarrollo y alternativa para Docker.
- `api/index.js`: entrada Node.js para Vercel; no importa SQLite ni escribe en disco.
- `public/`: interfaz sin framework, con polling cada 5 segundos y pausa al ocultar la pestaña.

## API

| Ruta | Acceso | Resultado |
| --- | --- | --- |
| `GET /api/health` | Público | Disponibilidad del almacenamiento |
| `POST /api/games` | Público limitado | Crea sala y devuelve credencial del narrador |
| `GET /api/games/:code/lobby` | Público limitado | Título, número de jugadores y estado de ingreso, sin nombres ni roles |
| `POST /api/games/:code/join` | Público limitado | Registro de un jugador pendiente de aprobación |
| `GET /api/games/:code` | Bearer privado | Vista del narrador o del jugador correspondiente |
| `POST /api/games/:code/actions` | Narrador | Aplica acción con revisión esperada |
| `POST /api/games/:code/qr` | Narrador | Genera un QR de sala o de carta, sin servicios externos |

Crear sala acepta `title` y `victory` (`elimination` o `parity`). Ingreso acepta `name` y un `token` opcional de 256 bits generado por el cliente. Usar el mismo token hace idempotente el reintento de ingreso, incluso después de cerrar el lobby. Esto no permite obtener una carta por nombre.

Acciones: `add` con `name`; `remove`, `approve` e `inspect` con `playerId`; `role` con `playerId` y `role`; `shuffle` con `wolves`; `lock` con `open`; `start`; `hunt` con `playerId`; `dawn`; `vote` con `playerId` o `null`. Solo el endpoint de ingreso puede ejecutar el registro público. Todas las acciones del narrador requieren `revision`.

## Concurrencia y persistencia

En Neon, una actualización usa `UPDATE ... WHERE revision = expected RETURNING code`. Solo una función puede ganar una revisión; las otras devuelven 409. Esto también cubre el ingreso de jugadores. No hay mutex ni estado de salas en memoria. SQLite usa una condición equivalente sobre la revisión almacenada en el JSON.

Una fila conserva todo el estado de una sala. Es adecuado para grupos de 18 personas; no se agregan servicios adicionales para una partida presencial. Las tablas llevan prefijo `werewolves_`. La caducidad se comprueba al leer y la purga se ejecuta al crear salas.

Los límites por minuto usan UPSERT en la misma base: creación por IP, ingreso/consulta pública por IP y lectura/acciones por hash de credencial. En Vercel se usa el encabezado de IP que proporciona la plataforma; en desarrollo local, la dirección del socket. La tabla almacena un hash de la clave de límite, no la IP o credencial en claro.

## Privacidad

El código de sala nunca autoriza la lectura de roles. El narrador recibe los roles y enlaces para repartirlos. El jugador solo ve su propio rol tras comenzar y los roles ya públicos por eliminación o fin de partida. No recibe consultas de la vidente ni la víctima nocturna pendiente.

Los enlaces de 256 bits viajan en el fragmento URL, no en la ruta HTTP, y se envían como `Authorization`. Quien posea un enlace privado puede utilizarlo: no hay cuentas ni verificación fuerte de identidad. El narrador aprueba a los invitados; también puede retirar un jugador y revocar su enlace antes de empezar. No hay todavía rotación de credenciales.

Se valida el origen, el objeto JSON y el tamaño de cuerpo (16 KiB). CSP sin scripts externos, `no-store`, `no-referrer`, escape HTML de nombres y lista fija de archivos locales. Los QR se codifican dentro del servidor, sin enviar los enlaces a un generador de terceros. Los errores internos registran identificador y tipo, no URLs de base de datos, cuerpos o credenciales.

## Verificación

Pruebas con `node:test`, API HTTP real y DOM con jsdom. Cubren condiciones de victoria, fases, rol privado, QR, aprobación, cierre de ingreso, revocación, idempotencia, solicitudes simultáneas entre handlers, límites compartidos, tamaño de cuerpo, origen, persistencia y expiración.

Los tests DOM comprueban comportamiento, no diseño visual, cámara ni escaneo físico de QR. Sigue siendo necesaria una prueba presencial en celulares.
