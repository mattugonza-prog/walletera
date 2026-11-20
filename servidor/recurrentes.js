// ===== Walletera | servidor/recurrentes.js =====
// En modo nube los recurrentes los registra el servidor, no cada navegador: así dos
// dispositivos abiertos a la vez no duplican el alquiler del mes.
import { fechaEnZona, generarId, ocurrenciasPendientes } from '../js/dominio.js';
import { aMovimiento, aRecurrente, insertarVarios } from './repositorio.js';

// Registra las ocurrencias vencidas hasta hoy (en la zona horaria del usuario) y
// devuelve los movimientos creados. Tiene que correr dentro de una transacción:
// FOR UPDATE hace que un segundo pedido simultáneo espere y vea "ultima" actualizada.
// El índice único (usuario_id, recurrente_id, fecha) es la red de seguridad.
export async function generarVencidos(cliente, usuario) {
    const hoy = fechaEnZona(usuario.zona);
    const { rows } = await cliente.query(
        'select * from recurrentes where usuario_id = $1 order by id for update',
        [usuario.id]
    );
    const nuevos = [];
    const ultimas = [];
    const ahora = Date.now();
    rows.map(aRecurrente).forEach(r => {
        const fechas = ocurrenciasPendientes(r, hoy);
        if (fechas.length === 0) return;
        fechas.forEach(fecha => nuevos.push({
            id: generarId(),
            descripcion: r.descripcion,
            monto: r.monto,
            tipo: r.tipo,
            fecha,
            cuentaId: r.cuentaId,
            cuentaDestinoId: r.cuentaDestinoId,
            categoriaId: r.categoriaId,
            recurrenteId: r.id,
            creado: ahora + nuevos.length
        }));
        ultimas.push([r.id, fechas.at(-1)]);
    });
    if (nuevos.length === 0) return [];

    const insertados = await insertarVarios(cliente, usuario.id, 'movimientos', nuevos,
        'on conflict (usuario_id, recurrente_id, fecha) where recurrente_id is not null do nothing returning *');
    await cliente.query(
        `update recurrentes r set ultima = v.ultima
           from unnest($2::text[], $3::date[]) as v(id, ultima)
          where r.usuario_id = $1 and r.id = v.id`,
        [usuario.id, ultimas.map(([id]) => id), ultimas.map(([, fecha]) => fecha)]
    );
    return insertados.map(aMovimiento);
}
