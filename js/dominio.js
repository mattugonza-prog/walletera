// ===== Walletera | dominio.js =====
// Reglas del dominio compartidas por el navegador y el servidor: fechas, recurrencias,
// presupuestos y validación de datos. Sin DOM, sin almacenamiento y sin red.

export const TIPOS_CUENTA = {
    efectivo:  { nombre: 'Efectivo',           icono: 'ph-money' },
    banco:     { nombre: 'Cuenta bancaria',    icono: 'ph-bank' },
    billetera: { nombre: 'Billetera virtual',  icono: 'ph-device-mobile' },
    credito:   { nombre: 'Tarjeta de crédito', icono: 'ph-credit-card' }
};

export const COLORES_CATEGORIA = ['naranja', 'azul', 'rosa', 'verde', 'violeta', 'amarillo', 'turquesa', 'gris'];
export const TIPOS_MOVIMIENTO = ['gasto', 'ingreso', 'transferencia'];
export const FRECUENCIAS = ['mensual', 'semanal'];
export const MAX_OCURRENCIAS_POR_CARGA = 120;

// Un presupuesto "desde siempre": el que tenían las categorías antes de que hubiera uno por mes.
export const PERIODO_INICIAL = '2000-01';

// Lo que entra en NUMERIC(14,2).
export const MONTO_MAXIMO = 999999999999.99;

const LARGO_NOMBRE = 60;
const LARGO_DESCRIPCION = 200;

// Hasta v4 las categorías usaban emojis; v5 los reemplaza por un ícono y un color.
export const EMOJI_A_ICONO = {
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

// ===== Identificadores =====
export function generarId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Los ids viajan en URLs y se guardan como texto: letras, números, guiones y guion bajo.
export const esIdValido = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

// ===== Montos =====
// Las sumas de decimales en punto flotante acumulan error (0,1 + 0,2): se redondea a centavos.
// Mitades hacia afuera (−1500,555 → −1500,56), corrigiendo la representación binaria (1,005 × 100 = 100,4999…).
export function redondearCentavos(n) {
    const centavos = Math.round(Math.abs(n) * 100 * (1 + Number.EPSILON));
    return (Math.sign(n) * centavos) / 100 || 0;
}

const esMonto = (n, minimo) => Number.isFinite(n) && n >= minimo && Math.abs(n) <= MONTO_MAXIMO;

// ===== Fechas ('AAAA-MM-DD', sin hora ni zona horaria) =====
export const pad = n => String(n).padStart(2, '0');

export function aFechaISO(fecha) {
    return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

export function desdeFechaISO(fechaISO) {
    const [a, m, d] = fechaISO.split('-').map(Number);
    return new Date(a, m - 1, d);
}

// Además del formato, la fecha tiene que existir (no '2026-02-31').
export function esFechaISO(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && aFechaISO(desdeFechaISO(valor)) === valor;
}

// La fecha de hoy en una zona horaria dada. El servidor corre en UTC y la casa está en Argentina.
export function fechaEnZona(zona, instante = new Date()) {
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(instante)
            .map(p => [p.type, p.value])
    );
    return `${partes.year}-${partes.month}-${partes.day}`;
}

// ===== Períodos ('AAAA-MM') =====
export const esPeriodo = valor => typeof valor === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);

export function desplazarPeriodo(periodo, meses) {
    const [a, m] = periodo.split('-').map(Number);
    return aFechaISO(new Date(a, m - 1 + meses, 1)).slice(0, 7);
}

export function diasDelPeriodo(periodo) {
    const [a, m] = periodo.split('-').map(Number);
    return new Date(a, m, 0).getDate();
}

// Un mes como rango de fechas inclusivo: { desde: 'AAAA-MM-01', hasta: 'AAAA-MM-último' }.
export function rangoDePeriodo(periodo) {
    return { desde: `${periodo}-01`, hasta: `${periodo}-${pad(diasDelPeriodo(periodo))}` };
}

// ===== Recurrentes =====
// Un recurrente es una plantilla de movimiento con frecuencia; "ultima" es la última fecha registrada.
// Las mensuales mantienen el día de inicio y se ajustan al último día de los meses cortos.
export function fechaSiguiente(r, fechaISO) {
    const fecha = desdeFechaISO(fechaISO);
    if (r.frecuencia === 'semanal') {
        fecha.setDate(fecha.getDate() + 7);
        return aFechaISO(fecha);
    }
    const diaBase = Number(r.inicio.slice(8, 10));
    const siguiente = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1);
    const ultimoDia = new Date(siguiente.getFullYear(), siguiente.getMonth() + 1, 0).getDate();
    siguiente.setDate(Math.min(diaBase, ultimoDia));
    return aFechaISO(siguiente);
}

