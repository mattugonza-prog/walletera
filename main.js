// ===== Walletera | main.js =====
// Capa de presentación: DOM, eventos y render.
import {
    TIPOS_CUENTA, COLORES_CATEGORIA,
    inicializarDatos,
    obtenerGruposIconos, primerIcono,
    obtenerCuentas, obtenerCuentaPorId, crearCuenta, editarCuenta, eliminarCuenta,
    contarMovimientosDeCuenta, contarRecurrentesDeCuenta, obtenerCuentasConSaldo, calcularSaldoTotal,
    obtenerCategorias, obtenerCategoriaPorId, crearCategoria, editarCategoria, eliminarCategoria,
    obtenerMovimientos, obtenerMovimientoPorId, crearMovimiento, editarMovimiento, eliminarMovimiento,
    buscarYFiltrar, agruparPorDia,
    obtenerRecurrentes, obtenerRecurrentePorId, crearRecurrente, editarRecurrente, eliminarRecurrente,
    obtenerProximosVencimientos, proximaFecha,
    periodoActual, desplazarPeriodo, nombrePeriodo, fechaHoy, esFechaISO,
    calcularResumen, calcularPromedioDiario, calcularVariacionGastos, calcularSerieMensual,
    obtenerCategoriasConMonto, obtenerCategoriaMasGastada, obtenerDatosGrafico,
    formatearMoneda, etiquetaDia, etiquetaProxima,
    validarRespaldo, reemplazarDatos, exportarRespaldo, exportarCSV,
    cargarDatosDeEjemplo, reiniciarDatos, hayMovimientos
} from './js/datos.js';

// ===== Estado de UI =====
let periodo = periodoActual();
let filtroActual = 'todos';
let busquedaActual = '';
let tipoCategoriaActual = 'gasto';
let graficoCategorias = null;
let graficoMensual = null;
let resolverConfirmacion = null;
const modalesAbiertos = [];

const CLAVE_TEMA = 'walletera_tema';
const CLAVE_OCULTAR = 'walletera_ocultar_montos';
const COLOR_META = { oscuro: '#0D0E11', claro: '#F4F5F2' };
const FUENTE = "'Inter Tight', system-ui, sans-serif";
const NOMBRES_COLOR = {
    naranja: 'Naranja', azul: 'Azul', rosa: 'Rosa', verde: 'Verde',
    violeta: 'Violeta', amarillo: 'Amarillo', turquesa: 'Turquesa', gris: 'Gris'
};

// Todo texto que viene del usuario o del almacenamiento pasa por acá antes de ir a innerHTML.
const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = valor => String(valor).replace(/[&<>"']/g, c => ENTIDADES[c]);

const $ = id => document.getElementById(id);
const guardarPreferencia = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };

// ===== Inicio =====
iniciar();

async function iniciar() {
    configurarTema();
    configurarPrivacidad();
    mostrarSkeletons();
    await inicializarDatos();
    configurarClicsGlobales();
    configurarModales();
    configurarConfirmacion();
    configurarFormularioMovimiento();
    configurarFormularioCuenta();
    configurarFormularioCategoria();
    configurarBuscadorYFiltros();
    configurarAjustes();
    renderizarTodo();
    registrarServiceWorker();
}

// Permite usar la app sin conexión e instalarla (PWA).
function registrarServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* la app funciona igual sin él */ });
    }
}

function renderizarTodo() {
    renderizarPeriodo();
    renderizarInicio();
    renderizarMovimientos();
    renderizarRecurrentes();
    renderizarCuentas();
    renderizarPresupuestos();
    renderizarAnalisis();
    if ($('analisis').classList.contains('activa')) renderizarGraficos();
}

// ===== Formato =====
const formatearPorcentaje = valor =>
    `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 }).replace('-', '−')} %`;

function formatearConSigno(monto) {
    if (monto > 0) return `+\u00a0${formatearMoneda(monto)}`;
    return formatearMoneda(monto);
}

const nombreMes = p => nombrePeriodo(p).split(' ')[0];

// ===== Tema y privacidad =====
function configurarTema() {
    aplicarTema(document.documentElement.getAttribute('data-tema'));
}

function aplicarTema(tema) {
    const valor = tema === 'claro' ? 'claro' : 'oscuro';
    const otro = valor === 'claro' ? 'oscuro' : 'claro';
    document.documentElement.setAttribute('data-tema', valor);
    guardarPreferencia(CLAVE_TEMA, valor);
    $('metaThemeColor')?.setAttribute('content', COLOR_META[valor]);
    document.querySelectorAll('[data-alternar-tema]').forEach(btn => btn.setAttribute('aria-label', `Cambiar a modo ${otro}`));
    document.querySelectorAll('.texto-tema').forEach(el => { el.textContent = `Modo ${otro}`; });
    if (graficoCategorias || graficoMensual) renderizarGraficos();
}

function configurarPrivacidad() {
    const btn = $('btnOcultarMontos');
    const actualizar = () => {
        const oculto = document.documentElement.classList.contains('ocultar-montos');
        btn.setAttribute('aria-pressed', String(oculto));
        btn.setAttribute('aria-label', oculto ? 'Mostrar montos' : 'Ocultar montos');
    };
    btn.addEventListener('click', () => {
        const oculto = document.documentElement.classList.toggle('ocultar-montos');
        guardarPreferencia(CLAVE_OCULTAR, oculto ? '1' : '0');
        actualizar();
    });
    actualizar();
}

// ===== Clics globales (delegación) =====
// Botones que se crean al renderizar también navegan, abren modales o editan.
function configurarClicsGlobales() {
    document.addEventListener('click', e => {
        const objetivo = e.target.closest('[data-seccion], [data-nuevo-movimiento], [data-alternar-tema], [data-periodo], [data-editar-movimiento], [data-editar-cuenta], [data-editar-categoria], [data-cargar-ejemplo], [data-editar-recurrente], [data-nuevo-recurrente]');
        if (!objetivo) return;
        const d = objetivo.dataset;
        if (d.seccion) irASeccion(d.seccion);
        else if (d.nuevoMovimiento) abrirModalMovimiento(null, d.nuevoMovimiento);
        else if ('alternarTema' in d) aplicarTema(document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'claro' : 'oscuro');
        else if (d.periodo) cambiarPeriodo(Number(d.periodo));
        else if (d.editarMovimiento) abrirModalMovimiento(d.editarMovimiento);
        else if (d.editarCuenta) abrirModalCuenta(d.editarCuenta);
        else if (d.editarCategoria) abrirModalCategoria(d.editarCategoria);
        else if ('cargarEjemplo' in d) cargarEjemplo();
        else if (d.editarRecurrente) abrirModalMovimiento(null, null, { recurrenteId: d.editarRecurrente });
        else if ('nuevoRecurrente' in d) abrirModalMovimiento(null, 'gasto', { repetir: 'mensual' });
    });
}

