import { neonStore } from '../src/storage.js';
import { apiHandler } from '../src/http.js';

let handle;
async function route(request) {
  try {
    handle ||= apiHandler(neonStore());
    const url = new URL(request.url);
    if (url.searchParams.has('route')) {
      url.pathname = `/api/${url.searchParams.get('route')}`;
      url.searchParams.delete('route');
      request = new Request(url, request);
    }
    return await handle(request, request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'vercel');
  } catch (error) {
    console.error(JSON.stringify({ event: 'storage_unavailable', name: error.name }));
    return Response.json({ error: 'La base de datos no está configurada.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = route;
export const POST = route;
