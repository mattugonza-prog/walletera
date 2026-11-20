// Antes de correr los tests: deja la base de prueba vacía y con el esquema al día.
// Solo si existe DATABASE_URL_TEST (en CI siempre; en tu máquina, si la definís).
import pg from 'pg';
import { migrar } from '../../scripts/migrar.js';

export default async function prepararBase() {
    const url = process.env.DATABASE_URL_TEST;
    if (!url) {
        console.log('DATABASE_URL_TEST no está definida: se saltean los tests del servidor.');
        return;
    }
    // Esta base se vacía en cada corrida: por las dudas, solo una cuyo nombre diga "test".
    const nombre = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!/test/i.test(nombre)) {
        const motivo = `DATABASE_URL_TEST apunta a "${nombre}": tiene que ser una base de prueba (con "test" en el nombre) porque los tests la borran.`;
        console.error(`\n${motivo}\n`);   // Vitest no siempre muestra el mensaje de un error en este paso
        throw new Error(motivo);
    }
    const cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
    await cliente.query('drop schema if exists public cascade; create schema public;');
    await cliente.end();
    await migrar(url, { silencioso: true });
}
