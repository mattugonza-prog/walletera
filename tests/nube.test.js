// Modo nube de la capa de datos, con una API falsa en memoria (misma forma que js/api.js).
import { describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../js/api.js';
import { prepararEntorno, leer } from './preparar.js';

function apiFalsa() {
    const servidor = {
        email: 'casa@ejemplo.com',
        cuentas: [{ id: 'banco', nombre: 'Banco', tipo: 'banco', saldoInicial: 1000 }],
        categorias: [{ id: 'super', nombre: 'Súper', icono: 'ph-shopping-cart', color: 'naranja', tipo: 'gasto', presupuestos: [{ desde: '2000-01', monto: 500 }] }],
        movimientos: [{ id: 'm1', descripcion: 'Super', monto: 100, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'banco', cuentaDestinoId: null, categoriaId: 'super', recurrenteId: null, creado: 1 }],
        recurrentes: []
    };
    const llamadas = [];
    let errorProximo = null;
    const responder = (nombre, args, fn) => {
        llamadas.push([nombre, ...args]);
        if (errorProximo) {
            const error = errorProximo;
            errorProximo = null;
            return Promise.reject(error);
        }
        return Promise.resolve(fn());
    };
    const clave = { cuentas: 'cuenta', categorias: 'categoria', movimientos: 'movimiento' };
    return {
        servidor,
        llamadas,
        fallarProxima(error) { errorProximo = error; },
        obtenerEstado: () => responder('obtenerEstado', [], () => structuredClone(servidor)),
        crear: (coleccion, entidad) => responder('crear', [coleccion, entidad], () => {
            if (coleccion === 'recurrentes') {
                const generado = { ...entidad, id: 'generado-1', fecha: entidad.inicio, recurrenteId: entidad.id, creado: 7 };
                const recurrente = { ...entidad, ultima: entidad.inicio };
                servidor.recurrentes.push(recurrente);
                servidor.movimientos.push(generado);
                return { recurrente, generados: [generado] };
            }
            // El servidor puede completar datos: la app tiene que usar lo que devuelve.
            const guardado = { ...entidad, ...(coleccion === 'movimientos' ? { creado: 999 } : {}) };
            servidor[coleccion].push(guardado);
            return { [clave[coleccion]]: guardado };
        }),
        editar: (coleccion, id, datos) => responder('editar', [coleccion, id, datos], () => {
            const actual = servidor[coleccion].find(x => x.id === id);
            Object.assign(actual, datos);
            return { [clave[coleccion]]: structuredClone(actual) };
        }),
        eliminar: (coleccion, id) => responder('eliminar', [coleccion, id], () => {
            servidor[coleccion] = servidor[coleccion].filter(x => x.id !== id);
            return null;
        }),
        reemplazarDatos: respaldo => responder('reemplazarDatos', [respaldo], () => {
            Object.assign(servidor, structuredClone({ ...respaldo, email: servidor.email }));
            return { descartados: 0 };
        }),
        borrarTodo: () => responder('borrarTodo', [], () => {
            Object.assign(servidor, { movimientos: [], recurrentes: [] });
            return null;
        })
    };
}

async function enNube(api, previo = {}) {
    prepararEntorno();
    Object.entries(previo).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    vi.resetModules();
    const d = await import('../js/datos.js');
    await d.inicializarDatos({ modo: 'nube', api });
    return d;
}

const sinConexion = () => new ErrorApi('Sin conexión. Revisá internet e intentá de nuevo.', 0);

describe('modo nube', () => {
    it('carga los datos del servidor y guarda una copia para ver sin conexión', async () => {
        const api = apiFalsa();
        const d = await enNube(api);
        expect(d.modoActual()).toBe('nube');
        expect(d.emailActual()).toBe('casa@ejemplo.com');
        expect(d.calcularSaldoTotal()).toBe(900);
        expect(leer('walletera_nube_copia')).toMatchObject({ email: 'casa@ejemplo.com', movimientos: [{ id: 'm1' }] });
        expect(localStorage.getItem('walletera_movimientos')).toBeNull();
    });

    it('cada cambio pasa por el servidor y usa lo que devuelve', async () => {
        const api = apiFalsa();
        const d = await enNube(api);
        const nuevo = await d.crearMovimiento({ descripcion: 'Farmacia', monto: 50, tipo: 'gasto', fecha: '2026-10-02', cuentaId: 'banco', categoriaId: '' });
        expect(api.llamadas.at(-1)).toMatchObject(['crear', 'movimientos', { descripcion: 'Farmacia', recurrenteId: null }]);
        expect(nuevo.creado).toBe(999);
        expect(d.obtenerMovimientos().map(m => m.id)).toContain(nuevo.id);

        await d.editarMovimiento('m1', { descripcion: 'Super', monto: 120, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'banco', categoriaId: 'super' });
        expect(d.obtenerMovimientoPorId('m1').monto).toBe(120);
        await d.eliminarMovimiento(nuevo.id);
        expect(api.servidor.movimientos.map(m => m.id)).toEqual(['m1']);
        expect(d.obtenerMovimientos().map(m => m.id)).toEqual(['m1']);
        expect(leer('walletera_nube_copia').movimientos.map(m => m.id)).toEqual(['m1']);
    });

    it('si el servidor rechaza un cambio, el estado queda igual', async () => {
        const api = apiFalsa();
        const d = await enNube(api);
        api.fallarProxima(new ErrorApi('Revisá el monto, la fecha y las cuentas del movimiento.', 400));
        await expect(d.crearMovimiento({ descripcion: 'X', monto: 5, tipo: 'gasto', fecha: '2026-10-02', cuentaId: 'banco' }))
            .rejects.toThrow('Revisá el monto');
        expect(d.obtenerMovimientos()).toHaveLength(1);
        api.fallarProxima(new ErrorApi('No existe o ya se eliminó.', 404));
        await expect(d.eliminarMovimiento('m1')).rejects.toThrow('No existe');
        expect(d.obtenerMovimientos()).toHaveLength(1);
    });

    it('los recurrentes los registra el servidor, no el navegador', async () => {
        const api = apiFalsa();
        const d = await enNube(api);
        const r = await d.crearRecurrente({ descripcion: 'Alquiler', monto: 300, tipo: 'gasto', fecha: '2026-09-03', cuentaId: 'banco' }, 'mensual');
        expect(r.ultima).toBe('2026-09-03');
        expect(d.obtenerMovimientos().filter(m => m.recurrenteId === r.id).map(m => m.id)).toEqual(['generado-1']);
        expect(d.generarRecurrentes()).toBe(0);
        await expect(d.editarRecurrente(r.id, { descripcion: 'Alquiler', monto: 300, tipo: 'gasto', fecha: '2026-09-03', cuentaId: 'banco' }, 'mensual'))
            .rejects.toThrow('posterior');
        expect(api.llamadas.filter(([n]) => n === 'editar')).toHaveLength(0);
    });

    it('sin conexión muestra la última copia y no deja guardar', async () => {
        const copia = apiFalsa();
        await enNube(copia);
        const guardada = leer('walletera_nube_copia');

        const api = apiFalsa();
        api.fallarProxima(sinConexion());
        const d = await enNube(api, { walletera_nube_copia: guardada });
        expect(d.esSoloLectura()).toBe(true);
        expect(d.obtenerMovimientos()).toHaveLength(1);
        await expect(d.crearCuenta({ nombre: 'Caja', tipo: 'efectivo', saldoInicial: 0 })).rejects.toThrow('Sin conexión');
        expect(api.llamadas.filter(([n]) => n === 'crear')).toHaveLength(0);

        api.servidor.movimientos = [];
        expect(await d.recargar()).toBe(true);
        expect(d.esSoloLectura()).toBe(false);
        expect(d.obtenerMovimientos()).toHaveLength(0);
    });

    it('sin conexión y sin copia, no arranca en modo nube', async () => {
        const api = apiFalsa();
        api.fallarProxima(sinConexion());
        await expect(enNube(api)).rejects.toThrow('Sin conexión');
    });

    it('restaurar y borrar todo van al servidor; los datos de ejemplo no', async () => {
        const api = apiFalsa();
        const d = await enNube(api);
        await d.reemplazarDatos({
            cuentas: [{ id: 'caja', nombre: 'Caja', tipo: 'efectivo', saldoInicial: 0 }],
            categorias: [],
            movimientos: [{ id: 'x', descripcion: 'A', monto: 1, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'caja' }]
        });
        expect(d.obtenerCuentas().map(c => c.id)).toEqual(['caja']);
        await d.reiniciarDatos();
        expect(api.llamadas.map(([n]) => n)).toContain('borrarTodo');
        expect(d.obtenerMovimientos()).toEqual([]);
        await expect(d.cargarDatosDeEjemplo()).rejects.toThrow('sin cuenta');
    });

    it('volver al modo local no toca los datos del navegador', async () => {
        const api = apiFalsa();
        const d = await enNube(api, { walletera_version: 6, walletera_movimientos: [] });
        await d.inicializarDatos();
        expect(d.modoActual()).toBe('local');
        expect(d.obtenerCuentas().map(c => c.nombre)).toEqual(['Efectivo']);
        d.borrarCopiaNube();
        expect(d.hayCopiaNube()).toBe(false);
    });
});
