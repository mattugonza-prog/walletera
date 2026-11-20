// ===== Walletera | api/index.js =====
// Función de Vercel: toda la API entra por acá.
// vercel.json reescribe /api/<ruta> a /api?__ruta=<ruta>; si llega así, se reconstruye la
// ruta original antes de pasarle el pedido a la app.
import { crearApp } from '../servidor/app.js';

const app = crearApp();

export function pedidoOriginal(pedido) {
    const url = new URL(pedido.url);
    const ruta = url.searchParams.get('__ruta');
    if (ruta === null) return pedido;
    url.searchParams.delete('__ruta');
    url.pathname = `/api/${ruta}`;
    const conCuerpo = !['GET', 'HEAD'].includes(pedido.method);
    return new Request(url, {
        method: pedido.method,
        headers: pedido.headers,
        body: conCuerpo ? pedido.body : undefined,
        duplex: conCuerpo ? 'half' : undefined,   // Node lo exige para cuerpos en stream
        signal: pedido.signal
    });
}

export default {
    fetch: pedido => app.fetch(pedidoOriginal(pedido))
};
