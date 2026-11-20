// ===== Walletera | exportar.js =====
// Descargas del listado de movimientos en Excel (.xlsx) y PDF.
// Las librerías viven en vendor/ y se cargan recién al exportar: no pesan al abrir la app
// y, una vez usadas, quedan en la caché del service worker para funcionar sin conexión.
import { formatearMoneda, formatearFecha } from './datos.js';

const LIBRERIAS = {
    excel: ['./vendor/write-excel-file/write-excel-file.min.js'],
    // En orden: el plugin de tablas se engancha a jsPDF al cargarse.
    pdf: ['./vendor/jspdf/jspdf.umd.min.js', './vendor/jspdf-autotable/jspdf.plugin.autotable.min.js']
};

export class ErrorDeCarga extends Error {}

const cargas = new Map();

function cargarScript(src) {
    if (!cargas.has(src)) {
        cargas.set(src, new Promise((resolver, rechazar) => {
            const script = Object.assign(document.createElement('script'), { src, async: false });
            script.onload = () => resolver();
            script.onerror = () => {
                cargas.delete(src);
                script.remove();
                rechazar(new ErrorDeCarga('No se pudo preparar la descarga. Revisá tu conexión e intentá de nuevo.'));
            };
            document.head.appendChild(script);
        }));
    }
    return cargas.get(src);
}

async function cargarLibrerias(lista) {
    for (const src of lista) await cargarScript(src);
}

