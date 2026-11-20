// ===== Walletera | scripts/migrar.js =====
// Aplica las migraciones pendientes de servidor/migraciones/ (en orden alfabético).
//   npm run db:migrar          usa DATABASE_URL (de .env o del entorno)
// Corre en una transacción con un lock: si dos procesos migran a la vez, el segundo espera,
// y si una migración falla no queda nada a medias.
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const CARPETA = new URL('../servidor/migraciones/', import.meta.url);
const LOCK = 4823;   // número arbitrario para pg_advisory_xact_lock

export async function migrar(url, { silencioso = false } = {}) {
    if (!url) throw new Error('Falta DATABASE_URL.');
    const cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query('select pg_advisory_xact_lock($1)', [LOCK]);
        await cliente.query(`create table if not exists schema_migraciones (
            nombre    text primary key,
            aplicada  timestamptz not null default now()
        )`);
        const { rows } = await cliente.query('select nombre from schema_migraciones');
        const aplicadas = new Set(rows.map(f => f.nombre));
        const pendientes = readdirSync(CARPETA).filter(f => f.endsWith('.sql') && !aplicadas.has(f)).sort();
        for (const nombre of pendientes) {
            await cliente.query(readFileSync(new URL(nombre, CARPETA), 'utf8'));
            await cliente.query('insert into schema_migraciones (nombre) values ($1)', [nombre]);
            if (!silencioso) console.log(`Migración aplicada: ${nombre}`);
        }
        await cliente.query('COMMIT');
        if (!silencioso && pendientes.length === 0) console.log('La base ya está al día.');
        return pendientes;
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        await cliente.end();
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    migrar(process.env.DATABASE_URL).catch(error => {
        console.error(`No se pudo migrar: ${error.message}`);
        process.exitCode = 1;
    });
}
