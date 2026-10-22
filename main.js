// ===== Walletera | main.js =====
// Capa de presentación: DOM, eventos, render y librerías externas.
import {
    TIPOS_CUENTA,
    inicializarDatos,
    obtenerGruposIconos, primerIcono,
    obtenerCuentas, obtenerCuentaPorId, crearCuenta, editarCuenta, eliminarCuenta,
    contarMovimientosDeCuenta, obtenerCuentasConSaldo, calcularSaldoTotal,
    obtenerCategorias, obtenerCategoriaPorId, crearCategoria, editarCategoria, eliminarCategoria,
    obtenerMovimientos, obtenerMovimientoPorId, crearMovimiento, editarMovimiento, eliminarMovimiento,
    buscarYFiltrar,
    periodoActual, desplazarPeriodo, nombrePeriodo, fechaHoy, esFechaISO,
    calcularResumen, calcularPromedioDiario, calcularVariacionGastos,
    obtenerCategoriasConMonto, obtenerCategoriaMasGastada, obtenerDatosGrafico,
    formatearMoneda, formatearFecha
} from './js/datos.js';

// ===== Estado de UI =====
let periodo = periodoActual();
let filtroActual = 'todos';
let busquedaActual = '';
let tipoCategoriaActual = 'gasto';
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
    configurarPeriodo();
    configurarModales();
    configurarListas();
    configurarFormularioCuenta();
    configurarFormularioCategoria();
    configurarFormularioMovimiento();
    configurarBuscadorYFiltros();
    configurarBotones();
    renderizarTodo();
}

function renderizarTodo() {
    renderizarPeriodo();
    renderizarDashboard();
    renderizarCuentas();
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
    // Los saldos de cuentas son acumulados: el selector de mes no aplica ahí.
    $('selectorPeriodo').hidden = idSeccion === 'cuentas';
    if (idSeccion === 'estadisticas') renderizarGrafico();
}

// ===== Selector de período =====
function configurarPeriodo() {
    $('btnPeriodoAnterior').addEventListener('click', () => cambiarPeriodo(-1));
    $('btnPeriodoSiguiente').addEventListener('click', () => cambiarPeriodo(1));
}

function cambiarPeriodo(meses) {
    const nuevo = desplazarPeriodo(periodo, meses);
    if (nuevo > periodoActual()) return;
    periodo = nuevo;
    renderizarTodo();
}

function renderizarPeriodo() {
    $('periodoNombre').textContent = nombrePeriodo(periodo);
    $('btnPeriodoSiguiente').disabled = periodo >= periodoActual();
}

// ===== Skeletons de carga =====
function mostrarSkeletons() {
    const filas = n => '<li class="skeleton skel-fila"></li>'.repeat(n);
    ['ultimosMovimientos', 'listaMovimientos'].forEach(id => { $(id).innerHTML = filas(4); });
    ['resumenCuentas', 'resumenCategorias', 'listaCuentas', 'listaCategorias'].forEach(id => { $(id).innerHTML = filas(3); });
}

// ===== Estado vacío =====
function htmlVacio(icono, titulo, sub) {
    return `<li class="vacio">
        <i class="ph ${icono}" aria-hidden="true"></i>
        <strong>${titulo}</strong>
        ${sub ? `<span>${sub}</span>` : ''}
    </li>`;
}

const formatearPorcentaje = valor => `${valor.toFixed(1)}%`;

function formatearConSigno(monto) {
    return monto > 0 ? `+ ${formatearMoneda(monto)}` : formatearMoneda(monto);
}

// ===== Dashboard =====
function renderizarDashboard() {
    const resumen = calcularResumen(periodo);
    const cantidadCuentas = obtenerCuentas().length;
    $('saldoTotal').textContent            = formatearMoneda(calcularSaldoTotal());
    $('saldoCuentas').textContent          = cantidadCuentas === 1 ? 'En 1 cuenta' : `En ${cantidadCuentas} cuentas`;
    $('ingresosMes').textContent           = formatearMoneda(resumen.ingresos);
    $('gastosMes').textContent             = formatearMoneda(resumen.gastos);
    $('resultadoMes').textContent          = formatearConSigno(resumen.resultado);
    $('cantidadMovimientos').textContent   = resumen.cantidad;
    $('porcentajePresupuesto').textContent = formatearPorcentaje(resumen.porcentajePresupuesto);
    $('promedioDiario').textContent        = formatearMoneda(calcularPromedioDiario(periodo));
    renderizarResumenCuentas();
    renderizarUltimosMovimientos();
    renderizarResumenCategorias();
}

