import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cargarDatos, leer } from './preparar.js';

// "Hoy" fijo: jueves 22 de octubre de 2026, mediodía en Buenos Aires.
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, 12));
});
afterEach(() => vi.useRealTimers());

const nbsp = texto => texto.replace(/\u00a0/g, ' ');

async function conDosCuentas() {
    const d = await cargarDatos();
    const efectivo = d.obtenerCuentas()[0];
    const banco = d.crearCuenta({ nombre: 'Banco', tipo: 'banco', saldoInicial: 100000 });
    const comida = d.obtenerCategorias('gasto').find(c => c.nombre === 'Alimentación');
    const sueldo = d.obtenerCategorias('ingreso').find(c => c.nombre === 'Sueldo');
    return { d, efectivo, banco, comida, sueldo };
}

describe('primera carga', () => {
    it('siembra categorías de gasto e ingreso y una cuenta de efectivo', async () => {
        const d = await cargarDatos();
        expect(d.obtenerCategorias('gasto')).toHaveLength(10);
        expect(d.obtenerCategorias('ingreso')).toHaveLength(5);
        expect(d.obtenerCategorias().every(c => c.icono.startsWith('ph-') && c.color)).toBe(true);
        expect(d.obtenerCuentas()).toMatchObject([{ nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 }]);
        expect(localStorage.getItem('walletera_version')).toBe('5');
    });
});

describe('saldos y resumen', () => {
    it('calcula el saldo de cada cuenta con gastos, ingresos y transferencias', async () => {
        const { d, efectivo, banco, comida, sueldo } = await conDosCuentas();
        d.crearMovimiento({ descripcion: 'Super', monto: 1550.5, tipo: 'gasto', fecha: '2026-10-22', cuentaId: banco.id, categoriaId: comida.id });
        d.crearMovimiento({ descripcion: 'Sueldo', monto: 200000, tipo: 'ingreso', fecha: '2026-10-01', cuentaId: efectivo.id, categoriaId: sueldo.id });
        d.crearMovimiento({ descripcion: '', monto: 50000, tipo: 'transferencia', fecha: '2026-10-05', cuentaId: banco.id, cuentaDestinoId: efectivo.id });

        const saldos = Object.fromEntries(d.obtenerCuentasConSaldo().map(c => [c.nombre, c.saldo]));
        expect(saldos).toEqual({ Efectivo: 250000, Banco: 48449.5 });
        expect(d.calcularSaldoTotal()).toBe(298449.5);
    });

    it('las transferencias no cuentan como ingreso ni gasto', async () => {
        const { d, efectivo, banco } = await conDosCuentas();
        d.crearMovimiento({ descripcion: '', monto: 50000, tipo: 'transferencia', fecha: '2026-10-05', cuentaId: banco.id, cuentaDestinoId: efectivo.id });
        expect(d.calcularResumen('2026-10')).toMatchObject({ ingresos: 0, gastos: 0, resultado: 0, cantidad: 1 });
    });

    it('una transferencia sin descripción se llama "Transferencia" y no lleva categoría', async () => {
        const { d, efectivo, banco, comida } = await conDosCuentas();
        const t = d.crearMovimiento({ descripcion: '  ', monto: 10, tipo: 'transferencia', fecha: '2026-10-05', cuentaId: banco.id, cuentaDestinoId: efectivo.id, categoriaId: comida.id });
        expect(t).toMatchObject({ descripcion: 'Transferencia', categoriaId: null });
    });

    it('descarta una categoría que no corresponde al tipo del movimiento', async () => {
        const { d, efectivo, comida } = await conDosCuentas();
        const m = d.crearMovimiento({ descripcion: 'Venta', monto: 10, tipo: 'ingreso', fecha: '2026-10-05', cuentaId: efectivo.id, categoriaId: comida.id });
        expect(m.categoriaId).toBeNull();
    });

    it('filtra por período y compara con el mes anterior', async () => {
        const { d, efectivo, comida } = await conDosCuentas();
        d.crearMovimiento({ descripcion: 'Sept', monto: 1000, tipo: 'gasto', fecha: '2026-09-10', cuentaId: efectivo.id, categoriaId: comida.id });
        d.crearMovimiento({ descripcion: 'Oct', monto: 1500, tipo: 'gasto', fecha: '2026-10-10', cuentaId: efectivo.id, categoriaId: comida.id });
        expect(d.calcularResumen('2026-10').gastos).toBe(1500);
        expect(d.calcularResumen('2026-09').gastos).toBe(1000);
        expect(d.calcularVariacionGastos('2026-10')).toBe(50);
        expect(d.calcularVariacionGastos('2026-09')).toBeNull();
        expect(d.calcularResumen('2026-10').porcentajePresupuesto).toBeCloseTo((1500 / 710000) * 100);
    });

    it('el promedio diario usa los días transcurridos del mes en curso', async () => {
        const { d, efectivo } = await conDosCuentas();
        d.crearMovimiento({ descripcion: 'A', monto: 2200, tipo: 'gasto', fecha: '2026-10-03', cuentaId: efectivo.id });
        d.crearMovimiento({ descripcion: 'B', monto: 3000, tipo: 'gasto', fecha: '2026-09-03', cuentaId: efectivo.id });
        expect(d.calcularPromedioDiario('2026-10')).toBe(100);
        expect(d.calcularPromedioDiario('2026-09')).toBe(100);
    });

    it('arma la serie de los últimos meses del más viejo al más nuevo', async () => {
        const { d, efectivo, sueldo } = await conDosCuentas();
        d.crearMovimiento({ descripcion: 'S', monto: 900, tipo: 'ingreso', fecha: '2026-08-01', cuentaId: efectivo.id, categoriaId: sueldo.id });
        const serie = d.calcularSerieMensual('2026-10', 3);
        expect(serie.map(s => s.periodo)).toEqual(['2026-08', '2026-09', '2026-10']);
        expect(serie[0]).toMatchObject({ ingresos: 900, gastos: 0 });
    });
});

