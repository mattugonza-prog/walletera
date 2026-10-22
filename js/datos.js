// ===== Walletera | datos.js =====
// Capa de datos: estado, persistencia, migraciones y cálculos.

const CLAVES = {
    configuracion: 'walletera_configuracion',
    categorias:    'walletera_categorias',
    movimientos:   'walletera_movimientos',
    version:       'walletera_version'
};

// Versión del esquema guardado. Cada salto tiene su paso en migrarDatos().
const VERSION_DATOS = 3;

const TIPOS = ['gasto', 'ingreso'];

// Catálogo mínimo por si iconos.json no se puede cargar.
const GRUPOS_ICONOS_FALLBACK = [
    { grupo: 'Comida y bebida', iconos: ['🍔','🛒','☕','🍎','🥗'] },
    { grupo: 'Hogar',           iconos: ['🏠','💡','🔥','💧'] },
    { grupo: 'Transporte',      iconos: ['🚗','⛽','🚌','✈️'] },
    { grupo: 'Salud',           iconos: ['💊','🏥','💪'] },
    { grupo: 'Educación',       iconos: ['📚','🎓','💻'] },
    { grupo: 'Ocio',            iconos: ['🎬','🎮','🎵'] },
    { grupo: 'Otros',           iconos: ['👕','🐶','💰','🎁'] }
];

// ===== Estado en memoria =====
let configuracion = { fondoMensual: 0 };
let categorias    = [];
let movimientos   = [];
let gruposIconos  = [];

// ===== Helpers de persistencia =====
function leer(clave, porDefecto) {
    try {
        const raw = localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : porDefecto;
    } catch {
        return porDefecto;
    }
}

function escribir(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor));
}

const guardarConfiguracion = () => escribir(CLAVES.configuracion, configuracion);
const guardarCategorias    = () => escribir(CLAVES.categorias, categorias);
const guardarMovimientos   = () => escribir(CLAVES.movimientos, movimientos);

function generarId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ===== Fechas =====
// Las fechas de los movimientos se guardan como 'AAAA-MM-DD' (fecha local, sin hora)
// para que no dependan de la zona horaria del navegador.
const pad = n => String(n).padStart(2, '0');

