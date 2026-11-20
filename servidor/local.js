// ===== Walletera | servidor/local.js =====
// Servidor de desarrollo: la app y la API en el mismo origen, como en Vercel.
//   npm start  →  http://localhost:5173
// Sin DATABASE_URL (en .env o en el entorno) la API responde 503 y la app queda en modo local.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { crearApp } from './app.js';
import { esPublico } from './publicos.js';

const app = crearApp();

app.use('*', async (c, next) => (esPublico(c.req.path) ? next() : c.notFound()));
app.use('*', serveStatic({ root: './' }));

const puerto = Number(process.env.PORT) || 5173;
serve({ fetch: app.fetch, port: puerto }, () => {
    console.log(`Walletera en http://localhost:${puerto}`);
    if (!process.env.DATABASE_URL) console.log('Sin DATABASE_URL: solo modo local (la API responde 503).');
});
