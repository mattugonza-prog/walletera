// ===== Walletera | servidor/seguridad.js =====
// Contraseñas, sesiones, cookie y controles de origen.
import { createHash, randomBytes, scrypt as scryptConCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const scrypt = promisify(scryptConCallback);

// ===== Contraseñas =====
// scrypt con N = 2^15 (~32 MB y unos 80 ms por intento): caro para quien prueba claves
// en masa, imperceptible al ingresar. Se guarda "scrypt$N$r$p$sal$hash".
const PARAMETROS = { N: 2 ** 15, r: 8, p: 1 };
const MEMORIA_MAXIMA = 64 * 1024 * 1024;
export const LARGO_MINIMO_CLAVE = 8;
const LARGO_MAXIMO_CLAVE = 200;

const derivar = (clave, sal, largo, { N, r, p }) =>
    scrypt(clave.normalize('NFKC'), sal, largo, { N, r, p, maxmem: MEMORIA_MAXIMA });

export async function hashearClave(clave) {
    const sal = randomBytes(16);
    const hash = await derivar(clave, sal, 64, PARAMETROS);
    const { N, r, p } = PARAMETROS;
    return ['scrypt', N, r, p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function verificarClave(clave, guardado) {
    const [algoritmo, N, r, p, sal, hash] = String(guardado).split('$');
    if (algoritmo !== 'scrypt' || !sal || !hash) return false;
    const esperado = Buffer.from(hash, 'base64');
    const calculado = await derivar(clave, Buffer.from(sal, 'base64'), esperado.length, { N: Number(N), r: Number(r), p: Number(p) });
    return timingSafeEqual(esperado, calculado);
}

// Con un email que no existe también se calcula un hash: así la respuesta tarda lo mismo
// y no revela qué emails tienen cuenta.
let hashFicticio;
export async function gastarTiempoComoUnaVerificacion(clave) {
    hashFicticio ??= hashearClave(randomBytes(16).toString('hex'));
    await verificarClave(clave, await hashFicticio);
    return false;
}

export const esClaveValida = clave =>
    typeof clave === 'string' && clave.length >= LARGO_MINIMO_CLAVE && clave.length <= LARGO_MAXIMO_CLAVE;

export function normalizarEmail(email) {
    if (typeof email !== 'string') return null;
    const limpio = email.trim().toLowerCase();
    return limpio.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

// Compara dos textos sin filtrar por el tiempo cuántos caracteres coinciden.
export function sonIguales(a, b) {
    const resumen = texto => createHash('sha256').update(String(texto)).digest();
    return timingSafeEqual(resumen(a), resumen(b));
}

// ===== Sesiones =====
export const COOKIE_SESION = 'walletera_sesion';
const DURACION = 60 * 24 * 60 * 60 * 1000;          // 60 días
const RENOVAR_SI_QUEDAN = 30 * 24 * 60 * 60 * 1000;  // se extiende al usarla

const hashToken = token => createHash('sha256').update(token).digest('hex');

export async function crearSesion(db, usuarioId) {
    const token = randomBytes(32).toString('base64url');
    await db.query(
        'insert into sesiones (token_hash, usuario_id, expira) values ($1, $2, $3)',
        [hashToken(token), usuarioId, new Date(Date.now() + DURACION)]
    );
    return token;
}

export async function leerSesion(db, token) {
    if (typeof token !== 'string' || token.length > 100) return null;
    const { rows: [sesion] } = await db.query(
        `select s.token_hash, s.expira, u.id, u.email, u.zona_horaria
           from sesiones s join usuarios u on u.id = s.usuario_id
          where s.token_hash = $1 and s.expira > now()`,
        [hashToken(token)]
    );
    if (!sesion) return null;
    let renovada = false;
    if (sesion.expira.getTime() - Date.now() < RENOVAR_SI_QUEDAN) {
        await db.query('update sesiones set expira = $2 where token_hash = $1', [sesion.token_hash, new Date(Date.now() + DURACION)]);
        renovada = true;
    }
    return { usuario: { id: sesion.id, email: sesion.email, zona: sesion.zona_horaria }, tokenHash: sesion.token_hash, renovada };
}

export async function cerrarSesion(db, token) {
    if (typeof token === 'string') await db.query('delete from sesiones where token_hash = $1', [hashToken(token)]);
}

// ===== Cookie =====
// HttpOnly: el JavaScript de la página no la puede leer. SameSite=Lax: no viaja en pedidos
// que otros sitios disparan en segundo plano. Path=/api: solo la reciben los pedidos a la API.
const esHttps = c =>
    new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';

export function guardarCookie(c, token) {
    setCookie(c, COOKIE_SESION, token, {
        httpOnly: true,
        secure: esHttps(c),
        sameSite: 'Lax',
        path: '/api',
        maxAge: DURACION / 1000
    });
}

export const leerCookie = c => getCookie(c, COOKIE_SESION);

export const borrarCookie = c => deleteCookie(c, COOKIE_SESION, { path: '/api', secure: esHttps(c) });

// ===== Middlewares =====
// Contra CSRF: los pedidos que cambian datos tienen que venir de la misma página (Origin)
// y mandar JSON, algo que un formulario de otro sitio no puede hacer.
export async function controlarOrigen(c, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
    const origen = c.req.header('origin');
    if (origen) {
        let hostOrigen = null;
        try {
            hostOrigen = new URL(origen).host;
        } catch { /* "null" u otro valor que no es una URL */ }
        const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host;
        if (hostOrigen !== host) return c.json({ error: 'Pedido de otro sitio rechazado.' }, 403);
    }
    const tieneCuerpo = c.req.method !== 'DELETE' || Number(c.req.header('content-length') ?? 0) > 0;
    if (tieneCuerpo && !c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
        return c.json({ error: 'El pedido tiene que ser JSON.' }, 415);
    }
    return next();
}

// Deja en c.get('usuario') al dueño de la sesión, o responde 401.
export function requerirSesion(pool) {
    return async (c, next) => {
        const sesion = await leerSesion(pool, leerCookie(c));
        if (!sesion) {
            borrarCookie(c);
            return c.json({ error: 'Tu sesión venció. Volvé a ingresar.' }, 401);
        }
        if (sesion.renovada) guardarCookie(c, leerCookie(c));
        c.set('usuario', sesion.usuario);
        c.set('tokenHash', sesion.tokenHash);
        return next();
    };
}
