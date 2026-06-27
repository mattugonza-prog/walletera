// ===== Walletera | datos.js =====
// Capa de datos: arrays, objetos, CRUD, LocalStorage, fetch y cálculos.
// ===== Claves de LocalStorage =====
const CLAVES = {
    configuracion: 'walletera_configuracion',
    categorias:    'walletera_categorias',
    movimientos:   'walletera_movimientos',
    version:       'walletera_version'
};
// Versión del esquema de datos. Al subirla, se descartan datos previos incompatibles.
const VERSION_DATOS = '2';
// ===== Íconos para categorías (catálogo agrupado, se carga desde iconos.json) =====
let gruposIconos = [];
// Fallback mínimo por si la app se abre sin servidor (fetch bloqueado).
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
// ===== LocalStorage: guardar =====
function guardarConfiguracion() {
    localStorage.setItem(CLAVES.configuracion, JSON.stringify(configuracion));
}
function guardarCategorias() {
    localStorage.setItem(CLAVES.categorias, JSON.stringify(categorias));
}
function guardarMovimientos() {
    localStorage.setItem(CLAVES.movimientos, JSON.stringify(movimientos));
}
// ===== LocalStorage: cargar =====
function cargarConfiguracion() {
    const raw = localStorage.getItem(CLAVES.configuracion);
    if (raw) configuracion = JSON.parse(raw);
}
function cargarCategorias() {
    const raw = localStorage.getItem(CLAVES.categorias);
    if (raw) categorias = JSON.parse(raw);
}
function cargarMovimientos() {
    const raw = localStorage.getItem(CLAVES.movimientos);
    if (raw) movimientos = JSON.parse(raw);
}
// ===== Migración de datos previos =====
// Una versión anterior guardó en LocalStorage categorías que no corresponden a
// esta app (usuarios traídos de una API de prueba). Si la versión guardada no
// coincide con la actual, descartamos esos datos para re-sembrar desde el JSON.
function migrarDatosPrevios() {
    if (localStorage.getItem(CLAVES.version) !== VERSION_DATOS) {
        localStorage.removeItem(CLAVES.categorias);
        localStorage.removeItem(CLAVES.movimientos);
        localStorage.setItem(CLAVES.version, VERSION_DATOS);
    }
}
// ===== Inicialización (Promesas + Async/Await) =====
async function inicializarDatos() {
    migrarDatosPrevios();
    cargarConfiguracion();
    cargarCategorias();
    cargarMovimientos();
    await cargarIconos();
    if (categorias.length === 0) {
        await cargarCategoriasIniciales();
    }
    recalcularGastoCategorias();
}
// ===== Fetch del catálogo de íconos (Fetch API + Async/Await) =====
async function cargarIconos() {
    try {
        const respuesta = await fetch('./iconos.json');
        if (!respuesta.ok) throw new Error('No se pudo cargar iconos.json');
        gruposIconos = await respuesta.json();
    } catch (error) {
        // Sin servidor: usamos el catálogo mínimo embebido.
        gruposIconos = GRUPOS_ICONOS_FALLBACK;
    }
}
// Accesores del catálogo de íconos
function obtenerGruposIconos() {
    return gruposIconos.length ? gruposIconos : GRUPOS_ICONOS_FALLBACK;
}
function primerIcono() {
    const grupos = obtenerGruposIconos();
    return grupos[0] && grupos[0].iconos[0] ? grupos[0].iconos[0] : '💰';
}
// ===== Fetch al JSON local (Fetch API + Async/Await + map) =====
async function cargarCategoriasIniciales() {
    try {
        const respuesta = await fetch('./categorias.json');
        if (!respuesta.ok) throw new Error('No se pudo cargar categorias.json');
        const data = await respuesta.json();
        // map() para transformar y enriquecer la respuesta del JSON
        categorias = data.map((cat, index) => ({
            id: Date.now() + index,
            nombre: cat.nombre,
            icono: cat.icono,
            presupuesto: Number(cat.presupuesto),
            gastado: 0
        }));
        guardarCategorias();
    } catch (error) {
        // Si falla el fetch, la app arranca sin categorías y el estado vacío guía al usuario.
        categorias = [];
    }
}
// ===== Fondo mensual =====
function obtenerFondoMensual() {
    return configuracion.fondoMensual;
}
function setearFondoMensual(monto) {
    configuracion.fondoMensual = Number(monto);
    guardarConfiguracion();
}
// ===== CRUD Categorías =====
function obtenerCategorias() {
    return categorias;
}
function obtenerCategoriaPorId(id) {
    // find() para localizar una categoría por su id
    return categorias.find(cat => cat.id === Number(id));
}
function crearCategoria({ nombre, icono, presupuesto }) {
    const nueva = {
        id: Date.now(),
        nombre: nombre.trim(),
        icono,
        presupuesto: Number(presupuesto),
        gastado: 0
    };
    categorias.push(nueva);
    guardarCategorias();
    return nueva;
}
function editarCategoria(id, { nombre, icono, presupuesto }) {
    const cat = obtenerCategoriaPorId(id);
    if (!cat) return null;
    cat.nombre = nombre.trim();
    cat.icono = icono;
    cat.presupuesto = Number(presupuesto);
    guardarCategorias();
    return cat;
}
function eliminarCategoria(id) {
    // filter() para excluir la categoría eliminada
    categorias  = categorias.filter(cat => cat.id !== Number(id));
    // Limpiamos también los movimientos asociados a esa categoría
    movimientos = movimientos.filter(m => m.categoriaId !== Number(id));
    guardarCategorias();
    guardarMovimientos();
    recalcularGastoCategorias();
}
// ===== CRUD Movimientos =====
function obtenerMovimientos() {
    // sort() para devolver los movimientos en orden descendente por fecha
    return [...movimientos].sort((a, b) => b.fecha - a.fecha);
}
function obtenerMovimientoPorId(id) {
    return movimientos.find(m => m.id === Number(id));
}
function crearMovimiento({ descripcion, monto, categoriaId, tipo, fecha }) {
    const nuevo = {
        id: Date.now(),
        descripcion: descripcion.trim(),
        monto: Number(monto),
        categoriaId: Number(categoriaId),
        tipo,
        fecha: Number(fecha),
        saldoRestante: 0
    };
    movimientos.push(nuevo);
    nuevo.saldoRestante = calcularSaldoDisponible();
    guardarMovimientos();
    recalcularGastoCategorias();
    return nuevo;
}
function editarMovimiento(id, { descripcion, monto, categoriaId, tipo, fecha }) {
    const m = obtenerMovimientoPorId(id);
    if (!m) return null;
    m.descripcion = descripcion.trim();
    m.monto = Number(monto);
    m.categoriaId = Number(categoriaId);
    m.tipo = tipo;
    m.fecha = Number(fecha);
    m.saldoRestante = calcularSaldoDisponible();
    guardarMovimientos();
    recalcularGastoCategorias();
    return m;
}
function eliminarMovimiento(id) {
    movimientos = movimientos.filter(m => m.id !== Number(id));
    guardarMovimientos();
    recalcularGastoCategorias();
}
// ===== Recalcular gasto por categoría (forEach) =====
function recalcularGastoCategorias() {
    // forEach() para reiniciar el gasto de cada categoría
    categorias.forEach(cat => { cat.gastado = 0; });
    // forEach() para sumar cada gasto a la categoría correspondiente
    movimientos.forEach(m => {
        if (m.tipo === 'gasto') {
            const cat = obtenerCategoriaPorId(m.categoriaId);
            if (cat) cat.gastado += m.monto;
        }
    });
    guardarCategorias();
}
// ===== Cálculos financieros (filter + reduce) =====
function calcularTotalIngresos() {
    return movimientos
        .filter(m => m.tipo === 'ingreso')
        .reduce((acc, m) => acc + m.monto, 0);
}
function calcularTotalGastado() {
    return movimientos
        .filter(m => m.tipo === 'gasto')
        .reduce((acc, m) => acc + m.monto, 0);
}
function calcularSaldoDisponible() {
    return configuracion.fondoMensual
         + calcularTotalIngresos()
         - calcularTotalGastado();
}
function calcularPorcentajeUtilizado() {
    if (configuracion.fondoMensual <= 0) return 0;
    return (calcularTotalGastado() / configuracion.fondoMensual) * 100;
}
function calcularCantidadMovimientos() {
    return movimientos.length;
}
function calcularPromedioDiario() {
    const diaActual = new Date().getDate();
    if (diaActual === 0) return 0;
    return calcularTotalGastado() / diaActual;
}
// ===== Estadística: categoría más gastada (forEach) =====
function obtenerCategoriaMasGastada() {
    if (categorias.length === 0) return null;
    let top = null;
    let maxGasto = 0;
    categorias.forEach(cat => {
        if (cat.gastado > maxGasto) {
            maxGasto = cat.gastado;
            top = cat;
        }
    });
    return top;
}
// ===== Búsqueda y filtros (filter) =====
function buscarMovimientos(texto) {
    const q = texto.trim().toLowerCase();
    if (!q) return obtenerMovimientos();
    return obtenerMovimientos().filter(m =>
        m.descripcion.toLowerCase().includes(q)
    );
}
function filtrarMovimientos(tipo) {
    if (tipo === 'todos') return obtenerMovimientos();
    return obtenerMovimientos().filter(m => m.tipo === tipo);
}
function buscarYFiltrar(texto, tipo) {
    let lista = obtenerMovimientos();
    if (tipo && tipo !== 'todos') {
        lista = lista.filter(m => m.tipo === tipo);
    }
    const q = texto.trim().toLowerCase();
    if (q) {
        lista = lista.filter(m => m.descripcion.toLowerCase().includes(q));
    }
    return lista;
}
// ===== Datos para Chart.js (map) =====
function obtenerDatosGrafico() {
    const etiquetas = categorias.map(c => `${c.icono} ${c.nombre}`);
    const valores   = categorias.map(c => c.gastado);
    return { etiquetas, valores };
}
// ===== Formateadores =====
function formatearMoneda(monto) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(monto || 0);
}
function formatearFecha(timestamp) {
    return new Date(timestamp).toLocaleDateString('es-AR', {
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    });
}