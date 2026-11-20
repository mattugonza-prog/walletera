# Backend de Walletera

API REST para que una casa lleve sus finanzas en la nube con un usuario compartido. Corre como una función de Vercel junto al sitio estático y guarda los datos en PostgreSQL.

## Cómo encaja con la app

```
Navegador ─────────────── modo local: localStorage (demo sin cuenta)
   │  modo nube: fetch /api/* (mismo origen, cookie de sesión)
   ▼
Vercel ── dist/ (sitio estático)
       └─ api/index.js → servidor/app.js (Hono)
              │  SQL parametrizado (pg, pool por instancia)
              ▼
          PostgreSQL ≥ 15 (Neon)
```

- **El servidor es la fuente de verdad en modo nube.** Cada alta, baja o modificación se guarda primero en la API; el navegador aplica el cambio recién cuando el servidor responde, usando lo que devuelve. Si el pedido falla, no cambia nada.
- **Los cálculos siguen en el navegador.** Saldos, resúmenes, gráficos y búsqueda trabajan sobre el estado completo que trae `GET /api/estado`. Una casa genera unos 2.000 movimientos por año, así que cargar todo es barato y deja la app usable sin conexión.
- **Mismas reglas en los dos lados.** `js/dominio.js` (fechas, recurrentes, presupuestos, validación) lo importan el navegador y el servidor.
- **Sin conexión.** El navegador guarda una copia del último estado y la muestra en solo lectura. El service worker nunca cachea `/api/`.

## Modelo de datos

`servidor/migraciones/001_inicial.sql`:

| Tabla | Para qué |
| --- | --- |
| `usuarios` | Email, hash de la contraseña y zona horaria (para saber qué día es "hoy" al registrar recurrentes) |
| `sesiones` | Una por dispositivo. Se guarda el SHA-256 del token de la cookie, nunca el token |
| `intentos_login` | Intentos fallidos recientes, para frenar a quien prueba contraseñas |
| `cuentas` | Efectivo, banco, billetera, tarjeta; saldo inicial |
| `categorias` | De gasto o de ingreso, con ícono y color |
| `presupuestos` | Presupuesto de una categoría desde un mes (`desde 'AAAA-MM'`) hasta la próxima entrada |
| `recurrentes` | Plantilla, frecuencia, fecha de inicio y última ocurrencia registrada |
| `movimientos` | Gasto, ingreso o transferencia; puede venir de un recurrente |

- **Claves que incluyen al usuario.**
  - Las tablas de datos tienen clave primaria `(usuario_id, id)` y claves foráneas compuestas `(usuario_id, cuenta_id)`.
  - Un movimiento no puede apuntar a la cuenta de otro usuario, ni siquiera por error.
  - Los ids son texto (`[A-Za-z0-9_-]{1,64}`) generados por el navegador, así que subir los datos locales a la nube conserva los ids.
- **Integridad en la base.**
  - `CHECK` de montos positivos, tipos válidos y transferencias con destino distinto del origen y sin categoría.
  - Una cuenta con movimientos no se puede borrar (409).
  - Borrar una categoría o un recurrente deja sus movimientos sin ese vínculo (`ON DELETE SET NULL` con lista de columnas, por eso PostgreSQL ≥ 15).
- **Montos y fechas.**
  - `NUMERIC(14,2)`; el driver los entrega como `number`.
  - `DATE` se entrega como texto `AAAA-MM-DD`, sin pasar por `Date`, para que la zona horaria no corra el día.

## API

Todas las rutas cuelgan de `/api`, reciben y devuelven JSON, y responden `Cache-Control: no-store`. Los errores son `{ "error": "mensaje para mostrar" }`.

