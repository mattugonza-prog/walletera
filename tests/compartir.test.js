import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { esPublico } from '../servidor/publicos.js';

// Vista previa al compartir el enlace (WhatsApp y otros): Open Graph con URLs absolutas,
// porque las relativas se ignoran, y una imagen JPEG liviana de 1200×630.
const SITIO = 'https://walletera.vercel.app/';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const meta = clave => html.match(new RegExp(`<meta (?:property|name)="${clave}" content="([^"]*)"`))?.[1];

// Ancho y alto de un JPEG, leídos de su marcador SOF (inicio del cuadro).
function medidasJPEG(datos) {
    if (datos[0] !== 0xff || datos[1] !== 0xd8) return null;
    for (let i = 2; i + 9 < datos.length && datos[i] === 0xff; i += 2 + datos.readUInt16BE(i + 2)) {
        const marcador = datos[i + 1];
        if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
            return [datos.readUInt16BE(i + 7), datos.readUInt16BE(i + 5)];
        }
    }
    return null;
}

describe('vista previa al compartir el enlace', () => {
    it('usa una imagen publicada, con URL absoluta, JPEG de 1200×630 y liviana para WhatsApp', () => {
        const imagen = meta('og:image');
        expect(imagen?.startsWith(SITIO)).toBe(true);
        const ruta = new URL(imagen).pathname;
        expect(esPublico(ruta)).toBe(true);
        const datos = readFileSync(new URL(`..${ruta}`, import.meta.url));
        expect(medidasJPEG(datos)).toEqual([1200, 630]);
        expect(datos.length).toBeLessThan(300 * 1024);
        expect([meta('og:image:type'), meta('og:image:width'), meta('og:image:height')]).toEqual(['image/jpeg', '1200', '630']);
    });

    it('describe la app con la tarjeta grande y la dirección pública', () => {
        for (const clave of ['og:site_name', 'og:title', 'og:description', 'og:image:alt']) {
            expect(meta(clave), clave).toBeTruthy();
        }
        expect(meta('og:locale')).toBe('es_AR');
        expect(meta('twitter:card')).toBe('summary_large_image');
        expect(meta('og:url')).toBe(SITIO);
        expect(html).toContain(`<link rel="canonical" href="${SITIO}">`);
    });
});
