// ===== Walletera | main.js =====
// Capa de presentación: DOM, eventos, render y librerías externas.

// ===== Estado de UI =====
let filtroActual = 'todos';
let busquedaActual = '';
let graficoCategorias = null;
let focoPrevio = null;

// ===== Tema (se aplica de inmediato para evitar parpadeo) =====
const CLAVE_TEMA = 'walletera_tema';
function temaInicial() {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    if (guardado) return guardado;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}
document.documentElement.setAttribute('data-tema', temaInicial());

// Paleta categórica cohesiva (derivada de la marca, no flat-UI 2014)
const PALETA_GRAFICO = [
    'oklch(0.62 0.19 280)', 'oklch(0.66 0.16 250)', 'oklch(0.70 0.14 215)',
    'oklch(0.72 0.14 180)', 'oklch(0.72 0.15 150)', 'oklch(0.78 0.15 110)',
    'oklch(0.80 0.15 80)',  'oklch(0.72 0.16 45)',  'oklch(0.66 0.18 20)',
    'oklch(0.62 0.16 335)'
];

// ===== Inicio =====
iniciar();
async function iniciar() {
    configurarTema();
    mostrarSkeletons();
    await inicializarDatos();
    configurarNavegacion();
    configurarModales();
    configurarFormularioCategoria();
    configurarFormularioMovimiento();
    configurarBuscadorYFiltros();
    configurarBotones();
    renderizarTodo();
}
function renderizarTodo() {
    renderizarDashboard();
    renderizarCategorias();
    renderizarMovimientos();
    renderizarEstadisticas();
    const seccionEstadisticas = document.getElementById('estadisticas');
    if (seccionEstadisticas && seccionEstadisticas.classList.contains('activa')) renderizarGrafico();
}

// ===== Tema =====
function configurarTema() {
    aplicarTema(document.documentElement.getAttribute('data-tema'));
    document.getElementById('btnTema').addEventListener('click', () => {
        const actual = document.documentElement.getAttribute('data-tema');
        aplicarTema(actual === 'oscuro' ? 'claro' : 'oscuro');
    });
}
function aplicarTema(tema) {
    document.documentElement.setAttribute('data-tema', tema);
    localStorage.setItem(CLAVE_TEMA, tema);
    const meta = document.getElementById('metaThemeColor');
    if (meta) meta.setAttribute('content', tema === 'oscuro' ? '#221d31' : '#6C5CE7');
    if (graficoCategorias) renderizarGrafico();
}

// ===== Navegación SPA =====
function configurarNavegacion() {
    document.querySelectorAll('[data-seccion]').forEach(btn => {
        btn.addEventListener('click', () => irASeccion(btn.dataset.seccion));
    });
}
function irASeccion(idSeccion) {
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.getElementById(idSeccion).classList.add('activa');
    document.querySelectorAll('.nav-btn').forEach(b => {
        const activa = b.dataset.seccion === idSeccion;
        b.classList.toggle('activa', activa);
        if (activa) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
    if (idSeccion === 'estadisticas') renderizarGrafico();
}

// ===== Skeletons de carga =====
function mostrarSkeletons() {
    const filas = n => Array.from({ length: n }, () => '<li class="skeleton skel-fila"></li>').join('');
    ['ultimosMovimientos', 'listaMovimientos'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = filas(4);
    });
    ['resumenCategorias', 'listaCategorias'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = filas(3);
    });
}

// ===== Estado vacío compuesto =====
function htmlVacio(icono, titulo, sub) {
    return `<li class="vacio">
        <i class="ph ${icono}" aria-hidden="true"></i>
        <strong>${titulo}</strong>
        ${sub ? `<span>${sub}</span>` : ''}
    </li>`;
}

// ===== Dashboard =====
function renderizarDashboard() {
    document.getElementById('saldoDisponible').textContent     = formatearMoneda(calcularSaldoDisponible());
    document.getElementById('fondoMensual').textContent        = formatearMoneda(obtenerFondoMensual());
    document.getElementById('totalGastado').textContent        = formatearMoneda(calcularTotalGastado());
    document.getElementById('cantidadMovimientos').textContent = calcularCantidadMovimientos();
    document.getElementById('porcentajeUtilizado').textContent = `${calcularPorcentajeUtilizado().toFixed(1)}%`;
    renderizarUltimosMovimientos();
    renderizarResumenCategorias();
}
function renderizarUltimosMovimientos() {
    const cont = document.getElementById('ultimosMovimientos');
    const ultimos = obtenerMovimientos().slice(0, 5);
    if (ultimos.length === 0) {
        cont.innerHTML = htmlVacio('ph-tray', 'Todavía no hay movimientos', 'Tocá el botón + para registrar el primero.');
        return;
    }
    cont.innerHTML = ultimos.map((m, i) => crearHTMLMovimiento(m, false, i)).join('');
}
function renderizarResumenCategorias() {
    const cont = document.getElementById('resumenCategorias');
    const cats = obtenerCategorias();
    if (cats.length === 0) {
        cont.innerHTML = htmlVacio('ph-squares-four', 'No hay categorías');
        return;
    }
    cont.innerHTML = cats.slice(0, 5).map(c => `
        <li class="categoria-mini">
            <span class="categoria-mini-icono">${c.icono}</span>
            <span class="categoria-mini-nombre">${c.nombre}</span>
            <span class="categoria-mini-monto">${formatearMoneda(c.gastado)} / ${formatearMoneda(c.presupuesto)}</span>
        </li>
    `).join('');
}