function renderizarResumenCuentas() {
    const cuentas = obtenerCuentasConSaldo();
    $('resumenCuentas').innerHTML = cuentas.length
        ? cuentas.map(c => `
            <li class="categoria-mini">
                <span class="categoria-mini-icono"><i class="ph ${TIPOS_CUENTA[c.tipo].icono}" aria-hidden="true"></i></span>
                <span class="categoria-mini-nombre">${esc(c.nombre)}</span>
                <span class="categoria-mini-monto ${c.saldo < 0 ? 'negativo' : ''}">${formatearMoneda(c.saldo)}</span>
            </li>
        `).join('')
        : htmlVacio('ph-wallet', 'No hay cuentas', 'Creá una para empezar a registrar movimientos.');
}

function renderizarUltimosMovimientos() {
    const ultimos = obtenerMovimientos(periodo).slice(0, 5);
    $('ultimosMovimientos').innerHTML = ultimos.length
        ? ultimos.map((m, i) => crearHTMLMovimiento(m, false, i)).join('')
        : htmlVacio('ph-tray', 'Sin movimientos este mes', 'Tocá el botón + para registrar uno.');
}

function renderizarResumenCategorias() {
    const cats = obtenerCategoriasConMonto('gasto', periodo);
    $('resumenCategorias').innerHTML = cats.length
        ? cats.slice(0, 5).map(c => `
            <li class="categoria-mini">
                <span class="categoria-mini-icono">${esc(c.icono)}</span>
                <span class="categoria-mini-nombre">${esc(c.nombre)}</span>
                <span class="categoria-mini-monto">${formatearMoneda(c.monto)} / ${formatearMoneda(c.presupuesto)}</span>
            </li>
        `).join('')
        : htmlVacio('ph-squares-four', 'No hay categorías de gasto');
}

// ===== Cuentas =====
function renderizarCuentas() {
    const cuentas = obtenerCuentasConSaldo();
    if (cuentas.length === 0) {
        $('listaCuentas').innerHTML = htmlVacio('ph-wallet', 'Todavía no hay cuentas', 'Creá la primera con el botón de arriba.');
        return;
    }
    $('listaCuentas').innerHTML = cuentas.map((c, i) => {
        const nombre = esc(c.nombre);
        const id = esc(c.id);
        return `
            <li class="movimiento cuenta" style="--i:${i}">
                <span class="movimiento-icono"><i class="ph ${TIPOS_CUENTA[c.tipo].icono}" aria-hidden="true"></i></span>
                <div class="movimiento-info">
                    <div class="movimiento-descripcion">${nombre}</div>
                    <div class="movimiento-meta">${TIPOS_CUENTA[c.tipo].nombre}</div>
                </div>
                <div class="movimiento-monto ${c.saldo < 0 ? 'negativo' : ''}">${formatearMoneda(c.saldo)}</div>
                <div class="movimiento-acciones">
                    <button class="movimiento-accion" type="button" data-editar-cuenta="${id}" aria-label="Editar ${nombre}"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
                    <button class="movimiento-accion peligro" type="button" data-eliminar-cuenta="${id}" aria-label="Eliminar ${nombre}"><i class="ph ph-trash" aria-hidden="true"></i></button>
                </div>
            </li>
        `;
    }).join('');
}