describe('integridad', () => {
    it('eliminar una categoría conserva sus movimientos como "Sin categoría"', async () => {
        const { d, efectivo, comida } = await conDosCuentas();
        const m = d.crearMovimiento({ descripcion: 'Super', monto: 100, tipo: 'gasto', fecha: '2026-10-10', cuentaId: efectivo.id, categoriaId: comida.id });
        const saldoAntes = d.calcularSaldoTotal();
        d.eliminarCategoria(comida.id);
        expect(d.obtenerMovimientoPorId(m.id).categoriaId).toBeNull();
        expect(d.calcularSaldoTotal()).toBe(saldoAntes);
    });

    it('no elimina una cuenta que tiene movimientos', async () => {
        const { d, efectivo, banco } = await conDosCuentas();
        d.crearMovimiento({ descripcion: '', monto: 10, tipo: 'transferencia', fecha: '2026-10-05', cuentaId: banco.id, cuentaDestinoId: efectivo.id });
        expect(d.eliminarCuenta(efectivo.id)).toBe(false);
        const vacia = d.crearCuenta({ nombre: 'Vacía', tipo: 'billetera', saldoInicial: 0 });
        expect(d.eliminarCuenta(vacia.id)).toBe(true);
    });

    it('agrupa por día con el neto y marca los días con solo transferencias', async () => {
        const { d, efectivo, banco } = await conDosCuentas();
        d.crearMovimiento({ descripcion: 'A', monto: 100, tipo: 'gasto', fecha: '2026-10-22', cuentaId: efectivo.id });
        d.crearMovimiento({ descripcion: 'B', monto: 300, tipo: 'ingreso', fecha: '2026-10-22', cuentaId: efectivo.id });
        d.crearMovimiento({ descripcion: '', monto: 50, tipo: 'transferencia', fecha: '2026-10-21', cuentaId: banco.id, cuentaDestinoId: efectivo.id });
        const grupos = d.agruparPorDia(d.obtenerMovimientos('2026-10'));
        expect(grupos.map(g => [g.fecha, g.neto, g.soloTransferencias])).toEqual([
            ['2026-10-22', 200, false],
            ['2026-10-21', 0, true]
        ]);
    });
});

