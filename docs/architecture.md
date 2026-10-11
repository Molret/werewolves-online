# Arquitectura y alcance de v0.1

## Componentes

- Node.js 24 sirve una interfaz HTML/CSS/JS y una API HTTP del mismo origen.
- SQLite nativo conserva el estado de la partida. No se requiere instalar paquetes.
- `src/game.js` implementa las transiciones y construye las vistas según permisos.
- `src/server.js` autentica los enlaces privados, valida revisiones y persiste los cambios.
- `public/app.js` contiene el panel del narrador y la carta móvil.

## API

`POST /api/games`: `{ "title": "La aldea", "victory": "elimination" }`. Devuelve código de sala y credencial de narrador. `victory` también acepta `parity`.

`GET /api/games/:code`: requiere `Authorization: Bearer <token>`. El narrador recibe todos los roles y los enlaces de jugadores. Cada jugador recibe su propio rol solo después de iniciar, además de nombres, estado y roles públicamente revelados. Nunca recibe enlaces ajenos, consultas de la vidente ni la víctima pendiente.

`POST /api/games/:code/actions`: solo para el narrador. Requiere `{ "action": "...", "revision": <última revisión> }` y los campos correspondientes:

| Acción | Campos | Fase |
| --- | --- | --- |
| `add` | `name` | Preparación |
| `remove` | `playerId` | Preparación |
| `role` | `playerId`, `role`: `wolf`, `seer` o `villager` | Preparación |
| `shuffle` | `wolves`: entero positivo | Preparación |
| `start` | Ninguno | Preparación |
| `inspect` | `playerId` | Vidente |
| `hunt` | `playerId` | Lobos |
| `dawn` | Ninguno | Amanecer |
| `vote` | `playerId` o `null` si nadie es eliminado | Día |

Las revisiones incompatibles devuelven 409 y la interfaz recarga el estado. El proceso relee el estado después de recibir el cuerpo para evitar sobrescrituras por acciones simultáneas dentro de esa instancia. Un motor completamente síncrono aplica y persiste cada transición sin ceder el control entre lectura y escritura. Despliega una única instancia del proceso.

## Privacidad y límites

Credenciales de 256 bits y código público independiente. La base conserva hash de la credencial del narrador y credenciales de jugador, necesarias para que el narrador recupere y comparta las cartas. El acceso es por posesión del enlace, sin cuentas ni verificación de identidad. Quitar un jugador durante la preparación invalida su enlace.

La API no ofrece una vista pública sin credencial. Hay límites por IP para crear salas y por credencial para acceder a una sala. Los límites viven en memoria, se reinician con el proceso y usan la IP directa del socket; no se confía en `X-Forwarded-For`. Un proxy compartirá el límite global entre sus visitantes. Para exposición a gran escala, agrega límites en el proxy.

Sin CORS abierto; se valida `Origin` cuando está presente. El servicio envía CSP, `no-store` y `no-referrer`. La interfaz escapa los nombres antes de incluirlos en HTML. Sirve únicamente archivos de una lista fija.

Los jugadores cierran los ojos de verdad y el narrador comunica la consulta de la vidente en persona. El teléfono no es un mecanismo contra miradas ajenas: ocultar la carta es una ayuda visual, y el propio jugador autorizado puede consultar su rol con herramientas del navegador.

## Validación

Pruebas con `node:test`: secuencia de fases, victorias de ambos equipos, variante de paridad, muerte de la vidente, restricciones de objetivos, reparto aleatorio, ausencia de roles ajenos en la API, rechazo de credenciales inválidas, permisos del narrador, revocación de enlaces, control de revisiones simultáneas, origen, reinicios y caducidad.

## Próximas versiones

Personajes avanzados, recuperación o rotación de enlaces, QR para cartas y transporte de actualizaciones por SSE pueden añadirse después. No se presentan como funcionalidades disponibles en la interfaz actual.
