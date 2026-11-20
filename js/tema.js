// ===== Walletera | tema.js =====
// Se carga en el <head> sin defer: aplica el tema y la privacidad antes del primer pintado,
// para evitar el parpadeo. Está en un archivo (y no en línea) para que la Content Security
// Policy no tenga que permitir scripts en línea.
try {
    const tema = localStorage.getItem('walletera_tema');
    document.documentElement.setAttribute('data-tema', tema === 'claro' ? 'claro' : 'oscuro');
    if (localStorage.getItem('walletera_ocultar_montos') === '1') document.documentElement.classList.add('ocultar-montos');
} catch { /* sin almacenamiento: queda el tema por defecto (oscuro) */ }