// ===== Navegación =====
function irASeccion(idSeccion) {
    document.querySelectorAll('.seccion').forEach(s => s.classList.toggle('activa', s.id === idSeccion));
    document.querySelectorAll('.nav-item[data-seccion], .nav-tab').forEach(b => {
        const activa = b.dataset.seccion === idSeccion;
        b.classList.toggle('activa', activa);
        if (activa) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
    if (idSeccion === 'analisis') renderizarGraficos();
}

// ===== Período =====
function cambiarPeriodo(meses) {
    const nuevo = desplazarPeriodo(periodo, meses);
    if (nuevo > periodoActual()) return;
    periodo = nuevo;
    renderizarTodo();
}

function renderizarPeriodo() {
    const nombre = nombrePeriodo(periodo).replace(' de ', ' ');
    document.querySelectorAll('[data-periodo-nombre]').forEach(el => { el.textContent = nombre; });
    document.querySelectorAll('[data-periodo="1"]').forEach(btn => { btn.disabled = periodo >= periodoActual(); });
}

// ===== Piezas de render =====
function mostrarSkeletons() {
    const bloques = n => '<div class="skeleton"></div>'.repeat(n);
    const filas = n => '<li class="skeleton"></li>'.repeat(n);
    ['ultimosMovimientos', 'listaMovimientos'].forEach(id => { $(id).innerHTML = bloques(4); });
    ['resumenPresupuestos', 'proximosVencimientos', 'listaRecurrentes', 'listaCuentas', 'listaCategorias'].forEach(id => { $(id).innerHTML = filas(3); });
}

function htmlVacio(icono, titulo, sub, etiqueta = 'div', extra = '') {
    return `<${etiqueta} class="vacio">
        <i class="ph ${icono}" aria-hidden="true"></i>
        <strong>${titulo}</strong>
        ${sub ? `<span>${sub}</span>` : ''}
        ${extra}
    </${etiqueta}>`;
}

const tile = (icono, color) =>
    `<span class="icono-tile tono-${color}"><i class="ph ${esc(icono)}" aria-hidden="true"></i></span>`;

const nombreCuenta = id => esc(obtenerCuentaPorId(id)?.nombre ?? 'Cuenta eliminada');

// Ícono, detalle y monto de un movimiento (o de la plantilla de un recurrente).
function partesMovimiento(m) {
    let icono, color, meta, monto, claseMonto;
    if (m.tipo === 'transferencia') {
        [icono, color] = ['ph-arrows-left-right', 'gris'];
        meta = `${nombreCuenta(m.cuentaId)} → ${nombreCuenta(m.cuentaDestinoId)}`;
        monto = formatearMoneda(m.monto);
        claseMonto = 'transferencia';
    } else {
        const cat = m.categoriaId ? obtenerCategoriaPorId(m.categoriaId) : null;
        const esIngreso = m.tipo === 'ingreso';
        [icono, color] = cat ? [cat.icono, cat.color] : (esIngreso ? ['ph-arrow-down-left', 'verde'] : ['ph-receipt', 'gris']);
        meta = `${cat ? esc(cat.nombre) : 'Sin categoría'} · ${nombreCuenta(m.cuentaId)}`;
        monto = esIngreso ? formatearConSigno(m.monto) : formatearMoneda(-m.monto);
        claseMonto = esIngreso ? 'ingreso' : '';
    }
    return { icono, color, meta, monto, claseMonto };
}

const ICONO_RECURRENTE = '<i class="ph ph-repeat icono-recurrente" aria-hidden="true"></i><span class="visualmente-oculto">Recurrente. </span>';

function filaMovimiento(m) {
    const { icono, color, meta, monto, claseMonto } = partesMovimiento(m);
    return `
        <button class="fila" type="button" data-editar-movimiento="${esc(m.id)}">
            ${tile(icono, color)}
            <span class="fila-texto">
                <span class="fila-nombre">${esc(m.descripcion)}</span>
                <span class="fila-meta">${m.recurrenteId ? ICONO_RECURRENTE : ''}${meta}</span>
            </span>
            <span class="fila-monto monto ${claseMonto}">${monto}</span>
        </button>`;
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function textoFrecuencia(r) {
    if (r.frecuencia === 'semanal') {
        const [a, m, d] = r.inicio.split('-').map(Number);
        return `Cada ${DIAS_SEMANA[new Date(a, m - 1, d).getDay()]}`;
    }
    return `Cada mes, el día ${Number(r.inicio.slice(8, 10))}`;
}

// conDetalle: la lista completa muestra la frecuencia; Inicio, cuándo vence.
function filaRecurrente(r, fecha, conDetalle) {
    const { icono, color, monto, claseMonto } = partesMovimiento(r);
    const cuenta = r.tipo === 'transferencia'
        ? `${nombreCuenta(r.cuentaId)} → ${nombreCuenta(r.cuentaDestinoId)}`
        : nombreCuenta(r.cuentaId);
    const meta = conDetalle ? `${textoFrecuencia(r)} · ${cuenta}` : `${etiquetaProxima(fecha)} · ${cuenta}`;
    return `
        <button class="fila" type="button" data-editar-recurrente="${esc(r.id)}">
            ${tile(icono, color)}
            <span class="fila-texto">
                <span class="fila-nombre">${esc(r.descripcion)}</span>
                <span class="fila-meta">${meta}</span>
            </span>
            <span class="fila-lado">
                <span class="fila-monto monto ${claseMonto}">${monto}</span>
                ${conDetalle ? `<span class="fila-meta">${etiquetaProxima(fecha)}</span>` : ''}
            </span>
        </button>`;
}

function htmlGrupos(lista) {
    return `<div class="grupos">${agruparPorDia(lista).map(g => `
        <section class="grupo-dia">
            <h3 class="grupo-dia-titulo">
                <span>${etiquetaDia(g.fecha)}</span>
                <span class="monto">${g.soloTransferencias ? 'Entre cuentas' : formatearConSigno(g.neto)}</span>
            </h3>
            ${g.movimientos.map(filaMovimiento).join('')}
        </section>`).join('')}</div>`;
}

function claseSalud(porcentaje) {
    if (porcentaje >= 100) return 'excedida';
    if (porcentaje >= 80) return 'cerca';
    return '';
}

function filaPresupuesto(c, conLado = true) {
    const porcentaje = c.presupuesto > 0 ? (c.monto / c.presupuesto) * 100 : 0;
    const restante = c.presupuesto - c.monto;
    let lado = '';
    if (conLado) {
        lado = c.presupuesto <= 0
            ? '<span class="fila-meta">Sin presupuesto</span>'
            : restante >= 0
                ? `<span class="fila-meta">Quedan</span><span class="fila-monto monto">${formatearMoneda(restante)}</span>`
                : `<span class="fila-meta">Excedido</span><span class="fila-monto monto negativo">${formatearMoneda(-restante)}</span>`;
    }
    return `
        <button class="fila fila-presupuesto" type="button" data-editar-categoria="${esc(c.id)}">
            ${tile(c.icono, c.color)}
            <span class="fila-texto">
                <span class="fila-nombre">${esc(c.nombre)}</span>
                <span class="fila-meta monto">${formatearMoneda(c.monto)} de ${formatearMoneda(c.presupuesto)}</span>
            </span>
            ${conLado ? `<span class="fila-lado">${lado}</span>` : `<span class="fila-meta">${formatearPorcentaje(porcentaje)}</span>`}
            <span class="barra"><span class="barra-relleno ${claseSalud(porcentaje)}" data-ancho="${Math.min(porcentaje, 100)}"></span></span>
        </button>`;
}

// Las barras se animan desde 0 hasta su valor real.
function animarBarras(contenedor) {
    requestAnimationFrame(() => {
        contenedor.querySelectorAll('.barra-relleno[data-ancho]').forEach(b => { b.style.width = `${b.dataset.ancho}%`; });
    });
}

// ===== Inicio =====
function renderizarInicio() {
    const hora = new Date().getHours();
    $('saludo').textContent = hora >= 5 && hora < 13 ? 'Buen día' : (hora >= 13 && hora < 20 ? 'Buenas tardes' : 'Buenas noches');
    const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    $('fechaHoy').textContent = hoy.charAt(0).toUpperCase() + hoy.slice(1);

    const resumen = calcularResumen(periodo);
    const cuentas = obtenerCuentasConSaldo();
    const mes = nombreMes(periodo);
    $('saldoTotal').textContent = formatearMoneda(calcularSaldoTotal());
    $('saldoCuentas').textContent = cuentas.length === 1 ? 'En 1 cuenta' : `En ${cuentas.length} cuentas`;

    const pastilla = $('resultadoMes');
    pastilla.textContent = resumen.cantidad
        ? `${formatearConSigno(resumen.resultado)} en ${mes}`
        : `Sin movimientos en ${mes}`;
    pastilla.classList.toggle('negativa', resumen.resultado < 0);

    $('resumenCuentas').innerHTML = cuentas.map(c => `
        <li>
            <button class="cuenta-mini" type="button" data-editar-cuenta="${esc(c.id)}">
                <i class="ph ${TIPOS_CUENTA[c.tipo].icono}" aria-hidden="true"></i>
                <span>
                    <span class="cuenta-mini-nombre">${esc(c.nombre)}</span>
                    <span class="cuenta-mini-saldo monto ${c.saldo < 0 ? 'negativo' : ''}">${formatearMoneda(c.saldo)}</span>
                </span>
            </button>
        </li>`).join('');

    $('tituloResumenMes').textContent = mes;
    $('presupuestoUsado').textContent = resumen.presupuesto > 0
        ? `Presupuesto ${formatearPorcentaje(resumen.porcentajePresupuesto)} usado`
        : 'Sin presupuestos';
    const barra = $('barraPresupuesto');
    barra.className = `barra-relleno ${claseSalud(resumen.porcentajePresupuesto)}`;
    barra.dataset.ancho = Math.min(resumen.porcentajePresupuesto, 100);
    animarBarras(barra.parentElement);
    $('ingresosMes').textContent = formatearConSigno(resumen.ingresos);
    $('gastosMes').textContent = formatearMoneda(resumen.gastos);

    const ultimos = obtenerMovimientos(periodo).slice(0, 6);
    // Sin ningún movimiento todavía, se ofrece cargar datos de ejemplo para explorar.
    $('ultimosMovimientos').innerHTML = ultimos.length
        ? htmlGrupos(ultimos)
        : hayMovimientos()
            ? htmlVacio('ph-tray', `Sin movimientos en ${mes}`, 'Tocá + para registrar uno.')
            : htmlVacio('ph-tray', 'Todavía no hay movimientos', 'Registrá el primero con + o explorá la app con datos de ejemplo.', 'div',
                '<button class="btn btn-secundario" type="button" data-cargar-ejemplo><i class="ph ph-sparkle" aria-hidden="true"></i> Cargar datos de ejemplo</button>');

    const conPresupuesto = obtenerCategoriasConMonto('gasto', periodo)
        .filter(c => c.presupuesto > 0)
        .sort((a, b) => b.monto / b.presupuesto - a.monto / a.presupuesto)
        .slice(0, 4);
    $('resumenPresupuestos').innerHTML = conPresupuesto.length
        ? conPresupuesto.map(c => `<li>${filaPresupuesto(c, false)}</li>`).join('')
        : htmlVacio('ph-target', 'Sin presupuestos', 'Asigná un presupuesto mensual a tus categorías.', 'li');
    animarBarras($('resumenPresupuestos'));
}

// ===== Movimientos =====
function renderizarMovimientos() {
    const resumen = calcularResumen(periodo);
    $('movIngresos').textContent = formatearConSigno(resumen.ingresos);
    $('movGastos').textContent = formatearMoneda(resumen.gastos);
    const lista = buscarYFiltrar(busquedaActual, filtroActual, periodo);
    if (lista.length === 0) {
        $('listaMovimientos').innerHTML = busquedaActual || filtroActual !== 'todos'
            ? htmlVacio('ph-magnifying-glass', 'Sin resultados', 'Probá con otro texto, filtro o mes.')
            : htmlVacio('ph-tray', `Sin movimientos en ${nombreMes(periodo)}`, 'Tocá + para registrar el primero.');
        return;
    }
    $('listaMovimientos').innerHTML = htmlGrupos(lista);
}

function configurarBuscadorYFiltros() {
    $('btnBuscar').addEventListener('click', () => {
        const campo = $('campoBuscar');
        const abrir = campo.hidden;
        campo.hidden = !abrir;
        $('btnBuscar').setAttribute('aria-expanded', String(abrir));
        if (abrir) {
            $('buscador').focus();
        } else if (busquedaActual) {
            $('buscador').value = '';
            busquedaActual = '';
            renderizarMovimientos();
        }
    });
    $('buscador').addEventListener('input', e => {
        busquedaActual = e.target.value;
        renderizarMovimientos();
    });
    configurarChips('filtrosMovimientos', btn => {
        filtroActual = btn.dataset.filtro;
        renderizarMovimientos();
    });
    configurarChips('filtrosCategorias', btn => {
        tipoCategoriaActual = btn.dataset.tipoCategoria;
        renderizarPresupuestos();
    });
}

function configurarChips(idGrupo, alElegir) {
    const grupo = $(idGrupo);
    grupo.addEventListener('click', e => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        grupo.querySelectorAll('.chip').forEach(b => {
            b.classList.toggle('activa', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
        });
        alElegir(btn);
    });
}

// ===== Recurrentes =====
function renderizarProximos() {
    const proximos = obtenerProximosVencimientos(30).slice(0, 4);
    $('proximosVencimientos').innerHTML = proximos.length
        ? proximos.map(v => `<li>${filaRecurrente(v.recurrente, v.fecha, false)}</li>`).join('')
        : htmlVacio('ph-repeat', 'Sin vencimientos en los próximos 30 días', 'Marcá un movimiento como "Se repite" y se registra solo.', 'li');
}

function renderizarRecurrentes() {
    renderizarProximos();
    const lista = obtenerRecurrentes();
    // Equivalente mensual: las semanales cuentan 52/12 veces por mes.
    const porMes = tipo => lista
        .filter(r => r.tipo === tipo)
        .reduce((acc, r) => acc + (r.frecuencia === 'semanal' ? (r.monto * 52) / 12 : r.monto), 0);
    $('recIngresos').textContent = formatearConSigno(Math.round(porMes('ingreso')));
    $('recGastos').textContent = formatearMoneda(Math.round(porMes('gasto')));
    $('listaRecurrentes').innerHTML = lista.length
        ? lista.map(r => `<li>${filaRecurrente(r, proximaFecha(r), true)}</li>`).join('')
        : htmlVacio('ph-repeat', 'Todavía no hay recurrentes', 'Creá uno con + o marcá "Se repite" al registrar un movimiento.', 'li');
}

// ===== Cuentas =====
function renderizarCuentas() {
    $('totalCuentas').textContent = formatearMoneda(calcularSaldoTotal());
    const cuentas = obtenerCuentasConSaldo();
    $('listaCuentas').innerHTML = cuentas.length
        ? cuentas.map(c => `
            <li>
                <button class="fila" type="button" data-editar-cuenta="${esc(c.id)}">
                    ${tile(TIPOS_CUENTA[c.tipo].icono, 'gris')}
                    <span class="fila-texto">
                        <span class="fila-nombre">${esc(c.nombre)}</span>
                        <span class="fila-meta">${TIPOS_CUENTA[c.tipo].nombre}</span>
                    </span>
                    <span class="fila-monto monto ${c.saldo < 0 ? 'negativo' : ''}">${formatearMoneda(c.saldo)}</span>
                </button>
            </li>`).join('')
        : htmlVacio('ph-wallet', 'Todavía no hay cuentas', 'Creá la primera con el botón +.', 'li');
}

// ===== Presupuestos =====
function renderizarPresupuestos() {
    const cats = obtenerCategoriasConMonto(tipoCategoriaActual, periodo);
    const cont = $('listaCategorias');
    if (cats.length === 0) {
        cont.innerHTML = htmlVacio('ph-squares-four', 'Todavía no hay categorías', 'Creá la primera con el botón +.', 'li');
        return;
    }
    const mes = nombreMes(periodo);
    cont.innerHTML = cats.map(c => `<li>${c.tipo === 'gasto'
        ? filaPresupuesto(c)
        : `<button class="fila" type="button" data-editar-categoria="${esc(c.id)}">
                ${tile(c.icono, c.color)}
                <span class="fila-texto">
                    <span class="fila-nombre">${esc(c.nombre)}</span>
                    <span class="fila-meta">Recibido en ${mes}</span>
                </span>
                <span class="fila-monto monto ${c.monto > 0 ? 'ingreso' : ''}">${formatearConSigno(c.monto)}</span>
            </button>`}</li>`).join('');
    animarBarras(cont);
}

// ===== Análisis =====
function renderizarAnalisis() {
    const resumen = calcularResumen(periodo);
    const top = obtenerCategoriaMasGastada(periodo);
    const variacion = calcularVariacionGastos(periodo);
    $('statIngresos').textContent      = formatearConSigno(resumen.ingresos);
    $('statGastos').textContent        = formatearMoneda(resumen.gastos);
    $('statPromedioDiario').textContent = formatearMoneda(calcularPromedioDiario(periodo));
    $('statPresupuesto').textContent   = resumen.presupuesto > 0 ? formatearPorcentaje(resumen.porcentajePresupuesto) : '—';
    $('statVariacion').textContent     = variacion === null ? '—' : `${variacion > 0 ? '+' : ''}${formatearPorcentaje(variacion)}`;
    $('statCategoriaTop').textContent  = top ? top.nombre : '—';
}

function renderizarGraficos() {
    renderizarGrafico();
    renderizarGraficoMensual();
}

function renderizarGraficoMensual() {
    const ctx = $('graficoMensual');
    if (!ctx || typeof Chart === 'undefined') return;
    const serie = calcularSerieMensual(periodo, 6);
    const estilos = getComputedStyle(document.documentElement);
    const token = nombre => estilos.getPropertyValue(nombre).trim();
    const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
    const etiqueta = p => {
        const [a, m] = p.split('-').map(Number);
        const texto = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
        return texto.charAt(0).toUpperCase() + texto.slice(1);
    };

    graficoMensual?.destroy();
    graficoMensual = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: serie.map(s => etiqueta(s.periodo)),
            datasets: [
                { label: 'Ingresos', data: serie.map(s => s.ingresos), backgroundColor: token('--barra-ok'), borderRadius: 6, maxBarThickness: 22 },
                { label: 'Gastos', data: serie.map(s => s.gastos), backgroundColor: token('--tinta-suave'), borderRadius: 6, maxBarThickness: 22 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: token('--tinta-suave'), font: { family: FUENTE } } },
                y: {
                    grid: { color: token('--borde') },
                    border: { display: false },
                    ticks: { color: token('--tinta-suave'), font: { family: FUENTE }, callback: v => compacto.format(v), maxTicksLimit: 5 }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: token('--tinta-suave'), usePointStyle: true, pointStyle: 'circle', padding: 14, font: { family: FUENTE, size: 13 } } },
                tooltip: {
                    padding: 12, cornerRadius: 10,
                    titleFont: { family: FUENTE, weight: '600' }, bodyFont: { family: FUENTE },
                    callbacks: { label: c => ` ${c.dataset.label}: ${formatearMoneda(c.parsed.y)}` }
                }
            }
        }
    });
}