// ===== Categorías =====
function renderizarCategorias() {
    const cont = $('listaCategorias');
    const cats = obtenerCategoriasConMonto(tipoCategoriaActual, periodo);
    if (cats.length === 0) {
        cont.innerHTML = htmlVacio('ph-squares-four', 'Todavía no hay categorías', 'Creá la primera con el botón de arriba.');
        return;
    }
    const mes = nombrePeriodo(periodo).split(' ')[0];
    cont.innerHTML = cats.map((c, i) => {
        const nombre = esc(c.nombre);
        const id = esc(c.id);
        const encabezado = `
            <div class="categoria-encabezado">
                <span class="categoria-icono">${esc(c.icono)}</span>
                <span class="categoria-nombre">${nombre}</span>
                <div class="categoria-acciones">
                    <button class="movimiento-accion" type="button" data-editar-categoria="${id}" aria-label="Editar ${nombre}"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
                    <button class="movimiento-accion peligro" type="button" data-eliminar-categoria="${id}" aria-label="Eliminar ${nombre}"><i class="ph ph-trash" aria-hidden="true"></i></button>
                </div>
            </div>`;
        if (c.tipo === 'ingreso') {
            return `
                <li class="categoria" style="--i:${i}">
                    ${encabezado}
                    <div class="categoria-dato">
                        <span>Recibido en ${mes}</span>
                        <strong>${formatearMoneda(c.monto)}</strong>
                    </div>
                </li>
            `;
        }
        const disponible = c.presupuesto - c.monto;
        const porcentaje = c.presupuesto > 0 ? (c.monto / c.presupuesto) * 100 : 0;
        const salud = porcentaje >= 100 ? 'alerta' : (porcentaje >= 80 ? 'cerca' : '');
        return `
            <li class="categoria" style="--i:${i}">
                ${encabezado}
                <div class="categoria-datos">
                    <div class="categoria-dato">
                        <span>Presupuesto</span>
                        <strong>${formatearMoneda(c.presupuesto)}</strong>
                    </div>
                    <div class="categoria-dato">
                        <span>Gastado</span>
                        <strong>${formatearMoneda(c.monto)}</strong>
                    </div>
                    <div class="categoria-dato">
                        <span>Disponible</span>
                        <strong>${formatearMoneda(disponible)}</strong>
                    </div>
                </div>
                <div class="barra-progreso">
                    <div class="barra-progreso-relleno ${salud}" data-w="${Math.min(porcentaje, 100)}" style="width:0"></div>
                </div>
                <div class="categoria-porcentaje">${formatearPorcentaje(porcentaje)} utilizado</div>
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
    const lista = buscarYFiltrar(busquedaActual, filtroActual, periodo);
    if (lista.length === 0) {
        $('listaMovimientos').innerHTML = busquedaActual || filtroActual !== 'todos'
            ? htmlVacio('ph-magnifying-glass', 'Sin resultados', 'Probá con otro texto, filtro o mes.')
            : htmlVacio('ph-tray', 'Sin movimientos este mes', 'Tocá el botón + para registrar uno.');
        return;
    }
    $('listaMovimientos').innerHTML = lista.map((m, i) => crearHTMLMovimiento(m, true, i)).join('');
}

const nombreCuenta = id => esc(obtenerCuentaPorId(id)?.nombre ?? 'Cuenta eliminada');

function crearHTMLMovimiento(m, conAcciones, indice = 0) {
    let icono;
    let detalle;
    let monto;
    if (m.tipo === 'transferencia') {
        icono = '<i class="ph ph-arrows-left-right" aria-hidden="true"></i>';
        detalle = `${nombreCuenta(m.cuentaId)} → ${nombreCuenta(m.cuentaDestinoId)}`;
        monto = formatearMoneda(m.monto);
    } else {
        const cat = m.categoriaId ? obtenerCategoriaPorId(m.categoriaId) : null;
        const iconoDefecto = m.tipo === 'ingreso' ? 'ph-arrow-down-left' : 'ph-receipt';
        icono = cat ? esc(cat.icono) : `<i class="ph ${iconoDefecto}" aria-hidden="true"></i>`;
        detalle = `${cat ? esc(cat.nombre) : 'Sin categoría'} · ${nombreCuenta(m.cuentaId)}`;
        monto = `${m.tipo === 'ingreso' ? '+' : '-'} ${formatearMoneda(m.monto)}`;
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
                <div class="movimiento-meta">${detalle} · ${formatearFecha(m.fecha)}</div>
            </div>
            <div class="movimiento-monto">${monto}</div>
            ${acciones}
        </li>
    `;
}

// Un solo listener por lista (delegación), en lugar de re-enlazar en cada render.
function delegar(idLista, acciones) {
    $(idLista).addEventListener('click', e => {
        for (const [atributo, accion] of Object.entries(acciones)) {
            const btn = e.target.closest(`[data-${atributo}]`);
            if (btn) return accion(btn.getAttribute(`data-${atributo}`));
        }
    });
}

function configurarListas() {
    delegar('listaCuentas', {
        'editar-cuenta': id => abrirModalCuenta(id),
        'eliminar-cuenta': confirmarEliminarCuenta
    });
    delegar('listaCategorias', {
        'editar-categoria': id => abrirModalCategoria(id),
        'eliminar-categoria': confirmarEliminarCategoria
    });
    delegar('listaMovimientos', {
        'editar-movimiento': id => abrirModalMovimiento(id),
        'eliminar-movimiento': confirmarEliminarMovimiento
    });
    delegar('selectorEmojis', { emoji: seleccionarEmoji });
}

// ===== Buscador y filtros =====
function activarEnGrupo(grupo, activo) {
    grupo.querySelectorAll('.filtro-btn').forEach(b => {
        b.classList.toggle('activa', b === activo);
        b.setAttribute('aria-pressed', String(b === activo));
    });
}

function configurarBuscadorYFiltros() {
    $('buscador').addEventListener('input', e => {
        busquedaActual = e.target.value;
        renderizarMovimientos();
    });
    $('filtrosMovimientos').querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activarEnGrupo($('filtrosMovimientos'), btn);
            filtroActual = btn.dataset.filtro;
            renderizarMovimientos();
        });
    });
    $('filtrosCategorias').querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activarEnGrupo($('filtrosCategorias'), btn);
            tipoCategoriaActual = btn.dataset.tipoCategoria;
            renderizarCategorias();
        });
    });
}

