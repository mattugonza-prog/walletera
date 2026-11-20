// ===== Walletera | servidor/app.js =====
// La API completa (/api/*). La usan la función de Vercel (api/index.js),
// el servidor de desarrollo (servidor/local.js) y los tests.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { crearPool } from './db.js';
import { controlarOrigen } from './seguridad.js';
import { rutasDeSesion } from './rutas/sesion.js';
import { rutasDeDatos } from './rutas/datos.js';

const LIMITE = 16 * 1024;
const LIMITE_RESPALDO = 4 * 1024 * 1024;   // Vercel acepta hasta 4,5 MB por pedido

export function crearApp({ pool = crearPool(), entorno = process.env } = {}) {
    const app = new Hono();

    // Son datos personales: ningún navegador ni proxy los guarda.
    app.use('/api/*', async (c, next) => {
        await next();
        c.res.headers.set('Cache-Control', 'no-store');
    });

    // Sin base de datos (un preview sin configurar, o `npm start` sin DATABASE_URL)
    // la app sigue funcionando en modo local.
    if (!pool) {
        app.all('/api/*', c => c.json({ error: 'La nube no está configurada en este servidor.' }, 503));
        return app;
    }

    app.use('/api/*', (c, next) => bodyLimit({
        maxSize: c.req.path === '/api/datos' ? LIMITE_RESPALDO : LIMITE,
        onError: () => c.json({ error: 'El pedido es demasiado grande.' }, 413)
    })(c, next));
    app.use('/api/*', controlarOrigen);

    app.route('/api', rutasDeSesion({ pool, entorno }));
    app.route('/api', rutasDeDatos({ pool }));
    app.all('/api/*', c => c.json({ error: 'No existe esa ruta.' }, 404));

    app.onError((error, c) => {
        console.error(error);
        return c.json({ error: 'Algo salió mal en el servidor. Probá de nuevo en un momento.' }, 500);
    });

    return app;
}