function renderizarGrafico() {
    const ctx = $('graficoCategorias');
    if (!ctx || typeof Chart === 'undefined') return;
    const contenedor = ctx.parentElement;
    const datos = obtenerDatosGrafico(periodo);
    contenedor.querySelector('.vacio')?.remove();

    if (datos.length === 0) {
        graficoCategorias?.destroy();
        graficoCategorias = null;
        ctx.hidden = true;
        contenedor.insertAdjacentHTML('beforeend', htmlVacio('ph-chart-pie-slice', `Sin gastos en ${nombreMes(periodo)}`, 'Registrá un gasto para ver el desglose.'));
        return;
    }
    ctx.hidden = false;

    const estilos = getComputedStyle(document.documentElement);
    const token = nombre => estilos.getPropertyValue(nombre).trim();
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    graficoCategorias?.destroy();
    graficoCategorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: datos.map(d => d.etiqueta),
            datasets: [{
                data: datos.map(d => d.valor),
                backgroundColor: datos.map(d => token(`--${d.color}-fg`)),
                borderColor: token('--superficie'),
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            animation: { duration: reducirMovimiento ? 0 : 600, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: token('--tinta-suave'),
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 14,
                        font: { family: FUENTE, size: 13, weight: '500' }
                    }
                },
                tooltip: {
                    padding: 12,
                    cornerRadius: 10,
                    titleFont: { family: FUENTE, weight: '600' },
                    bodyFont: { family: FUENTE },
                    callbacks: { label: c => ` ${formatearMoneda(c.parsed)}` }
                }
            }
        }
    });
}

