// ===== Walletera | servidor/rutas/datos.js =====
// Estado completo, altas, bajas y modificaciones, y respaldo. Todo requiere sesión y
// se valida con las mismas funciones que usa el navegador (js/dominio.js).
import { Hono } from 'hono';
import {
    FRECUENCIAS, esIdValido, esFechaISO, aplicarEdicionRecurrente,
    normalizarCuenta, normalizarCategoria, normalizarMovimiento, normalizarRecurrente, validarRespaldo
} from '../../js/dominio.js';
import { enTransaccion, ERRORES_PG } from '../db.js';
import { generarVencidos } from '../recurrentes.js';
import {
    aMovimiento, aRecurrente, leerEstado, leerReferencias, siguienteOrden,
    insertarVarios, presupuestosDe, borrarTodo, insertarTodo, sembrar
} from '../repositorio.js';
import { requerirSesion } from '../seguridad.js';
import { leerCuerpo, invalido, noExiste } from './util.js';

const MENSAJES = {
    cuenta: 'Revisá el nombre y el saldo inicial de la cuenta.',
    categoria: 'Revisá el nombre, el ícono y el presupuesto de la categoría.',
    movimiento: 'Revisá el monto, la fecha y las cuentas del movimiento.',
    recurrente: 'Revisá el monto, la fecha, la frecuencia y las cuentas del recurrente.'
};

// Un error de Postgres conocido se convierte en respuesta; cualquier otro sigue de largo (500).
function siEs(codigo, respuesta) {
    return error => {
        if (error.code === codigo) return respuesta();
        throw error;
    };
}