describe('migraciones', () => {
    it('v2: corrige las fechas guardadas en UTC y convierte el fondo en una cuenta', async () => {
        const d = await cargarDatos({
            walletera_version: '2',
            walletera_configuracion: { fondoMensual: 1000 },
            walletera_categorias: [{ id: 17, nombre: 'Comida', icono: '🍔', presupuesto: 100, gastado: 9 }],
            walletera_movimientos: [
                { id: 1761100000000, descripcion: 'Super', monto: 50, categoriaId: 17, tipo: 'gasto', fecha: Date.UTC(2026, 9, 22), saldoRestante: 5 },
                { id: 1761100000001, descripcion: 'Sueldo', monto: 900, categoriaId: 17, tipo: 'ingreso', fecha: Date.UTC(2026, 9, 1) }
            ]
        });
        const [gasto, ingreso] = leer('walletera_movimientos');
        expect(gasto).toMatchObject({ fecha: '2026-10-22', categoriaId: '17' });
        expect(gasto).not.toHaveProperty('saldoRestante');
        expect(ingreso.categoriaId).toBeNull();
        expect(d.obtenerCuentas()).toMatchObject([{ nombre: 'Cuenta principal', saldoInicial: 1000 }]);
        expect(d.calcularSaldoTotal()).toBe(1850);
        expect(d.obtenerCategoriaPorId('17')).toMatchObject({ icono: 'ph-fork-knife', color: 'naranja', tipo: 'gasto' });
        expect(d.obtenerCategorias('ingreso')).toHaveLength(5);
        expect(localStorage.getItem('walletera_respaldo_v2')).not.toBeNull();
    });

    it('v1: descarta datos que no son de Walletera y vuelve a sembrar', async () => {
        const d = await cargarDatos({ walletera_categorias: [{ id: 1, name: 'Leanne Graham' }] });
        expect(d.obtenerCategorias()).toHaveLength(15);
    });

    it('v4: reemplaza emojis por ícono y color, con un genérico si no hay equivalente', async () => {
        const d = await cargarDatos({
            walletera_version: '4',
            walletera_cuentas: [{ id: 'c1', nombre: 'Banco', tipo: 'banco', saldoInicial: 0 }],
            walletera_categorias: [
                { id: 'a', nombre: 'Comida', icono: '🍔', presupuesto: 100, tipo: 'gasto' },
                { id: 'b', nombre: 'Rara', icono: '🦄', presupuesto: 0, tipo: 'gasto' }
            ],
            walletera_movimientos: []
        });
        expect(d.obtenerCategorias().map(c => [c.icono, c.color])).toEqual([['ph-fork-knife', 'naranja'], ['ph-tag', 'gris']]);
    });
});

