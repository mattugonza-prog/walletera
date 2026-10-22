// ===== Walletera | main.js =====
// Capa de presentación: DOM, eventos, render y librerías externas.
import {
    inicializarDatos,
    obtenerGruposIconos, primerIcono,
    obtenerFondoMensual, setearFondoMensual,
    obtenerCategorias, obtenerCategoriaPorId, crearCategoria, editarCategoria, eliminarCategoria,
    obtenerMovimientos, obtenerMovimientoPorId, crearMovimiento, editarMovimiento, eliminarMovimiento,
    buscarYFiltrar,
    periodoActual, nombrePeriodo, fechaHoy, esFechaISO,
    calcularResumen, calcularPromedioDiario, obtenerCategoriasConGasto, obtenerCategoriaMasGastada,
    obtenerDatosGrafico,
    formatearMoneda, formatearFecha
} from './js/datos.js';

// ===== Estado de UI =====
let filtroActual = 'todos';
let busquedaActual = '';
let graficoCategorias = null;
let focoPrevio = null;

const CLAVE_TEMA = 'walletera_tema';

// Paleta categórica cohesiva (derivada de la marca)
const PALETA_GRAFICO = [
    'oklch(0.62 0.19 280)', 'oklch(0.66 0.16 250)', 'oklch(0.70 0.14 215)',
    'oklch(0.72 0.14 180)', 'oklch(0.72 0.15 150)', 'oklch(0.78 0.15 110)',
    'oklch(0.80 0.15 80)',  'oklch(0.72 0.16 45)',  'oklch(0.66 0.18 20)',
    'oklch(0.62 0.16 335)'
];
const COLOR_SIN_CATEGORIA = 'oklch(0.70 0.01 280)';

