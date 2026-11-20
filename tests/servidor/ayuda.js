// Ayudas para probar la API contra un Postgres real sin levantar un servidor:
// app.request() de Hono arma el pedido en memoria.
import { crearApp } from '../../servidor/app.js';
import { crearPool } from '../../servidor/db.js';

export const hayBase = Boolean(process.env.DATABASE_URL_TEST);
export const CODIGO = 'codigo-de-prueba-123';
export const CLAVE = 'clave-segura-1';

let pool = null;
export function appDePrueba(entorno = { CODIGO_REGISTRO: CODIGO }) {
    pool ??= crearPool(process.env.DATABASE_URL_TEST);
    return { app: crearApp({ pool, entorno }), pool };
}

export async function cerrarBase() {
    await pool?.end();
    pool = null;
}

// Un "navegador": guarda la cookie de sesión entre pedidos y manda el Origin de la página.
export function navegador(app, { origen = 'http://localhost' } = {}) {
    let cookie = null;
    async function pedir(metodo, ruta, cuerpo, encabezados = {}) {
        const headers = { origin: origen, ...encabezados };
        if (cookie) headers.cookie = cookie;
        if (cuerpo !== undefined) headers['content-type'] ??= 'application/json';
        const res = await app.request(`http://localhost/api${ruta}`, {
            method: metodo,
            headers,
            body: cuerpo === undefined ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))
        });
        const nueva = res.headers.get('set-cookie');
        if (nueva) {
            const valor = nueva.split(';')[0];
            cookie = valor.endsWith('=') ? null : valor;   // borrarCookie deja el valor vacío
        }
        const texto = await res.text();
        return { status: res.status, cuerpo: texto ? JSON.parse(texto) : null, headers: res.headers };
    }
    return {
        pedir,
        get cookie() { return cookie; },
        set cookie(valor) { cookie = valor; }
    };
}

let contador = 0;
export const emailNuevo = () => `prueba-${process.pid}-${Date.now()}-${++contador}@walletera.test`;

// Registra un usuario nuevo y devuelve su "navegador" con la sesión iniciada.
export async function registrado(app) {
    const n = navegador(app);
    const email = emailNuevo();
    const res = await n.pedir('POST', '/usuario', { email, clave: CLAVE, codigo: CODIGO });
    if (res.status !== 201) throw new Error(`El registro falló: ${res.status} ${JSON.stringify(res.cuerpo)}`);
    const { cuerpo: estado } = await n.pedir('GET', '/estado');
    return { n, email, estado };
}