// ===== Categorías =====
function renderizarCategorias() {
    const cont = document.getElementById('listaCategorias');
    const cats = obtenerCategorias();
    if (cats.length === 0) {
        cont.innerHTML = htmlVacio('ph-squares-four', 'Todavía no hay categorías', 'Creá la primera con el botón de arriba.');
        return;
    }
    cont.innerHTML = cats.map((c, i) => {
        const disponible = c.presupuesto - c.gastado;
        const porcentaje = c.presupuesto > 0 ? (c.gastado / c.presupuesto) * 100 : 0;
        const salud = porcentaje >= 100 ? 'alerta' : (porcentaje >= 80 ? 'cerca' : '');
        return `
            <li class="categoria" style="--i:${i}">
                <div class="categoria-encabezado">
                    <span class="categoria-icono">${c.icono}</span>
                    <span class="categoria-nombre">${c.nombre}</span>
                    <div class="categoria-acciones">
                        <button class="movimiento-accion" data-editar-categoria="${c.id}" aria-label="Editar ${c.nombre}"><i class="ph ph-pencil-simple"></i></button>
                        <button class="movimiento-accion peligro" data-eliminar-categoria="${c.id}" aria-label="Eliminar ${c.nombre}"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="categoria-datos">
                    <div class="categoria-dato">
                        <span>Presupuesto</span>
                        <strong>${formatearMoneda(c.presupuesto)}</strong>
                    </div>
                    <div class="categoria-dato">
                        <span>Gastado</span>
                        <strong>${formatearMoneda(c.gastado)}</strong>
                    </div>
                    <div class="categoria-dato">
                        <span>Disponible</span>
                        <strong>${formatearMoneda(disponible)}</strong>
                    </div>
                </div>
                <div class="barra-progreso">
                    <div class="barra-progreso-relleno ${salud}" data-w="${Math.min(porcentaje, 100)}" style="width:0"></div>
                </div>
                <div class="categoria-porcentaje">${porcentaje.toFixed(1)}% utilizado</div>
            </li>
        `;
    }).join('');
    // Animar barras desde 0 hasta su valor real
    requestAnimationFrame(() => {
        cont.querySelectorAll('.barra-progreso-relleno').forEach(b => { b.style.width = `${b.dataset.w}%`; });
    });
    cont.querySelectorAll('[data-editar-categoria]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalCategoria(btn.dataset.editarCategoria));
    });
    cont.querySelectorAll('[data-eliminar-categoria]').forEach(btn => {
        btn.addEventListener('click', () => confirmarEliminarCategoria(btn.dataset.eliminarCategoria));
    });
}

