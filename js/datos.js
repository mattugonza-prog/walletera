// ===== Walletera | datos.js =====
// Capa de datos: estado, persistencia, migraciones y cálculos.
import { generarDatosDeEjemplo } from './ejemplo.js';
import {
    TIPOS_CUENTA, COLORES_CATEGORIA,
    generarId, redondearCentavos, pad, aFechaISO, desdeFechaISO, esFechaISO,
    desplazarPeriodo, diasDelPeriodo, rangoDePeriodo, proximaFecha, ocurrenciasPendientes, aplicarEdicionRecurrente,
    presupuestoDe, conPresupuesto,
    normalizarCategoria, validarRespaldo
} from './dominio.js';

const CLAVES = {
    configuracion: 'walletera_configuracion',
    cuentas:       'walletera_cuentas',
    categorias:    'walletera_categorias',
    movimientos:   'walletera_movimientos',
    recurrentes:   'walletera_recurrentes',
    version:       'walletera_version'
};

// Versión del esquema guardado. Cada salto tiene su paso en migrarDatos().
const VERSION_DATOS = 6;

// Catálogo mínimo por si iconos.json no se puede cargar.
const GRUPOS_ICONOS_FALLBACK = [
    { grupo: 'Comida',     iconos: ['ph-fork-knife', 'ph-shopping-cart', 'ph-coffee'] },
    { grupo: 'Hogar',      iconos: ['ph-house', 'ph-lightning', 'ph-drop'] },
    { grupo: 'Transporte', iconos: ['ph-car', 'ph-bus', 'ph-gas-pump'] },
    { grupo: 'Otros',      iconos: ['ph-heartbeat', 'ph-film-slate', 'ph-piggy-bank', 'ph-tag'] }
];

// ===== Estado en memoria =====
let cuentas       = [];
let categorias    = [];
let movimientos   = [];
let recurrentes   = [];
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
const guardarRecurrentes = () => escribir(CLAVES.recurrentes, recurrentes);

// ===== Fechas =====
// Las fechas de los movimientos se guardan como 'AAAA-MM-DD' (fecha local, sin hora)
// para que no dependan de la zona horaria del navegador.
function fechaHoy() {
    return aFechaISO(new Date());
}

