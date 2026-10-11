import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { sqliteStore } from './sqlite.js';
import { neonStore } from './storage.js';
import { apiHandler, securityHeaders } from './http.js';

const publicPath = fileURLToPath(new URL('../public/', import.meta.url));
export function createApp({ database = process.env.DB_PATH || './data/werewolves.sqlite', now = Date.now, store = process.env.DATABASE_URL ? neonStore() : sqliteStore(database) } = {}) {
  const api = apiHandler(store, { now });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
        const response = await api(request, req.socket.remoteAddress);
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      const files = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/favicon.svg': ['favicon.svg','image/svg+xml'] };
      const file = files[url.pathname];
      if (!file || !['GET','HEAD'].includes(req.method)) { res.writeHead(404, securityHeaders); res.end('No encontrado'); return; }
      res.writeHead(200, { ...securityHeaders, 'Content-Type': `${file[1]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(resolve(publicPath,file[0])));
    } catch { res.writeHead(500); res.end('Error del servidor'); }
  });
  server.on('close', () => store.close()); return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log(`Werewolves Online · puerto ${server.address().port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
