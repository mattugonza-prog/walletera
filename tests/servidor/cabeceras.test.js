import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABECERAS_SEGURIDAD, CSP } from '../../servidor/cabeceras.js';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const indice = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('encabezados de seguridad', () => {
    it('vercel.json publica los mismos que el servidor local', () => {
        const regla = vercel.headers.find(h => h.source === '/(.*)');
        expect(Object.fromEntries(regla.headers.map(h => [h.key, h.value]))).toEqual(CABECERAS_SEGURIDAD);
    });

    it('la CSP no permite scripts en línea ni eval, y el HTML no los necesita', () => {
        expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval/);
        expect(indice).not.toMatch(/<script>|<script(?![^>]*\bsrc=)[^>]*>/);
        expect(indice).not.toMatch(/\son[a-z]+=|style="/);
    });

    it('los scripts de terceros vienen solo de orígenes permitidos', () => {
        const externos = [...indice.matchAll(/<script[^>]+src="(https:[^"]+)"/g)].map(m => new URL(m[1]).origin);
        expect(externos.every(origen => CSP.includes(origen))).toBe(true);
    });
});
