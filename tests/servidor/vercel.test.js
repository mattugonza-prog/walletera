import { describe, expect, it } from 'vitest';
import funcion, { pedidoOriginal } from '../../api/index.js';

describe('función de Vercel (api/index.js)', () => {
    it('reconstruye la ruta que llega reescrita como /api?__ruta=…', async () => {
        const pedido = pedidoOriginal(new Request('https://walletera.vercel.app/api?__ruta=movimientos/abc-1&otro=1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json', cookie: 'walletera_sesion=x' },
            body: JSON.stringify({ monto: 10 })
        }));
        const url = new URL(pedido.url);
        expect(url.pathname).toBe('/api/movimientos/abc-1');
        expect(url.search).toBe('?otro=1');
        expect(pedido.method).toBe('PUT');
        expect(pedido.headers.get('cookie')).toBe('walletera_sesion=x');
        expect(await pedido.json()).toEqual({ monto: 10 });
    });

    it('deja igual un pedido que ya trae la ruta original', () => {
        const original = new Request('https://walletera.vercel.app/api/estado');
        expect(pedidoOriginal(original)).toBe(original);
    });

    it.skipIf(process.env.DATABASE_URL)('llega a la API (sin DATABASE_URL responde que la nube no está configurada)', async () => {
        const respuesta = await funcion.fetch(new Request('https://walletera.vercel.app/api?__ruta=sesion'));
        expect(respuesta.status).toBe(503);
        expect(respuesta.headers.get('content-type')).toMatch(/json/);
    });
});