// ===== Movimientos =====
function renderizarMovimientos() {
    const cont = document.getElementById('listaMovimientos');
    const lista = buscarYFiltrar(busquedaActual, filtroActual);
    if (lista.length === 0) {
        const vacio = busquedaActual || filtroActual !== 'todos'
            ? htmlVacio('ph-magnifying-glass', 'Sin resultados', 'Probá con otro texto o filtro.')
            : htmlVacio('ph-tray', 'Todavía no hay movimientos', 'Tocá el botón + para registrar el primero.');
        cont.innerHTML = vacio;
        return;
    }
    cont.innerHTML = lista.map((m, i) => crearHTMLMovimiento(m, true, i)).join('');
    cont.querySelectorAll('[data-editar-movimiento]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalMovimiento(btn.dataset.editarMovimiento));
    });
    cont.querySelectorAll('[data-eliminar-movimiento]').forEach(btn => {
        btn.addEventListener('click', () => confirmarEliminarMovimiento(btn.dataset.eliminarMovimiento));
    });
}
function crearHTMLMovimiento(m, conAcciones, indice = 0) {
    const cat = obtenerCategoriaPorId(m.categoriaId);
    const iconoHTML = cat
        ? `<span class="movimiento-icono">${cat.icono}</span>`
        : `<span class="movimiento-icono"><i class="ph ph-receipt"></i></span>`;
    const nombreCat = cat ? cat.nombre : 'Sin categoría';
    const signo = m.tipo === 'ingreso' ? '+' : '-';
    const acciones = conAcciones ? `
        <div class="movimiento-acciones">
            <button class="movimiento-accion" data-editar-movimiento="${m.id}" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button>
            <button class="movimiento-accion peligro" data-eliminar-movimiento="${m.id}" aria-label="Eliminar"><i class="ph ph-trash"></i></button>
        </div>
    ` : '';
    return `
        <li class="movimiento movimiento-${m.tipo}" style="--i:${indice}">
            ${iconoHTML}
            <div class="movimiento-info">
                <div class="movimiento-descripcion">${m.descripcion}</div>
                <div class="movimiento-meta">${nombreCat} · ${formatearFecha(m.fecha)}</div>
            </div>
            <div class="movimiento-monto">${signo} ${formatearMoneda(m.monto)}</div>
            ${acciones}
        </li>
    `;
}

// ===== Buscador y filtros =====
function configurarBuscadorYFiltros() {
    document.getElementById('buscador').addEventListener('input', e => {
        busquedaActual = e.target.value;
        renderizarMovimientos();
    });
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activa'));
            btn.classList.add('activa');
            filtroActual = btn.dataset.filtro;
            renderizarMovimientos();
        });
    });
}

// ===== Estadísticas =====
function renderizarEstadisticas() {
    const top = obtenerCategoriaMasGastada();
    document.getElementById('statCategoriaTop').textContent       = top && top.gastado > 0 ? `${top.icono} ${top.nombre}` : 'Sin datos';
    document.getElementById('statTotalGastado').textContent       = formatearMoneda(calcularTotalGastado());
    document.getElementById('statPromedioDiario').textContent     = formatearMoneda(calcularPromedioDiario());
    document.getElementById('statCantidadMovimientos').textContent= calcularCantidadMovimientos();
    document.getElementById('statPorcentajeConsumido').textContent= `${calcularPorcentajeUtilizado().toFixed(1)}%`;
}
function renderizarGrafico() {
    const ctx = document.getElementById('graficoCategorias');
    if (!ctx || typeof Chart === 'undefined') return;
    const contenedor = ctx.parentElement;
    const cats = obtenerCategorias().filter(c => c.gastado > 0);
    let aviso = contenedor.querySelector('.grafico-vacio');

    if (cats.length === 0) {
        if (graficoCategorias) { graficoCategorias.destroy(); graficoCategorias = null; }
        ctx.style.display = 'none';
        if (!aviso) {
            aviso = document.createElement('div');
            aviso.className = 'vacio grafico-vacio';
            aviso.innerHTML = '<i class="ph ph-chart-pie-slice" aria-hidden="true"></i><strong>Sin gastos para mostrar</strong><span>Registrá un gasto para ver el desglose.</span>';
            contenedor.appendChild(aviso);
        }
        return;
    }
    if (aviso) aviso.remove();
    ctx.style.display = '';

    const estilos = getComputedStyle(document.documentElement);
    const colorTexto = estilos.getPropertyValue('--tinta-suave').trim() || '#888';
    const colorBorde = estilos.getPropertyValue('--superficie').trim() || '#fff';

    const etiquetas = cats.map(c => `${c.icono} ${c.nombre}`);
    const valores   = cats.map(c => c.gastado);

    if (graficoCategorias) graficoCategorias.destroy();
    graficoCategorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etiquetas,
            datasets: [{
                data: valores,
                backgroundColor: PALETA_GRAFICO,
                borderColor: colorBorde,
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            animation: { duration: prefiereMenosMovimiento() ? 0 : 600, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: colorTexto,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 14,
                        font: { family: 'Manrope', size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    padding: 12,
                    cornerRadius: 10,
                    titleFont: { family: 'Manrope', weight: '700' },
                    bodyFont: { family: 'Manrope' },
                    callbacks: {
                        label: c => ` ${formatearMoneda(c.parsed)}`
                    }
                }
            }
        }
    });
}
function prefiereMenosMovimiento() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ===== Botones globales =====
function configurarBotones() {
    document.getElementById('btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria());
    document.getElementById('btnNuevoMovimiento').addEventListener('click', () => abrirModalMovimiento());
    document.getElementById('btnEditarFondo').addEventListener('click', editarFondoMensual);
}

// ===== Modales (apertura/cierre + foco accesible) =====
function configurarModales() {
    document.querySelectorAll('[data-cerrar]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(el.dataset.cerrar));
    });
}
function abrirModal(id) {
    const modal = document.getElementById(id);
    focoPrevio = document.activeElement;
    modal.classList.add('activo');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modal.addEventListener('keydown', manejarTeclasModal);
    const primerCampo = modal.querySelector('input:not([type=hidden]):not([type=date]), select, textarea, button:not(.modal-cerrar)');
    if (primerCampo) setTimeout(() => primerCampo.focus({ preventScroll: true }), 60);
}
function cerrarModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('activo');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    modal.removeEventListener('keydown', manejarTeclasModal);
    if (focoPrevio && typeof focoPrevio.focus === 'function') focoPrevio.focus({ preventScroll: true });
}
function manejarTeclasModal(e) {
    const modal = e.currentTarget;
    if (e.key === 'Escape') { cerrarModal(modal.id); return; }
    if (e.key !== 'Tab') return;
    const enfocables = [...modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.offsetParent !== null);
    if (enfocables.length === 0) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
}

