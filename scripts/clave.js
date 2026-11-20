// ===== Walletera | scripts/clave.js =====
// Cambia la contraseña de un usuario cuando nadie la recuerda (la app no manda mails).
//   npm run clave -- tu@email.com
// Usa DATABASE_URL (en .env o en el entorno) y cierra todas las sesiones abiertas.
import { createInterface } from 'node:readline';
import pg from 'pg';
import { esClaveValida, hashearClave, normalizarEmail, LARGO_MINIMO_CLAVE } from '../servidor/seguridad.js';

// Pregunta sin mostrar lo que se escribe.
function preguntarOculto(pregunta) {
    return new Promise(resolver => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl._writeToOutput = texto => { if (texto.includes(pregunta)) process.stdout.write(texto); };
        rl.question(pregunta, respuesta => {
            rl.close();
            process.stdout.write('\n');
            resolver(respuesta);
        });
    });
}

const email = normalizarEmail(process.argv[2]);
if (!email) {
    console.error('Uso: npm run clave -- tu@email.com');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (en .env o en el entorno).');
    process.exit(1);
}

const clave = await preguntarOculto('Contraseña nueva: ');
if (!esClaveValida(clave)) {
    console.error(`La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
    process.exit(1);
}
if (clave !== await preguntarOculto('Repetila: ')) {
    console.error('No coinciden.');
    process.exit(1);
}

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();
try {
    const { rows: [usuario] } = await cliente.query(
        'update usuarios set hash_clave = $2 where email = $1 returning id', [email, await hashearClave(clave)]
    );
    if (!usuario) {
        console.error(`No hay ningún usuario con el email ${email}.`);
        process.exitCode = 1;
    } else {
        await cliente.query('delete from sesiones where usuario_id = $1', [usuario.id]);
        console.log('Listo: contraseña cambiada y sesiones cerradas. Ingresá de nuevo en cada dispositivo.');
    }
} finally {
    await cliente.end();
}
