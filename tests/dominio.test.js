import { describe, expect, it } from 'vitest';
import {
    esFechaISO, fechaEnZona, desplazarPeriodo, redondearCentavos, esIdValido,
    ocurrenciasPendientes, aplicarEdicionRecurrente, MAX_OCURRENCIAS_POR_CARGA,
    presupuestoDe, conPresupuesto, PERIODO_INICIAL,
    normalizarCategoria, normalizarMovimiento, normalizarCuenta, validarRespaldo
} from '../js/dominio.js';

describe('fechas', () => {
    it('una fecha tiene que existir, no solo tener el formato', () => {
        expect(esFechaISO('2026-02-31')).toBe(false);
        expect(esFechaISO('2026-13-01')).toBe(false);
        expect(esFechaISO('2028-02-29')).toBe(true);
        expect(esFechaISO(20261001)).toBe(false);
    });

    it('calcula "hoy" en la zona de la casa aunque el servidor corra en UTC', () => {
        // 02:30 UTC del 21 son las 23:30 del 20 en Buenos Aires.
        expect(fechaEnZona('America/Argentina/Buenos_Aires', new Date('2026-11-21T02:30:00Z'))).toBe('2026-11-20');
        expect(fechaEnZona('UTC', new Date('2026-11-21T02:30:00Z'))).toBe('2026-11-21');
    });

    it('se mueve entre meses y años', () => {
        expect(desplazarPeriodo('2026-01', -1)).toBe('2025-12');
        expect(desplazarPeriodo('2026-11', 2)).toBe('2027-01');
    });
});

describe('montos e ids', () => {
    it('redondea a centavos', () => {
        expect(redondearCentavos(0.1 + 0.2)).toBe(0.3);
        expect(redondearCentavos(1550.499999)).toBe(1550.5);
    });

    it('acepta los ids de siempre y rechaza los raros', () => {
        expect(esIdValido('3b2f0e4c-8a1d-4c55-9a4e-0f1b2c3d4e5f')).toBe(true);
        expect(esIdValido('ejemplo-r-sueldo')).toBe(true);
        expect(esIdValido('17')).toBe(true);
        expect(esIdValido('a/b')).toBe(false);
        expect(esIdValido('')).toBe(false);
        expect(esIdValido('x'.repeat(65))).toBe(false);
    });
});

describe('recurrentes', () => {
    const mensual = (inicio, ultima = null) => ({ inicio, ultima, frecuencia: 'mensual' });

    it('lista las ocurrencias vencidas, con el día 31 ajustado a los meses cortos', () => {
        expect(ocurrenciasPendientes(mensual('2027-01-31'), '2027-04-30'))
            .toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
        expect(ocurrenciasPendientes(mensual('2027-01-31', '2027-03-31'), '2027-04-29')).toEqual([]);
    });

    it('las semanales van cada 7 días y hay un tope por carga', () => {
        expect(ocurrenciasPendientes({ inicio: '2026-10-08', ultima: null, frecuencia: 'semanal' }, '2026-10-22'))
            .toEqual(['2026-10-08', '2026-10-15', '2026-10-22']);
        expect(ocurrenciasPendientes({ inicio: '2000-01-01', ultima: null, frecuencia: 'semanal' }, '2026-10-22'))
            .toHaveLength(MAX_OCURRENCIAS_POR_CARGA);
    });

    it('editar valida la próxima fecha y reinicia el calendario si cambia', () => {
        const r = { ...mensual('2026-09-03', '2026-10-03'), monto: 1000 };
        expect(() => aplicarEdicionRecurrente(r, { monto: 1500 }, '2026-10-03', 'mensual')).toThrow('posterior');
        expect(aplicarEdicionRecurrente(r, { monto: 1500 }, '2026-11-03', 'mensual'))
            .toMatchObject({ monto: 1500, inicio: '2026-09-03', ultima: '2026-10-03' });
        expect(aplicarEdicionRecurrente(r, { monto: 1500 }, '2026-11-10', 'mensual'))
            .toMatchObject({ inicio: '2026-11-10', ultima: null });
    });
});

