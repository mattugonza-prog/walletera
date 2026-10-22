// ===== Walletera | datos.js =====
// Capa de datos: estado, persistencia, migraciones y cálculos.
import { generarDatosDeEjemplo } from './ejemplo.js';

const CLAVES = {
    configuracion: 'walletera_configuracion',
    cuentas:       'walletera_cuentas',
    categorias:    'walletera_categorias',
    movimientos:   'walletera_movimientos',
    version:       'walletera_version'
};

// Versión del esquema guardado. Cada salto tiene su paso en migrarDatos().
const VERSION_DATOS = 5;

const TIPOS_CUENTA = {
    efectivo:  { nombre: 'Efectivo',           icono: 'ph-money' },
    banco:     { nombre: 'Cuenta bancaria',    icono: 'ph-bank' },
    billetera: { nombre: 'Billetera virtual',  icono: 'ph-device-mobile' },
    credito:   { nombre: 'Tarjeta de crédito', icono: 'ph-credit-card' }
};

const COLORES_CATEGORIA = ['naranja', 'azul', 'rosa', 'verde', 'violeta', 'amarillo', 'turquesa', 'gris'];

// Catálogo mínimo por si iconos.json no se puede cargar.
const GRUPOS_ICONOS_FALLBACK = [
    { grupo: 'Comida',     iconos: ['ph-fork-knife', 'ph-shopping-cart', 'ph-coffee'] },
    { grupo: 'Hogar',      iconos: ['ph-house', 'ph-lightning', 'ph-drop'] },
    { grupo: 'Transporte', iconos: ['ph-car', 'ph-bus', 'ph-gas-pump'] },
    { grupo: 'Otros',      iconos: ['ph-heartbeat', 'ph-film-slate', 'ph-piggy-bank', 'ph-tag'] }
];

// Hasta v4 las categorías usaban emojis; v5 los reemplaza por un ícono y un color.
const EMOJI_A_ICONO = {
    '🍔': ['ph-fork-knife', 'naranja'], '🍕': ['ph-fork-knife', 'naranja'], '🥗': ['ph-fork-knife', 'naranja'],
    '🛒': ['ph-shopping-cart', 'naranja'], '🍎': ['ph-shopping-cart', 'naranja'], '🍞': ['ph-bread', 'naranja'],
    '☕': ['ph-coffee', 'naranja'], '🍷': ['ph-wine', 'rosa'], '🍺': ['ph-wine', 'amarillo'],
    '🏠': ['ph-house', 'violeta'], '🏡': ['ph-house', 'violeta'], '💡': ['ph-lightning', 'amarillo'],
    '🔥': ['ph-flame', 'naranja'], '💧': ['ph-drop', 'azul'], '🛠️': ['ph-wrench', 'gris'], '📺': ['ph-film-slate', 'rosa'],
    '🚗': ['ph-car', 'azul'], '🚙': ['ph-car', 'azul'], '⛽': ['ph-gas-pump', 'azul'], '🚌': ['ph-bus', 'azul'],
    '🚕': ['ph-taxi', 'amarillo'], '🚆': ['ph-train', 'azul'], '🚇': ['ph-train', 'azul'], '✈️': ['ph-airplane', 'azul'],
    '🚲': ['ph-bicycle', 'verde'],
    '💊': ['ph-pill', 'turquesa'], '🏥': ['ph-first-aid', 'turquesa'], '🦷': ['ph-tooth', 'turquesa'],
    '💪': ['ph-barbell', 'turquesa'], '🩺': ['ph-heartbeat', 'turquesa'],
    '📚': ['ph-graduation-cap', 'amarillo'], '🎓': ['ph-graduation-cap', 'amarillo'], '📖': ['ph-book-open', 'amarillo'],
    '💻': ['ph-laptop', 'azul'], '💼': ['ph-briefcase', 'verde'],
    '🎬': ['ph-film-slate', 'rosa'], '🎮': ['ph-game-controller', 'rosa'], '🎵': ['ph-music-notes', 'rosa'],
    '🎟️': ['ph-ticket', 'rosa'], '🏖️': ['ph-umbrella', 'turquesa'],
    '👕': ['ph-t-shirt', 'violeta'], '👗': ['ph-t-shirt', 'violeta'], '👟': ['ph-shopping-bag', 'violeta'],
    '👜': ['ph-shopping-bag', 'violeta'], '💇': ['ph-scissors', 'violeta'], '🛍️': ['ph-storefront', 'naranja'],
    '🐶': ['ph-paw-print', 'naranja'], '🐱': ['ph-paw-print', 'naranja'], '🐾': ['ph-paw-print', 'naranja'],
    '💰': ['ph-piggy-bank', 'verde'], '💵': ['ph-money', 'verde'], '💳': ['ph-credit-card', 'gris'],
    '🏦': ['ph-bank', 'gris'], '📈': ['ph-chart-line-up', 'turquesa'], '🪙': ['ph-coins', 'amarillo'],
    '🧾': ['ph-receipt', 'gris'], '🎁': ['ph-gift', 'rosa'], '❤️': ['ph-heart', 'rosa'], '⭐': ['ph-star', 'amarillo']
};