// Dispara la descarga de un archivo generado en el navegador.
export function descargarArchivo(nombre, contenido, tipo) {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== Contenido común =====
// `datos`: { filas (de filasParaExportar, en orden cronológico), totales, categorias,
//            textoRango, filtros (textos), generado (Date) }
const categoriaDeFila = f => f.categoria || (f.tipo === 'transferencia' ? '' : 'Sin categoría');

function textoGenerado(fecha) {
    const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dia} ${hora}`;
}

const textoFiltros = filtros => (filtros.length ? filtros.join(' · ') : 'Ninguno');

// ===== Excel =====
// La librería pasa las fechas a número de serie con getTime(): con la medianoche UTC
// el día queda exacto sin importar la zona horaria del navegador.
function fechaExcel(fechaISO) {
    const [a, m, d] = fechaISO.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
}

const FORMATO_MONTO = '#,##0.00';
const negrita = value => ({ value, fontWeight: 'bold' });
const celdaMonto = value => ({ value, type: Number, format: FORMATO_MONTO });
const ENCABEZADOS_EXCEL = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Cuenta destino', 'Monto'];

export function armarHojasExcel(datos) {
    const encabezado = ENCABEZADOS_EXCEL.map(value => ({ value, fontWeight: 'bold', backgroundColor: '#E2E5DF' }));
    const filas = datos.filas.map(f => [
        { value: fechaExcel(f.fecha), type: Date, format: 'dd/mm/yyyy' },
        f.tipoNombre,
        f.descripcion || null,
        categoriaDeFila(f) || null,
        f.cuenta || null,
        f.cuentaDestino || null,
        celdaMonto(f.monto)
    ]);

    const { totales, categorias } = datos;
    const resumen = [
        [{ value: 'Walletera · Movimientos', fontWeight: 'bold', fontSize: 14 }],
        [null],
        [negrita('Período'), datos.textoRango],
        [negrita('Filtros'), textoFiltros(datos.filtros)],
        [negrita('Generado'), textoGenerado(datos.generado)],
        [null],
        [negrita('Ingresos'), celdaMonto(totales.ingresos)],
        [negrita('Gastos'), celdaMonto(totales.gastos)],
        [negrita('Resultado'), celdaMonto(totales.resultado)],
        [negrita('Movimientos'), { value: totales.cantidad, type: Number }]
    ];
    if (categorias.length) {
        resumen.push(
            [null],
            [negrita('Gasto por categoría'), negrita('Monto'), negrita('% del gasto')],
            ...categorias.map(c => [c.nombre, celdaMonto(c.monto), { value: c.porcentaje / 100, type: Number, format: '0.0%' }])
        );
    }

    return [
        {
            sheet: 'Movimientos',
            data: [encabezado, ...filas],
            columns: [{ width: 12 }, { width: 14 }, { width: 38 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 15 }],
            stickyRowsCount: 1
        },
        {
            sheet: 'Resumen',
            data: resumen,
            columns: [{ width: 22 }, { width: 30 }, { width: 12 }]
        }
    ];
}

export async function descargarExcel(datos, nombreArchivo) {
    await cargarLibrerias(LIBRERIAS.excel);
    const blob = await globalThis.writeXlsxFile(armarHojasExcel(datos), { fontFamily: 'Calibri', fontSize: 11 }).toBlob();
    descargarArchivo(nombreArchivo, blob);
}

// ===== PDF =====
// Helvetica, la fuente estándar de los PDF, no tiene el signo menos tipográfico ni
// el espacio duro que usa formatearMoneda: se reemplazan por sus versiones simples.
const textoPDF = valor => String(valor).replaceAll('\u2212', '-').replaceAll('\u00a0', ' ');
const montoPDF = monto => textoPDF(formatearMoneda(monto));
const conSigno = monto => (monto > 0 ? `+ ${montoPDF(monto)}` : montoPDF(monto));
const porcentajePDF = valor => `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;

export function armarContenidoPDF(datos) {
    const { totales } = datos;
    return {
        titulo: 'Movimientos',
        subtitulo: textoPDF(datos.textoRango),
        detalle: [
            datos.filtros.length ? textoPDF(`Filtros: ${textoFiltros(datos.filtros)}`) : null,
            `Generado el ${textoGenerado(datos.generado)}`
        ].filter(Boolean),
        resumen: {
            head: [['Ingresos', 'Gastos', 'Resultado', 'Movimientos']],
            body: [[conSigno(totales.ingresos), montoPDF(totales.gastos), conSigno(totales.resultado), String(totales.cantidad)]]
        },
        categorias: datos.categorias.map(c => [textoPDF(c.nombre), montoPDF(c.monto), porcentajePDF(c.porcentaje)]),
        tabla: {
            head: [['Fecha', 'Descripción', 'Categoría', 'Cuenta', 'Monto']],
            body: datos.filas.map(f => [
                formatearFecha(f.fecha),
                textoPDF(f.descripcion),
                textoPDF(categoriaDeFila(f) || 'Transferencia'),
                textoPDF(f.cuentaDestino ? `${f.cuenta} › ${f.cuentaDestino}` : f.cuenta),
                f.tipo === 'ingreso' ? conSigno(f.monto) : montoPDF(f.monto)
            ]),
            tipos: datos.filas.map(f => f.tipo)
        }
    };
}

const COLOR = {
    tinta: [17, 19, 17],
    suave: [93, 100, 92],
    acento: [74, 107, 0],
    fondoFila: [244, 245, 242],
    borde: [226, 229, 223]
};

export async function descargarPDF(datos, nombreArchivo) {
    await cargarLibrerias(LIBRERIAS.pdf);
    const { jsPDF } = globalThis.jspdf;
    const c = armarContenidoPDF(datos);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margen = 14;
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    doc.setProperties({ title: `Walletera · ${c.titulo}`, subject: c.subtitulo, creator: 'Walletera' });

    // Encabezado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.acento);
    doc.text('WALLETERA', margen, 16);
    doc.setFontSize(18);
    doc.setTextColor(...COLOR.tinta);
    doc.text(c.titulo, margen, 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(c.subtitulo, margen, 32);
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.suave);
    let y = 38;
    c.detalle.forEach(linea => {
        doc.text(linea, margen, y);
        y += 4.5;
    });

    // Totales
    doc.autoTable({
        startY: y + 2,
        head: c.resumen.head,
        body: c.resumen.body,
        theme: 'plain',
        styles: { font: 'helvetica', cellPadding: { top: 1, right: 2, bottom: 1, left: 0 } },
        headStyles: { fontSize: 8, fontStyle: 'normal', textColor: COLOR.suave },
        bodyStyles: { fontSize: 12, fontStyle: 'bold', textColor: COLOR.tinta },
        margin: { left: margen, right: margen }
    });

    // Gasto por categoría
    if (c.categorias.length) {
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 6,
            head: [['Gasto por categoría', 'Monto', '%']],
            body: c.categorias,
            theme: 'plain',
            tableWidth: 112,
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.4, textColor: COLOR.tinta },
            headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.3 }, lineColor: COLOR.borde },
            columnStyles: { 1: { halign: 'right', cellWidth: 32 }, 2: { halign: 'right', cellWidth: 16 } },
            didParseCell: d => {
                if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right';
            },
            margin: { left: margen, right: margen }
        });
    }

    // Movimientos
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 8,
        head: c.tabla.head,
        body: c.tabla.body,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: COLOR.tinta, overflow: 'linebreak' },
        headStyles: { fillColor: COLOR.tinta, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: COLOR.fondoFila },
        columnStyles: {
            0: { cellWidth: 20 },
            2: { cellWidth: 30 },
            3: { cellWidth: 38 },
            4: { cellWidth: 30, halign: 'right' }
        },
        didParseCell: d => {
            if (d.column.index !== 4) return;
            if (d.section === 'head') d.cell.styles.halign = 'right';
            if (d.section !== 'body') return;
            const tipo = c.tabla.tipos[d.row.index];
            if (tipo === 'ingreso') d.cell.styles.textColor = COLOR.acento;
            if (tipo === 'transferencia') d.cell.styles.textColor = COLOR.suave;
        },
        margin: { left: margen, right: margen, bottom: 18 }
    });

    // Pie con el número de página en todas las hojas
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR.suave);
        doc.text(`Walletera · ${c.subtitulo}`, margen, alto - 8);
        doc.text(`Página ${i} de ${paginas}`, ancho - margen, alto - 8, { align: 'right' });
    }

    descargarArchivo(nombreArchivo, doc.output('blob'));
}
