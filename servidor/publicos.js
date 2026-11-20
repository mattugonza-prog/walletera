// ===== Walletera | servidor/publicos.js =====
// Lo que se publica de la app. Lo usan el build (copia a dist/) y el servidor de
// desarrollo (que no sirve nada fuera de esta lista: ni .env ni el código del servidor).
export const ARCHIVOS_PUBLICOS = ['index.html', 'main.js', 'sw.js', 'manifest.webmanifest', 'categorias.json', 'iconos.json'];
export const CARPETAS_PUBLICAS = ['js', 'css', 'img', 'vendor'];

export function esPublico(ruta) {
    if (ruta.includes('..')) return false;
    return ruta === '/'
        || ARCHIVOS_PUBLICOS.includes(ruta.slice(1))
        || CARPETAS_PUBLICAS.some(carpeta => ruta.startsWith(`/${carpeta}/`));
}
