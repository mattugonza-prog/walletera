// ===== Walletera | scripts/build.js =====
// Copia la app a dist/ (lo que publica Vercel como sitio estático). La API no pasa por acá:
// Vercel la arma aparte desde api/.
// En el deploy de producción, si hay base configurada, también aplica las migraciones.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { ARCHIVOS_PUBLICOS, CARPETAS_PUBLICAS } from '../servidor/publicos.js';
import { migrar } from './migrar.js';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const ruta of [...ARCHIVOS_PUBLICOS, ...CARPETAS_PUBLICAS]) {
    cpSync(ruta, `dist/${ruta}`, { recursive: true });
}
console.log('App copiada a dist/.');

if (process.env.VERCEL_ENV === 'production' && process.env.DATABASE_URL) {
    await migrar(process.env.DATABASE_URL);
}