export function rutasDeDatos({ pool }) {
    const r = new Hono();
    const sesion = requerirSesion(pool);
    const usuarioDe = c => c.get('usuario');
    const idDe = c => (esIdValido(c.req.param('id')) ? c.req.param('id') : null);
    const yaExiste = c => () => c.json({ error: 'Ya existe un registro con ese id.' }, 409);

    // ===== Estado =====
    // Antes de leer, registra los recurrentes que vencieron desde la última vez.
    r.get('/estado', sesion, async c => {
        const usuario = usuarioDe(c);
        const estado = await enTransaccion(pool, async cliente => {
            await generarVencidos(cliente, usuario);
            return leerEstado(cliente, usuario.id);
        });
        return c.json({ email: usuario.email, ...estado });
    });

    // ===== Cuentas =====
    r.post('/cuentas', sesion, async c => {
        const usuario = usuarioDe(c);
        const cuenta = normalizarCuenta(await leerCuerpo(c));
        if (!cuenta) return invalido(c, MENSAJES.cuenta);
        const orden = await siguienteOrden(pool, usuario.id, 'cuentas');
        return pool.query(
            'insert into cuentas (usuario_id, id, nombre, tipo, saldo_inicial, orden) values ($1, $2, $3, $4, $5, $6)',
            [usuario.id, cuenta.id, cuenta.nombre, cuenta.tipo, cuenta.saldoInicial, orden]
        ).then(() => c.json({ cuenta }, 201), siEs(ERRORES_PG.duplicado, yaExiste(c)));
    });

    r.put('/cuentas/:id', sesion, async c => {
        const id = idDe(c);
        if (!id) return noExiste(c);
        const cuenta = normalizarCuenta({ ...(await leerCuerpo(c)), id });
        if (!cuenta) return invalido(c, MENSAJES.cuenta);
        const { rowCount } = await pool.query(
            'update cuentas set nombre = $3, tipo = $4, saldo_inicial = $5 where usuario_id = $1 and id = $2',
            [usuarioDe(c).id, id, cuenta.nombre, cuenta.tipo, cuenta.saldoInicial]
        );
        return rowCount ? c.json({ cuenta }) : noExiste(c);
    });

    // Una cuenta con movimientos o recurrentes no se borra (la clave foránea lo impide).
    r.delete('/cuentas/:id', sesion, async c => {
        const id = idDe(c);
        if (!id) return noExiste(c);
        return pool.query('delete from cuentas where usuario_id = $1 and id = $2', [usuarioDe(c).id, id]).then(
            ({ rowCount }) => (rowCount ? c.body(null, 204) : noExiste(c)),
            siEs(ERRORES_PG.claveForanea, () => c.json({
                error: 'La cuenta tiene movimientos o recurrentes. Eliminalos o pasalos a otra cuenta primero.'
            }, 409))
        );
    });

    // ===== Categorías =====
    async function guardarPresupuestos(cliente, usuarioId, categoria) {
        await cliente.query('delete from presupuestos where usuario_id = $1 and categoria_id = $2', [usuarioId, categoria.id]);
        await insertarVarios(cliente, usuarioId, 'presupuestos', presupuestosDe([categoria]));
    }

    r.post('/categorias', sesion, async c => {
        const usuario = usuarioDe(c);
        const categoria = normalizarCategoria(await leerCuerpo(c));
        if (!categoria) return invalido(c, MENSAJES.categoria);
        return enTransaccion(pool, async cliente => {
            const orden = await siguienteOrden(cliente, usuario.id, 'categorias');
            await cliente.query(
                'insert into categorias (usuario_id, id, nombre, icono, color, tipo, orden) values ($1, $2, $3, $4, $5, $6, $7)',
                [usuario.id, categoria.id, categoria.nombre, categoria.icono, categoria.color, categoria.tipo, orden]
            );
            await guardarPresupuestos(cliente, usuario.id, categoria);
        }).then(() => c.json({ categoria }, 201), siEs(ERRORES_PG.duplicado, yaExiste(c)));
    });

    // El tipo no cambia al editar: sus movimientos ya son de ese tipo.
    r.put('/categorias/:id', sesion, async c => {
        const usuario = usuarioDe(c);
        const id = idDe(c);
        if (!id) return noExiste(c);
        const cuerpo = await leerCuerpo(c);
        const categoria = await enTransaccion(pool, async cliente => {
            const { rows: [actual] } = await cliente.query(
                'select tipo from categorias where usuario_id = $1 and id = $2 for update', [usuario.id, id]
            );
            if (!actual) return undefined;
            const editada = normalizarCategoria({ ...cuerpo, id, tipo: actual.tipo });
            if (!editada) return null;
            await cliente.query(
                'update categorias set nombre = $3, icono = $4, color = $5 where usuario_id = $1 and id = $2',
                [usuario.id, id, editada.nombre, editada.icono, editada.color]
            );
            await guardarPresupuestos(cliente, usuario.id, editada);
            return editada;
        });
        if (categoria === undefined) return noExiste(c);
        return categoria ? c.json({ categoria }) : invalido(c, MENSAJES.categoria);
    });

    // Sus movimientos y recurrentes quedan "Sin categoría" (ON DELETE SET NULL).
    r.delete('/categorias/:id', sesion, async c => {
        const id = idDe(c);
        if (!id) return noExiste(c);
        const { rowCount } = await pool.query('delete from categorias where usuario_id = $1 and id = $2', [usuarioDe(c).id, id]);
        return rowCount ? c.body(null, 204) : noExiste(c);
    });

    // ===== Movimientos =====
    // Los que se cargan a mano nunca vienen de un recurrente: esos los registra el servidor.
    r.post('/movimientos', sesion, async c => {
        const usuario = usuarioDe(c);
        const cuerpo = await leerCuerpo(c);
        const { idsCuentas, categoriasPorId } = await leerReferencias(pool, usuario.id);
        const movimiento = normalizarMovimiento(cuerpo, idsCuentas, categoriasPorId);
        if (!movimiento) return invalido(c, MENSAJES.movimiento);
        movimiento.creado ||= Date.now();
        return insertarVarios(pool, usuario.id, 'movimientos', [movimiento])
            .then(() => c.json({ movimiento }, 201), siEs(ERRORES_PG.duplicado, yaExiste(c)));
    });

    // Al editar no cambian ni el vínculo con el recurrente ni la fecha de creación.
    r.put('/movimientos/:id', sesion, async c => {
        const usuario = usuarioDe(c);
        const id = idDe(c);
        if (!id) return noExiste(c);
        const cuerpo = await leerCuerpo(c);
        const { idsCuentas, categoriasPorId } = await leerReferencias(pool, usuario.id);
        const m = normalizarMovimiento({ ...cuerpo, id }, idsCuentas, categoriasPorId);
        if (!m) return invalido(c, MENSAJES.movimiento);
        return pool.query(
            `update movimientos set descripcion = $3, monto = $4, tipo = $5, fecha = $6,
                    cuenta_id = $7, cuenta_destino_id = $8, categoria_id = $9
              where usuario_id = $1 and id = $2 returning *`,
            [usuario.id, id, m.descripcion, m.monto, m.tipo, m.fecha, m.cuentaId, m.cuentaDestinoId, m.categoriaId]
        ).then(
            ({ rows: [fila] }) => (fila ? c.json({ movimiento: aMovimiento(fila) }) : noExiste(c)),
            siEs(ERRORES_PG.duplicado, () => c.json({ error: 'Ese recurrente ya tiene un movimiento en esa fecha.' }, 409))
        );
    });

    r.delete('/movimientos/:id', sesion, async c => {
        const id = idDe(c);
        if (!id) return noExiste(c);
        const { rowCount } = await pool.query('delete from movimientos where usuario_id = $1 and id = $2', [usuarioDe(c).id, id]);
        return rowCount ? c.body(null, 204) : noExiste(c);
    });

    // ===== Recurrentes =====
    // Crear o editar uno registra lo que ya venció y lo devuelve en "generados".
    async function leerRecurrente(cliente, usuarioId, id) {
        const { rows: [fila] } = await cliente.query('select * from recurrentes where usuario_id = $1 and id = $2', [usuarioId, id]);
        return aRecurrente(fila);
    }

    r.post('/recurrentes', sesion, async c => {
        const usuario = usuarioDe(c);
        const cuerpo = await leerCuerpo(c);
        return enTransaccion(pool, async cliente => {
            const { idsCuentas, categoriasPorId } = await leerReferencias(cliente, usuario.id);
            const recurrente = normalizarRecurrente({ ...cuerpo, ultima: null }, idsCuentas, categoriasPorId);
            if (!recurrente) return null;
            await insertarVarios(cliente, usuario.id, 'recurrentes', [recurrente]);
            const generados = await generarVencidos(cliente, usuario);
            return { recurrente: await leerRecurrente(cliente, usuario.id, recurrente.id), generados };
        }).then(
            resultado => (resultado ? c.json(resultado, 201) : invalido(c, MENSAJES.recurrente)),
            siEs(ERRORES_PG.duplicado, yaExiste(c))
        );
    });

    // Recibe la plantilla, la próxima fecha y la frecuencia, y aplica la misma regla que el
    // navegador (aplicarEdicionRecurrente) sobre lo que hay guardado.
    r.put('/recurrentes/:id', sesion, async c => {
        const usuario = usuarioDe(c);
        const id = idDe(c);
        if (!id) return noExiste(c);
        const cuerpo = await leerCuerpo(c);
        if (!cuerpo || !esFechaISO(cuerpo.fecha) || !FRECUENCIAS.includes(cuerpo.frecuencia)) {
            return invalido(c, MENSAJES.recurrente);
        }
        const resultado = await enTransaccion(pool, async cliente => {
            const { rows: [fila] } = await cliente.query(
                'select * from recurrentes where usuario_id = $1 and id = $2 for update', [usuario.id, id]
            );
            if (!fila) return { estado: 404 };
            const { idsCuentas, categoriasPorId } = await leerReferencias(cliente, usuario.id);
            const plantilla = normalizarMovimiento({ ...cuerpo, id }, idsCuentas, categoriasPorId);
            if (!plantilla) return { estado: 400, error: MENSAJES.recurrente };
            const { id: _id, fecha, recurrenteId, creado, ...campos } = plantilla;
            let e;
            try {
                e = aplicarEdicionRecurrente(aRecurrente(fila), campos, fecha, cuerpo.frecuencia);
            } catch (error) {
                return { estado: 400, error: error.message };
            }
            await cliente.query(
                `update recurrentes set descripcion = $3, monto = $4, tipo = $5, cuenta_id = $6, cuenta_destino_id = $7,
                        categoria_id = $8, inicio = $9, frecuencia = $10, ultima = $11
                  where usuario_id = $1 and id = $2`,
                [usuario.id, id, e.descripcion, e.monto, e.tipo, e.cuentaId, e.cuentaDestinoId, e.categoriaId, e.inicio, e.frecuencia, e.ultima]
            );
            const generados = await generarVencidos(cliente, usuario);
            return { recurrente: await leerRecurrente(cliente, usuario.id, id), generados };
        });
        if (resultado.estado === 404) return noExiste(c);
        if (resultado.estado === 400) return invalido(c, resultado.error);
        return c.json(resultado);
    });

    // Los movimientos ya registrados se conservan, sin el vínculo (ON DELETE SET NULL).
    r.delete('/recurrentes/:id', sesion, async c => {
        const id = idDe(c);
        if (!id) return noExiste(c);
        const { rowCount } = await pool.query('delete from recurrentes where usuario_id = $1 and id = $2', [usuarioDe(c).id, id]);
        return rowCount ? c.body(null, 204) : noExiste(c);
    });

    // ===== Respaldo =====
    // Reemplaza todos los datos por los de un respaldo (el mismo JSON que descarga la app).
    r.put('/datos', sesion, async c => {
        const usuario = usuarioDe(c);
        let validos;
        try {
            validos = validarRespaldo(await leerCuerpo(c));
        } catch (error) {
            return invalido(c, error.message);
        }
        // Dos movimientos de un mismo recurrente en la misma fecha no entran en el índice
        // único: el repetido se conserva, pero sin el vínculo.
        const ocurrencias = new Set();
        validos.movimientos.forEach(m => {
            if (!m.recurrenteId) return;
            const clave = `${m.recurrenteId}|${m.fecha}`;
            if (ocurrencias.has(clave)) m.recurrenteId = null;
            ocurrencias.add(clave);
        });
        const generados = await enTransaccion(pool, async cliente => {
            await borrarTodo(cliente, usuario.id);
            await insertarTodo(cliente, usuario.id, validos);
            return generarVencidos(cliente, usuario);
        });
        return c.json({
            cuentas: validos.cuentas.length,
            categorias: validos.categorias.length,
            movimientos: validos.movimientos.length + generados.length,
            recurrentes: validos.recurrentes.length,
            descartados: validos.descartados
        });
    });

    // Borra todo y vuelve al estado inicial (categorías de ejemplo y una cuenta de efectivo).
    r.delete('/datos', sesion, async c => {
        const cuerpo = await leerCuerpo(c);
        if (cuerpo?.confirmar !== true) return invalido(c, 'Falta confirmar el borrado.');
        const usuario = usuarioDe(c);
        await enTransaccion(pool, async cliente => {
            await borrarTodo(cliente, usuario.id);
            await sembrar(cliente, usuario.id);
        });
        return c.body(null, 204);
    });

    return r;
}