function aFechaISO(fecha) {
    return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function fechaHoy() {
    return aFechaISO(new Date());
}

function esFechaISO(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function desdeFechaISO(fechaISO) {
    const [a, m, d] = fechaISO.split('-').map(Number);
    return new Date(a, m - 1, d);
}

// ===== Períodos ('AAAA-MM') =====
function periodoActual() {
    return fechaHoy().slice(0, 7);
}

function diasDelPeriodo(periodo) {
    const [a, m] = periodo.split('-').map(Number);
    return new Date(a, m, 0).getDate();
}

function nombrePeriodo(periodo) {
    const [a, m] = periodo.split('-').map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

// ===== Migraciones =====
// v1: datos de prueba de otra app (sin "nombre"/"presupuesto"); se descartan al validar.
// v2: ids numéricos, fecha como timestamp (parseada en UTC), ingresos con categoría,
//     "gastado" y "saldoRestante" persistidos.
// v3: ids string, fecha 'AAAA-MM-DD', ingresos sin categoría, solo datos de origen.
function timestampAFechaISO(ts) {
    const d = new Date(ts);
    // Los timestamps exactos a medianoche UTC vienen de new Date('AAAA-MM-DD'):
    // la fecha que eligió el usuario es la fecha UTC, no la local.
    if (ts % 86400000 === 0) {
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return aFechaISO(d);
}

function normalizarCategoria(c) {
    if (!c || typeof c.nombre !== 'string' || !c.nombre.trim()) return null;
    const presupuesto = Number(c.presupuesto);
    if (!Number.isFinite(presupuesto) || presupuesto < 0) return null;
    return {
        id: String(c.id ?? generarId()),
        nombre: c.nombre.trim(),
        icono: typeof c.icono === 'string' && c.icono ? c.icono : '💰',
        presupuesto
    };
}

function normalizarMovimiento(m, idsCategorias) {
    if (!m || typeof m.descripcion !== 'string' || !TIPOS.includes(m.tipo)) return null;
    const monto = Number(m.monto);
    if (!Number.isFinite(monto) || monto <= 0) return null;
    let fecha = m.fecha;
    if (typeof fecha === 'number' && Number.isFinite(fecha)) fecha = timestampAFechaISO(fecha);
    if (!esFechaISO(fecha)) return null;
    const categoriaId = m.tipo === 'gasto' && m.categoriaId != null && idsCategorias.has(String(m.categoriaId))
        ? String(m.categoriaId)
        : null;
    return {
        id: String(m.id ?? generarId()),
        descripcion: m.descripcion.trim(),
        monto,
        categoriaId,
        tipo: m.tipo,
        fecha,
        creado: Number(m.creado) || (typeof m.id === 'number' ? m.id : 0)
    };
}

function migrarDatos() {
    const version = Number(localStorage.getItem(CLAVES.version)) || 1;
    if (version >= VERSION_DATOS) return;

    const rawCategorias  = localStorage.getItem(CLAVES.categorias);
    const rawMovimientos = localStorage.getItem(CLAVES.movimientos);
    if (rawCategorias || rawMovimientos) {
        // Copia intacta de lo que había antes de migrar, por si algo sale mal.
        localStorage.setItem(`walletera_respaldo_v${version}`, JSON.stringify({
            categorias: rawCategorias,
            movimientos: rawMovimientos,
            configuracion: localStorage.getItem(CLAVES.configuracion)
        }));
    }

    const cats = leer(CLAVES.categorias, []);
    const movs = leer(CLAVES.movimientos, []);
    const categoriasValidas = (Array.isArray(cats) ? cats : []).map(normalizarCategoria).filter(Boolean);
    const ids = new Set(categoriasValidas.map(c => c.id));
    const movimientosValidos = (Array.isArray(movs) ? movs : [])
        .map(m => normalizarMovimiento(m, ids))
        .filter(Boolean);

    escribir(CLAVES.categorias, categoriasValidas);
    escribir(CLAVES.movimientos, movimientosValidos);
    localStorage.setItem(CLAVES.version, String(VERSION_DATOS));
}

// ===== Inicialización =====
async function inicializarDatos() {
    migrarDatos();
    configuracion = { fondoMensual: 0, ...leer(CLAVES.configuracion, {}) };
    configuracion.fondoMensual = Number(configuracion.fondoMensual) || 0;
    categorias  = leer(CLAVES.categorias, []);
    movimientos = leer(CLAVES.movimientos, []);
    await cargarIconos();
    if (categorias.length === 0 && movimientos.length === 0) {
        await cargarCategoriasIniciales();
    }
}

async function cargarJSON(ruta) {
    const respuesta = await fetch(ruta);
    if (!respuesta.ok) throw new Error(`No se pudo cargar ${ruta}`);
    return respuesta.json();
}

async function cargarIconos() {
    try {
        gruposIconos = await cargarJSON('./iconos.json');
    } catch {
        gruposIconos = GRUPOS_ICONOS_FALLBACK;
    }
}

async function cargarCategoriasIniciales() {
    try {
        const data = await cargarJSON('./categorias.json');
        categorias = data.map(normalizarCategoria).filter(Boolean).map(c => ({ ...c, id: generarId() }));
        guardarCategorias();
    } catch {
        categorias = [];
    }
}

function obtenerGruposIconos() {
    return gruposIconos.length ? gruposIconos : GRUPOS_ICONOS_FALLBACK;
}

function primerIcono() {
    return obtenerGruposIconos()[0]?.iconos[0] ?? '💰';
}

// ===== Fondo mensual =====
function obtenerFondoMensual() {
    return configuracion.fondoMensual;
}

function setearFondoMensual(monto) {
    configuracion.fondoMensual = Number(monto);
    guardarConfiguracion();
}

// ===== Categorías =====
function obtenerCategorias() {
    return categorias;
}

function obtenerCategoriaPorId(id) {
    return categorias.find(c => c.id === String(id));
}

function crearCategoria({ nombre, icono, presupuesto }) {
    const nueva = { id: generarId(), nombre: nombre.trim(), icono, presupuesto: Number(presupuesto) };
    categorias.push(nueva);
    guardarCategorias();
    return nueva;
}

function editarCategoria(id, { nombre, icono, presupuesto }) {
    const cat = obtenerCategoriaPorId(id);
    if (!cat) return null;
    Object.assign(cat, { nombre: nombre.trim(), icono, presupuesto: Number(presupuesto) });
    guardarCategorias();
    return cat;
}

// Los movimientos de la categoría se conservan y quedan "Sin categoría":
// borrar un rubro no debe alterar el historial ni el saldo.
function eliminarCategoria(id) {
    const clave = String(id);
    categorias = categorias.filter(c => c.id !== clave);
    movimientos.forEach(m => { if (m.categoriaId === clave) m.categoriaId = null; });
    guardarCategorias();
    guardarMovimientos();
}

// ===== Movimientos =====
function ordenarMovimientos(lista) {
    return [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
}

function obtenerMovimientos() {
    return ordenarMovimientos(movimientos);
}

function obtenerMovimientoPorId(id) {
    return movimientos.find(m => m.id === String(id));
}

function datosMovimiento({ descripcion, monto, categoriaId, tipo, fecha }) {
    return {
        descripcion: descripcion.trim(),
        monto: Number(monto),
        categoriaId: tipo === 'gasto' && categoriaId ? String(categoriaId) : null,
        tipo,
        fecha
    };
}

function crearMovimiento(datos) {
    const nuevo = { id: generarId(), ...datosMovimiento(datos), creado: Date.now() };
    movimientos.push(nuevo);
    guardarMovimientos();
    return nuevo;
}

function editarMovimiento(id, datos) {
    const m = obtenerMovimientoPorId(id);
    if (!m) return null;
    Object.assign(m, datosMovimiento(datos));
    guardarMovimientos();
    return m;
}

function eliminarMovimiento(id) {
    movimientos = movimientos.filter(m => m.id !== String(id));
    guardarMovimientos();
}

function buscarYFiltrar(texto, tipo) {
    const q = texto.trim().toLowerCase();
    return obtenerMovimientos().filter(m =>
        (tipo === 'todos' || m.tipo === tipo) &&
        (!q || m.descripcion.toLowerCase().includes(q))
    );
}

// ===== Cálculos del período =====
function movimientosDelPeriodo(periodo = periodoActual()) {
    return movimientos.filter(m => m.fecha.startsWith(periodo));
}

const sumar = lista => lista.reduce((acc, m) => acc + m.monto, 0);

// Modelo: el dinero del mes es el fondo más los ingresos del mes.
// El saldo es lo que queda de eso, y el % utilizado se mide sobre ese mismo total.
function calcularResumen(periodo = periodoActual()) {
    const movs = movimientosDelPeriodo(periodo);
    const ingresos = sumar(movs.filter(m => m.tipo === 'ingreso'));
    const gastos = sumar(movs.filter(m => m.tipo === 'gasto'));
    const fondo = configuracion.fondoMensual;
    const disponibleTotal = fondo + ingresos;
    return {
        fondo,
        ingresos,
        gastos,
        disponibleTotal,
        saldo: disponibleTotal - gastos,
        porcentajeUtilizado: disponibleTotal > 0 ? (gastos / disponibleTotal) * 100 : 0,
        cantidad: movs.length
    };
}

function calcularPromedioDiario(periodo = periodoActual()) {
    const dias = periodo === periodoActual() ? new Date().getDate() : diasDelPeriodo(periodo);
    return calcularResumen(periodo).gastos / dias;
}

// Gasto por categoría en el período. La clave null agrupa los gastos sin categoría.
function calcularGastoPorCategoria(periodo = periodoActual()) {
    const gasto = new Map();
    movimientosDelPeriodo(periodo)
        .filter(m => m.tipo === 'gasto')
        .forEach(m => {
            const clave = m.categoriaId && obtenerCategoriaPorId(m.categoriaId) ? m.categoriaId : null;
            gasto.set(clave, (gasto.get(clave) ?? 0) + m.monto);
        });
    return gasto;
}

function obtenerCategoriasConGasto(periodo = periodoActual()) {
    const gasto = calcularGastoPorCategoria(periodo);
    return categorias.map(c => ({ ...c, gastado: gasto.get(c.id) ?? 0 }));
}

function obtenerCategoriaMasGastada(periodo = periodoActual()) {
    return obtenerCategoriasConGasto(periodo)
        .filter(c => c.gastado > 0)
        .reduce((top, c) => (!top || c.gastado > top.gastado ? c : top), null);
}

function obtenerDatosGrafico(periodo = periodoActual()) {
    const datos = obtenerCategoriasConGasto(periodo)
        .filter(c => c.gastado > 0)
        .map(c => ({ etiqueta: `${c.icono} ${c.nombre}`, valor: c.gastado, sinCategoria: false }));
    const sinCategoria = calcularGastoPorCategoria(periodo).get(null);
    if (sinCategoria) datos.push({ etiqueta: 'Sin categoría', valor: sinCategoria, sinCategoria: true });
    return datos;
}

// ===== Formateadores =====
function formatearMoneda(monto) {
    const valor = monto || 0;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
        maximumFractionDigits: 2
    }).format(valor);
}

function formatearFecha(fechaISO) {
    return desdeFechaISO(fechaISO).toLocaleDateString('es-AR', {
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    });
}

export {
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
};