// ===== Modales =====
function configurarModales() {
    document.querySelectorAll('[data-cerrar]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(el.dataset.cerrar));
    });
}

function abrirModal(id, enfocar) {
    const modal = $(id);
    modalesAbiertos.push({ id, foco: document.activeElement });
    modal.classList.add('activo');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modal.addEventListener('keydown', manejarTeclasModal);
    const destino = enfocar ?? modal.querySelector('input:not([type=hidden]), select, button:not([data-cerrar])');
    if (destino) setTimeout(() => destino.focus({ preventScroll: true }), 60);
}

function cerrarModal(id) {
    const modal = $(id);
    if (!modal.classList.contains('activo')) return;
    modal.classList.remove('activo');
    modal.setAttribute('aria-hidden', 'true');
    modal.removeEventListener('keydown', manejarTeclasModal);
    const indice = modalesAbiertos.findIndex(m => m.id === id);
    const [{ foco } = {}] = indice >= 0 ? modalesAbiertos.splice(indice, 1) : [];
    if (modalesAbiertos.length === 0) document.body.style.overflow = '';
    if (foco?.isConnected) foco.focus({ preventScroll: true });
    if (id === 'modalConfirmar' && resolverConfirmacion) {
        const resolver = resolverConfirmacion;
        resolverConfirmacion = null;
        resolver(false);
    }
}