export const proximaFecha = r => (r.ultima ? fechaSiguiente(r, r.ultima) : r.inicio);

// Fechas que vencieron hasta `hasta` (inclusive) y todavía no se registraron.
export function ocurrenciasPendientes(r, hasta) {
    const fechas = [];
    let fecha = proximaFecha(r);
    while (fecha <= hasta && fechas.length < MAX_OCURRENCIAS_POR_CARGA) {
        fechas.push(fecha);
        fecha = fechaSiguiente(r, fecha);
    }
    return fechas;
}

// Cambia la plantilla para las próximas ocurrencias; las ya registradas no se tocan.
// `fecha` es la próxima ocurrencia y tiene que ser posterior a la última registrada.
export function aplicarEdicionRecurrente(r, plantilla, fecha, frecuencia) {
    if (r.ultima && fecha <= r.ultima) {
        throw new Error('La próxima fecha tiene que ser posterior a la última registrada.');
    }
    const editado = { ...r, ...plantilla, frecuencia };
    if (fecha !== proximaFecha(editado)) {
        editado.inicio = fecha;
        editado.ultima = null;
    }
    return editado;
}

// ===== Presupuestos =====
// Cada categoría de gasto tiene una lista [{ desde: 'AAAA-MM', monto }] ordenada por fecha.
// El presupuesto de un mes es el de la última entrada que empieza en ese mes o antes.
export function presupuestoDe(categoria, periodo) {
    let monto = 0;
    for (const p of categoria.presupuestos ?? []) {
        if (p.desde > periodo) break;
        monto = p.monto;
    }
    return monto;
}

// Quita las entradas que repiten el monto vigente (y los ceros iniciales, que es el valor por defecto).
function compactarPresupuestos(lista) {
    const resultado = [];
    let vigente = 0;
    lista.forEach(p => {
        if (p.monto !== vigente) resultado.push(p);
        vigente = p.monto;
    });
    return resultado;
}

// Fija el presupuesto desde `periodo` en adelante, hasta la próxima entrada que ya existiera.
export function conPresupuesto(presupuestos, periodo, monto) {
    const lista = (presupuestos ?? []).filter(p => p.desde !== periodo);
    lista.push({ desde: periodo, monto: redondearCentavos(monto) });
    return compactarPresupuestos(lista.sort((a, b) => a.desde.localeCompare(b.desde)));
}

// Acepta la lista nueva o el "presupuesto" único de las versiones anteriores.
// Devuelve null si algún valor es inválido.
function normalizarPresupuestos(c) {
    const lista = Array.isArray(c.presupuestos)
        ? c.presupuestos
        : [{ desde: PERIODO_INICIAL, monto: c.presupuesto ?? 0 }];
    const porDesde = new Map();
    for (const p of lista) {
        const monto = Number(p?.monto);
        if (!p || !esPeriodo(p.desde) || !esMonto(monto, 0)) return null;
        porDesde.set(p.desde, { desde: p.desde, monto: redondearCentavos(monto) });
    }
    return compactarPresupuestos([...porDesde.values()].sort((a, b) => a.desde.localeCompare(b.desde)));
}

// ===== Validación y normalización =====
// Cada función devuelve el registro limpio o null si no sirve. Se usan al migrar,
// al importar un respaldo y en el servidor para validar lo que llega.
const texto = (valor, largo) => valor.trim().slice(0, largo);

function idONuevo(id) {
    const valor = String(id ?? generarId());
    return esIdValido(valor) ? valor : null;
}

export function normalizarCuenta(c) {
    if (!c || typeof c.nombre !== 'string' || !c.nombre.trim()) return null;
    const id = idONuevo(c.id);
    const saldoInicial = Number(c.saldoInicial ?? 0);
    if (!id || !esMonto(saldoInicial, -MONTO_MAXIMO)) return null;
    return {
        id,
        nombre: texto(c.nombre, LARGO_NOMBRE),
        tipo: TIPOS_CUENTA[c.tipo] ? c.tipo : 'efectivo',
        saldoInicial: redondearCentavos(saldoInicial)
    };
}

