import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../../servidor/app.js';
import { desplazarPeriodo, fechaEnZona, generarId, normalizarCategoria } from '../../js/dominio.js';
import { generarDatosDeEjemplo } from '../../js/ejemplo.js';
import { CLAVE, CODIGO, appDePrueba, cerrarBase, emailNuevo, hayBase, navegador, registrado } from './ayuda.js';

describe('sin base de datos', () => {
    it('la API responde 503 y la app sigue funcionando en modo local', async () => {
        const res = await crearApp({ pool: null }).request('http://localhost/api/sesion');
        expect(res.status).toBe(503);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toMatchObject({ error: expect.stringContaining('no está configurada') });
    });
});

describe.skipIf(!hayBase)('API', () => {
    const { app, pool } = hayBase ? appDePrueba() : {};
    afterAll(() => cerrarBase());

    describe('registro e ingreso', () => {
        it('sin CODIGO_REGISTRO el registro está cerrado', async () => {
            const n = navegador(appDePrueba({}).app);
            expect((await n.pedir('POST', '/usuario', { email: emailNuevo(), clave: CLAVE, codigo: 'x' })).status).toBe(403);
            expect(await n.pedir('GET', '/sesion')).toMatchObject({ status: 200, cuerpo: { email: null, registroAbierto: false } });
        });

        it('con un código incorrecto no registra', async () => {
            const n = navegador(app);
            const res = await n.pedir('POST', '/usuario', { email: emailNuevo(), clave: CLAVE, codigo: 'otro' });
            expect(res).toMatchObject({ status: 403, cuerpo: { error: expect.stringContaining('código') } });
            expect((await n.pedir('GET', '/sesion')).cuerpo).toMatchObject({ registroAbierto: true });
        });

        it('registra, siembra categorías y una cuenta, y deja la sesión iniciada', async () => {
            const n = navegador(app);
            const email = emailNuevo();
            const res = await n.pedir('POST', '/usuario', { email: email.toUpperCase(), clave: CLAVE, codigo: CODIGO });
            expect(res).toMatchObject({ status: 201, cuerpo: { email } });
            const cookie = res.headers.get('set-cookie');
            expect(cookie).toMatch(/HttpOnly/i);
            expect(cookie).toMatch(/SameSite=Lax/i);
            expect(cookie).toMatch(/Path=\/api/);

            const { cuerpo: estado } = await n.pedir('GET', '/estado');
            expect(estado.email).toBe(email);
            expect(estado.categorias).toHaveLength(15);
            expect(estado.cuentas).toMatchObject([{ nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 }]);
            expect(estado.categorias.find(c => c.nombre === 'Alimentación').presupuestos).toEqual([{ desde: '2000-01', monto: 150000 }]);

            const { rows: [fila] } = await pool.query('select hash_clave from usuarios where email = $1', [email]);
            expect(fila.hash_clave).toMatch(/^scrypt\$/);
            expect(fila.hash_clave).not.toContain(CLAVE);
        });

        it('no permite dos usuarios con el mismo email ni contraseñas cortas', async () => {
            const { email } = await registrado(app);
            const n = navegador(app);
            expect((await n.pedir('POST', '/usuario', { email, clave: CLAVE, codigo: CODIGO })).status).toBe(409);
            expect((await n.pedir('POST', '/usuario', { email: emailNuevo(), clave: 'corta', codigo: CODIGO })).status).toBe(400);
            expect((await n.pedir('POST', '/usuario', { email: 'no-es-email', clave: CLAVE, codigo: CODIGO })).status).toBe(400);
        });

        it('el otro dispositivo entra con el mismo usuario', async () => {
            const { email } = await registrado(app);
            const otro = navegador(app);
            expect((await otro.pedir('GET', '/estado')).status).toBe(401);
            expect((await otro.pedir('POST', '/sesion', { email, clave: CLAVE })).status).toBe(200);
            expect((await otro.pedir('GET', '/sesion')).cuerpo).toEqual({ email });
            expect((await otro.pedir('GET', '/estado')).status).toBe(200);
        });

        it('una contraseña incorrecta y un email inexistente responden igual', async () => {
            const { email } = await registrado(app);
            const n = navegador(app);
            const mal = await n.pedir('POST', '/sesion', { email, clave: 'otra-clave-123' });
            const inexistente = await n.pedir('POST', '/sesion', { email: emailNuevo(), clave: CLAVE });
            expect(mal.status).toBe(401);
            expect(inexistente.status).toBe(401);
            expect(mal.cuerpo).toEqual(inexistente.cuerpo);
            expect(n.cookie).toBeNull();
        });

        it('frena después de 5 intentos fallidos, aunque el sexto sea correcto', async () => {
            const { email } = await registrado(app);
            const n = navegador(app);
            for (let i = 0; i < 5; i++) {
                expect((await n.pedir('POST', '/sesion', { email, clave: `incorrecta-${i}` })).status).toBe(401);
            }
            expect((await n.pedir('POST', '/sesion', { email, clave: CLAVE })).status).toBe(429);
        });

        it('cerrar sesión invalida la cookie, aunque alguien la haya copiado', async () => {
            const { n } = await registrado(app);
            const copiada = n.cookie;
            expect((await n.pedir('DELETE', '/sesion')).status).toBe(204);
            expect(n.cookie).toBeNull();
            const otro = navegador(app);
            otro.cookie = copiada;
            expect((await otro.pedir('GET', '/estado')).status).toBe(401);
        });

        it('"cerrar en todos los dispositivos" deja afuera a todas las sesiones', async () => {
            const { n, email } = await registrado(app);
            const celular = navegador(app);
            await celular.pedir('POST', '/sesion', { email, clave: CLAVE });
            expect((await n.pedir('DELETE', '/sesiones')).status).toBe(204);
            expect((await celular.pedir('GET', '/estado')).status).toBe(401);
            expect((await n.pedir('GET', '/estado')).status).toBe(401);
        });

        it('cambiar la contraseña pide la actual y cierra las otras sesiones', async () => {
            const { n, email } = await registrado(app);
            const celular = navegador(app);
            await celular.pedir('POST', '/sesion', { email, clave: CLAVE });
            expect((await n.pedir('PUT', '/usuario/clave', { actual: 'no-es-esta', nueva: 'nueva-clave-456' })).status).toBe(403);
            expect((await n.pedir('PUT', '/usuario/clave', { actual: CLAVE, nueva: 'nueva-clave-456' })).status).toBe(204);
            expect((await n.pedir('GET', '/estado')).status).toBe(200);
            expect((await celular.pedir('GET', '/estado')).status).toBe(401);
            expect((await celular.pedir('POST', '/sesion', { email, clave: CLAVE })).status).toBe(401);
            expect((await celular.pedir('POST', '/sesion', { email, clave: 'nueva-clave-456' })).status).toBe(200);
        });
    });

    describe('protección', () => {
        it('sin sesión no hay datos', async () => {
            const n = navegador(app);
            expect((await n.pedir('GET', '/estado')).status).toBe(401);
            expect((await n.pedir('POST', '/movimientos', {})).status).toBe(401);
            expect((await n.pedir('DELETE', '/datos', { confirmar: true })).status).toBe(401);
        });

        it('rechaza pedidos de otro sitio y los que no son JSON', async () => {
            const { n } = await registrado(app);
            const ajeno = await n.pedir('POST', '/cuentas', { nombre: 'X' }, { origin: 'https://sitio-malo.example' });
            expect(ajeno.status).toBe(403);
            const formulario = await n.pedir('POST', '/cuentas', 'nombre=X', { 'content-type': 'application/x-www-form-urlencoded' });
            expect(formulario.status).toBe(415);
        });

        it('un usuario no ve ni toca los datos de otro', async () => {
            const a = await registrado(app);
            const b = await registrado(app);
            const cuentaA = a.estado.cuentas[0].id;
            const cuentaB = b.estado.cuentas[0].id;
            const mov = { id: 'compartido', descripcion: 'Super', monto: 100, tipo: 'gasto', fecha: '2026-10-01', cuentaId: cuentaA };
            expect((await a.n.pedir('POST', '/movimientos', mov)).status).toBe(201);

            expect((await b.n.pedir('GET', '/estado')).cuerpo.movimientos).toEqual([]);
            expect((await b.n.pedir('PUT', '/movimientos/compartido', { ...mov, cuentaId: cuentaB, monto: 1 })).status).toBe(404);
            expect((await b.n.pedir('DELETE', '/movimientos/compartido')).status).toBe(404);
            expect((await b.n.pedir('DELETE', `/cuentas/${cuentaA}`)).status).toBe(404);
            // No puede usar la cuenta de A, pero sí el mismo id para lo suyo.
            expect((await b.n.pedir('POST', '/movimientos', mov)).status).toBe(400);
            expect((await b.n.pedir('POST', '/movimientos', { ...mov, cuentaId: cuentaB })).status).toBe(201);

            expect((await a.n.pedir('GET', '/estado')).cuerpo.movimientos).toMatchObject([{ id: 'compartido', monto: 100 }]);
        });

        it('rechaza cuerpos demasiado grandes y rutas que no existen', async () => {
            const { n, estado } = await registrado(app);
            const enorme = { id: 'x', descripcion: 'x'.repeat(20000), monto: 1, tipo: 'gasto', fecha: '2026-10-01', cuentaId: estado.cuentas[0].id };
            expect((await n.pedir('POST', '/movimientos', enorme)).status).toBe(413);
            expect((await n.pedir('GET', '/no-existe')).status).toBe(404);
        });

        it('las respuestas no se guardan en caché', async () => {
            const { n } = await registrado(app);
            expect((await n.pedir('GET', '/estado')).headers.get('cache-control')).toBe('no-store');
        });
    });

    describe('datos', () => {
        it('alta, edición y baja de un movimiento, con validación', async () => {
            const { n, estado } = await registrado(app);
            const efectivo = estado.cuentas[0];
            const comida = estado.categorias.find(c => c.nombre === 'Alimentación');
            const mov = { id: 'm1', descripcion: 'Super', monto: 1550.5, tipo: 'gasto', fecha: '2026-01-01', cuentaId: efectivo.id, categoriaId: comida.id };

            const creado = await n.pedir('POST', '/movimientos', mov);
            expect(creado.status).toBe(201);
            expect(creado.cuerpo.movimiento).toMatchObject({ ...mov, cuentaDestinoId: null, recurrenteId: null });
            expect((await n.pedir('POST', '/movimientos', mov)).status).toBe(409);
            expect((await n.pedir('POST', '/movimientos', { ...mov, id: 'm2', monto: -5 })).status).toBe(400);
            expect((await n.pedir('POST', '/movimientos', { ...mov, id: 'm3', fecha: '2026-02-31' })).status).toBe(400);
            expect((await n.pedir('POST', '/movimientos', { ...mov, id: 'mal/id' })).status).toBe(400);

            const editado = await n.pedir('PUT', '/movimientos/m1', { ...mov, monto: 2000, fecha: '2026-10-23' });
            expect(editado.cuerpo.movimiento).toMatchObject({ monto: 2000, fecha: '2026-10-23', creado: creado.cuerpo.movimiento.creado });

            const { cuerpo: despues } = await n.pedir('GET', '/estado');
            expect(despues.movimientos).toMatchObject([{ id: 'm1', monto: 2000, fecha: '2026-10-23' }]);
            expect(typeof despues.movimientos[0].monto).toBe('number');

            expect((await n.pedir('DELETE', '/movimientos/m1')).status).toBe(204);
            expect((await n.pedir('DELETE', '/movimientos/m1')).status).toBe(404);
        });

        it('una transferencia necesita otra cuenta de destino y no lleva categoría', async () => {
            const { n, estado } = await registrado(app);
            const efectivo = estado.cuentas[0].id;
            const comida = estado.categorias.find(c => c.nombre === 'Alimentación').id;
            await n.pedir('POST', '/cuentas', { id: 'banco', nombre: 'Banco', tipo: 'banco', saldoInicial: 1000 });
            const base = { id: 't1', descripcion: '', monto: 300, tipo: 'transferencia', fecha: '2026-10-05', cuentaId: 'banco' };
            expect((await n.pedir('POST', '/movimientos', { ...base, cuentaDestinoId: 'banco' })).status).toBe(400);
            const ok = await n.pedir('POST', '/movimientos', { ...base, cuentaDestinoId: efectivo, categoriaId: comida });
            expect(ok.cuerpo.movimiento).toMatchObject({ descripcion: 'Transferencia', cuentaDestinoId: efectivo, categoriaId: null });
        });

        it('una cuenta con movimientos no se borra; una vacía sí', async () => {
            const { n, estado } = await registrado(app);
            const efectivo = estado.cuentas[0].id;
            await n.pedir('POST', '/movimientos', { id: 'm', descripcion: 'A', monto: 1, tipo: 'gasto', fecha: '2026-10-01', cuentaId: efectivo });
            expect((await n.pedir('DELETE', `/cuentas/${efectivo}`)).status).toBe(409);
            const nueva = await n.pedir('POST', '/cuentas', { id: 'vacia', nombre: 'Vacía', tipo: 'billetera', saldoInicial: -1500.555 });
            expect(nueva.cuerpo.cuenta).toMatchObject({ saldoInicial: -1500.56 });
            expect((await n.pedir('PUT', '/cuentas/vacia', { nombre: 'Mercado Pago', tipo: 'billetera', saldoInicial: 10 })).cuerpo.cuenta)
                .toMatchObject({ id: 'vacia', nombre: 'Mercado Pago' });
            expect((await n.pedir('DELETE', '/cuentas/vacia')).status).toBe(204);
            expect((await n.pedir('GET', '/estado')).cuerpo.cuentas.map(c => c.id)).toEqual([efectivo]);
        });

        it('borrar una categoría deja sus movimientos "Sin categoría"', async () => {
            const { n, estado } = await registrado(app);
            const comida = estado.categorias.find(c => c.nombre === 'Alimentación').id;
            await n.pedir('POST', '/movimientos', { id: 'm', descripcion: 'Super', monto: 1, tipo: 'gasto', fecha: '2026-10-01', cuentaId: estado.cuentas[0].id, categoriaId: comida });
            expect((await n.pedir('DELETE', `/categorias/${comida}`)).status).toBe(204);
            const { cuerpo } = await n.pedir('GET', '/estado');
            expect(cuerpo.movimientos[0].categoriaId).toBeNull();
            expect(cuerpo.categorias.some(c => c.id === comida)).toBe(false);
        });

        it('guarda el presupuesto por mes y el tipo de una categoría no cambia al editarla', async () => {
            const { n } = await registrado(app);
            const creada = await n.pedir('POST', '/categorias', { id: 'gym', nombre: 'Gimnasio', icono: 'ph-barbell', color: 'turquesa', tipo: 'gasto', presupuestos: [{ desde: '2026-10', monto: 5000 }] });
            expect(creada.status).toBe(201);
            const presupuestos = [{ desde: '2026-10', monto: 5000 }, { desde: '2026-12', monto: 6500.5 }];
            const editada = await n.pedir('PUT', '/categorias/gym', { nombre: 'Gym', icono: 'ph-barbell', color: 'verde', tipo: 'ingreso', presupuestos });
            expect(editada.cuerpo.categoria).toMatchObject({ nombre: 'Gym', tipo: 'gasto', presupuestos });
            const { cuerpo } = await n.pedir('GET', '/estado');
            expect(cuerpo.categorias.at(-1)).toEqual({ id: 'gym', nombre: 'Gym', icono: 'ph-barbell', color: 'verde', tipo: 'gasto', presupuestos });
            expect((await n.pedir('PUT', '/categorias/gym', { nombre: 'Gym', presupuestos: [{ desde: '2026-13', monto: 1 }] })).status).toBe(400);
        });
    });

    describe('recurrentes', () => {
        const hoy = fechaEnZona('America/Argentina/Buenos_Aires');
        const mes = hoy.slice(0, 7);
        const inicio = `${desplazarPeriodo(mes, -2)}-01`;
        const alquiler = cuentaId => ({ id: 'alquiler', descripcion: 'Alquiler', monto: 1000, tipo: 'gasto', cuentaId, inicio, frecuencia: 'mensual' });

        it('al crearlo registra lo que ya venció y lo devuelve', async () => {
            const { n, estado } = await registrado(app);
            const res = await n.pedir('POST', '/recurrentes', alquiler(estado.cuentas[0].id));
            expect(res.status).toBe(201);
            expect(res.cuerpo.recurrente).toMatchObject({ id: 'alquiler', inicio, ultima: `${mes}-01` });
            expect(res.cuerpo.generados.map(m => m.fecha)).toEqual([inicio, `${desplazarPeriodo(mes, -1)}-01`, `${mes}-01`]);
            expect(res.cuerpo.generados.every(m => m.recurrenteId === 'alquiler')).toBe(true);
            // Volver a abrir la app no registra nada nuevo.
            expect((await n.pedir('GET', '/estado')).cuerpo.movimientos).toHaveLength(3);
        });

        it('dos dispositivos que abren la app al mismo tiempo no duplican', async () => {
            const { n, email, estado } = await registrado(app);
            const { rows: [usuario] } = await pool.query('select id from usuarios where email = $1', [email]);
            await pool.query(
                `insert into recurrentes (usuario_id, id, descripcion, monto, tipo, cuenta_id, inicio, frecuencia)
                 values ($1, 'sueldo', 'Sueldo', 900, 'ingreso', $2, $3, 'mensual')`,
                [usuario.id, estado.cuentas[0].id, inicio]
            );
            const celular = navegador(app);
            await celular.pedir('POST', '/sesion', { email, clave: CLAVE });
            const [uno, otro] = await Promise.all([n.pedir('GET', '/estado'), celular.pedir('GET', '/estado')]);
            expect(uno.cuerpo.movimientos).toHaveLength(3);
            expect(otro.cuerpo.movimientos).toHaveLength(3);
        });

        it('editar valida la próxima fecha y no toca lo ya registrado', async () => {
            const { n, estado } = await registrado(app);
            const cuentaId = estado.cuentas[0].id;
            await n.pedir('POST', '/recurrentes', alquiler(cuentaId));
            const plantilla = { descripcion: 'Alquiler', monto: 1200, tipo: 'gasto', cuentaId, frecuencia: 'mensual' };
            const mal = await n.pedir('PUT', '/recurrentes/alquiler', { ...plantilla, fecha: `${mes}-01` });
            expect(mal).toMatchObject({ status: 400, cuerpo: { error: expect.stringContaining('posterior') } });
            const proximo = `${desplazarPeriodo(mes, 1)}-10`;
            const bien = await n.pedir('PUT', '/recurrentes/alquiler', { ...plantilla, fecha: proximo });
            expect(bien.cuerpo.recurrente).toMatchObject({ monto: 1200, inicio: proximo, ultima: null });
            expect((await n.pedir('GET', '/estado')).cuerpo.movimientos.every(m => m.monto === 1000)).toBe(true);
        });

        it('borrarlo conserva los movimientos, sin el vínculo', async () => {
            const { n, estado } = await registrado(app);
            await n.pedir('POST', '/recurrentes', alquiler(estado.cuentas[0].id));
            expect((await n.pedir('DELETE', '/recurrentes/alquiler')).status).toBe(204);
            const { cuerpo } = await n.pedir('GET', '/estado');
            expect(cuerpo.recurrentes).toEqual([]);
            expect(cuerpo.movimientos).toHaveLength(3);
            expect(cuerpo.movimientos.every(m => m.recurrenteId === null)).toBe(true);
        });
    });

    describe('respaldo', () => {
        it('restaura un respaldo de la versión anterior (presupuesto único y emojis)', async () => {
            const { n } = await registrado(app);
            const res = await n.pedir('PUT', '/datos', {
                cuentas: [{ id: 'c1', nombre: 'Caja', tipo: 'efectivo', saldoInicial: 100 }],
                categorias: [{ id: 'cat', nombre: 'Comida', icono: '🍔', presupuesto: 500, tipo: 'gasto' }],
                movimientos: [
                    { id: 'm', descripcion: 'Super', monto: 50, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c1', categoriaId: 'cat', creado: 1 },
                    { id: 'malo', descripcion: 'x', monto: -1, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c1' }
                ]
            });
            expect(res.cuerpo).toEqual({ cuentas: 1, categorias: 1, movimientos: 1, recurrentes: 0, descartados: 1 });
            const { cuerpo } = await n.pedir('GET', '/estado');
            expect(cuerpo.categorias).toEqual([{ id: 'cat', nombre: 'Comida', icono: 'ph-fork-knife', color: 'naranja', tipo: 'gasto', presupuestos: [{ desde: '2000-01', monto: 500 }] }]);
            expect(cuerpo.movimientos).toEqual([{ id: 'm', descripcion: 'Super', monto: 50, tipo: 'gasto', fecha: '2026-10-01', cuentaId: 'c1', cuentaDestinoId: null, categoriaId: 'cat', recurrenteId: null, creado: 1 }]);
        });

        it('los datos de ejemplo de la app se suben completos', async () => {
            const { n } = await registrado(app);
            const semilla = JSON.parse(readFileSync(new URL('../../categorias.json', import.meta.url), 'utf8'))
                .map(c => normalizarCategoria({ ...c, id: generarId() }));
            const ejemplo = generarDatosDeEjemplo(semilla);
            const res = await n.pedir('PUT', '/datos', ejemplo);
            expect(res.cuerpo).toMatchObject({ descartados: 0, cuentas: 4, recurrentes: 7 });
            const { cuerpo } = await n.pedir('GET', '/estado');
            expect(cuerpo.movimientos).toHaveLength(ejemplo.movimientos.length);
            expect(cuerpo.recurrentes.find(r => r.id === 'ejemplo-r-sueldo').ultima).toBe(ejemplo.recurrentes[0].ultima);
        });

        it('rechaza un archivo que no es un respaldo', async () => {
            const { n } = await registrado(app);
            expect((await n.pedir('PUT', '/datos', { hola: 1 })).cuerpo).toMatchObject({ error: expect.stringContaining('no es un respaldo') });
        });

        it('borrar todo pide confirmación y vuelve al estado inicial', async () => {
            const { n, estado } = await registrado(app);
            await n.pedir('POST', '/movimientos', { id: 'm', descripcion: 'A', monto: 1, tipo: 'gasto', fecha: '2026-10-01', cuentaId: estado.cuentas[0].id });
            expect((await n.pedir('DELETE', '/datos', {})).status).toBe(400);
            expect((await n.pedir('DELETE', '/datos', { confirmar: true })).status).toBe(204);
            const { cuerpo } = await n.pedir('GET', '/estado');
            expect(cuerpo.movimientos).toEqual([]);
            expect(cuerpo.categorias).toHaveLength(15);
            expect(cuerpo.cuentas).toMatchObject([{ nombre: 'Efectivo' }]);
        });
    });
});