function manejarTeclasModal(e) {
    const modal = e.currentTarget;
    if (e.key === 'Escape') { e.stopPropagation(); cerrarModal(modal.id); return; }
    if (e.key !== 'Tab') return;
    const enfocables = [...modal.querySelectorAll('button:not([disabled]), input:not([type=hidden]), select')]
        .filter(el => el.offsetParent !== null);
    if (enfocables.length === 0) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
}

// ===== Diálogo de confirmación =====
function configurarConfirmacion() {
    $('confirmarCancelar').addEventListener('click', () => cerrarModal('modalConfirmar'));
    $('confirmarAceptar').addEventListener('click', () => {
        const resolver = resolverConfirmacion;
        resolverConfirmacion = null;
        cerrarModal('modalConfirmar');
        resolver?.(true);
    });
}

// Devuelve una promesa que resuelve true si el usuario acepta.
function confirmar({ titulo, texto, aceptar = 'Aceptar', peligro = false, soloAceptar = false }) {
    $('confirmarTitulo').textContent = titulo;
    $('confirmarTexto').textContent = texto;
    $('confirmarAceptar').textContent = aceptar;
    $('confirmarAceptar').className = `btn ${peligro ? 'btn-peligro' : 'btn-primario'}`;
    $('confirmarCancelar').hidden = soloAceptar;
    return new Promise(resolver => {
        resolverConfirmacion = resolver;
        abrirModal('modalConfirmar', $(soloAceptar || !peligro ? 'confirmarAceptar' : 'confirmarCancelar'));
    });
}

