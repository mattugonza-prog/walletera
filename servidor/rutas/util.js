// ===== Walletera | servidor/rutas/util.js =====

// El cuerpo JSON del pedido, o null si no es un objeto JSON válido.
export async function leerCuerpo(c) {
    try {
        const cuerpo = await c.req.json();
        return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : null;
    } catch {
        return null;
    }
}

export const invalido = (c, mensaje) => c.json({ error: mensaje }, 400);
export const noExiste = c => c.json({ error: 'No existe o ya se eliminó.' }, 404);
