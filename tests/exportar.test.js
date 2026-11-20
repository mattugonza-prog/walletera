import { describe, expect, it } from 'vitest';
import { armarHojasExcel, armarContenidoPDF } from '../js/exportar.js';

const datos = {
    filas: [
        { fecha: '2026-09-15', tipo: 'gasto', tipoNombre: 'Gasto', descripcion: 'Super', categoria: 'Alimentación', cuenta: 'Efectivo', cuentaDestino: '', monto: -1550.5 },
        { fecha: '2026-10-01', tipo: 'ingreso', tipoNombre: 'Ingreso', descripcion: 'Sueldo', categoria: 'Sueldo', cuenta: 'Banco', cuentaDestino: '', monto: 1250000 },
        { fecha: '2026-10-05', tipo: 'transferencia', tipoNombre: 'Transferencia', descripcion: 'Transferencia', categoria: '', cuenta: 'Banco', cuentaDestino: 'Mercado Pago', monto: 300 },
        { fecha: '2026-11-10', tipo: 'gasto', tipoNombre: 'Gasto', descripcion: '=HYPERLINK("x")', categoria: '', cuenta: 'Efectivo', cuentaDestino: '', monto: -50 }
    ],
    totales: { ingresos: 1250000, gastos: 1600.5, resultado: 1248399.5, cantidad: 4 },
    categorias: [{ nombre: 'Alimentación', monto: 1550.5, porcentaje: 96.876 }, { nombre: 'Sin categoría', monto: 50, porcentaje: 3.124 }],
    textoRango: 'Del 15/09/2026 al 10/11/2026',
    filtros: ['Solo gastos', 'Búsqueda: «super»'],
    generado: new Date(2026, 10, 20, 14, 30)
};

describe('Excel', () => {
    const [movimientos, resumen] = armarHojasExcel(datos);

    it('tiene la hoja de movimientos con encabezado fijo y en negrita', () => {
        expect(movimientos.sheet).toBe('Movimientos');
        expect(movimientos.stickyRowsCount).toBe(1);
        expect(movimientos.data[0].map(c => c.value)).toEqual(['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Cuenta destino', 'Monto']);
        expect(movimientos.data[0].every(c => c.fontWeight === 'bold')).toBe(true);
        expect(movimientos.data).toHaveLength(5);
    });

    it('guarda fechas reales a medianoche UTC y montos como número', () => {
        const [fecha, , , , , , monto] = movimientos.data[1];
        expect(fecha).toMatchObject({ type: Date, format: 'dd/mm/yyyy' });
        expect(fecha.value.toISOString()).toBe('2026-09-15T00:00:00.000Z');
        expect(monto).toEqual({ value: -1550.5, type: Number, format: '#,##0.00' });
    });

    it('distingue un gasto sin categoría de una transferencia y no interpreta fórmulas', () => {
        expect(movimientos.data[3][3]).toBeNull();
        expect(movimientos.data[3][5]).toBe('Mercado Pago');
        expect(movimientos.data[4][3]).toBe('Sin categoría');
        expect(movimientos.data[4][2]).toBe('=HYPERLINK("x")');
    });

    it('resume rango, filtros, totales y gasto por categoría', () => {
        const fila = etiqueta => resumen.data.find(f => f[0]?.value === etiqueta);
        expect(fila('Período')[1]).toBe('Del 15/09/2026 al 10/11/2026');
        expect(fila('Filtros')[1]).toBe('Solo gastos · Búsqueda: «super»');
        expect(fila('Generado')[1]).toBe('20/11/2026 14:30');
        expect(fila('Resultado')[1]).toMatchObject({ value: 1248399.5, type: Number });
        expect(fila('Movimientos')[1]).toMatchObject({ value: 4, type: Number });
        expect(resumen.data.at(-1)).toEqual(['Sin categoría', { value: 50, type: Number, format: '#,##0.00' }, { value: 0.03124, type: Number, format: '0.0%' }]);
    });
});

describe('PDF', () => {
    const c = armarContenidoPDF(datos);
    const textos = JSON.stringify(c);

    it('usa solo caracteres que tiene la fuente estándar del PDF', () => {
        expect(textos).not.toMatch(/[\u2212\u00a0\u2192]/);
    });

    it('muestra montos con signo y transferencias entre cuentas', () => {
        expect(c.tabla.body.map(f => f[4])).toEqual(['- $ 1.550,50', '+ $ 1.250.000', '$ 300', '- $ 50']);
        expect(c.tabla.body[2].slice(2, 4)).toEqual(['Transferencia', 'Banco › Mercado Pago']);
        expect(c.tabla.body[3][2]).toBe('Sin categoría');
        expect(c.tabla.tipos).toEqual(['gasto', 'ingreso', 'transferencia', 'gasto']);
    });

    it('incluye el rango, los filtros y el resumen', () => {
        expect(c.subtitulo).toBe('Del 15/09/2026 al 10/11/2026');
        expect(c.detalle).toEqual(['Filtros: Solo gastos · Búsqueda: «super»', 'Generado el 20/11/2026 14:30']);
        expect(c.resumen.body).toEqual([['+ $ 1.250.000', '$ 1.600,50', '+ $ 1.248.399,50', '4']]);
        expect(c.categorias[0]).toEqual(['Alimentación', '$ 1.550,50', '96,9 %']);
    });
});