// ===== Modal Categoría =====
function abrirModalCategoria(id) {
    const form = document.getElementById('formCategoria');
    form.reset();
    renderizarSelectorEmojis();
    if (id) {
        const cat = obtenerCategoriaPorId(id);
        if (!cat) return;
        document.getElementById('tituloModalCategoria').textContent = 'Editar categoría';
        document.getElementById('categoriaId').value          = cat.id;
        document.getElementById('categoriaNombre').value      = cat.nombre;
        document.getElementById('categoriaPresupuesto').value = cat.presupuesto;
        seleccionarEmoji(cat.icono);
    } else {
        document.getElementById('tituloModalCategoria').textContent = 'Nueva categoría';
        document.getElementById('categoriaId').value = '';
        seleccionarEmoji(primerIcono());
    }
    abrirModal('modalCategoria');
}
function renderizarSelectorEmojis() {
    const cont = document.getElementById('selectorEmojis');
    cont.innerHTML = obtenerGruposIconos().map(g => `
        <div class="emoji-grupo">
            <p class="emoji-grupo-titulo">${g.grupo}</p>
            <div class="emoji-grupo-grid">
                ${g.iconos.map(e => `
                    <button type="button" class="emoji-btn" data-emoji="${e}" role="radio" aria-checked="false" aria-label="Ícono ${e}">${e}</button>
                `).join('')}
            </div>
        </div>
    `).join('');
    cont.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => seleccionarEmoji(btn.dataset.emoji));
    });
}
function seleccionarEmoji(emoji) {
    document.getElementById('categoriaIcono').value = emoji;
    document.querySelectorAll('#selectorEmojis .emoji-btn').forEach(btn => {
        const activa = btn.dataset.emoji === emoji;
        btn.classList.toggle('activa', activa);
        btn.setAttribute('aria-checked', activa ? 'true' : 'false');
    });
}
function configurarFormularioCategoria() {
    document.getElementById('formCategoria').addEventListener('submit', e => {
        e.preventDefault();
        const id           = document.getElementById('categoriaId').value;
        const nombre       = document.getElementById('categoriaNombre').value;
        const icono        = document.getElementById('categoriaIcono').value;
        const presupuesto  = document.getElementById('categoriaPresupuesto').value;
        if (!icono) {
            mostrarToast('Elegí un ícono para la categoría', 'alerta');
            return;
        }
        if (id) {
            editarCategoria(id, { nombre, icono, presupuesto });
            mostrarToast('Categoría actualizada');
        } else {
            crearCategoria({ nombre, icono, presupuesto });
            mostrarToast('Categoría creada');
        }
        cerrarModal('modalCategoria');
        renderizarTodo();
    });
}
function confirmarEliminarCategoria(id) {
    Swal.fire(opcionesSwal({
        title: '¿Eliminar categoría?',
        text: 'Se eliminarán también los movimientos asociados a esta categoría.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#FF5C5C',
        cancelButtonColor: '#6B7280'
    })).then(resultado => {
        if (resultado.isConfirmed) {
            eliminarCategoria(id);
            mostrarToast('Categoría eliminada');
            renderizarTodo();
        }
    });
}

