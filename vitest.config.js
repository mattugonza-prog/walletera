import { defineConfig } from 'vitest/config';

// Las fechas dependen de la zona horaria: se fija la de Argentina para que los
// tests den lo mismo en cualquier máquina (y reproduzcan el error de UTC-3).
process.env.TZ = 'America/Argentina/Buenos_Aires';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node'
    }
});
