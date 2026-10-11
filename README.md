# Werewolves Online

Cartas digitales para jugar al hombre lobo **en persona**, con un narrador humano. Modo básico: hombre lobo, aldeano y vidente. Adaptación independiente, sin cartas ni ilustraciones del juego comercial.

## Jugar

1. Crea una aldea. Tú eres el narrador, no un jugador.
2. Comparte el código de 8 caracteres, el enlace de invitación o el QR de sala. Cada persona escribe su nombre desde su celular. **Aprueba sus ingresos** desde tu panel.
3. También puedes agregar jugadores tú mismo y entregarles su enlace o QR privado. No pueden elegir el nombre de otra persona para acceder a su carta.
4. Asigna los roles manualmente o reparte al azar. Cuando todos estén aprobados y haya una vidente y mayoría de la aldea, inicia la partida.
5. Cada jugador toca su carta para revelar el rol. Se oculta a los 10 segundos, al cambiar de aplicación o al recibir una actualización de la partida.
6. Sigue el panel: vidente, lobos, amanecer, debate y votación. La vidente señala a alguien y tú le comunicas el rol discretamente. Los lobos eligen a su víctima en silencio. La votación se hace en persona y tú registras el resultado.

El QR de sala es público y solo permite **solicitar ingreso**. El QR de carta y el enlace de narrador son credenciales privadas. Guarda tu enlace de narrador y no lo compartas con el grupo. El navegador recuerda la última sala; si pierdes el enlace y borras esa sesión, no hay recuperación por cuenta.

## Desarrollo local

Requiere Node.js 24 o posterior:

```sh
npm ci
npm run dev
```

Abre `http://localhost:3000`. Sin `DATABASE_URL`, se utiliza SQLite en `./data/werewolves.sqlite`. Para jugar en la misma red, los celulares deben entrar a la IP LAN del computador. Con `DATABASE_URL`, el mismo servidor local usa Neon.

```sh
npm run check
npm test
```

Las pruebas incluyen motor, API HTTP, privacidad, códigos, QR, aprobación, concurrencia entre handlers, persistencia y flujos de interfaz en DOM. No sustituyen la comprobación visual en dispositivos reales.

## Vercel

El frontend se sirve desde `public/` y la API corre en Vercel Functions con Node.js 24. Vincula una base **Neon dedicada** desde Storage al proyecto e incluye `DATABASE_URL` en producción. Nunca pongas esa variable en el frontend ni en el repositorio.

`vercel.json` define el build, rutas, cabeceras y región. Las tablas `werewolves_games` y `werewolves_rates` se crean de forma idempotente en el primer acceso a la API; el usuario de la base necesita permiso para crearlas. Las actualizaciones usan compare-and-swap en PostgreSQL, no memoria de una función. Los límites de solicitudes también se comparten mediante PostgreSQL.

`GET /api/health` comprueba acceso al almacenamiento sin devolver secretos. Las salas expiran a los 7 días sin modificaciones y los registros expirados se purgan al crear otra sala.

Para jugar con amigos, el dominio de producción debe permitir visitantes sin una cuenta de Vercel. Mantén las previews protegidas cuando sea posible. El repositorio no guarda credenciales ni necesita exportarlas para desplegar.

## Docker / servidor propio

```sh
APP_ORIGIN=https://tu-dominio.example docker compose up -d --build
```

El volumen de Compose conserva SQLite. Usa un proxy HTTPS delante del puerto 3000. También puedes configurar `DATABASE_URL` para usar Neon en lugar de SQLite.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | URL privada de Neon/PostgreSQL; obligatoria en Vercel |
| `PORT` | Puerto local, por defecto `3000` |
| `HOST` | Interfaz local, por defecto `0.0.0.0` |
| `DB_PATH` | SQLite local, por defecto `./data/werewolves.sqlite` |
| `APP_ORIGIN` | Origen exacto opcional, p. ej. `https://lobos.example.com` |

Sin `APP_ORIGIN`, se acepta el origen de la solicitud actual, por lo que funcionan los dominios y las previews. Compose fija localhost por defecto; usa la IP LAN para acceder desde celulares. El proxy debe conservar `Host` y `Authorization`.

## Reglas y arte

Referencia: [manual original](https://cdn.1j1ju.com/medias/60/0e/b4-les-loups-garous-de-thiercelieux-regle.pdf) y [sitio oficial de Zygomatic](https://www.zygomatic-games.com/game/the-werewolves-of-millers-hollow/).

- Manual: 8–18 jugadores más el narrador. Para 8–11, 2 lobos y 1 vidente; para 12–18, 3 lobos y 1 vidente. El resto son aldeanos.
- La aplicación permite 4–7 como variante de grupo pequeño. Se recomienda un lobo y una vidente.
- La vidente despierta antes de los lobos y conoce el rol exacto de otra persona viva. Juega para la aldea.
- Los lobos no pueden atacar a otro lobo. La víctima se revela al amanecer; los eliminados guardan silencio.
- La aldea gana al eliminar todos los lobos. Por defecto, los lobos ganan al eliminar a todos los demás. La victoria por igualdad o mayoría numérica es una variante seleccionable al crear la sala.
- Sin capitán: repitan una votación empatada entre los empatados. Si persiste, el narrador registra que no hubo eliminación.

No se encontró una licencia de reutilización de las ilustraciones oficiales en la página consultada. Se usan gráficos SVG propios. No se incluyen personajes avanzados, narración automática ni votación por celular.

Más detalles en [docs/architecture.md](docs/architecture.md).