| Método y ruta | Sesión | Qué hace |
| --- | --- | --- |
| `GET /sesion` | — | `{ email }` si hay sesión; si no, `{ email: null, registroAbierto }` |
| `POST /sesion` | — | Ingresar `{ email, clave }`. 401 si no coincide, 429 tras 5 fallos en 15 minutos |
| `DELETE /sesion` | — | Salir de este dispositivo |
| `DELETE /sesiones` | ✓ | Salir de todos los dispositivos |
| `POST /usuario` | — | Crear el usuario `{ email, clave, codigo }`. Solo si existe `CODIGO_REGISTRO` y el código coincide. Siembra categorías y una cuenta "Efectivo" |
| `PUT /usuario/clave` | ✓ | `{ actual, nueva }`. Cierra las demás sesiones |
| `GET /estado` | ✓ | Registra los recurrentes vencidos y devuelve `{ email, cuentas, categorias, movimientos, recurrentes }` |
| `POST /cuentas`, `PUT /cuentas/:id`, `DELETE /cuentas/:id` | ✓ | Cuentas (409 si tiene movimientos o recurrentes) |
| `POST /categorias`, `PUT /categorias/:id`, `DELETE /categorias/:id` | ✓ | Categorías con su lista de `presupuestos`. El tipo no cambia al editar |
| `POST /movimientos`, `PUT /movimientos/:id`, `DELETE /movimientos/:id` | ✓ | Movimientos. Al editar no cambian el vínculo con el recurrente ni la fecha de creación |
| `POST /recurrentes`, `PUT /recurrentes/:id`, `DELETE /recurrentes/:id` | ✓ | Al crear o editar devuelve `{ recurrente, generados }` con lo que ya venció. `PUT` recibe la plantilla, la próxima `fecha` y la `frecuencia` |
| `PUT /datos` | ✓ | Restaura un respaldo (el JSON que descarga la app): reemplaza todo |
| `DELETE /datos` | ✓ | `{ confirmar: true }`: borra todo y vuelve al estado inicial |

Sin `DATABASE_URL`, toda la API responde 503 y la app sigue en modo local.

### Recurrentes

En modo nube los registra el servidor, no cada navegador:

- `GET /estado` y el alta o edición de un recurrente corren `generarVencidos()` dentro de una transacción.
- `SELECT … FOR UPDATE` sobre los recurrentes del usuario hace que, si dos dispositivos abren la app al mismo tiempo, el segundo espere y vea la última ocurrencia ya actualizada.
- El índice único `(usuario_id, recurrente_id, fecha)` es la red de seguridad.
- "Hoy" se calcula en la zona horaria del usuario (por defecto, Buenos Aires), porque el servidor corre en UTC.

## Seguridad

- **Contraseñas.**
  - scrypt (`node:crypto`, N = 2¹⁵, sal aleatoria) y comparación en tiempo constante.
  - Con un email inexistente también se calcula un hash, así la respuesta no revela qué emails tienen usuario.
  - Mínimo 8 caracteres.
- **Sesión.**
  - Token aleatorio de 32 bytes en la cookie `walletera_sesion`: `HttpOnly` (el JavaScript de la página no la lee), `Secure` en HTTPS, `SameSite=Lax` y `Path=/api`.
  - Dura 60 días y se renueva sola al usarla.
- **CSRF.** Los pedidos que cambian datos tienen que mandar `Content-Type: application/json` (415 si no) y, si traen `Origin`, coincidir con el host (403).
- **Registro cerrado por defecto.** Sin `CODIGO_REGISTRO` nadie puede crear usuarios. La idea es usarlo una vez y borrarlo.
- **Límites.** 16 KB por pedido (4 MB para restaurar un respaldo) y 5 intentos de ingreso fallidos por email cada 15 minutos.
- **Encabezados** (`servidor/cabeceras.js` y `vercel.json`, un test verifica que coincidan):
  - Content Security Policy sin scripts en línea ni `eval`;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` y `Permissions-Policy`.
- **Al cerrar sesión** se borra la copia local de los datos. Si al abrir la app la sesión ya no existe, también.

## Operación

| Tarea | Comando |
| --- | --- |
| Servidor de desarrollo (app + API) | `npm start` |
| Aplicar migraciones | `npm run db:migrar` (usa `DATABASE_URL`) |
| Build para Vercel | `npm run build` (en producción también migra) |
| Cambiar una contraseña olvidada | `npm run clave -- email@ejemplo.com` |
| Tests | `npm test` (los de la API necesitan `DATABASE_URL_TEST`) |

- **Migraciones nuevas**: un archivo `servidor/migraciones/NNN_descripcion.sql`. Se aplican en orden, una sola vez, dentro de una transacción con un lock (`schema_migraciones` guarda cuáles ya corrieron). Conviene que sean aditivas: el build migra antes de que el código nuevo reciba tráfico.
- **Respaldos**: además de las copias de Neon, desde la app se puede descargar el JSON completo (Ajustes → Descargar respaldo) y restaurarlo en cualquier momento.

### Variables de entorno

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | Vercel (la crea la integración de Neon) y `.env` | Conexión a PostgreSQL |
| `CODIGO_REGISTRO` | Vercel, solo mientras se crea el usuario | Habilita "Crear usuario" para quien lo conozca |
| `DATABASE_URL_TEST` | `.env` o CI | Base que vacían los tests de la API (el nombre tiene que incluir "test") |
