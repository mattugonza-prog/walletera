// ===== Walletera | servidor/db.js =====
// Conexión a Postgres: un pool por proceso (en Vercel se reutiliza entre pedidos).
import pg from 'pg';

const OID = { date: 1082, numeric: 1700, int8: 20 };

// - DATE queda como texto 'AAAA-MM-DD': pasarlo por Date lo correría por la zona horaria,
//   el mismo error que la app ya corrigió en el navegador.
// - NUMERIC e INT8 pasan a number: los montos son NUMERIC(14,2) y "creado" son milisegundos,
//   ambos entran en un double sin perder precisión.
const tipos = {
    getTypeParser(oid, formato) {
        if (oid === OID.date) return valor => valor;
        if (oid === OID.numeric || oid === OID.int8) return valor => Number(valor);
        return pg.types.getTypeParser(oid, formato);
    }
};

export function crearPool(url = process.env.DATABASE_URL) {
    if (!url) return null;
    const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, types: tipos });
    // Neon cierra las conexiones inactivas cuando suspende la base. Sin este manejador, pg
    // emitiría un "error" sin escuchar y el proceso se caería; así solo se descarta esa conexión.
    pool.on('error', error => console.error('Se cerró una conexión inactiva con la base:', error.message));
    return pool;
}

// Ejecuta `fn(cliente)` dentro de una transacción: si algo falla, no queda nada a medias.
export async function enTransaccion(pool, fn) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const resultado = await fn(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

// Códigos de error de Postgres que la API traduce a respuestas para el usuario.
export const ERRORES_PG = {
    claveForanea: '23503',
    duplicado: '23505',
    restriccion: '23514'
};
