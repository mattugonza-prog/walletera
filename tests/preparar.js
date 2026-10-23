// Entorno mínimo de navegador para la capa de datos: localStorage en memoria
// y fetch que lee los JSON del proyecto.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const raiz = new URL('../', import.meta.url);

class AlmacenEnMemoria {
    #datos = new Map();
    get length() { return this.#datos.size; }
    key(i) { return [...this.#datos.keys()][i] ?? null; }
    getItem(clave) { return this.#datos.has(clave) ? this.#datos.get(clave) : null; }
    setItem(clave, valor) { this.#datos.set(clave, String(valor)); }
    removeItem(clave) { this.#datos.delete(clave); }
    clear() { this.#datos.clear(); }
}

export function prepararEntorno() {
    globalThis.localStorage = new AlmacenEnMemoria();
    globalThis.fetch = vi.fn(async ruta => {
        const archivo = fileURLToPath(new URL(ruta.replace(/^\.\//, ''), raiz));
        return { ok: true, json: async () => JSON.parse(readFileSync(archivo, 'utf8')) };
    });
}

// Importa la capa de datos desde cero (su estado vive en el módulo).
export async function cargarDatos(previo = {}) {
    prepararEntorno();
    Object.entries(previo).forEach(([clave, valor]) =>
        localStorage.setItem(clave, typeof valor === 'string' ? valor : JSON.stringify(valor)));
    vi.resetModules();
    const datos = await import('../js/datos.js');
    await datos.inicializarDatos();
    return datos;
}

export const leer = clave => JSON.parse(localStorage.getItem(clave));
