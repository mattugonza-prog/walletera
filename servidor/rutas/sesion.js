// ===== Walletera | servidor/rutas/sesion.js =====
// Un usuario por casa: el mismo email y contraseña en todos los dispositivos,
// cada uno con su propia sesión.
import { Hono } from 'hono';
import { enTransaccion, ERRORES_PG } from '../db.js';
import { sembrar } from '../repositorio.js';
import {
    LARGO_MINIMO_CLAVE, esClaveValida, normalizarEmail, sonIguales,
    hashearClave, verificarClave, gastarTiempoComoUnaVerificacion,
    crearSesion, leerSesion, cerrarSesion, guardarCookie, leerCookie, borrarCookie, requerirSesion
} from '../seguridad.js';
import { leerCuerpo } from './util.js';

const MAX_INTENTOS = 5;   // por email, cada 15 minutos

export function rutasDeSesion({ pool, entorno }) {
    const r = new Hono();
    const sesion = requerirSesion(pool);
    // El registro solo está abierto mientras exista CODIGO_REGISTRO (y hay que conocerlo).
    const registroAbierto = () => Boolean(entorno.CODIGO_REGISTRO);

    // Siempre 200: no tener sesión es lo normal para quien usa la demo, no un error
    // (un 401 acá ensuciaría la consola de cada visitante).
    r.get('/sesion', async c => {
        const actual = await leerSesion(pool, leerCookie(c));
        if (!actual) return c.json({ email: null, registroAbierto: registroAbierto() });
        if (actual.renovada) guardarCookie(c, leerCookie(c));
        return c.json({ email: actual.usuario.email });
    });

    r.post('/sesion', async c => {
        const cuerpo = await leerCuerpo(c);
        const email = normalizarEmail(cuerpo?.email);
        if (!email || typeof cuerpo.clave !== 'string') return c.json({ error: 'Escribí tu email y tu contraseña.' }, 400);

        const { rows: [intentos] } = await pool.query(
            `select count(*)::int as cantidad from intentos_login where email = $1 and creado > now() - interval '15 minutes'`,
            [email]
        );
        if (intentos.cantidad >= MAX_INTENTOS) {
            return c.json({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' }, 429);
        }

        const { rows: [usuario] } = await pool.query('select id, email, hash_clave from usuarios where email = $1', [email]);
        const valida = usuario
            ? await verificarClave(cuerpo.clave, usuario.hash_clave)
            : await gastarTiempoComoUnaVerificacion(cuerpo.clave);
        if (!valida) {
            await pool.query('insert into intentos_login (email) values ($1)', [email]);
            return c.json({ error: 'El email o la contraseña no son correctos.' }, 401);
        }

        // Limpieza de paso: intentos viejos y sesiones vencidas.
        await pool.query(`delete from intentos_login where email = $1 or creado < now() - interval '1 day'`, [email]);
        await pool.query('delete from sesiones where usuario_id = $1 and expira < now()', [usuario.id]);
        guardarCookie(c, await crearSesion(pool, usuario.id));
        return c.json({ email: usuario.email });
    });

    r.delete('/sesion', async c => {
        await cerrarSesion(pool, leerCookie(c));
        borrarCookie(c);
        return c.body(null, 204);
    });

    // Por si se pierde un celular: cierra todas las sesiones, incluida esta.
    r.delete('/sesiones', sesion, async c => {
        await pool.query('delete from sesiones where usuario_id = $1', [c.get('usuario').id]);
        borrarCookie(c);
        return c.body(null, 204);
    });

    r.post('/usuario', async c => {
        if (!registroAbierto()) return c.json({ error: 'El registro está cerrado.' }, 403);
        const cuerpo = await leerCuerpo(c);
        if (!sonIguales(cuerpo?.codigo ?? '', entorno.CODIGO_REGISTRO)) {
            return c.json({ error: 'El código de registro no es correcto.' }, 403);
        }
        const email = normalizarEmail(cuerpo.email);
        if (!email) return c.json({ error: 'Escribí un email válido.' }, 400);
        if (!esClaveValida(cuerpo.clave)) {
            return c.json({ error: `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` }, 400);
        }
        const hash = await hashearClave(cuerpo.clave);
        let usuario;
        try {
            usuario = await enTransaccion(pool, async cliente => {
                const { rows: [nuevo] } = await cliente.query(
                    'insert into usuarios (email, hash_clave) values ($1, $2) returning id, email',
                    [email, hash]
                );
                await sembrar(cliente, nuevo.id);
                return nuevo;
            });
        } catch (error) {
            if (error.code === ERRORES_PG.duplicado) {
                return c.json({ error: 'Ya hay un usuario con ese email. Ingresá con tu contraseña.' }, 409);
            }
            throw error;
        }
        guardarCookie(c, await crearSesion(pool, usuario.id));
        return c.json({ email: usuario.email }, 201);
    });

    r.put('/usuario/clave', sesion, async c => {
        const cuerpo = await leerCuerpo(c);
        const usuario = c.get('usuario');
        if (!esClaveValida(cuerpo?.nueva)) {
            return c.json({ error: `La contraseña nueva tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` }, 400);
        }
        const { rows: [fila] } = await pool.query('select hash_clave from usuarios where id = $1', [usuario.id]);
        if (typeof cuerpo.actual !== 'string' || !(await verificarClave(cuerpo.actual, fila.hash_clave))) {
            return c.json({ error: 'La contraseña actual no es correcta.' }, 403);
        }
        await pool.query('update usuarios set hash_clave = $2 where id = $1', [usuario.id, await hashearClave(cuerpo.nueva)]);
        // Las demás sesiones se cierran: quien tuviera la contraseña vieja queda afuera.
        await pool.query('delete from sesiones where usuario_id = $1 and token_hash <> $2', [usuario.id, c.get('tokenHash')]);
        return c.body(null, 204);
    });

    return r;
}