describe('presupuestos', () => {
    const cat = presupuestos => ({ presupuestos });

    it('rige el último que empezó en ese mes o antes', () => {
        const c = cat([{ desde: '2000-01', monto: 100 }, { desde: '2026-10', monto: 150 }]);
        expect(presupuestoDe(c, '2026-09')).toBe(100);
        expect(presupuestoDe(c, '2026-10')).toBe(150);
        expect(presupuestoDe(cat([{ desde: '2026-10', monto: 150 }]), '2026-09')).toBe(0);
        expect(presupuestoDe({}, '2026-10')).toBe(0);
    });

    it('fijar un monto lo ordena y saca las vigencias que no cambian nada', () => {
        const base = [{ desde: '2000-01', monto: 100 }, { desde: '2026-12', monto: 150 }];
        expect(conPresupuesto(base, '2026-11', 150)).toEqual([{ desde: '2000-01', monto: 100 }, { desde: '2026-11', monto: 150 }]);
        expect(conPresupuesto(base, '2026-11', 100)).toEqual(base);
        expect(conPresupuesto([], '2026-11', 0)).toEqual([]);
    });
});

describe('normalización', () => {
    it('convierte el presupuesto único de las versiones anteriores', () => {
        expect(normalizarCategoria({ id: 'a', nombre: 'Comida', icono: 'ph-fork-knife', presupuesto: 100, tipo: 'gasto' }).presupuestos)
            .toEqual([{ desde: PERIODO_INICIAL, monto: 100 }]);
        expect(normalizarCategoria({ id: 'a', nombre: 'Comida', presupuesto: -1, tipo: 'gasto' })).toBeNull();
        expect(normalizarCategoria({ id: 'a', nombre: 'Comida', presupuestos: [{ desde: '2026-13', monto: 1 }], tipo: 'gasto' })).toBeNull();
        expect(normalizarCategoria({ id: 'b', nombre: 'Sueldo', presupuesto: 9, tipo: 'ingreso' }).presupuestos).toEqual([]);
    });

    it('limpia un movimiento: ids, montos, textos largos y transferencias sin descripción', () => {
        const cuentas = new Set(['c1', 'c2']);
        const categorias = new Map();
        const base = { id: 'm1', descripcion: 'Super', monto: 10.004, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c1' };
        expect(normalizarMovimiento(base, cuentas, categorias)).toMatchObject({ monto: 10, categoriaId: null, creado: 0 });
        expect(normalizarMovimiento({ ...base, id: 'no/valido' }, cuentas, categorias)).toBeNull();
        expect(normalizarMovimiento({ ...base, monto: 0 }, cuentas, categorias)).toBeNull();
        expect(normalizarMovimiento({ ...base, monto: 1e13 }, cuentas, categorias)).toBeNull();
        expect(normalizarMovimiento({ ...base, descripcion: 'x'.repeat(500) }, cuentas, categorias).descripcion).toHaveLength(200);
        expect(normalizarMovimiento({ ...base, tipo: 'transferencia', descripcion: ' ', cuentaDestinoId: 'c2' }, cuentas, categorias))
            .toMatchObject({ descripcion: 'Transferencia', cuentaDestinoId: 'c2' });
    });

    it('una cuenta puede empezar en negativo (deuda de tarjeta)', () => {
        expect(normalizarCuenta({ id: 'v', nombre: 'Visa', tipo: 'credito', saldoInicial: -1500.555 })).toMatchObject({ saldoInicial: -1500.56 });
        expect(normalizarCuenta({ id: 'v', nombre: 'Visa', saldoInicial: 'mucho' })).toBeNull();
    });

    it('un respaldo con ids repetidos conserva uno y avisa los descartados', () => {
        const r = validarRespaldo({
            cuentas: [{ id: 'c', nombre: 'Caja', tipo: 'efectivo', saldoInicial: 0 }],
            categorias: [],
            movimientos: [
                { id: 'm', descripcion: 'A', monto: 5, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c' },
                { id: 'm', descripcion: 'B', monto: 6, tipo: 'gasto', fecha: '2026-10-02', cuentaId: 'c' }
            ]
        });
        expect(r.movimientos).toHaveLength(1);
        expect(r.descartados).toBe(1);
    });
});
