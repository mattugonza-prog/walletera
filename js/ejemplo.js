// ===== Walletera | ejemplo.js =====
// Genera tres meses de movimientos verosímiles para explorar la app.
// Es determinista: la misma fecha de referencia produce siempre los mismos datos.

// Generador pseudoaleatorio con semilla (mulberry32).
function crearAleatorio(semilla) {
    let a = semilla >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pad = n => String(n).padStart(2, '0');

// Presupuestos acordes a los gastos generados: la mayoría en orden, alguno al límite.
const PRESUPUESTOS = {
    'Alimentación': 220000, 'Transporte': 40000, 'Vivienda': 480000, 'Salud': 30000,
    'Educación': 30000, 'Entretenimiento': 30000, 'Servicios': 100000,
    'Indumentaria': 50000, 'Mascotas': 25000, 'Ahorro': 0
};

export function generarDatosDeEjemplo(semilla, hoy = new Date()) {
    const categorias = semilla.map(c => (c.tipo === 'gasto' && c.nombre in PRESUPUESTOS
        ? { ...c, presupuesto: PRESUPUESTOS[c.nombre] }
        : c));
    const azar = crearAleatorio(42);
    const entre = (min, max) => Math.round((min + azar() * (max - min)) / 50) * 50;
    const diaAzar = (min, max) => min + Math.floor(azar() * (max - min + 1));
    const elegir = lista => lista[Math.floor(azar() * lista.length)];
    const idCategoria = nombre => categorias.find(c => c.nombre === nombre)?.id ?? null;

    const cuentas = [
        { id: 'ejemplo-banco',    nombre: 'Banco Nación', tipo: 'banco',     saldoInicial: 350000 },
        { id: 'ejemplo-mp',       nombre: 'Mercado Pago', tipo: 'billetera', saldoInicial: 40000 },
        { id: 'ejemplo-efectivo', nombre: 'Efectivo',     tipo: 'efectivo',  saldoInicial: 20000 },
        { id: 'ejemplo-visa',     nombre: 'Visa',         tipo: 'credito',   saldoInicial: 0 }
    ];
    const [banco, mp, efectivo, visa] = cuentas.map(c => c.id);

    // Gastos e ingresos fijos: se cargan como recurrentes y sus movimientos quedan vinculados.
    const fijos = [
        { id: 'ejemplo-r-sueldo',   dia: 1,  tipo: 'ingreso',       descripcion: 'Sueldo',            monto: 1250000, cuenta: banco, categoria: 'Sueldo' },
        { id: 'ejemplo-r-alquiler', dia: 3,  tipo: 'gasto',         descripcion: 'Alquiler',          monto: 380000,  cuenta: banco, categoria: 'Vivienda' },
        { id: 'ejemplo-r-mp',       dia: 5,  tipo: 'transferencia', descripcion: 'Transferencia',     monto: 280000,  cuenta: banco, destino: mp },
        { id: 'ejemplo-r-expensas', dia: 6,  tipo: 'gasto',         descripcion: 'Expensas',          monto: 95000,   cuenta: banco, categoria: 'Vivienda' },
        { id: 'ejemplo-r-internet', dia: 12, tipo: 'gasto',         descripcion: 'Internet Fibertel', monto: 28000,   cuenta: mp,    categoria: 'Servicios' },
        { id: 'ejemplo-r-netflix',  dia: 14, tipo: 'gasto',         descripcion: 'Netflix',           monto: 9500,    cuenta: visa,  categoria: 'Entretenimiento' },
        { id: 'ejemplo-r-spotify',  dia: 14, tipo: 'gasto',         descripcion: 'Spotify',           monto: 4200,    cuenta: visa,  categoria: 'Entretenimiento' }
    ];

    const movimientos = [];
    let creado = 1;
    const hoyISO = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;

    function agregar(fecha, tipo, descripcion, monto, cuentaId, extra = {}) {
        if (fecha > hoyISO) return;
        movimientos.push({
            id: `ejemplo-${creado}`,
            descripcion,
            monto,
            tipo,
            fecha,
            cuentaId,
            cuentaDestinoId: extra.destino ?? null,
            categoriaId: extra.categoria ? idCategoria(extra.categoria) : null,
            recurrenteId: extra.recurrente ?? null,
            creado: creado++
        });
    }

    let deudaTarjeta = 0;
    for (let atras = 2; atras >= 0; atras--) {
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
        const anio = inicio.getFullYear();
        const mes = inicio.getMonth();
        const diasDelMes = new Date(anio, mes + 1, 0).getDate();
        const dia = d => `${anio}-${pad(mes + 1)}-${pad(Math.min(d, diasDelMes))}`;
        const gasto = (d, descripcion, monto, cuenta, categoria) => {
            agregar(dia(d), 'gasto', descripcion, monto, cuenta, { categoria });
            if (cuenta === visa && dia(d) <= hoyISO) deudaTarjeta += monto;
        };

        // El resumen de la tarjeta del mes anterior se paga con el banco.
        if (deudaTarjeta > 0) {
            agregar(dia(10), 'transferencia', 'Pago tarjeta Visa', deudaTarjeta, banco, { destino: visa });
            deudaTarjeta = 0;
        }

        fijos.forEach(f => {
            agregar(dia(f.dia), f.tipo, f.descripcion, f.monto, f.cuenta, { categoria: f.categoria, destino: f.destino, recurrente: f.id });
            if (f.tipo === 'gasto' && f.cuenta === visa && dia(f.dia) <= hoyISO) deudaTarjeta += f.monto;
        });
        agregar(dia(7), 'transferencia', 'Extracción', 40000, banco, { destino: efectivo });

        gasto(8, 'Edenor', entre(32000, 42000), banco, 'Servicios');
        gasto(15, 'Metrogas', entre(15000, 22000), banco, 'Servicios');

        [2, 9, 16, 23, 30].forEach(d => {
            if (d <= diasDelMes) gasto(d, elegir(['Supermercado Coto', 'Carrefour', 'Supermercado Día']), entre(24000, 38000), mp, 'Alimentación');
        });
        [11, 19, 26].forEach(d => gasto(d, 'Kiosco', entre(1500, 4500), efectivo, 'Alimentación'));
        [6, 13, 20, 27].forEach(d => gasto(d, 'Verdulería', entre(5000, 9000), efectivo, 'Alimentación'));

        gasto(4, 'Carga SUBE', 10000, mp, 'Transporte');
        gasto(18, 'Carga SUBE', 10000, mp, 'Transporte');
        gasto(diaAzar(9, 21), 'Uber', entre(4000, 9000), visa, 'Transporte');

        gasto(diaAzar(12, 20), elegir(['Cena con amigos', 'Cine', 'Bar']), entre(12000, 28000), visa, 'Entretenimiento');

        gasto(diaAzar(4, 23), 'Farmacia', entre(8000, 24000), mp, 'Salud');
        gasto(20, 'Alimento para Toby', 22000, mp, 'Mascotas');
        if (atras === 1) {
            gasto(17, 'Zapatillas', 68000, visa, 'Indumentaria');
            agregar(dia(18), 'ingreso', 'Proyecto web freelance', 180000, mp, { categoria: 'Freelance' });
        }
        gasto(25, 'Curso online', 24000, mp, 'Educación');
    }

    const primerMes = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
    const recurrentes = fijos.map(f => {
        const registrados = movimientos.filter(m => m.recurrenteId === f.id).map(m => m.fecha);
        return {
            id: f.id,
            descripcion: f.descripcion,
            monto: f.monto,
            tipo: f.tipo,
            cuentaId: f.cuenta,
            cuentaDestinoId: f.destino ?? null,
            categoriaId: f.categoria ? idCategoria(f.categoria) : null,
            inicio: `${primerMes.getFullYear()}-${pad(primerMes.getMonth() + 1)}-${pad(f.dia)}`,
            frecuencia: 'mensual',
            ultima: registrados.length ? registrados[registrados.length - 1] : null
        };
    });

    return { cuentas, categorias, movimientos, recurrentes };
}
