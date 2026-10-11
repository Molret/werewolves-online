# Werewolves Online

Cartas digitales para jugar al hombre lobo **en persona**, con un narrador humano. Los celulares reemplazan las cartas; el debate y las votaciones ocurren cara a cara.

## Ejecutar

Requiere Node.js 24 o posterior. No hay dependencias externas ni servicios de terceros.

```sh
npm start
```

Abre `http://localhost:3000`. Para que los jugadores entren desde sus celulares, todos deben acceder al mismo servidor: usa la IP de tu computador dentro de la misma red o despliega detrás de un proxy HTTPS.

```sh
npm run check
npm test
```

## Jugar

1. Crea una aldea. Tú eres el narrador y no cuentas como jugador.
2. Agrega a cada persona. Asigna los roles o reparte al azar.
3. Copia **Carta** junto a cada nombre y comparte ese enlace únicamente con esa persona. Guarda tu enlace de narrador: permite recuperar el panel completo.
4. Inicia la partida. Cada jugador toca su carta para ver el rol; se oculta a los 10 segundos o al cambiar de aplicación.
5. Sigue el panel: vidente, lobos, amanecer, debate y votación. La vidente señala a alguien; tú consultas el rol en tu panel y se lo comunicas discretamente. Los lobos acuerdan su víctima en persona. Los vivos votan en persona y tú registras el resultado.
6. Los roles se revelan al morir y al terminar la partida. Los eliminados permanecen en silencio.

Solo están implementados **hombre lobo, aldeano y vidente**. No hay capitán, personajes avanzados, narración automática ni votación por celular.

## Reglas

Basadas en el [manual de Les Loups-Garous de Thiercelieux](https://cdn.1j1ju.com/medias/60/0e/b4-les-loups-garous-de-thiercelieux-regle.pdf), especialmente la distribución simplificada y el orden nocturno.

- El manual recomienda 8–18 jugadores más el narrador. 8–11: 2 lobos, 1 vidente y el resto aldeanos. 12–18: 3 lobos, 1 vidente y el resto aldeanos.
- Permitimos 4–7 jugadores como variante de grupo pequeño; se recomienda un lobo y una vidente.
- La vidente despierta antes de los lobos y conoce el rol exacto de otra persona viva.
- Los lobos no pueden atacar a otro lobo. La muerte nocturna se revela al amanecer.
- La aldea gana al eliminar todos los lobos. Por defecto los lobos ganan al eliminar a todos los demás, como en el manual. La victoria por igualdad numérica es una variante configurable al crear la sala.
- Sin capitán: en empate se repite la votación entre los empatados. Si persiste, el narrador registra que nadie fue eliminado.

Las ilustraciones son originales y el proyecto no incluye cartas ni marcas gráficas del juego comercial. Consulta [docs/architecture.md](docs/architecture.md) para conocer la API y el alcance.

## Desplegar

```sh
APP_ORIGIN=https://tu-dominio.example docker compose up -d --build
```

Pon un proxy HTTPS delante del puerto 3000. El volumen `games` conserva las salas entre reinicios. **No uses hosting exclusivamente estático ni funciones efímeras con disco temporal**: este backend necesita un proceso Node y almacenamiento persistente.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP |
| `HOST` | `0.0.0.0` | Interfaz de escucha |
| `DB_PATH` | `./data/werewolves.sqlite` | SQLite persistente |
| `APP_ORIGIN` | Sin definir | Origen exacto permitido, p. ej. `https://lobos.example.com` |

Sin `APP_ORIGIN`, se aceptan solicitudes del mismo host, útil para jugar en una LAN. Compose usa `http://localhost:3000` por defecto: cámbialo a la IP LAN si accedes desde celulares. El proxy debe conservar el encabezado `Host` y permitir `Authorization`.

Cada enlace privado es una credencial: quien lo tenga puede abrir esa carta o, en el caso del narrador, controlar la sala. No compartas el enlace del narrador en el grupo. Las credenciales viajan en el fragmento URL y el navegador las envía como `Authorization`; no aparecen en las rutas HTTP. El navegador guarda la última sesión localmente para recuperarla. No hay recuperación si se pierde el enlace y se borra esa sesión.

Las salas expiran después de 7 días sin modificaciones. Los registros expirados se purgan al crear una sala nueva. Haz respaldos consistentes de SQLite, incluyendo el WAL si copias la base mientras el proceso está activo; las tarjetas privadas se almacenan en esa base. La versión inicial admite un proceso por base de datos y consulta el estado cada 3 segundos. No está pensada para desplegar varias réplicas independientes.
