# Librerías incluidas

Se sirven desde el propio sitio (sin CDN) y conservan su licencia original.

| Carpeta | Paquete | Versión | Archivo de origen | Licencia | Uso |
| --- | --- | --- | --- | --- | --- |
| `phosphor/` | [Phosphor Icons](https://phosphoricons.com) | — | fuente web | MIT | Íconos |
| `write-excel-file/` | [write-excel-file](https://www.npmjs.com/package/write-excel-file) | 4.1.1 | `bundle/write-excel-file.min.js` | MIT | Descarga en Excel |
| `jspdf/` | [jsPDF](https://www.npmjs.com/package/jspdf) | 4.2.1 | `dist/jspdf.umd.min.js` | MIT | Descarga en PDF |
| `jspdf-autotable/` | [jspdf-autotable](https://www.npmjs.com/package/jspdf-autotable) | 5.0.9 | `dist/jspdf.plugin.autotable.min.js` | MIT | Tablas del PDF |

Las de Excel y PDF se cargan recién cuando alguien descarga (`js/exportar.js`).
Para actualizarlas: `npm pack <paquete>@<versión>`, copiar el archivo de origen y su licencia, y
probar las descargas (`npm test` cubre el contenido; los archivos se validan abriéndolos).
