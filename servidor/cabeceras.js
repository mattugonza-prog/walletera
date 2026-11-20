// ===== Walletera | servidor/cabeceras.js =====
// Encabezados de seguridad del sitio. Los aplica el servidor local; vercel.json repite los
// mismos valores para producción (tests/servidor/cabeceras.test.js verifica que coincidan).
//
// Content Security Policy: solo se ejecuta código propio y Chart.js (jsDelivr, versión fija).
// Sin scripts en línea ni eval: una inyección de HTML no puede correr código ni mandar datos
// a otro lado. Los workers "blob:" son los que usa la librería de Excel para comprimir.
export const CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
].join('; ');

export const CABECERAS_SEGURIDAD = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};