// ===== Avisos (toasts) =====
function mostrarToast(mensaje, tipo = 'ok') {
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<i class="ph ${tipo === 'alerta' ? 'ph-warning-circle' : 'ph-check-circle'}" aria-hidden="true"></i><span></span>`;
    toast.querySelector('span').textContent = mensaje;
    $('toasts').appendChild(toast);
    setTimeout(() => {
        toast.classList.add('saliendo');
        setTimeout(() => toast.remove(), 220);
    }, 2400);
}

// Marca el campo inválido, lo enfoca y avisa.
function errorEnCampo(campo, mensaje) {
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
    campo.addEventListener('input', () => campo.removeAttribute('aria-invalid'), { once: true });
    mostrarToast(mensaje, 'alerta');
}

// ===== Modal Movimiento =====
const opcionesCuentas = () => obtenerCuentas()
    .map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`)
    .join('');

// Sirve para movimientos y para recurrentes: con opciones.recurrenteId edita la plantilla.
async function abrirModalMovimiento(id, tipoInicial = 'gasto', opciones = {}) {
    if (obtenerCuentas().length === 0) {
        const crear = await confirmar({
            titulo: 'Primero creá una cuenta',
            texto: 'Cada movimiento sale de una cuenta o entra en una: efectivo, banco, billetera virtual o tarjeta.',
            aceptar: 'Crear cuenta'
        });
        if (crear) abrirModalCuenta();
        return;
    }
    const r = opciones.recurrenteId ? obtenerRecurrentePorId(opciones.recurrenteId) : null;
    if (opciones.recurrenteId && !r) return;
    const m = r ?? (id ? obtenerMovimientoPorId(id) : null);
    if (id && !m) return;
    $('formMovimiento').reset();
    $('formMovimiento').querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    $('movimientoCuenta').innerHTML = opcionesCuentas();
    $('movimientoCuentaDestino').innerHTML = opcionesCuentas();
    seleccionarTipo(m ? m.tipo : tipoInicial);
    $('btnEliminarMovimiento').hidden = !m;
    $('recurrenteId').value = r?.id ?? '';
    // Repetir solo se elige al crear; un recurrente existente no puede dejar de serlo desde acá.
    $('movimientoRepetir').innerHTML = (r ? '' : '<option value="">No se repite</option>') +
        '<option value="mensual">Cada mes</option><option value="semanal">Cada semana</option>';
    $('movimientoRepetir').value = r?.frecuencia ?? opciones.repetir ?? '';
    $('campoRepetir').hidden = Boolean(m && !r);
    $('etiquetaFecha').textContent = r ? 'Próxima fecha' : 'Fecha';
    if (m) {
        $('tituloModalMovimiento').textContent = r ? 'Editar recurrente' : 'Editar movimiento';
        $('movimientoId').value          = r ? '' : m.id;
        $('movimientoDescripcion').value = m.descripcion;
        $('movimientoMonto').value       = m.monto;
        $('movimientoFecha').value       = r ? proximaFecha(r) : m.fecha;
        if (obtenerCuentaPorId(m.cuentaId)) $('movimientoCuenta').value = m.cuentaId;
        if (m.cuentaDestinoId && obtenerCuentaPorId(m.cuentaDestinoId)) $('movimientoCuentaDestino').value = m.cuentaDestinoId;
        if (m.categoriaId && obtenerCategoriaPorId(m.categoriaId)) $('movimientoCategoria').value = m.categoriaId;
    } else {
        $('tituloModalMovimiento').textContent = opciones.repetir ? 'Nuevo recurrente' : 'Nuevo movimiento';
        $('movimientoId').value    = '';
        $('movimientoFecha').value = fechaHoy();
        const cuentas = obtenerCuentas();
        if (cuentas[1]) $('movimientoCuentaDestino').value = cuentas[1].id;
    }
    ajustarAnchoMonto();
    abrirModal('modalMovimiento', $('movimientoMonto'));
}