// ===== Estadísticas =====
function renderizarEstadisticas() {
    const resumen = calcularResumen(periodo);
    const top = obtenerCategoriaMasGastada(periodo);
    const variacion = calcularVariacionGastos(periodo);
    $('statCategoriaTop').textContent          = top ? `${top.icono} ${top.nombre}` : 'Sin datos';
    $('statTotalGastado').textContent          = formatearMoneda(resumen.gastos);
    $('statTotalIngresos').textContent         = formatearMoneda(resumen.ingresos);
    $('statPromedioDiario').textContent        = formatearMoneda(calcularPromedioDiario(periodo));
    $('statPorcentajePresupuesto').textContent = formatearPorcentaje(resumen.porcentajePresupuesto);
    $('statVariacion').textContent             = variacion === null
        ? '—'
        : `${variacion > 0 ? '+' : ''}${formatearPorcentaje(variacion)}`;
}

function renderizarGrafico() {
    const ctx = $('graficoCategorias');
    if (!ctx || typeof Chart === 'undefined') return;
    const contenedor = ctx.parentElement;
    const datos = obtenerDatosGrafico(periodo);
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
    $('btnNuevaCuenta').addEventListener('click', () => abrirModalCuenta());
    $('btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria());
    $('btnNuevoMovimiento').addEventListener('click', () => abrirModalMovimiento());
    document.querySelectorAll('[data-nuevo-movimiento]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalMovimiento(null, btn.dataset.nuevoMovimiento));
    });
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

// ===== Modal Cuenta =====
function abrirModalCuenta(id) {
    $('formCuenta').reset();
    $('cuentaTipo').innerHTML = Object.entries(TIPOS_CUENTA)
        .map(([clave, t]) => `<option value="${clave}">${t.nombre}</option>`)
        .join('');
    if (id) {
        const cuenta = obtenerCuentaPorId(id);
        if (!cuenta) return;
        $('tituloModalCuenta').textContent = 'Editar cuenta';
        $('cuentaId').value           = cuenta.id;
        $('cuentaNombre').value       = cuenta.nombre;
        $('cuentaTipo').value         = cuenta.tipo;
        $('cuentaSaldoInicial').value = cuenta.saldoInicial;
    } else {
        $('tituloModalCuenta').textContent = 'Nueva cuenta';
        $('cuentaId').value = '';
        $('cuentaSaldoInicial').value = 0;
    }
    abrirModal('modalCuenta');
}

function configurarFormularioCuenta() {
    $('formCuenta').addEventListener('submit', e => {
        e.preventDefault();
        const id           = $('cuentaId').value;
        const nombre       = $('cuentaNombre').value;
        const tipo         = $('cuentaTipo').value;
        const saldoInicial = Number($('cuentaSaldoInicial').value);
        if (!nombre.trim()) {
            mostrarToast('Escribí un nombre para la cuenta', 'alerta');
            return;
        }
        if (!Number.isFinite(saldoInicial)) {
            mostrarToast('Ingresá un saldo inicial válido', 'alerta');
            return;
        }
        if (id) {
            editarCuenta(id, { nombre, tipo, saldoInicial });
            mostrarToast('Cuenta actualizada');
        } else {
            crearCuenta({ nombre, tipo, saldoInicial });
            mostrarToast('Cuenta creada');
        }
        cerrarModal('modalCuenta');
        renderizarTodo();
    });
}

function confirmarEliminarCuenta(id) {
    const usos = contarMovimientosDeCuenta(id);
    if (usos > 0) {
        Swal.fire(opcionesSwal({
            title: 'No se puede eliminar',
            text: `La cuenta tiene ${usos} ${usos === 1 ? 'movimiento' : 'movimientos'}. Eliminalos o pasalos a otra cuenta primero.`,
            icon: 'info',
            confirmButtonColor: '#6C5CE7'
        }));
        return;
    }
    Swal.fire(opcionesSwal({
        title: '¿Eliminar cuenta?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#FF5C5C',
        cancelButtonColor: '#6B7280'
    })).then(resultado => {
        if (resultado.isConfirmed && eliminarCuenta(id)) {
            mostrarToast('Cuenta eliminada');
            renderizarTodo();
        }
    });
}

// ===== Modal Categoría =====
function abrirModalCategoria(id) {
    $('formCategoria').reset();
    renderizarSelectorEmojis();
    const cat = id ? obtenerCategoriaPorId(id) : null;
    if (id && !cat) return;
    const tipo = cat ? cat.tipo : tipoCategoriaActual;
    const deTipo = tipo === 'ingreso' ? 'de ingreso' : 'de gasto';
    $('categoriaTipo').value = tipo;
    $('campoPresupuesto').hidden = tipo === 'ingreso';
    $('categoriaPresupuesto').required = tipo === 'gasto';
    if (cat) {
        $('tituloModalCategoria').textContent = `Editar categoría ${deTipo}`;
        $('categoriaId').value          = cat.id;
        $('categoriaNombre').value      = cat.nombre;
        $('categoriaPresupuesto').value = cat.presupuesto;
        seleccionarEmoji(cat.icono);
    } else {
        $('tituloModalCategoria').textContent = `Nueva categoría ${deTipo}`;
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
        const tipo        = $('categoriaTipo').value;
        const nombre      = $('categoriaNombre').value;
        const icono       = $('categoriaIcono').value;
        const presupuesto = tipo === 'gasto' ? $('categoriaPresupuesto').value : 0;
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
            crearCategoria({ nombre, icono, presupuesto, tipo });
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
const opcionesCuentas = () => obtenerCuentas()
    .map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`)
    .join('');

function abrirModalMovimiento(id, tipoInicial = 'gasto') {
    if (obtenerCuentas().length === 0) {
        Swal.fire(opcionesSwal({
            title: 'Primero creá una cuenta',
            text: 'Cada movimiento sale de una cuenta o entra en una: efectivo, banco, billetera virtual o tarjeta.',
            icon: 'info',
            confirmButtonColor: '#6C5CE7'
        }));
        return;
    }
    const m = id ? obtenerMovimientoPorId(id) : null;
    if (id && !m) return;
    $('formMovimiento').reset();
    $('movimientoCuenta').innerHTML = opcionesCuentas();
    $('movimientoCuentaDestino').innerHTML = opcionesCuentas();
    seleccionarTipo(m ? m.tipo : tipoInicial);
    if (m) {
        $('tituloModalMovimiento').textContent = 'Editar movimiento';
        $('movimientoId').value          = m.id;
        $('movimientoDescripcion').value = m.descripcion;
        $('movimientoMonto').value       = m.monto;
        $('movimientoFecha').value       = m.fecha;
        if (obtenerCuentaPorId(m.cuentaId)) $('movimientoCuenta').value = m.cuentaId;
        if (m.cuentaDestinoId && obtenerCuentaPorId(m.cuentaDestinoId)) $('movimientoCuentaDestino').value = m.cuentaDestinoId;
        if (m.categoriaId && obtenerCategoriaPorId(m.categoriaId)) $('movimientoCategoria').value = m.categoriaId;
    } else {
        $('tituloModalMovimiento').textContent = 'Nuevo movimiento';
        $('movimientoId').value    = '';
        $('movimientoFecha').value = fechaHoy();
        const cuentas = obtenerCuentas();
        if (cuentas[1]) $('movimientoCuentaDestino').value = cuentas[1].id;
    }
    abrirModal('modalMovimiento');
}

function cargarSelectCategorias(tipo) {
    const select = $('movimientoCategoria');
    const previa = select.value;
    const opciones = obtenerCategorias(tipo)
        .map(c => `<option value="${esc(c.id)}">${esc(c.icono)} ${esc(c.nombre)}</option>`)
        .join('');
    select.innerHTML = '<option value="">Sin categoría</option>' + opciones;
    if (obtenerCategoriaPorId(previa)?.tipo === tipo) select.value = previa;
}

function seleccionarTipo(tipo) {
    const esTransferencia = tipo === 'transferencia';
    $('movimientoTipo').value = tipo;
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        const activa = btn.dataset.tipo === tipo;
        btn.classList.toggle('activa', activa);
        btn.setAttribute('aria-pressed', String(activa));
    });
    $('etiquetaCuenta').textContent = esTransferencia ? 'Desde' : 'Cuenta';
    $('campoCuentaDestino').hidden = !esTransferencia;
    $('campoCategoria').hidden = esTransferencia;
    $('movimientoDescripcion').required = !esTransferencia;
    $('movimientoDescripcion').placeholder = esTransferencia ? 'Transferencia (opcional)' : 'Ej: Compra supermercado';
    if (!esTransferencia) cargarSelectCategorias(tipo);
}

function configurarFormularioMovimiento() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => seleccionarTipo(btn.dataset.tipo));
    });
    $('formMovimiento').addEventListener('submit', e => {
        e.preventDefault();
        const id              = $('movimientoId').value;
        const tipo            = $('movimientoTipo').value;
        const descripcion     = $('movimientoDescripcion').value;
        const monto           = Number($('movimientoMonto').value);
        const cuentaId        = $('movimientoCuenta').value;
        const cuentaDestinoId = $('movimientoCuentaDestino').value;
        const categoriaId     = $('movimientoCategoria').value;
        const fecha           = $('movimientoFecha').value;
        const esTransferencia = tipo === 'transferencia';
        if (!esTransferencia && !descripcion.trim()) {
            mostrarToast('Escribí una descripción', 'alerta');
            return;
        }
        if (!(monto > 0)) {
            mostrarToast('El monto tiene que ser mayor a cero', 'alerta');
            return;
        }
        if (!obtenerCuentaPorId(cuentaId)) {
            mostrarToast('Elegí una cuenta', 'alerta');
            return;
        }
        if (esTransferencia && (!obtenerCuentaPorId(cuentaDestinoId) || cuentaDestinoId === cuentaId)) {
            mostrarToast(obtenerCuentas().length < 2
                ? 'Necesitás al menos dos cuentas para transferir'
                : 'Elegí una cuenta de destino distinta a la de origen', 'alerta');
            return;
        }
        if (!esFechaISO(fecha)) {
            mostrarToast('Elegí una fecha válida', 'alerta');
            return;
        }
        const datos = { descripcion, monto, tipo, fecha, cuentaId, cuentaDestinoId, categoriaId };
        if (id) {
            editarMovimiento(id, datos);
            mostrarToast('Movimiento actualizado');
        } else {
            crearMovimiento(datos);
            mostrarToast(esTransferencia ? 'Transferencia registrada' : 'Movimiento creado');
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