// ===== Modal Movimiento =====
function abrirModalMovimiento(id) {
    const form = document.getElementById('formMovimiento');
    form.reset();
    cargarSelectCategorias();
    if (obtenerCategorias().length === 0) {
        Swal.fire(opcionesSwal({
            title: 'Sin categorías',
            text: 'Primero creá al menos una categoría para poder registrar movimientos.',
            icon: 'info',
            confirmButtonColor: '#6C5CE7'
        }));
        return;
    }
    if (id) {
        const m = obtenerMovimientoPorId(id);
        if (!m) return;
        document.getElementById('tituloModalMovimiento').textContent = 'Editar movimiento';
        document.getElementById('movimientoId').value          = m.id;
        document.getElementById('movimientoDescripcion').value = m.descripcion;
        document.getElementById('movimientoMonto').value       = m.monto;
        document.getElementById('movimientoCategoria').value   = m.categoriaId;
        document.getElementById('movimientoFecha').value       = aFechaInput(m.fecha);
        seleccionarTipo(m.tipo);
    } else {
        document.getElementById('tituloModalMovimiento').textContent = 'Nuevo movimiento';
        document.getElementById('movimientoId').value    = '';
        document.getElementById('movimientoFecha').value = aFechaInput(Date.now());
        seleccionarTipo('gasto');
    }
    abrirModal('modalMovimiento');
}
function cargarSelectCategorias() {
    const sel = document.getElementById('movimientoCategoria');
    sel.innerHTML = obtenerCategorias()
        .map(c => `<option value="${c.id}">${c.icono} ${c.nombre}</option>`)
        .join('');
}
function seleccionarTipo(tipo) {
    document.getElementById('movimientoTipo').value = tipo;
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('activa', btn.dataset.tipo === tipo);
    });
}
function configurarFormularioMovimiento() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => seleccionarTipo(btn.dataset.tipo));
    });
    document.getElementById('formMovimiento').addEventListener('submit', e => {
        e.preventDefault();
        const id          = document.getElementById('movimientoId').value;
        const descripcion = document.getElementById('movimientoDescripcion').value;
        const monto       = document.getElementById('movimientoMonto').value;
        const categoriaId = document.getElementById('movimientoCategoria').value;
        const tipo        = document.getElementById('movimientoTipo').value;
        const fechaStr    = document.getElementById('movimientoFecha').value;
        const fecha       = new Date(fechaStr).getTime();
        if (id) {
            editarMovimiento(id, { descripcion, monto, categoriaId, tipo, fecha });
            mostrarToast('Movimiento actualizado');
        } else {
            crearMovimiento({ descripcion, monto, categoriaId, tipo, fecha });
            mostrarToast('Movimiento creado');
        }
        cerrarModal('modalMovimiento');
        renderizarTodo();
    });
}
function confirmarEliminarMovimiento(id) {
    Swal.fire(opcionesSwal({
        title: '¿Eliminar movimiento?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#FF5C5C',
        cancelButtonColor: '#6B7280'
    })).then(resultado => {
        if (resultado.isConfirmed) {
            eliminarMovimiento(id);
            mostrarToast('Movimiento eliminado');
            renderizarTodo();
        }
    });
}

// ===== Fondo mensual =====
function editarFondoMensual() {
    Swal.fire(opcionesSwal({
        title: 'Definir fondo mensual',
        input: 'number',
        inputLabel: 'Monto disponible para este mes',
        inputValue: obtenerFondoMensual(),
        inputAttributes: { min: 0, step: 100 },
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#6C5CE7',
        inputValidator: valor => {
            if (!valor || Number(valor) < 0) return 'Ingresá un monto válido';
        }
    })).then(resultado => {
        if (resultado.isConfirmed) {
            setearFondoMensual(resultado.value);
            mostrarToast('Fondo mensual actualizado');
            renderizarTodo();
        }
    });
}

// ===== SweetAlert2 con tema Walletera =====
function opcionesSwal(opciones) {
    return {
        ...opciones,
        customClass: {
            popup: 'swal-walletera',
            confirmButton: 'swal-btn-confirmar',
            cancelButton: 'swal-btn-cancelar'
        }
    };
}

// ===== Toast (Toastify) =====
function mostrarToast(mensaje, tipo) {
    const estilos = getComputedStyle(document.documentElement);
    const colores = {
        ok: estilos.getPropertyValue('--marca').trim(),
        alerta: estilos.getPropertyValue('--alerta').trim(),
        peligro: estilos.getPropertyValue('--peligro').trim()
    };
    Toastify({
        text: mensaje,
        duration: 2400,
        gravity: 'top',
        position: 'right',
        stopOnFocus: true,
        style: {
            background: colores[tipo] || colores.ok,
            color: '#fff',
            borderRadius: '12px',
            fontFamily: 'Manrope, sans-serif',
            fontWeight: '700',
            boxShadow: 'none'
        }
    }).showToast();
}

// ===== Helpers =====
function aFechaInput(timestamp) {
    const d = new Date(timestamp);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
