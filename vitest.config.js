import { defineConfig } from 'vitest/config';

// Las fechas dependen de la zona horaria: se fija la de Argentina para que los
// tests den lo mismo en cualquier máquina (y reproduzcan el error de UTC-3).
process.env.TZ = 'America/Argentina/Buenos_Aires';

// DATABASE_URL_TEST puede venir del entorno (CI) o de un .env local.
try {
    process.loadEnvFile('.env');
} catch { /* sin .env: se usa solo el entorno */ }

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node',
        // Los tests del servidor usan un Postgres real (DATABASE_URL_TEST): este paso
        // recrea el esquema una vez antes de correrlos. Sin esa variable se saltean.
        globalSetup: ['tests/servidor/preparar-base.js'],
        testTimeout: 20000
    }
});