describe('respaldo y exportación', () => {
    it('un respaldo exportado se puede volver a importar igual', async () => {
        const { d, efectivo, banco, comida } = await conDosCuentas();
        d.crearMovimiento({ descripcion: 'Super', monto: 100, tipo: 'gasto', fecha: '2026-10-10', cuentaId: efectivo.id, categoriaId: comida.id });
        d.crearMovimiento({ descripcion: '', monto: 10, tipo: 'transferencia', fecha: '2026-10-05', cuentaId: banco.id, cuentaDestinoId: efectivo.id });
        const respaldo = JSON.parse(JSON.stringify(d.exportarRespaldo()));
        const saldo = d.calcularSaldoTotal();

        const otra = await cargarDatos();
        const resultado = otra.reemplazarDatos(respaldo);
        expect(resultado.descartados).toBe(0);
        expect(otra.calcularSaldoTotal()).toBe(saldo);
        expect(otra.obtenerMovimientos()).toHaveLength(2);
    });

    it('rechaza archivos que no son respaldos y descarta movimientos inválidos', async () => {
        const d = await cargarDatos();
        expect(() => d.validarRespaldo({ hola: 1 })).toThrow('no es un respaldo');
        const r = d.validarRespaldo({
            cuentas: [{ id: 'c', nombre: 'Caja', tipo: 'efectivo', saldoInicial: 0 }],
            categorias: [],
            movimientos: [
                { id: 'ok', descripcion: 'Bien', monto: 5, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c' },
                { id: 'x1', descripcion: 'Sin cuenta', monto: 5, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'nope' },
                { id: 'x2', descripcion: 'Monto raro', monto: -5, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c' },
                { id: 'x3', descripcion: 'A sí misma', monto: 5, tipo: 'transferencia', fecha: '2026-10-01', cuentaId: 'c', cuentaDestinoId: 'c' }
            ]
        });
        expect(r.movimientos.map(m => m.id)).toEqual(['ok']);
        expect(r.descartados).toBe(3);
    });

    it('exporta CSV para Excel en español y neutraliza fórmulas', async () => {
        const { d, efectivo } = await conDosCuentas();
        d.crearMovimiento({ descripcion: '=HYPERLINK("x")', monto: 1550.5, tipo: 'gasto', fecha: '2026-10-10', cuentaId: efectivo.id });
        const [encabezado, fila] = d.exportarCSV().split('\r\n');
        expect(encabezado).toBe('Fecha;Tipo;Descripción;Monto;Cuenta;Cuenta destino;Categoría');
        expect(fila).toBe('2026-10-10;Gasto;"\'=HYPERLINK(""x"")";-1550,50;Efectivo;;');
    });
});

describe('datos de ejemplo', () => {
    it('genera tres meses coherentes, sin fechas futuras ni referencias rotas', async () => {
        const d = await cargarDatos();
        const r = await d.cargarDatosDeEjemplo();
        expect(r.descartados).toBe(0);
        const movimientos = d.obtenerMovimientos();
        expect(movimientos.length).toBeGreaterThan(40);
        expect(movimientos.every(m => m.fecha <= '2026-10-22' && m.fecha >= '2026-08-01')).toBe(true);
        expect(d.obtenerCuentas().map(c => c.nombre)).toEqual(['Banco Nación', 'Mercado Pago', 'Efectivo', 'Visa']);
        expect(d.calcularResumen('2026-09').resultado).toBeGreaterThan(0);
    });

    it('la tarjeta queda saldada con lo pagado hasta el mes anterior', async () => {
        const d = await cargarDatos();
        await d.cargarDatosDeEjemplo();
        const visa = d.obtenerCuentasConSaldo().find(c => c.nombre === 'Visa');
        const gastosVisaOctubre = d.obtenerMovimientos('2026-10')
            .filter(m => m.tipo === 'gasto' && m.cuentaId === visa.id)
            .reduce((acc, m) => acc + m.monto, 0);
        expect(visa.saldo).toBe(-gastosVisaOctubre);
    });

    it('es determinista', async () => {
        const a = await cargarDatos();
        await a.cargarDatosDeEjemplo();
        const primera = a.obtenerMovimientos().map(m => [m.fecha, m.descripcion, m.monto]);
        const b = await cargarDatos();
        await b.cargarDatosDeEjemplo();
        expect(b.obtenerMovimientos().map(m => [m.fecha, m.descripcion, m.monto])).toEqual(primera);
    });

    it('reiniciar vuelve al estado inicial y borra los respaldos', async () => {
        const d = await cargarDatos({ walletera_respaldo_v2: '{}' });
        await d.cargarDatosDeEjemplo();
        await d.reiniciarDatos();
        expect(d.obtenerMovimientos()).toHaveLength(0);
        expect(d.obtenerCuentas()).toMatchObject([{ nombre: 'Efectivo' }]);
        expect(localStorage.getItem('walletera_respaldo_v2')).toBeNull();
    });
});

describe('formato', () => {
    it('usa el signo menos tipográfico y decimales solo cuando hacen falta', async () => {
        const d = await cargarDatos();
        expect(nbsp(d.formatearMoneda(-8000))).toBe('− $ 8.000');
        expect(nbsp(d.formatearMoneda(1550.5))).toBe('$ 1.550,50');
        expect(nbsp(d.formatearMoneda(0))).toBe('$ 0');
    });

    it('nombra los días como lo haría una persona', async () => {
        const d = await cargarDatos();
        expect(d.etiquetaDia('2026-10-22')).toBe('Hoy');
        expect(d.etiquetaDia('2026-10-21')).toBe('Ayer');
        expect(d.etiquetaDia('2026-10-20')).toBe('Martes 20');
        expect(d.etiquetaDia('2026-09-15')).toBe('Martes 15 de septiembre');
    });
});