function cargarSelectCategorias(tipo) {
    const select = $('movimientoCategoria');
    const previa = select.value;
    const opciones = obtenerCategorias(tipo)
        .map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`)
        .join('');
    select.innerHTML = '<option value="">Sin categoría</option>' + opciones;
    if (obtenerCategoriaPorId(previa)?.tipo === tipo) select.value = previa;
}

function seleccionarTipo(tipo) {
    const esTransferencia = tipo === 'transferencia';
    $('movimientoTipo').value = tipo;
    document.querySelectorAll('.segmento').forEach(btn => {
        const activa = btn.dataset.tipo === tipo;
        btn.classList.toggle('activa', activa);
        btn.setAttribute('aria-pressed', String(activa));
    });
    $('etiquetaCuenta').textContent = esTransferencia ? 'Desde' : 'Cuenta';
    $('campoCuentaDestino').hidden = !esTransferencia;
    $('campoCategoria').hidden = esTransferencia;
    $('movimientoDescripcion').placeholder = esTransferencia ? 'Transferencia (opcional)' : 'Ej: Supermercado';
    if (!esTransferencia) cargarSelectCategorias(tipo);
}

// El campo de monto crece con lo que se escribe, así el "$" queda pegado a la cifra.
function ajustarAnchoMonto() {
    const input = $('movimientoMonto');
    const largo = (input.value || input.placeholder).length;
    input.style.width = `${largo + 0.6}ch`;
}

function configurarFormularioMovimiento() {
    $('movimientoMonto').addEventListener('input', ajustarAnchoMonto);
    document.querySelectorAll('.segmento').forEach(btn => {
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
        const recurrenteId    = $('recurrenteId').value;
        const repetir         = $('movimientoRepetir').value;
        const esTransferencia = tipo === 'transferencia';
        if (!(monto > 0)) return errorEnCampo($('movimientoMonto'), 'Ingresá un monto mayor a cero');
        if (!esTransferencia && !descripcion.trim()) return errorEnCampo($('movimientoDescripcion'), 'Escribí una descripción');
        if (!obtenerCuentaPorId(cuentaId)) return errorEnCampo($('movimientoCuenta'), 'Elegí una cuenta');
        if (esTransferencia && (!obtenerCuentaPorId(cuentaDestinoId) || cuentaDestinoId === cuentaId)) {
            return errorEnCampo($('movimientoCuentaDestino'), obtenerCuentas().length < 2
                ? 'Necesitás al menos dos cuentas para transferir'
                : 'Elegí una cuenta de destino distinta a la de origen');
        }
        if (!esFechaISO(fecha)) return errorEnCampo($('movimientoFecha'), 'Elegí una fecha válida');

        const datos = { descripcion, monto, tipo, fecha, cuentaId, cuentaDestinoId, categoriaId };
        if (recurrenteId) {
            try {
                editarRecurrente(recurrenteId, datos, repetir);
            } catch (error) {
                return errorEnCampo($('movimientoFecha'), error.message);
            }
            mostrarToast('Recurrente actualizado');
        } else if (repetir) {
            const antes = obtenerMovimientos().length;
            crearRecurrente(datos, repetir);
            const registrados = obtenerMovimientos().length - antes;
            mostrarToast(registrados > 1
                ? `Recurrente creado · ${registrados} movimientos registrados`
                : 'Recurrente creado: se registra solo');
        } else if (id) {
            editarMovimiento(id, datos);
            mostrarToast('Movimiento actualizado');
        } else {
            crearMovimiento(datos);
            mostrarToast(esTransferencia ? 'Transferencia registrada' : 'Movimiento registrado');
        }
        cerrarModal('modalMovimiento');
        renderizarTodo();
    });
    $('btnEliminarMovimiento').addEventListener('click', async () => {
        const id = $('movimientoId').value;
        const recurrenteId = $('recurrenteId').value;
        if (recurrenteId) {
            const ok = await confirmar({
                titulo: '¿Eliminar recurrente?',
                texto: 'Deja de registrarse. Los movimientos que ya se registraron se conservan.',
                aceptar: 'Eliminar',
                peligro: true
            });
            if (!ok) return;
            eliminarRecurrente(recurrenteId);
            cerrarModal('modalMovimiento');
            mostrarToast('Recurrente eliminado');
            return renderizarTodo();
        }
        const ok = await confirmar({
            titulo: '¿Eliminar movimiento?',
            texto: 'Esta acción no se puede deshacer.',
            aceptar: 'Eliminar',
            peligro: true
        });
        if (!ok) return;
        eliminarMovimiento(id);
        cerrarModal('modalMovimiento');
        mostrarToast('Movimiento eliminado');
        renderizarTodo();
    });
}

// ===== Modal Cuenta =====
function abrirModalCuenta(id) {
    const cuenta = id ? obtenerCuentaPorId(id) : null;
    if (id && !cuenta) return;
    $('formCuenta').reset();
    $('cuentaTipo').innerHTML = Object.entries(TIPOS_CUENTA)
        .map(([clave, t]) => `<option value="${clave}">${t.nombre}</option>`)
        .join('');
    $('btnEliminarCuenta').hidden = !cuenta;
    $('tituloModalCuenta').textContent = cuenta ? 'Editar cuenta' : 'Nueva cuenta';
    $('cuentaId').value           = cuenta?.id ?? '';
    $('cuentaNombre').value       = cuenta?.nombre ?? '';
    $('cuentaTipo').value         = cuenta?.tipo ?? 'banco';
    $('cuentaSaldoInicial').value = cuenta?.saldoInicial ?? 0;
    abrirModal('modalCuenta');
}

function configurarFormularioCuenta() {
    $('btnNuevaCuenta').addEventListener('click', () => abrirModalCuenta());
    $('formCuenta').addEventListener('submit', e => {
        e.preventDefault();
        const id           = $('cuentaId').value;
        const nombre       = $('cuentaNombre').value;
        const tipo         = $('cuentaTipo').value;
        const saldoInicial = Number($('cuentaSaldoInicial').value);
        if (!nombre.trim()) return errorEnCampo($('cuentaNombre'), 'Escribí un nombre para la cuenta');
        if (!Number.isFinite(saldoInicial)) return errorEnCampo($('cuentaSaldoInicial'), 'Ingresá un saldo inicial válido');
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
    $('btnEliminarCuenta').addEventListener('click', async () => {
        const id = $('cuentaId').value;
        const usos = contarMovimientosDeCuenta(id);
        const fijos = contarRecurrentesDeCuenta(id);
        if (usos > 0 || fijos > 0) {
            const partes = [
                usos ? `${usos} ${usos === 1 ? 'movimiento' : 'movimientos'}` : '',
                fijos ? `${fijos} ${fijos === 1 ? 'recurrente' : 'recurrentes'}` : ''
            ].filter(Boolean).join(' y ');
            await confirmar({
                titulo: 'No se puede eliminar',
                texto: `La cuenta tiene ${partes}. Eliminalos o pasalos a otra cuenta primero.`,
                aceptar: 'Entendido',
                soloAceptar: true
            });
            return;
        }
        const ok = await confirmar({
            titulo: '¿Eliminar cuenta?',
            texto: 'Esta acción no se puede deshacer.',
            aceptar: 'Eliminar',
            peligro: true
        });
        if (!ok || !eliminarCuenta(id)) return;
        cerrarModal('modalCuenta');
        mostrarToast('Cuenta eliminada');
        renderizarTodo();
    });
}

// ===== Modal Categoría =====
const nombreIcono = icono => icono.replace(/^ph-/, '').replaceAll('-', ' ');

function abrirModalCategoria(id) {
    const cat = id ? obtenerCategoriaPorId(id) : null;
    if (id && !cat) return;
    const tipo = cat ? cat.tipo : tipoCategoriaActual;
    const deTipo = tipo === 'ingreso' ? 'de ingreso' : 'de gasto';
    $('formCategoria').reset();
    $('btnEliminarCategoria').hidden = !cat;
    $('tituloModalCategoria').textContent = `${cat ? 'Editar' : 'Nueva'} categoría ${deTipo}`;
    $('categoriaTipo').value = tipo;
    $('categoriaId').value = cat?.id ?? '';
    $('categoriaNombre').value = cat?.nombre ?? '';
    $('categoriaPresupuesto').value = cat?.presupuesto ?? '';
    $('campoPresupuesto').hidden = tipo === 'ingreso';

    $('selectorColores').innerHTML = COLORES_CATEGORIA.map(color => `
        <button class="color-btn tono-${color}" type="button" data-color="${color}" aria-pressed="false" aria-label="${NOMBRES_COLOR[color]}"></button>
    `).join('');
    $('selectorIconos').innerHTML = obtenerGruposIconos().flatMap(g => g.iconos).map(icono => `
        <button class="icono-btn" type="button" data-icono="${esc(icono)}" aria-pressed="false" aria-label="${esc(nombreIcono(icono))}"><i class="ph ${esc(icono)}" aria-hidden="true"></i></button>
    `).join('');

    const colorPorDefecto = COLORES_CATEGORIA[obtenerCategorias().length % COLORES_CATEGORIA.length];
    seleccionarColor(cat?.color ?? colorPorDefecto);
    seleccionarIcono(cat?.icono ?? primerIcono());
    abrirModal('modalCategoria', $('categoriaNombre'));
}

function marcarEnGrupo(contenedor, atributo, valor) {
    contenedor.querySelectorAll(`[data-${atributo}]`).forEach(btn => {
        const activa = btn.getAttribute(`data-${atributo}`) === valor;
        btn.classList.toggle('activa', activa);
        btn.setAttribute('aria-pressed', String(activa));
    });
}

function seleccionarColor(color) {
    $('categoriaColor').value = color;
    $('vistaCategoria').className = `icono-tile grande tono-${color}`;
    marcarEnGrupo($('selectorColores'), 'color', color);
}

function seleccionarIcono(icono) {
    $('categoriaIcono').value = icono;
    $('vistaCategoria').innerHTML = `<i class="ph ${esc(icono)}" aria-hidden="true"></i>`;
    marcarEnGrupo($('selectorIconos'), 'icono', icono);
}

function configurarFormularioCategoria() {
    $('btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria());
    $('selectorColores').addEventListener('click', e => {
        const btn = e.target.closest('[data-color]');
        if (btn) seleccionarColor(btn.dataset.color);
    });
    $('selectorIconos').addEventListener('click', e => {
        const btn = e.target.closest('[data-icono]');
        if (btn) seleccionarIcono(btn.dataset.icono);
    });
    $('formCategoria').addEventListener('submit', e => {
        e.preventDefault();
        const id          = $('categoriaId').value;
        const tipo        = $('categoriaTipo').value;
        const nombre      = $('categoriaNombre').value;
        const icono       = $('categoriaIcono').value;
        const color       = $('categoriaColor').value;
        const presupuesto = tipo === 'gasto' ? Number($('categoriaPresupuesto').value || 0) : 0;
        if (!nombre.trim()) return errorEnCampo($('categoriaNombre'), 'Escribí un nombre para la categoría');
        if (!Number.isFinite(presupuesto) || presupuesto < 0) return errorEnCampo($('categoriaPresupuesto'), 'Ingresá un presupuesto válido');
        if (id) {
            editarCategoria(id, { nombre, icono, color, presupuesto });
            mostrarToast('Categoría actualizada');
        } else {
            crearCategoria({ nombre, icono, color, presupuesto, tipo });
            mostrarToast('Categoría creada');
        }
        cerrarModal('modalCategoria');
        renderizarTodo();
    });
    $('btnEliminarCategoria').addEventListener('click', async () => {
        const id = $('categoriaId').value;
        const ok = await confirmar({
            titulo: '¿Eliminar categoría?',
            texto: 'Sus movimientos se conservan y quedan como "Sin categoría".',
            aceptar: 'Eliminar',
            peligro: true
        });
        if (!ok) return;
        eliminarCategoria(id);
        cerrarModal('modalCategoria');
        mostrarToast('Categoría eliminada');
        renderizarTodo();
    });
}

// ===== Ajustes: datos de ejemplo, exportación y respaldo =====
function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function cargarEjemplo() {
    if (hayMovimientos()) {
        const ok = await confirmar({
            titulo: '¿Reemplazar tus datos?',
            texto: 'Los datos de ejemplo reemplazan tus cuentas, categorías y movimientos actuales.',
            aceptar: 'Reemplazar',
            peligro: true
        });
        if (!ok) return;
    }
    await cargarDatosDeEjemplo();
    periodo = periodoActual();
    renderizarTodo();
    irASeccion('inicio');
    mostrarToast('Datos de ejemplo cargados');
}

function configurarAjustes() {
    $('btnExportarCSV').addEventListener('click', () => {
        if (!hayMovimientos()) return mostrarToast('Todavía no hay movimientos para exportar', 'alerta');
        // El BOM hace que Excel reconozca los acentos.
        descargar(`walletera-movimientos-${fechaHoy()}.csv`, `\ufeff${exportarCSV()}`, 'text/csv;charset=utf-8');
    });
    $('btnDescargarRespaldo').addEventListener('click', () => {
        descargar(`walletera-respaldo-${fechaHoy()}.json`, JSON.stringify(exportarRespaldo(), null, 2), 'application/json');
        mostrarToast('Respaldo descargado');
    });
    $('btnRestaurarRespaldo').addEventListener('click', () => $('archivoRespaldo').click());
    $('archivoRespaldo').addEventListener('change', async e => {
        const archivo = e.target.files[0];
        e.target.value = '';
        if (!archivo) return;
        let datos;
        try {
            datos = validarRespaldo(JSON.parse(await archivo.text()));
        } catch (error) {
            return mostrarToast(error instanceof SyntaxError ? 'El archivo no es un JSON válido' : error.message, 'alerta');
        }
        const resumen = `${datos.cuentas.length} cuentas, ${datos.categorias.length} categorías y ${datos.movimientos.length} movimientos`;
        const ok = await confirmar({
            titulo: '¿Restaurar este respaldo?',
            texto: `Se cargan ${resumen}${datos.descartados ? ` (${datos.descartados} movimientos inválidos se omiten)` : ''}. Tus datos actuales se reemplazan.`,
            aceptar: 'Restaurar',
            peligro: true
        });
        if (!ok) return;
        reemplazarDatos(datos);
        periodo = periodoActual();
        renderizarTodo();
        mostrarToast('Respaldo restaurado');
    });
    $('btnBorrarTodo').addEventListener('click', async () => {
        const ok = await confirmar({
            titulo: '¿Borrar todos los datos?',
            texto: 'Se eliminan tus cuentas, categorías y movimientos de este navegador. Si querés conservarlos, descargá un respaldo antes.',
            aceptar: 'Borrar todo',
            peligro: true
        });
        if (!ok) return;
        await reiniciarDatos();
        periodo = periodoActual();
        renderizarTodo();
        mostrarToast('Datos borrados');
    });
}