// Todo texto que viene del usuario o del almacenamiento pasa por acá antes de ir a innerHTML.
const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = valor => String(valor).replace(/[&<>"']/g, c => ENTIDADES[c]);

const $ = id => document.getElementById(id);

// ===== Inicio =====
iniciar();

async function iniciar() {
    configurarTema();
    mostrarSkeletons();
    await inicializarDatos();
    configurarNavegacion();
    configurarModales();
    configurarListas();
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
    if ($('estadisticas').classList.contains('activa')) renderizarGrafico();
}

// ===== Tema =====
// El atributo data-tema ya lo fija el script inline del <head> para evitar parpadeo.
function configurarTema() {
    aplicarTema(document.documentElement.getAttribute('data-tema') || 'claro');
    $('btnTema').addEventListener('click', () => {
        const actual = document.documentElement.getAttribute('data-tema');
        aplicarTema(actual === 'oscuro' ? 'claro' : 'oscuro');
    });
}

function aplicarTema(tema) {
    document.documentElement.setAttribute('data-tema', tema);
    try { localStorage.setItem(CLAVE_TEMA, tema); } catch { /* sin almacenamiento */ }
    $('metaThemeColor')?.setAttribute('content', tema === 'oscuro' ? '#221d31' : '#6C5CE7');
    if (graficoCategorias) renderizarGrafico();
}

// ===== Navegación SPA =====
function configurarNavegacion() {
    document.querySelectorAll('[data-seccion]').forEach(btn => {
        btn.addEventListener('click', () => irASeccion(btn.dataset.seccion));
    });
}

function irASeccion(idSeccion) {
    document.querySelectorAll('.seccion').forEach(s => s.classList.toggle('activa', s.id === idSeccion));
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
    const filas = n => '<li class="skeleton skel-fila"></li>'.repeat(n);
    ['ultimosMovimientos', 'listaMovimientos'].forEach(id => { $(id).innerHTML = filas(4); });
    ['resumenCategorias', 'listaCategorias'].forEach(id => { $(id).innerHTML = filas(3); });
}

// ===== Estado vacío =====
function htmlVacio(icono, titulo, sub) {
    return `<li class="vacio">
        <i class="ph ${icono}" aria-hidden="true"></i>
        <strong>${titulo}</strong>
        ${sub ? `<span>${sub}</span>` : ''}
    </li>`;
}

// ===== Dashboard =====
function renderizarDashboard() {
    const resumen = calcularResumen();
    $('periodoSaldo').textContent         = nombrePeriodo(periodoActual());
    $('saldoDisponible').textContent      = formatearMoneda(resumen.saldo);
    $('fondoMensual').textContent         = formatearMoneda(resumen.fondo);
    $('ingresosMes').textContent          = formatearMoneda(resumen.ingresos);
    $('totalGastado').textContent         = formatearMoneda(resumen.gastos);
    $('cantidadMovimientos').textContent  = resumen.cantidad;
    $('porcentajeUtilizado').textContent  = `${resumen.porcentajeUtilizado.toFixed(1)}%`;
    renderizarUltimosMovimientos();
    renderizarResumenCategorias();
}

function renderizarUltimosMovimientos() {
    const ultimos = obtenerMovimientos().slice(0, 5);
    $('ultimosMovimientos').innerHTML = ultimos.length
        ? ultimos.map((m, i) => crearHTMLMovimiento(m, false, i)).join('')
        : htmlVacio('ph-tray', 'Todavía no hay movimientos', 'Tocá el botón + para registrar el primero.');
}

function renderizarResumenCategorias() {
    const cats = obtenerCategoriasConGasto();
    $('resumenCategorias').innerHTML = cats.length
        ? cats.slice(0, 5).map(c => `
            <li class="categoria-mini">
                <span class="categoria-mini-icono">${esc(c.icono)}</span>
                <span class="categoria-mini-nombre">${esc(c.nombre)}</span>
                <span class="categoria-mini-monto">${formatearMoneda(c.gastado)} / ${formatearMoneda(c.presupuesto)}</span>
            </li>
        `).join('')
        : htmlVacio('ph-squares-four', 'No hay categorías');
}

// ===== Categorías =====
function renderizarCategorias() {
    const cont = $('listaCategorias');
    const cats = obtenerCategoriasConGasto();
    if (cats.length === 0) {
        cont.innerHTML = htmlVacio('ph-squares-four', 'Todavía no hay categorías', 'Creá la primera con el botón de arriba.');
        return;
    }
    cont.innerHTML = cats.map((c, i) => {
        const disponible = c.presupuesto - c.gastado;
        const porcentaje = c.presupuesto > 0 ? (c.gastado / c.presupuesto) * 100 : 0;
        const salud = porcentaje >= 100 ? 'alerta' : (porcentaje >= 80 ? 'cerca' : '');
        const nombre = esc(c.nombre);
        const id = esc(c.id);
        return `
            <li class="categoria" style="--i:${i}">
                <div class="categoria-encabezado">
                    <span class="categoria-icono">${esc(c.icono)}</span>
                    <span class="categoria-nombre">${nombre}</span>
                    <div class="categoria-acciones">
                        <button class="movimiento-accion" type="button" data-editar-categoria="${id}" aria-label="Editar ${nombre}"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
                        <button class="movimiento-accion peligro" type="button" data-eliminar-categoria="${id}" aria-label="Eliminar ${nombre}"><i class="ph ph-trash" aria-hidden="true"></i></button>
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
}

// ===== Movimientos =====
function renderizarMovimientos() {
    const lista = buscarYFiltrar(busquedaActual, filtroActual);
    if (lista.length === 0) {
        $('listaMovimientos').innerHTML = busquedaActual || filtroActual !== 'todos'
            ? htmlVacio('ph-magnifying-glass', 'Sin resultados', 'Probá con otro texto o filtro.')
            : htmlVacio('ph-tray', 'Todavía no hay movimientos', 'Tocá el botón + para registrar el primero.');
        return;
    }
    $('listaMovimientos').innerHTML = lista.map((m, i) => crearHTMLMovimiento(m, true, i)).join('');
}

function crearHTMLMovimiento(m, conAcciones, indice = 0) {
    const cat = m.categoriaId ? obtenerCategoriaPorId(m.categoriaId) : null;
    const esIngreso = m.tipo === 'ingreso';
    let icono = '<i class="ph ph-receipt" aria-hidden="true"></i>';
    let etiqueta = 'Sin categoría';
    if (esIngreso) {
        icono = '<i class="ph ph-arrow-down-left" aria-hidden="true"></i>';
        etiqueta = 'Ingreso';
    } else if (cat) {
        icono = esc(cat.icono);
        etiqueta = esc(cat.nombre);
    }
    const descripcion = esc(m.descripcion);
    const id = esc(m.id);
    const acciones = conAcciones ? `
        <div class="movimiento-acciones">
            <button class="movimiento-accion" type="button" data-editar-movimiento="${id}" aria-label="Editar ${descripcion}"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
            <button class="movimiento-accion peligro" type="button" data-eliminar-movimiento="${id}" aria-label="Eliminar ${descripcion}"><i class="ph ph-trash" aria-hidden="true"></i></button>
        </div>
    ` : '';
    return `
        <li class="movimiento movimiento-${m.tipo}" style="--i:${indice}">
            <span class="movimiento-icono">${icono}</span>
            <div class="movimiento-info">
                <div class="movimiento-descripcion">${descripcion}</div>
                <div class="movimiento-meta">${etiqueta} · ${formatearFecha(m.fecha)}</div>
            </div>
            <div class="movimiento-monto">${esIngreso ? '+' : '-'} ${formatearMoneda(m.monto)}</div>
            ${acciones}
        </li>
    `;
}

// Un solo listener por lista (delegación), en lugar de re-enlazar en cada render.
function configurarListas() {
    $('listaCategorias').addEventListener('click', e => {
        const editar = e.target.closest('[data-editar-categoria]');
        const eliminar = e.target.closest('[data-eliminar-categoria]');
        if (editar) abrirModalCategoria(editar.dataset.editarCategoria);
        else if (eliminar) confirmarEliminarCategoria(eliminar.dataset.eliminarCategoria);
    });
    $('listaMovimientos').addEventListener('click', e => {
        const editar = e.target.closest('[data-editar-movimiento]');
        const eliminar = e.target.closest('[data-eliminar-movimiento]');
        if (editar) abrirModalMovimiento(editar.dataset.editarMovimiento);
        else if (eliminar) confirmarEliminarMovimiento(eliminar.dataset.eliminarMovimiento);
    });
    $('selectorEmojis').addEventListener('click', e => {
        const btn = e.target.closest('.emoji-btn');
        if (btn) seleccionarEmoji(btn.dataset.emoji);
    });
}

// ===== Buscador y filtros =====
function configurarBuscadorYFiltros() {
    $('buscador').addEventListener('input', e => {
        busquedaActual = e.target.value;
        renderizarMovimientos();
    });
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => {
                const activa = b === btn;
                b.classList.toggle('activa', activa);
                b.setAttribute('aria-pressed', String(activa));
            });
            filtroActual = btn.dataset.filtro;
            renderizarMovimientos();
        });
    });
}

// ===== Estadísticas =====
function renderizarEstadisticas() {
    const resumen = calcularResumen();
    const top = obtenerCategoriaMasGastada();
    $('statCategoriaTop').textContent        = top ? `${top.icono} ${top.nombre}` : 'Sin datos';
    $('statTotalGastado').textContent        = formatearMoneda(resumen.gastos);
    $('statPromedioDiario').textContent      = formatearMoneda(calcularPromedioDiario());
    $('statCantidadMovimientos').textContent = resumen.cantidad;
    $('statPorcentajeConsumido').textContent = `${resumen.porcentajeUtilizado.toFixed(1)}%`;
}

function renderizarGrafico() {
    const ctx = $('graficoCategorias');
    if (!ctx || typeof Chart === 'undefined') return;
    const contenedor = ctx.parentElement;
    const datos = obtenerDatosGrafico();
    let aviso = contenedor.querySelector('.grafico-vacio');

    if (datos.length === 0) {
        graficoCategorias?.destroy();
        graficoCategorias = null;
        ctx.style.display = 'none';
        if (!aviso) {
            aviso = document.createElement('div');
            aviso.className = 'vacio grafico-vacio';
            aviso.innerHTML = '<i class="ph ph-chart-pie-slice" aria-hidden="true"></i><strong>Sin gastos este mes</strong><span>Registrá un gasto para ver el desglose.</span>';
            contenedor.appendChild(aviso);
        }
        return;
    }
    aviso?.remove();
    ctx.style.display = '';

    const estilos = getComputedStyle(document.documentElement);
    const colorTexto = estilos.getPropertyValue('--tinta-suave').trim() || '#888';
    const colorBorde = estilos.getPropertyValue('--superficie').trim() || '#fff';
    const colores = datos.map((d, i) => d.sinCategoria ? COLOR_SIN_CATEGORIA : PALETA_GRAFICO[i % PALETA_GRAFICO.length]);

    graficoCategorias?.destroy();
    graficoCategorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: datos.map(d => d.etiqueta),
            datasets: [{
                data: datos.map(d => d.valor),
                backgroundColor: colores,
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
    $('btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria());
    $('btnNuevoMovimiento').addEventListener('click', () => abrirModalMovimiento());
    $('btnEditarFondo').addEventListener('click', editarFondoMensual);
}

// ===== Modales (apertura/cierre + foco accesible) =====
function configurarModales() {
    document.querySelectorAll('[data-cerrar]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(el.dataset.cerrar));
    });
}

function abrirModal(id) {
    const modal = $(id);
    focoPrevio = document.activeElement;
    modal.classList.add('activo');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modal.addEventListener('keydown', manejarTeclasModal);
    const primerCampo = modal.querySelector('input:not([type=hidden]):not([type=date]), select, textarea, button:not(.modal-cerrar)');
    if (primerCampo) setTimeout(() => primerCampo.focus({ preventScroll: true }), 60);
}

function cerrarModal(id) {
    const modal = $(id);
    modal.classList.remove('activo');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    modal.removeEventListener('keydown', manejarTeclasModal);
    focoPrevio?.focus?.({ preventScroll: true });
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
    $('formCategoria').reset();
    renderizarSelectorEmojis();
    if (id) {
        const cat = obtenerCategoriaPorId(id);
        if (!cat) return;
        $('tituloModalCategoria').textContent = 'Editar categoría';
        $('categoriaId').value          = cat.id;
        $('categoriaNombre').value      = cat.nombre;
        $('categoriaPresupuesto').value = cat.presupuesto;
        seleccionarEmoji(cat.icono);
    } else {
        $('tituloModalCategoria').textContent = 'Nueva categoría';
        $('categoriaId').value = '';
        seleccionarEmoji(primerIcono());
    }
    abrirModal('modalCategoria');
}

function renderizarSelectorEmojis() {
    $('selectorEmojis').innerHTML = obtenerGruposIconos().map(g => `
        <div class="emoji-grupo">
            <p class="emoji-grupo-titulo">${esc(g.grupo)}</p>
            <div class="emoji-grupo-grid">
                ${g.iconos.map(e => `
                    <button type="button" class="emoji-btn" data-emoji="${esc(e)}" role="radio" aria-checked="false" aria-label="Ícono ${esc(e)}">${esc(e)}</button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function seleccionarEmoji(emoji) {
    $('categoriaIcono').value = emoji;
    document.querySelectorAll('#selectorEmojis .emoji-btn').forEach(btn => {
        const activa = btn.dataset.emoji === emoji;
        btn.classList.toggle('activa', activa);
        btn.setAttribute('aria-checked', activa ? 'true' : 'false');
    });
}

function configurarFormularioCategoria() {
    $('formCategoria').addEventListener('submit', e => {
        e.preventDefault();
        const id          = $('categoriaId').value;
        const nombre      = $('categoriaNombre').value;
        const icono       = $('categoriaIcono').value;
        const presupuesto = $('categoriaPresupuesto').value;
        if (!nombre.trim()) {
            mostrarToast('Escribí un nombre para la categoría', 'alerta');
            return;
        }
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
        text: 'Sus movimientos se conservan y quedan como "Sin categoría".',
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
    $('formMovimiento').reset();
    cargarSelectCategorias();
    if (id) {
        const m = obtenerMovimientoPorId(id);
        if (!m) return;
        $('tituloModalMovimiento').textContent = 'Editar movimiento';
        $('movimientoId').value          = m.id;
        $('movimientoDescripcion').value = m.descripcion;
        $('movimientoMonto').value       = m.monto;
        $('movimientoFecha').value       = m.fecha;
        if (m.categoriaId && obtenerCategoriaPorId(m.categoriaId)) $('movimientoCategoria').value = m.categoriaId;
        seleccionarTipo(m.tipo);
    } else {
        $('tituloModalMovimiento').textContent = 'Nuevo movimiento';
        $('movimientoId').value    = '';
        $('movimientoFecha').value = fechaHoy();
        seleccionarTipo('gasto');
    }
    abrirModal('modalMovimiento');
}

function cargarSelectCategorias() {
    const opciones = obtenerCategorias()
        .map(c => `<option value="${esc(c.id)}">${esc(c.icono)} ${esc(c.nombre)}</option>`)
        .join('');
    $('movimientoCategoria').innerHTML = '<option value="">Sin categoría</option>' + opciones;
}

// Los ingresos no llevan categoría: las categorías son rubros de gasto con presupuesto.
function seleccionarTipo(tipo) {
    $('movimientoTipo').value = tipo;
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        const activa = btn.dataset.tipo === tipo;
        btn.classList.toggle('activa', activa);
        btn.setAttribute('aria-pressed', String(activa));
    });
    $('campoCategoria').hidden = tipo !== 'gasto';
}

function configurarFormularioMovimiento() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => seleccionarTipo(btn.dataset.tipo));
    });
    $('formMovimiento').addEventListener('submit', e => {
        e.preventDefault();
        const id          = $('movimientoId').value;
        const descripcion = $('movimientoDescripcion').value;
        const monto       = Number($('movimientoMonto').value);
        const categoriaId = $('movimientoCategoria').value;
        const tipo        = $('movimientoTipo').value;
        const fecha       = $('movimientoFecha').value;
        if (!descripcion.trim()) {
            mostrarToast('Escribí una descripción', 'alerta');
            return;
        }
        if (!(monto > 0)) {
            mostrarToast('El monto tiene que ser mayor a cero', 'alerta');
            return;
        }
        if (!esFechaISO(fecha)) {
            mostrarToast('Elegí una fecha válida', 'alerta');
            return;
        }
        const datos = { descripcion, monto, categoriaId, tipo, fecha };
        if (id) {
            editarMovimiento(id, datos);
            mostrarToast('Movimiento actualizado');
        } else {
            crearMovimiento(datos);
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
        inputLabel: 'Monto disponible para cada mes',
        inputValue: obtenerFondoMensual(),
        inputAttributes: { min: 0, step: '0.01', inputmode: 'decimal' },
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#6C5CE7',
        inputValidator: valor => {
            const monto = Number(valor);
            if (valor === '' || !Number.isFinite(monto) || monto < 0) return 'Ingresá un monto válido';
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