export function normalizarCategoria(c) {
    if (!c || typeof c.nombre !== 'string' || !c.nombre.trim()) return null;
    const id = idONuevo(c.id);
    if (!id) return null;
    const tipo = c.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    const presupuestos = tipo === 'gasto' ? normalizarPresupuestos(c) : [];
    if (!presupuestos) return null;
    const esIcono = typeof c.icono === 'string' && /^ph-[a-z0-9-]+$/.test(c.icono);
    const [iconoMigrado, colorMigrado] = esIcono ? [c.icono] : (EMOJI_A_ICONO[c.icono] ?? ['ph-tag', 'gris']);
    return {
        id,
        nombre: texto(c.nombre, LARGO_NOMBRE),
        icono: iconoMigrado,
        color: COLORES_CATEGORIA.includes(c.color) ? c.color : (colorMigrado ?? 'gris'),
        tipo,
        presupuestos
    };
}

export function normalizarMovimiento(m, idsCuentas, categoriasPorId, idsRecurrentes = new Set()) {
    if (!m || typeof m.descripcion !== 'string' || !TIPOS_MOVIMIENTO.includes(m.tipo)) return null;
    const id = idONuevo(m.id);
    const monto = Number(m.monto);
    if (!id || !esMonto(monto, 0) || monto === 0 || !esFechaISO(m.fecha)) return null;
    const cuentaId = String(m.cuentaId);
    if (!idsCuentas.has(cuentaId)) return null;
    const esTransferencia = m.tipo === 'transferencia';
    const destino = esTransferencia ? String(m.cuentaDestinoId) : null;
    if (esTransferencia && (!idsCuentas.has(destino) || destino === cuentaId)) return null;
    const cat = !esTransferencia && m.categoriaId != null ? categoriasPorId.get(String(m.categoriaId)) : null;
    const creado = Number(m.creado);
    return {
        id,
        descripcion: texto(m.descripcion, LARGO_DESCRIPCION) || (esTransferencia ? 'Transferencia' : ''),
        monto: redondearCentavos(monto),
        tipo: m.tipo,
        fecha: m.fecha,
        cuentaId,
        cuentaDestinoId: destino,
        categoriaId: cat && cat.tipo === m.tipo ? cat.id : null,
        recurrenteId: idsRecurrentes.has(String(m.recurrenteId)) ? String(m.recurrenteId) : null,
        creado: Number.isSafeInteger(creado) && creado > 0 ? creado : 0
    };
}

export function normalizarRecurrente(r, idsCuentas, categoriasPorId) {
    if (!r || !FRECUENCIAS.includes(r.frecuencia)) return null;
    const base = normalizarMovimiento({ ...r, fecha: r.inicio }, idsCuentas, categoriasPorId);
    if (!base) return null;
    const { fecha, recurrenteId, creado, ...plantilla } = base;
    return {
        ...plantilla,
        inicio: fecha,
        frecuencia: r.frecuencia,
        ultima: esFechaISO(r.ultima) && r.ultima >= fecha ? r.ultima : null
    };
}

// Valida un respaldo completo. Lanza un Error con un mensaje para el usuario si no sirve;
// los registros sueltos inválidos se descartan y se informan en "descartados".
export function validarRespaldo(datos) {
    if (!datos || typeof datos !== 'object' ||
        !Array.isArray(datos.cuentas) || !Array.isArray(datos.categorias) || !Array.isArray(datos.movimientos)) {
        throw new Error('El archivo no es un respaldo de Walletera.');
    }
    const unicos = lista => [...new Map(lista.map(x => [x.id, x])).values()];
    const cuentas = unicos(datos.cuentas.map(normalizarCuenta).filter(Boolean));
    const categorias = unicos(datos.categorias.map(normalizarCategoria).filter(Boolean));
    const idsCuentas = new Set(cuentas.map(c => c.id));
    const categoriasPorId = new Map(categorias.map(c => [c.id, c]));
    // Los respaldos anteriores a los recurrentes no traen esa lista.
    const recurrentes = unicos((Array.isArray(datos.recurrentes) ? datos.recurrentes : [])
        .map(r => normalizarRecurrente(r, idsCuentas, categoriasPorId))
        .filter(Boolean));
    const idsRecurrentes = new Set(recurrentes.map(r => r.id));
    const movimientos = unicos(datos.movimientos
        .map(m => normalizarMovimiento(m, idsCuentas, categoriasPorId, idsRecurrentes))
        .filter(Boolean));
    return {
        cuentas,
        categorias,
        movimientos,
        recurrentes,
        descartados: datos.movimientos.length - movimientos.length
    };
}