// ===== Estado en memoria =====
let cuentas       = [];
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

const guardarCuentas     = () => escribir(CLAVES.cuentas, cuentas);
const guardarCategorias  = () => escribir(CLAVES.categorias, categorias);
const guardarMovimientos = () => escribir(CLAVES.movimientos, movimientos);

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

function desplazarPeriodo(periodo, meses) {
    const [a, m] = periodo.split('-').map(Number);
    return aFechaISO(new Date(a, m - 1 + meses, 1)).slice(0, 7);
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
// v4: cuentas con saldo inicial (reemplazan al "fondo mensual"), transferencias
//     y categorías con tipo (gasto / ingreso).
// v5: categorías con ícono de Phosphor y color en lugar de emoji.
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
    const presupuesto = Number(c.presupuesto ?? 0);
    if (!Number.isFinite(presupuesto) || presupuesto < 0) return null;
    const tipo = c.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    const esIcono = typeof c.icono === 'string' && /^ph-[a-z0-9-]+$/.test(c.icono);
    const [iconoMigrado, colorMigrado] = esIcono ? [c.icono] : (EMOJI_A_ICONO[c.icono] ?? ['ph-tag', 'gris']);
    return {
        id: String(c.id ?? generarId()),
        nombre: c.nombre.trim(),
        icono: iconoMigrado,
        color: COLORES_CATEGORIA.includes(c.color) ? c.color : (colorMigrado ?? 'gris'),
        tipo,
        presupuesto: tipo === 'gasto' ? presupuesto : 0
    };
}