// ===== Períodos ('AAAA-MM') =====
function periodoActual() {
    return fechaHoy().slice(0, 7);
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
// v6: presupuesto con vigencia mensual ([{ desde: 'AAAA-MM', monto }]) en lugar de uno único.
function timestampAFechaISO(ts) {
    const d = new Date(ts);
    // Los timestamps exactos a medianoche UTC vienen de new Date('AAAA-MM-DD'):
    // la fecha que eligió el usuario es la fecha UTC, no la local.
    if (ts % 86400000 === 0) {
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return aFechaISO(d);
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
        movimientos: localStorage.getItem(CLAVES.movimientos),
        recurrentes: localStorage.getItem(CLAVES.recurrentes)
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
    // v4 → v5 → v6: emoji → ícono + color y presupuesto único → presupuesto con vigencia
    // (normalizarCategoria hace las dos conversiones).
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
    recurrentes   = leer(CLAVES.recurrentes, []);
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
    generarRecurrentes();
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
function reemplazarDatos(datos) {
    const validos = validarRespaldo(datos);
    cuentas = validos.cuentas;
    categorias = validos.categorias;
    movimientos = validos.movimientos;
    recurrentes = validos.recurrentes;
    guardarCuentas();
    guardarCategorias();
    guardarMovimientos();
    guardarRecurrentes();
    generarRecurrentes();
    return validos;
}

function exportarRespaldo() {
    return {
        app: 'walletera',
        version: VERSION_DATOS,
        exportado: new Date().toISOString(),
        cuentas,
        categorias,
        movimientos,
        recurrentes
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
    const filas = filasParaExportar(ordenarMovimientos(movimientos)).map(f => [
        f.fecha,
        f.tipoNombre,
        texto(f.descripcion),
        f.monto.toFixed(2).replace('.', ','),
        texto(f.cuenta),
        texto(f.cuentaDestino),
        texto(f.categoria)
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
    [CLAVES.cuentas, CLAVES.categorias, CLAVES.movimientos, CLAVES.recurrentes].forEach(clave => localStorage.removeItem(clave));
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

const usaCuenta = clave => m => m.cuentaId === clave || m.cuentaDestinoId === clave;

function contarMovimientosDeCuenta(id) {
    return movimientos.filter(usaCuenta(String(id))).length;
}

function contarRecurrentesDeCuenta(id) {
    return recurrentes.filter(usaCuenta(String(id))).length;
}

// Una cuenta con movimientos no se elimina: borrarla cambiaría el saldo total
// y dejaría transferencias sin origen o destino.
function eliminarCuenta(id) {
    if (contarMovimientosDeCuenta(id) > 0 || contarRecurrentesDeCuenta(id) > 0) return false;
    cuentas = cuentas.filter(c => c.id !== String(id));
    guardarCuentas();
    return true;
}

function calcularSaldoCuenta(cuenta) {
    return movimientos.reduce((saldo, m) => {
        if (m.cuentaId === cuenta.id) saldo += m.tipo === 'ingreso' ? m.monto : -m.monto;
        if (m.tipo === 'transferencia' && m.cuentaDestinoId === cuenta.id) saldo += m.monto;
        return redondearCentavos(saldo);
    }, cuenta.saldoInicial);
}

function obtenerCuentasConSaldo() {
    return cuentas.map(c => ({ ...c, saldo: calcularSaldoCuenta(c) }));
}

function calcularSaldoTotal() {
    return obtenerCuentasConSaldo().reduce((acc, c) => redondearCentavos(acc + c.saldo), 0);
}

// ===== Categorías =====
function obtenerCategorias(tipo) {
    return tipo ? categorias.filter(c => c.tipo === tipo) : categorias;
}

function obtenerCategoriaPorId(id) {
    return categorias.find(c => c.id === String(id));
}

// El presupuesto se fija desde el mes que se está viendo: los meses anteriores conservan el suyo.
function crearCategoria({ nombre, icono, color, presupuesto = 0, tipo }, periodo = periodoActual()) {
    const presupuestos = conPresupuesto([], periodo, Number(presupuesto) || 0);
    const nueva = normalizarCategoria({ id: generarId(), nombre, icono, color, tipo, presupuestos });
    categorias.push(nueva);
    guardarCategorias();
    return nueva;
}

// El tipo de una categoría no cambia al editarla: sus movimientos ya son de ese tipo.
function editarCategoria(id, { nombre, icono, color, presupuesto }, periodo = periodoActual()) {
    const cat = obtenerCategoriaPorId(id);
    if (!cat) return null;
    const monto = Number(presupuesto) || 0;
    const presupuestos = cat.tipo === 'gasto' && monto !== presupuestoDe(cat, periodo)
        ? conPresupuesto(cat.presupuestos, periodo, monto)
        : cat.presupuestos;
    Object.assign(cat, normalizarCategoria({ ...cat, nombre, icono, color, presupuestos }));
    guardarCategorias();
    return cat;
}

// Los movimientos de la categoría se conservan y quedan "Sin categoría":
// borrar un rubro no debe alterar el historial ni el saldo.
function eliminarCategoria(id) {
    const clave = String(id);
    categorias = categorias.filter(c => c.id !== clave);
    [...movimientos, ...recurrentes].forEach(m => { if (m.categoriaId === clave) m.categoriaId = null; });
    guardarCategorias();
    guardarMovimientos();
    guardarRecurrentes();
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
        monto: redondearCentavos(Number(monto)),
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
            grupo.neto = redondearCentavos(grupo.neto + (m.tipo === 'ingreso' ? m.monto : -m.monto));
            grupo.soloTransferencias = false;
        }
    });
    return grupos;
}

// ===== Recurrentes =====
// Un recurrente es una plantilla de movimiento con frecuencia. Cada vez que se abre
// la app se registran las ocurrencias vencidas hasta hoy; "ultima" evita duplicarlas.
function generarRecurrentes(hasta = fechaHoy()) {
    let generados = 0;
    recurrentes.forEach(r => {
        const { id, inicio, frecuencia, ultima, ...plantilla } = r;
        ocurrenciasPendientes(r, hasta).forEach(fecha => {
            movimientos.push({ ...plantilla, id: generarId(), fecha, recurrenteId: id, creado: Date.now() + generados });
            r.ultima = fecha;
            generados++;
        });
    });
    if (generados) {
        guardarMovimientos();
        guardarRecurrentes();
    }
    return generados;
}

function obtenerRecurrentes() {
    return [...recurrentes].sort((a, b) => proximaFecha(a).localeCompare(proximaFecha(b)));
}

function obtenerRecurrentePorId(id) {
    return recurrentes.find(r => r.id === String(id));
}

function crearRecurrente(datos, frecuencia) {
    const { fecha, ...plantilla } = datosMovimiento(datos);
    const nuevo = { id: generarId(), ...plantilla, inicio: fecha, frecuencia, ultima: null };
    recurrentes.push(nuevo);
    guardarRecurrentes();
    generarRecurrentes();
    return nuevo;
}

// Cambia la plantilla para las próximas ocurrencias; las ya registradas no se tocan.
// La fecha recibida es la próxima ocurrencia y tiene que ser posterior a la última registrada.
function editarRecurrente(id, datos, frecuencia) {
    const r = obtenerRecurrentePorId(id);
    if (!r) return null;
    const { fecha, ...plantilla } = datosMovimiento(datos);
    Object.assign(r, aplicarEdicionRecurrente(r, plantilla, fecha, frecuencia));
    guardarRecurrentes();
    generarRecurrentes();
    return r;
}

// Los movimientos ya registrados se conservan, sin el vínculo.
function eliminarRecurrente(id) {
    const clave = String(id);
    recurrentes = recurrentes.filter(r => r.id !== clave);
    movimientos.forEach(m => { if (m.recurrenteId === clave) m.recurrenteId = null; });
    guardarRecurrentes();
    guardarMovimientos();
}

// Próxima ocurrencia de cada recurrente dentro de los próximos `dias`.
function obtenerProximosVencimientos(dias = 30) {
    const limite = aFechaISO(new Date(Date.now() + dias * 86400000));
    return obtenerRecurrentes()
        .map(r => ({ recurrente: r, fecha: proximaFecha(r) }))
        .filter(v => v.fecha <= limite);
}

// Movimientos entre dos fechas 'AAAA-MM-DD' (inclusive), del más nuevo al más viejo.
function obtenerMovimientosEntre({ desde, hasta }) {
    return ordenarMovimientos(movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta));
}

// `rango` es un período 'AAAA-MM' o un rango { desde, hasta }.
function buscarYFiltrar(texto, tipo, rango) {
    const q = texto.trim().toLowerCase();
    const lista = obtenerMovimientosEntre(typeof rango === 'string' ? rangoDePeriodo(rango) : rango);
    return lista.filter(m =>
        (tipo === 'todos' || m.tipo === tipo) &&
        (!q || m.descripcion.toLowerCase().includes(q))
    );
}

// ===== Cálculos del período =====
// Las transferencias mueven dinero entre cuentas propias: no son ingreso ni gasto.
function movimientosDelPeriodo(periodo) {
    return movimientos.filter(m => m.fecha.startsWith(periodo));
}

const sumar = lista => lista.reduce((acc, m) => redondearCentavos(acc + m.monto), 0);

// Totales de una lista cualquiera (las transferencias no son ingreso ni gasto).
function calcularTotales(lista) {
    const ingresos = sumar(lista.filter(m => m.tipo === 'ingreso'));
    const gastos = sumar(lista.filter(m => m.tipo === 'gasto'));
    return { ingresos, gastos, resultado: redondearCentavos(ingresos - gastos), cantidad: lista.length };
}

function totalPorTipo(periodo, tipo) {
    return sumar(movimientosDelPeriodo(periodo).filter(m => m.tipo === tipo));
}

function calcularResumen(periodo) {
    const ingresos = totalPorTipo(periodo, 'ingreso');
    const gastos = totalPorTipo(periodo, 'gasto');
    const presupuesto = obtenerCategorias('gasto').reduce((acc, c) => redondearCentavos(acc + presupuestoDe(c, periodo)), 0);
    return {
        ingresos,
        gastos,
        resultado: redondearCentavos(ingresos - gastos),
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

// Monto por categoría de una lista. La clave null agrupa lo que no tiene categoría.
function sumarPorCategoria(lista, tipo) {
    const montos = new Map();
    lista
        .filter(m => m.tipo === tipo)
        .forEach(m => {
            const clave = m.categoriaId && obtenerCategoriaPorId(m.categoriaId) ? m.categoriaId : null;
            montos.set(clave, redondearCentavos((montos.get(clave) ?? 0) + m.monto));
        });
    return montos;
}

function calcularMontoPorCategoria(tipo, periodo) {
    return sumarPorCategoria(movimientosDelPeriodo(periodo), tipo);
}

// Categorías de una lista con su monto y su parte del total, de mayor a menor.
function resumenPorCategoria(lista, tipo = 'gasto') {
    const montos = sumarPorCategoria(lista, tipo);
    const total = [...montos.values()].reduce((acc, monto) => redondearCentavos(acc + monto), 0);
    return [...montos]
        .map(([id, monto]) => ({
            nombre: id ? obtenerCategoriaPorId(id).nombre : 'Sin categoría',
            monto,
            porcentaje: total > 0 ? (monto / total) * 100 : 0
        }))
        .sort((a, b) => b.monto - a.monto);
}

// ===== Exportación =====
// Filas planas para CSV, Excel y PDF. El monto lleva signo: los gastos van en negativo.
const NOMBRES_TIPO = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' };

function filasParaExportar(lista) {
    const nombreCuenta = id => obtenerCuentaPorId(id)?.nombre ?? '';
    return lista.map(m => ({
        fecha: m.fecha,
        tipo: m.tipo,
        tipoNombre: NOMBRES_TIPO[m.tipo],
        descripcion: m.descripcion,
        categoria: m.categoriaId ? (obtenerCategoriaPorId(m.categoriaId)?.nombre ?? '') : '',
        cuenta: nombreCuenta(m.cuentaId),
        cuentaDestino: m.cuentaDestinoId ? nombreCuenta(m.cuentaDestinoId) : '',
        monto: m.tipo === 'gasto' ? -m.monto : m.monto
    }));
}

// Cada categoría con lo movido en el período y el presupuesto vigente ese mes.
function obtenerCategoriasConMonto(tipo, periodo) {
    const montos = calcularMontoPorCategoria(tipo, periodo);
    return obtenerCategorias(tipo).map(c => ({ ...c, monto: montos.get(c.id) ?? 0, presupuesto: presupuestoDe(c, periodo) }));
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

// "Mañana", "En 5 días" o "3 de noviembre" para fechas futuras.
function etiquetaProxima(fechaISO) {
    const hoy = desdeFechaISO(fechaHoy());
    const dias = Math.round((desdeFechaISO(fechaISO) - hoy) / 86400000);
    if (dias <= 0) return 'Hoy';
    if (dias === 1) return 'Mañana';
    if (dias < 7) return `En ${dias} días`;
    return desdeFechaISO(fechaISO).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
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
    contarMovimientosDeCuenta, contarRecurrentesDeCuenta, obtenerCuentasConSaldo, calcularSaldoTotal,
    obtenerCategorias, obtenerCategoriaPorId, crearCategoria, editarCategoria, eliminarCategoria, presupuestoDe,
    obtenerMovimientos, obtenerMovimientoPorId, crearMovimiento, editarMovimiento, eliminarMovimiento,
    obtenerMovimientosEntre, buscarYFiltrar, agruparPorDia, calcularTotales, resumenPorCategoria, filasParaExportar,
    obtenerRecurrentes, obtenerRecurrentePorId, crearRecurrente, editarRecurrente, eliminarRecurrente,
    obtenerProximosVencimientos, generarRecurrentes, proximaFecha,
    periodoActual, desplazarPeriodo, rangoDePeriodo, nombrePeriodo, fechaHoy, esFechaISO,
    calcularResumen, calcularPromedioDiario, calcularVariacionGastos, calcularSerieMensual,
    obtenerCategoriasConMonto, obtenerCategoriaMasGastada, obtenerDatosGrafico,
    formatearMoneda, formatearFecha, etiquetaDia, etiquetaProxima,
    validarRespaldo, reemplazarDatos, exportarRespaldo, exportarCSV,
    cargarDatosDeEjemplo, reiniciarDatos, hayMovimientos
};
