// ===== Walletera | servidor/repositorio.js =====
// SQL de los datos de cada usuario. Toda consulta filtra por usuario_id.
// Los objetos que salen de acá tienen la misma forma que usa el navegador.
import { readFileSync } from 'node:fs';
import { generarId, normalizarCategoria } from '../js/dominio.js';

// ===== Filas → objetos del dominio =====
export const aCuenta = f => ({ id: f.id, nombre: f.nombre, tipo: f.tipo, saldoInicial: f.saldo_inicial });

export const aCategoria = (f, presupuestos = []) => ({
    id: f.id, nombre: f.nombre, icono: f.icono, color: f.color, tipo: f.tipo, presupuestos
});

export const aMovimiento = f => ({
    id: f.id,
    descripcion: f.descripcion,
    monto: f.monto,
    tipo: f.tipo,
    fecha: f.fecha,
    cuentaId: f.cuenta_id,
    cuentaDestinoId: f.cuenta_destino_id,
    categoriaId: f.categoria_id,
    recurrenteId: f.recurrente_id,
    creado: f.creado
});

export const aRecurrente = f => ({
    id: f.id,
    descripcion: f.descripcion,
    monto: f.monto,
    tipo: f.tipo,
    cuentaId: f.cuenta_id,
    cuentaDestinoId: f.cuenta_destino_id,
    categoriaId: f.categoria_id,
    inicio: f.inicio,
    frecuencia: f.frecuencia,
    ultima: f.ultima
});

// ===== Inserción en bloque =====
// Una sola consulta por tabla con unnest(): restaurar un respaldo de miles de movimientos
// no hace miles de viajes a la base. Tablas y columnas son constantes de este archivo.
const COLUMNAS = {
    cuentas: [['id', 'text'], ['nombre', 'text'], ['tipo', 'text'], ['saldo_inicial', 'numeric'], ['orden', 'int']],
    categorias: [['id', 'text'], ['nombre', 'text'], ['icono', 'text'], ['color', 'text'], ['tipo', 'text'], ['orden', 'int']],
    presupuestos: [['categoria_id', 'text'], ['desde', 'text'], ['monto', 'numeric']],
    recurrentes: [
        ['id', 'text'], ['descripcion', 'text'], ['monto', 'numeric'], ['tipo', 'text'], ['cuenta_id', 'text'],
        ['cuenta_destino_id', 'text'], ['categoria_id', 'text'], ['inicio', 'date'], ['frecuencia', 'text'], ['ultima', 'date']
    ],
    movimientos: [
        ['id', 'text'], ['descripcion', 'text'], ['monto', 'numeric'], ['tipo', 'text'], ['fecha', 'date'], ['cuenta_id', 'text'],
        ['cuenta_destino_id', 'text'], ['categoria_id', 'text'], ['recurrente_id', 'text'], ['creado', 'bigint']
    ]
};

const FILA = {
    cuentas: (c, i) => [c.id, c.nombre, c.tipo, c.saldoInicial, i],
    categorias: (c, i) => [c.id, c.nombre, c.icono, c.color, c.tipo, i],
    presupuestos: p => [p.categoriaId, p.desde, p.monto],
    recurrentes: r => [r.id, r.descripcion, r.monto, r.tipo, r.cuentaId, r.cuentaDestinoId, r.categoriaId, r.inicio, r.frecuencia, r.ultima],
    movimientos: m => [m.id, m.descripcion, m.monto, m.tipo, m.fecha, m.cuentaId, m.cuentaDestinoId, m.categoriaId, m.recurrenteId, m.creado || Date.now()]
};

export async function insertarVarios(db, usuarioId, tabla, objetos, sufijo = '') {
    if (objetos.length === 0) return [];
    const columnas = COLUMNAS[tabla];
    const filas = objetos.map(FILA[tabla]);
    const arreglos = columnas.map((_, i) => filas.map(fila => fila[i]));
    const nombres = columnas.map(([nombre]) => nombre).join(', ');
    const desarmar = columnas.map(([, tipo], i) => `$${i + 2}::${tipo}[]`).join(', ');
    const { rows } = await db.query(
        `insert into ${tabla} (usuario_id, ${nombres}) select $1, * from unnest(${desarmar}) ${sufijo}`,
        [usuarioId, ...arreglos]
    );
    return rows;
}

