# Werewolves Online

Cartas digitales para jugar al hombre lobo **en persona**, con un narrador humano. Modo básico: hombre lobo, aldeano y vidente. Adaptación independiente, sin cartas ni ilustraciones del juego comercial.

## Jugar

1. Crea una aldea. Tú eres el **narrador** (anfitrión), no un jugador.
2. Muestra el **QR** o comparte el código de 8 caracteres. Cada persona escribe su nombre desde su celular y tú la aceptas. Para quien no tiene celular, agrégala tú y préstale el tuyo (o entrégale su QR de carta).
3. Elige las cartas: lobos, vidente, bruja, cazador, niña y Cupido. Los aldeanos completan el resto y el reparto es aleatorio.
4. Cada jugador toca su carta para verla; se oculta sola a los 10 segundos, al cambiar de app o con Escape.
5. De noche todos los celulares quedan **oscuros** (nadie sabe qué rol despierta). Sigue el guion en pantalla: Cupido, vidente, lobos, bruja, amanecer. De día, la aldea vota en voz alta y tú registras el resultado. El cazador dispara al morir y los enamorados mueren juntos.
6. ¿Te equivocaste de toque? **Deshacer** revierte el último paso. Al terminar, **Jugar otra vez** reparte nuevas cartas con los mismos QR.

El QR de sala es público y solo permite **pedir ingreso**. El QR de carta y el enlace de narrador son credenciales privadas: guarda tu enlace de narrador. No hay recuperación por cuenta.

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
# Demo interactiva

Abre `/demo` para crear una aldea independiente de ocho personajes. Cambia entre narrador y cualquiera de los jugadores, avanza fases con el backend real, prueba victoria de ambos equipos, muerte de la vidente o empate, y repite las animaciones. La sesión de práctica vive en sessionStorage y no reemplaza tu última partida real. Puedes reiniciar con «Nueva demo».

Las cartas se muestran con un toque o «Ver mi rol», y se ocultan con otro toque, «Ocultar mi rol», Escape, al cambiar de pestaña o después de diez segundos. Las animaciones respetan la preferencia de movimiento reducido.

La demo incluye únicamente los tres roles implementados: aldeano, hombre lobo y vidente. Los demás personajes del juego oficial no están implementados.

