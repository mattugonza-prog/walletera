// ===== Walletera | api.js =====
// Cliente de la API (/api, mismo origen). La sesión viaja en una cookie HttpOnly que este
// código no puede leer: el navegador la manda sola. Todo error se convierte en ErrorApi
// con un mensaje listo para mostrar.

export class ErrorApi extends Error {
    constructor(mensaje, estado, datos = null) {
        super(mensaje);
        this.name = 'ErrorApi';
        this.estado = estado;    // código HTTP; 0 = sin conexión
        this.datos = datos;
    }

    get sinConexion() {
        return this.estado === 0;
    }
}

// Se dispara cuando un pedido con sesión vuelve 401 (la sesión venció o se cerró en otro lado).
export const EVENTO_SESION_VENCIDA = 'walletera:sesion-vencida';

const MENSAJE_SIN_CONEXION = 'Sin conexión. Revisá internet e intentá de nuevo.';

async function pedir(metodo, ruta, cuerpo) {
    let respuesta;
    try {
        respuesta = await fetch(`/api${ruta}`, {
            method: metodo,
            credentials: 'same-origin',
            headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
        });
    } catch {
        throw new ErrorApi(MENSAJE_SIN_CONEXION, 0);
    }
    const datos = respuesta.status === 204 ? null : await respuesta.json().catch(() => null);
    if (respuesta.ok) return datos;
    if (respuesta.status === 401 && ruta !== '/sesion') {
        globalThis.dispatchEvent?.(new CustomEvent(EVENTO_SESION_VENCIDA));
    }
    throw new ErrorApi(datos?.error ?? 'Algo salió mal. Probá de nuevo en un momento.', respuesta.status, datos);
}

// ===== Sesión =====
// Nunca lanza: devuelve en qué situación está este dispositivo.
//   activa        → hay sesión ({ email })
//   sin-sesion    → la nube funciona pero no hay sesión ({ registroAbierto })
//   sin-conexion  → no se pudo consultar
//   sin-nube      → este sitio no tiene backend configurado (503, 404 de un hosting estático…)
export async function consultarSesion() {
    try {
        const { email, registroAbierto } = await pedir('GET', '/sesion');
        return email ? { estado: 'activa', email } : { estado: 'sin-sesion', registroAbierto: Boolean(registroAbierto) };
    } catch (error) {
        if (!(error instanceof ErrorApi)) return { estado: 'sin-nube' };
        if (error.estado === 401) return { estado: 'sin-sesion', registroAbierto: Boolean(error.datos?.registroAbierto) };
        if (error.estado === 0) return { estado: 'sin-conexion' };
        return { estado: 'sin-nube' };
    }
}

export const ingresar = (email, clave) => pedir('POST', '/sesion', { email, clave });
export const registrarse = (email, clave, codigo) => pedir('POST', '/usuario', { email, clave, codigo });
export const salir = () => pedir('DELETE', '/sesion');
export const salirDeTodos = () => pedir('DELETE', '/sesiones');
export const cambiarClave = (actual, nueva) => pedir('PUT', '/usuario/clave', { actual, nueva });

// ===== Datos =====
export const obtenerEstado = () => pedir('GET', '/estado');
export const crear = (coleccion, entidad) => pedir('POST', `/${coleccion}`, entidad);
export const editar = (coleccion, id, datos) => pedir('PUT', `/${coleccion}/${encodeURIComponent(id)}`, datos);
export const eliminar = (coleccion, id) => pedir('DELETE', `/${coleccion}/${encodeURIComponent(id)}`);
export const reemplazarDatos = respaldo => pedir('PUT', '/datos', respaldo);
export const borrarTodo = () => pedir('DELETE', '/datos', { confirmar: true });