// Lista plana de presupuestos a partir de las categorías.
export const presupuestosDe = categorias =>
    categorias.flatMap(c => c.presupuestos.map(p => ({ categoriaId: c.id, ...p })));

// ===== Lectura =====
// Las consultas van de a una: dentro de una transacción comparten una sola conexión.
export async function leerEstado(db, usuarioId) {
    const consulta = async sql => (await db.query(sql, [usuarioId])).rows;
    const cuentas = await consulta('select * from cuentas where usuario_id = $1 order by orden, id');
    const categorias = await consulta('select * from categorias where usuario_id = $1 order by orden, id');
    const presupuestos = await consulta('select * from presupuestos where usuario_id = $1 order by categoria_id, desde');
    const recurrentes = await consulta('select * from recurrentes where usuario_id = $1 order by id');
    const movimientos = await consulta('select * from movimientos where usuario_id = $1 order by fecha, creado');
    const porCategoria = Map.groupBy(presupuestos, p => p.categoria_id);
    return {
        cuentas: cuentas.map(aCuenta),
        categorias: categorias.map(f => aCategoria(f, (porCategoria.get(f.id) ?? []).map(p => ({ desde: p.desde, monto: p.monto })))),
        recurrentes: recurrentes.map(aRecurrente),
        movimientos: movimientos.map(aMovimiento)
    };
}

// Ids de cuentas y categorías del usuario, para validar referencias con normalizarMovimiento().
export async function leerReferencias(db, usuarioId) {
    const cuentas = await db.query('select id from cuentas where usuario_id = $1', [usuarioId]);
    const categorias = await db.query('select id, tipo from categorias where usuario_id = $1', [usuarioId]);
    return {
        idsCuentas: new Set(cuentas.rows.map(f => f.id)),
        categoriasPorId: new Map(categorias.rows.map(f => [f.id, f]))
    };
}

export async function siguienteOrden(db, usuarioId, tabla) {
    const { rows: [fila] } = await db.query(`select coalesce(max(orden), 0) + 1 as orden from ${tabla} where usuario_id = $1`, [usuarioId]);
    return fila.orden;
}

// ===== Reemplazo completo =====
// El orden importa por las claves foráneas.
export async function borrarTodo(db, usuarioId) {
    for (const tabla of ['movimientos', 'recurrentes', 'categorias', 'cuentas']) {
        await db.query(`delete from ${tabla} where usuario_id = $1`, [usuarioId]);
    }
}

export async function insertarTodo(db, usuarioId, { cuentas, categorias, recurrentes, movimientos }) {
    await insertarVarios(db, usuarioId, 'cuentas', cuentas);
    await insertarVarios(db, usuarioId, 'categorias', categorias);
    await insertarVarios(db, usuarioId, 'presupuestos', presupuestosDe(categorias));
    await insertarVarios(db, usuarioId, 'recurrentes', recurrentes);
    await insertarVarios(db, usuarioId, 'movimientos', movimientos);
}

// Lo mismo con lo que arranca la app sin datos: las categorías de categorias.json
// y una cuenta de efectivo.
let categoriasIniciales;
function leerCategoriasIniciales() {
    categoriasIniciales ??= JSON.parse(readFileSync(new URL('../categorias.json', import.meta.url), 'utf8'));
    return categoriasIniciales;
}

export async function sembrar(db, usuarioId) {
    const categorias = leerCategoriasIniciales()
        .map(c => normalizarCategoria({ ...c, id: generarId() }))
        .filter(Boolean);
    const cuentas = [{ id: generarId(), nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 }];
    await insertarTodo(db, usuarioId, { cuentas, categorias, recurrentes: [], movimientos: [] });
}