function normalizarMovimientoV3(m, idsCategorias) {
    if (!m || typeof m.descripcion !== 'string' || !['gasto', 'ingreso'].includes(m.tipo)) return null;
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

// Hasta v3: validar y normalizar lo guardado.
function migrarAV3({ categorias: cats, movimientos: movs }) {
    const categoriasV3 = (Array.isArray(cats) ? cats : []).map(normalizarCategoria).filter(Boolean);
    const ids = new Set(categoriasV3.map(c => c.id));
    const movimientosV3 = (Array.isArray(movs) ? movs : [])
        .map(m => normalizarMovimientoV3(m, ids))
        .filter(Boolean);
    return { categorias: categoriasV3, movimientos: movimientosV3 };
}

// v3 → v4: el fondo mensual pasa a ser el saldo inicial de una cuenta principal
// a la que se asignan todos los movimientos existentes.
function migrarAV4({ categorias: cats, movimientos: movs }, config) {
    const fondo = Number(config.fondoMensual) || 0;
    const cuentasV4 = [];
    if (movs.length || fondo) {
        cuentasV4.push({ id: generarId(), nombre: 'Cuenta principal', tipo: 'banco', saldoInicial: fondo });
    }
    const principal = cuentasV4[0]?.id ?? null;
    const resto = { ...config };
    delete resto.fondoMensual;
    return {
        configuracion: resto,
        cuentas: cuentasV4,
        categorias: cats.map(c => ({ ...c, tipo: 'gasto' })),
        movimientos: movs.map(m => ({ ...m, cuentaId: principal, cuentaDestinoId: null }))
    };
}

function migrarDatos() {
    const version = Number(localStorage.getItem(CLAVES.version)) || 1;
    if (version >= VERSION_DATOS) return { desde: version };

    const crudo = {
        configuracion: localStorage.getItem(CLAVES.configuracion),
        categorias: localStorage.getItem(CLAVES.categorias),
        cuentas: localStorage.getItem(CLAVES.cuentas),
        movimientos: localStorage.getItem(CLAVES.movimientos)
    };
    if (Object.values(crudo).some(Boolean)) {
        // Copia intacta de lo que había antes de migrar, por si algo sale mal.
        localStorage.setItem(`walletera_respaldo_v${version}`, JSON.stringify(crudo));
    }

    if (version < 4) {
        const config = leer(CLAVES.configuracion, {});
        const v3 = migrarAV3({ categorias: leer(CLAVES.categorias, []), movimientos: leer(CLAVES.movimientos, []) });
        const v4 = migrarAV4(v3, config && typeof config === 'object' ? config : {});
        escribir(CLAVES.configuracion, v4.configuracion);
        escribir(CLAVES.cuentas, v4.cuentas);
        escribir(CLAVES.categorias, v4.categorias);
        escribir(CLAVES.movimientos, v4.movimientos);
    }
    // v4 → v5: emoji → ícono + color (normalizarCategoria hace la conversión).
    escribir(CLAVES.categorias, leer(CLAVES.categorias, []).map(normalizarCategoria).filter(Boolean));
    localStorage.setItem(CLAVES.version, String(VERSION_DATOS));
    return { desde: version };
}

// ===== Inicialización =====
async function inicializarDatos() {
    const { desde } = migrarDatos();
    cuentas       = leer(CLAVES.cuentas, []);
    categorias    = leer(CLAVES.categorias, []);
    movimientos   = leer(CLAVES.movimientos, []);
    await cargarIconos();

    const sinDatos = categorias.length === 0 && movimientos.length === 0;
    const faltanIngresos = desde < 4 && !categorias.some(c => c.tipo === 'ingreso');
    if (sinDatos || faltanIngresos) {
        const semilla = await cargarCategoriasIniciales();
        categorias = sinDatos ? semilla : [...categorias, ...semilla.filter(c => c.tipo === 'ingreso')];
        guardarCategorias();
    }
    if (cuentas.length === 0 && movimientos.length === 0) {
        cuentas = [{ id: generarId(), nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 }];
        guardarCuentas();
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
        return data.map(normalizarCategoria).filter(Boolean).map(c => ({ ...c, id: generarId() }));
    } catch {
        return [];
    }
}

// ===== Respaldo, importación y datos de ejemplo =====
function normalizarCuenta(c) {
    if (!c || typeof c.nombre !== 'string' || !c.nombre.trim()) return null;
    const saldoInicial = Number(c.saldoInicial ?? 0);
    if (!Number.isFinite(saldoInicial)) return null;
    return {
        id: String(c.id ?? generarId()),
        nombre: c.nombre.trim(),
        tipo: TIPOS_CUENTA[c.tipo] ? c.tipo : 'efectivo',
        saldoInicial
    };
}

function normalizarMovimiento(m, idsCuentas, categoriasPorId) {
    if (!m || typeof m.descripcion !== 'string' || !['gasto', 'ingreso', 'transferencia'].includes(m.tipo)) return null;
    const monto = Number(m.monto);
    if (!Number.isFinite(monto) || monto <= 0 || !esFechaISO(m.fecha)) return null;
    const cuentaId = String(m.cuentaId);
    if (!idsCuentas.has(cuentaId)) return null;
    const esTransferencia = m.tipo === 'transferencia';
    const destino = esTransferencia ? String(m.cuentaDestinoId) : null;
    if (esTransferencia && (!idsCuentas.has(destino) || destino === cuentaId)) return null;
    const cat = !esTransferencia && m.categoriaId != null ? categoriasPorId.get(String(m.categoriaId)) : null;
    return {
        id: String(m.id ?? generarId()),
        descripcion: m.descripcion.trim(),
        monto,
        tipo: m.tipo,
        fecha: m.fecha,
        cuentaId,
        cuentaDestinoId: destino,
        categoriaId: cat && cat.tipo === m.tipo ? cat.id : null,
        creado: Number(m.creado) || 0
    };
}

// Valida un respaldo completo. Lanza un Error con un mensaje para el usuario si no sirve;
// los registros sueltos inválidos se descartan y se informan en "descartados".
function validarRespaldo(datos) {
    if (!datos || typeof datos !== 'object' ||
        !Array.isArray(datos.cuentas) || !Array.isArray(datos.categorias) || !Array.isArray(datos.movimientos)) {
        throw new Error('El archivo no es un respaldo de Walletera.');
    }
    const cuentasValidas = datos.cuentas.map(normalizarCuenta).filter(Boolean);
    const categoriasValidas = datos.categorias.map(normalizarCategoria).filter(Boolean);
    const idsCuentas = new Set(cuentasValidas.map(c => c.id));
    const categoriasPorId = new Map(categoriasValidas.map(c => [c.id, c]));
    const movimientosValidos = datos.movimientos
        .map(m => normalizarMovimiento(m, idsCuentas, categoriasPorId))
        .filter(Boolean);
    return {
        cuentas: cuentasValidas,
        categorias: categoriasValidas,
        movimientos: movimientosValidos,
        descartados: datos.movimientos.length - movimientosValidos.length
    };
}

function reemplazarDatos(datos) {
    const validos = validarRespaldo(datos);
    cuentas = validos.cuentas;
    categorias = validos.categorias;
    movimientos = validos.movimientos;
    guardarCuentas();
    guardarCategorias();
    guardarMovimientos();
    return validos;
}

function exportarRespaldo() {
    return {
        app: 'walletera',
        version: VERSION_DATOS,
        exportado: new Date().toISOString(),
        cuentas,
        categorias,
        movimientos
    };
}

// CSV con ";" y coma decimal, como lo espera Excel en español.
// Los textos que empiezan con = + - @ se prefijan para que no se ejecuten como fórmulas.
function exportarCSV() {
    const texto = valor => {
        const t = String(valor ?? '');
        return /^[=+\-@]/.test(t) ? `'${t}` : t;
    };
    const celda = valor => {
        const t = String(valor);
        return /[";\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
    };
    const tipos = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' };
    const filas = ordenarMovimientos(movimientos).map(m => [
        m.fecha,
        tipos[m.tipo],
        texto(m.descripcion),
        (m.tipo === 'gasto' ? -m.monto : m.monto).toFixed(2).replace('.', ','),
        texto(obtenerCuentaPorId(m.cuentaId)?.nombre),
        texto(m.cuentaDestinoId ? obtenerCuentaPorId(m.cuentaDestinoId)?.nombre : ''),
        texto(m.categoriaId ? obtenerCategoriaPorId(m.categoriaId)?.nombre : '')
    ]);
    const encabezado = ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Cuenta', 'Cuenta destino', 'Categoría'];
    return [encabezado, ...filas].map(fila => fila.map(celda).join(';')).join('\r\n');
}

async function cargarDatosDeEjemplo() {
    const semilla = await cargarCategoriasIniciales();
    return reemplazarDatos(generarDatosDeEjemplo(semilla));
}

// Borra todo (incluidos los respaldos de migración) y vuelve al estado inicial.
async function reiniciarDatos() {
    Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .filter(clave => clave.startsWith('walletera_respaldo_'))
        .forEach(clave => localStorage.removeItem(clave));
    [CLAVES.cuentas, CLAVES.categorias, CLAVES.movimientos].forEach(clave => localStorage.removeItem(clave));
    await inicializarDatos();
}

const hayMovimientos = () => movimientos.length > 0;

function obtenerGruposIconos() {
    return gruposIconos.length ? gruposIconos : GRUPOS_ICONOS_FALLBACK;
}

function primerIcono() {
    return obtenerGruposIconos()[0]?.iconos[0] ?? 'ph-tag';
}

// ===== Cuentas =====
function obtenerCuentas() {
    return cuentas;
}

function obtenerCuentaPorId(id) {
    return cuentas.find(c => c.id === String(id));
}

function datosCuenta({ nombre, tipo, saldoInicial }) {
    return {
        nombre: nombre.trim(),
        tipo: TIPOS_CUENTA[tipo] ? tipo : 'efectivo',
        saldoInicial: Number(saldoInicial) || 0
    };
}

function crearCuenta(datos) {
    const nueva = { id: generarId(), ...datosCuenta(datos) };
    cuentas.push(nueva);
    guardarCuentas();
    return nueva;
}

function editarCuenta(id, datos) {
    const cuenta = obtenerCuentaPorId(id);
    if (!cuenta) return null;
    Object.assign(cuenta, datosCuenta(datos));
    guardarCuentas();
    return cuenta;
}

function contarMovimientosDeCuenta(id) {
    const clave = String(id);
    return movimientos.filter(m => m.cuentaId === clave || m.cuentaDestinoId === clave).length;
}

// Una cuenta con movimientos no se elimina: borrarla cambiaría el saldo total
// y dejaría transferencias sin origen o destino.
function eliminarCuenta(id) {
    if (contarMovimientosDeCuenta(id) > 0) return false;
    cuentas = cuentas.filter(c => c.id !== String(id));
    guardarCuentas();
    return true;
}

function calcularSaldoCuenta(cuenta) {
    return movimientos.reduce((saldo, m) => {
        if (m.cuentaId === cuenta.id) saldo += m.tipo === 'ingreso' ? m.monto : -m.monto;
        if (m.tipo === 'transferencia' && m.cuentaDestinoId === cuenta.id) saldo += m.monto;
        return saldo;
    }, cuenta.saldoInicial);
}

function obtenerCuentasConSaldo() {
    return cuentas.map(c => ({ ...c, saldo: calcularSaldoCuenta(c) }));
}

function calcularSaldoTotal() {
    return obtenerCuentasConSaldo().reduce((acc, c) => acc + c.saldo, 0);
}

// ===== Categorías =====
function obtenerCategorias(tipo) {
    return tipo ? categorias.filter(c => c.tipo === tipo) : categorias;
}

function obtenerCategoriaPorId(id) {
    return categorias.find(c => c.id === String(id));
}

function crearCategoria({ nombre, icono, color, presupuesto, tipo }) {
    const nueva = normalizarCategoria({ id: generarId(), nombre, icono, color, presupuesto, tipo });
    categorias.push(nueva);
    guardarCategorias();
    return nueva;
}

// El tipo de una categoría no cambia al editarla: sus movimientos ya son de ese tipo.
function editarCategoria(id, { nombre, icono, color, presupuesto }) {
    const cat = obtenerCategoriaPorId(id);
    if (!cat) return null;
    Object.assign(cat, normalizarCategoria({ ...cat, nombre, icono, color, presupuesto }));
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

function obtenerMovimientos(periodo) {
    return ordenarMovimientos(periodo ? movimientosDelPeriodo(periodo) : movimientos);
}

function obtenerMovimientoPorId(id) {
    return movimientos.find(m => m.id === String(id));
}

function datosMovimiento({ descripcion, monto, tipo, fecha, cuentaId, cuentaDestinoId, categoriaId }) {
    const esTransferencia = tipo === 'transferencia';
    const cat = !esTransferencia && categoriaId ? obtenerCategoriaPorId(categoriaId) : null;
    return {
        descripcion: descripcion.trim() || (esTransferencia ? 'Transferencia' : ''),
        monto: Number(monto),
        tipo,
        fecha,
        cuentaId: String(cuentaId),
        cuentaDestinoId: esTransferencia ? String(cuentaDestinoId) : null,
        categoriaId: cat && cat.tipo === tipo ? cat.id : null
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

// Agrupa una lista ya ordenada por fecha. El neto del día ignora las transferencias.
function agruparPorDia(lista) {
    const grupos = [];
    lista.forEach(m => {
        let grupo = grupos[grupos.length - 1];
        if (!grupo || grupo.fecha !== m.fecha) {
            grupo = { fecha: m.fecha, movimientos: [], neto: 0, soloTransferencias: true };
            grupos.push(grupo);
        }
        grupo.movimientos.push(m);
        if (m.tipo !== 'transferencia') {
            grupo.neto += m.tipo === 'ingreso' ? m.monto : -m.monto;
            grupo.soloTransferencias = false;
        }
    });
    return grupos;
}

function buscarYFiltrar(texto, tipo, periodo) {
    const q = texto.trim().toLowerCase();
    return obtenerMovimientos(periodo).filter(m =>
        (tipo === 'todos' || m.tipo === tipo) &&
        (!q || m.descripcion.toLowerCase().includes(q))
    );
}

// ===== Cálculos del período =====
// Las transferencias mueven dinero entre cuentas propias: no son ingreso ni gasto.
function movimientosDelPeriodo(periodo) {
    return movimientos.filter(m => m.fecha.startsWith(periodo));
}

const sumar = lista => lista.reduce((acc, m) => acc + m.monto, 0);

function totalPorTipo(periodo, tipo) {
    return sumar(movimientosDelPeriodo(periodo).filter(m => m.tipo === tipo));
}

function calcularResumen(periodo) {
    const ingresos = totalPorTipo(periodo, 'ingreso');
    const gastos = totalPorTipo(periodo, 'gasto');
    const presupuesto = obtenerCategorias('gasto').reduce((acc, c) => acc + c.presupuesto, 0);
    return {
        ingresos,
        gastos,
        resultado: ingresos - gastos,
        presupuesto,
        porcentajePresupuesto: presupuesto > 0 ? (gastos / presupuesto) * 100 : 0,
        cantidad: movimientosDelPeriodo(periodo).length
    };
}

function calcularPromedioDiario(periodo) {
    const dias = periodo === periodoActual() ? new Date().getDate() : diasDelPeriodo(periodo);
    return Math.round(totalPorTipo(periodo, 'gasto') / dias);
}

// Variación porcentual de los gastos contra el mes anterior (null si no hay base).
function calcularVariacionGastos(periodo) {
    const anterior = totalPorTipo(desplazarPeriodo(periodo, -1), 'gasto');
    if (anterior === 0) return null;
    return ((totalPorTipo(periodo, 'gasto') - anterior) / anterior) * 100;
}

// Ingresos y gastos de los últimos `meses` períodos, del más viejo al más nuevo.
function calcularSerieMensual(periodoFin, meses = 6) {
    return Array.from({ length: meses }, (_, i) => {
        const p = desplazarPeriodo(periodoFin, i - meses + 1);
        return { periodo: p, ingresos: totalPorTipo(p, 'ingreso'), gastos: totalPorTipo(p, 'gasto') };
    });
}

// Monto por categoría en el período. La clave null agrupa lo que no tiene categoría.
function calcularMontoPorCategoria(tipo, periodo) {
    const montos = new Map();
    movimientosDelPeriodo(periodo)
        .filter(m => m.tipo === tipo)
        .forEach(m => {
            const clave = m.categoriaId && obtenerCategoriaPorId(m.categoriaId) ? m.categoriaId : null;
            montos.set(clave, (montos.get(clave) ?? 0) + m.monto);
        });
    return montos;
}

function obtenerCategoriasConMonto(tipo, periodo) {
    const montos = calcularMontoPorCategoria(tipo, periodo);
    return obtenerCategorias(tipo).map(c => ({ ...c, monto: montos.get(c.id) ?? 0 }));
}

function obtenerCategoriaMasGastada(periodo) {
    return obtenerCategoriasConMonto('gasto', periodo)
        .filter(c => c.monto > 0)
        .reduce((top, c) => (!top || c.monto > top.monto ? c : top), null);
}

function obtenerDatosGrafico(periodo) {
    const datos = obtenerCategoriasConMonto('gasto', periodo)
        .filter(c => c.monto > 0)
        .map(c => ({ etiqueta: c.nombre, valor: c.monto, color: c.color }));
    const sinCategoria = calcularMontoPorCategoria('gasto', periodo).get(null);
    if (sinCategoria) datos.push({ etiqueta: 'Sin categoría', valor: sinCategoria, color: 'gris' });
    return datos;
}

// ===== Formateadores =====
// Usa el signo menos tipográfico (−) en lugar del guion de Intl.
function formatearMoneda(monto) {
    const valor = monto || 0;
    const texto = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
        maximumFractionDigits: 2
    }).format(Math.abs(valor));
    return valor < 0 ? `−\u00a0${texto}` : texto;
}

// "Hoy", "Ayer" o "Martes 20" (con el mes si no es el actual).
function etiquetaDia(fechaISO) {
    const hoy = fechaHoy();
    const ayer = aFechaISO(new Date(Date.now() - 86400000));
    if (fechaISO === hoy) return 'Hoy';
    if (fechaISO === ayer) return 'Ayer';
    const fecha = desdeFechaISO(fechaISO);
    const opciones = fechaISO.slice(0, 7) === hoy.slice(0, 7)
        ? { weekday: 'long', day: 'numeric' }
        : { weekday: 'long', day: 'numeric', month: 'long' };
    const texto = fecha.toLocaleDateString('es-AR', opciones).replace(',', '');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearFecha(fechaISO) {
    return desdeFechaISO(fechaISO).toLocaleDateString('es-AR', {
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    });
}

export {
    TIPOS_CUENTA, COLORES_CATEGORIA,
    inicializarDatos,
    obtenerGruposIconos, primerIcono,
    obtenerCuentas, obtenerCuentaPorId, crearCuenta, editarCuenta, eliminarCuenta,
    contarMovimientosDeCuenta, obtenerCuentasConSaldo, calcularSaldoTotal,
    obtenerCategorias, obtenerCategoriaPorId, crearCategoria, editarCategoria, eliminarCategoria,
    obtenerMovimientos, obtenerMovimientoPorId, crearMovimiento, editarMovimiento, eliminarMovimiento,
    buscarYFiltrar, agruparPorDia,
    periodoActual, desplazarPeriodo, nombrePeriodo, fechaHoy, esFechaISO,
    calcularResumen, calcularPromedioDiario, calcularVariacionGastos, calcularSerieMensual,
    obtenerCategoriasConMonto, obtenerCategoriaMasGastada, obtenerDatosGrafico,
    formatearMoneda, formatearFecha, etiquetaDia,
    validarRespaldo, reemplazarDatos, exportarRespaldo, exportarCSV,
    cargarDatosDeEjemplo, reiniciarDatos, hayMovimientos
};
