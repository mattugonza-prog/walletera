// Cliente HTTP (js/api.js) con fetch simulado.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../js/api.js';

const json = (status, cuerpo) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' }
});

function simularFetch(...respuestas) {
    const fetch = vi.fn(async () => {
        const siguiente = respuestas.shift();
        if (siguiente instanceof Error) throw siguiente;
        return siguiente;
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('cliente de la API', () => {
    it('manda JSON a /api con la cookie del mismo origen', async () => {
        const fetch = simularFetch(json(201, { movimiento: { id: 'm1' } }));
        expect(await api.crear('movimientos', { id: 'm1', monto: 10 })).toEqual({ movimiento: { id: 'm1' } });
        expect(fetch).toHaveBeenCalledWith('/api/movimientos', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: '{"id":"m1","monto":10}'
        });
    });

    it('codifica el id en la ruta y entiende las respuestas vacías', async () => {
        const fetch = simularFetch(new Response(null, { status: 204 }));
        expect(await api.eliminar('movimientos', 'a/b')).toBeNull();
        expect(fetch.mock.calls[0][0]).toBe('/api/movimientos/a%2Fb');
        expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: {} });
    });

    it('convierte los errores del servidor y la falta de conexión en ErrorApi', async () => {
        simularFetch(json(409, { error: 'La cuenta tiene movimientos.' }), new TypeError('Failed to fetch'));
        await expect(api.eliminar('cuentas', 'c1')).rejects.toMatchObject({ name: 'ErrorApi', estado: 409, message: 'La cuenta tiene movimientos.' });
        const error = await api.obtenerEstado().catch(e => e);
        expect(error).toBeInstanceOf(api.ErrorApi);
        expect(error.sinConexion).toBe(true);
        expect(error.message).toMatch(/Sin conexión/);
    });

    it('avisa cuando la sesión venció, pero no por una contraseña incorrecta', async () => {
        const dispatchEvent = vi.fn();
        vi.stubGlobal('dispatchEvent', dispatchEvent);
        simularFetch(json(401, { error: 'Tu sesión venció.' }), json(401, { error: 'El email o la contraseña no son correctos.' }));
        await expect(api.obtenerEstado()).rejects.toMatchObject({ estado: 401 });
        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(dispatchEvent.mock.calls[0][0].type).toBe(api.EVENTO_SESION_VENCIDA);
        await expect(api.ingresar('a@b.com', 'x')).rejects.toMatchObject({ estado: 401 });
        expect(dispatchEvent).toHaveBeenCalledTimes(1);
    });

    it('consultarSesion distingue sesión, sin sesión, sin conexión y sitio sin nube', async () => {
        simularFetch(
            json(200, { email: 'casa@ejemplo.com' }),
            json(200, { email: null, registroAbierto: true }),
            new TypeError('Failed to fetch'),
            json(503, { error: 'La nube no está configurada.' }),
            new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } })
        );
        expect(await api.consultarSesion()).toEqual({ estado: 'activa', email: 'casa@ejemplo.com' });
        expect(await api.consultarSesion()).toEqual({ estado: 'sin-sesion', registroAbierto: true });
        expect(await api.consultarSesion()).toEqual({ estado: 'sin-conexion' });
        expect(await api.consultarSesion()).toEqual({ estado: 'sin-nube' });
        expect(await api.consultarSesion()).toEqual({ estado: 'sin-nube' });
    });

    it('borrar todo manda la confirmación que pide el servidor', async () => {
        const fetch = simularFetch(new Response(null, { status: 204 }));
        await api.borrarTodo();
        expect(fetch.mock.calls[0]).toEqual(['/api/datos', expect.objectContaining({ method: 'DELETE', body: '{"confirmar":true}' })]);
    });
});
