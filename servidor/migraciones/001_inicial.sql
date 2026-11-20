-- Walletera · esquema inicial
-- Todas las tablas de datos llevan usuario_id en la clave primaria y en las claves foráneas:
-- los datos de un usuario no pueden apuntar a los de otro, y los ids que genera el
-- navegador (texto) no chocan entre usuarios. Requiere PostgreSQL 15 o posterior
-- (ON DELETE SET NULL con lista de columnas).

create table usuarios (
    id            uuid primary key default gen_random_uuid(),
    email         text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
    hash_clave    text not null,
    zona_horaria  text not null default 'America/Argentina/Buenos_Aires',
    creado        timestamptz not null default now()
);

-- La cookie lleva un token aleatorio; acá se guarda solo su SHA-256.
create table sesiones (
    token_hash  text primary key,
    usuario_id  uuid not null references usuarios (id) on delete cascade,
    expira      timestamptz not null,
    creado      timestamptz not null default now()
);
create index sesiones_usuario on sesiones (usuario_id);

-- Intentos de ingreso fallidos, para frenar a quien prueba contraseñas.
create table intentos_login (
    email   text not null,
    creado  timestamptz not null default now()
);
create index intentos_login_email on intentos_login (email, creado);

create table cuentas (
    usuario_id     uuid not null references usuarios (id) on delete cascade,
    id             text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
    nombre         text not null check (char_length(nombre) between 1 and 60),
    tipo           text not null check (tipo in ('efectivo', 'banco', 'billetera', 'credito')),
    saldo_inicial  numeric(14, 2) not null default 0,
    orden          integer not null default 0,
    primary key (usuario_id, id)
);

create table categorias (
    usuario_id  uuid not null references usuarios (id) on delete cascade,
    id          text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
    nombre      text not null check (char_length(nombre) between 1 and 60),
    icono       text not null check (icono ~ '^ph-[a-z0-9-]+$'),
    color       text not null check (color in ('naranja', 'azul', 'rosa', 'verde', 'violeta', 'amarillo', 'turquesa', 'gris')),
    tipo        text not null check (tipo in ('gasto', 'ingreso')),
    orden       integer not null default 0,
    primary key (usuario_id, id)
);

-- Presupuesto mensual con vigencia: rige desde 'AAAA-MM' hasta la próxima entrada.
create table presupuestos (
    usuario_id    uuid not null,
    categoria_id  text not null,
    desde         text not null check (desde ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    monto         numeric(14, 2) not null check (monto >= 0),
    primary key (usuario_id, categoria_id, desde),
    foreign key (usuario_id, categoria_id) references categorias (usuario_id, id) on delete cascade
);

create table recurrentes (
    usuario_id         uuid not null references usuarios (id) on delete cascade,
    id                 text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
    descripcion        text not null check (char_length(descripcion) <= 200),
    monto              numeric(14, 2) not null check (monto > 0),
    tipo               text not null check (tipo in ('gasto', 'ingreso', 'transferencia')),
    cuenta_id          text not null,
    cuenta_destino_id  text,
    categoria_id       text,
    inicio             date not null,
    frecuencia         text not null check (frecuencia in ('mensual', 'semanal')),
    ultima             date check (ultima >= inicio),
    primary key (usuario_id, id),
    foreign key (usuario_id, cuenta_id) references cuentas (usuario_id, id),
    foreign key (usuario_id, cuenta_destino_id) references cuentas (usuario_id, id),
    foreign key (usuario_id, categoria_id) references categorias (usuario_id, id) on delete set null (categoria_id),
    check ((tipo = 'transferencia') = (cuenta_destino_id is not null)),
    check (cuenta_destino_id <> cuenta_id),
    check (tipo <> 'transferencia' or categoria_id is null)
);

create table movimientos (
    usuario_id         uuid not null references usuarios (id) on delete cascade,
    id                 text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
    descripcion        text not null check (char_length(descripcion) <= 200),
    monto              numeric(14, 2) not null check (monto > 0),
    tipo               text not null check (tipo in ('gasto', 'ingreso', 'transferencia')),
    fecha              date not null,
    cuenta_id          text not null,
    cuenta_destino_id  text,
    categoria_id       text,
    recurrente_id      text,
    -- Milisegundos de creación: ordenan los movimientos de un mismo día.
    creado             bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
    primary key (usuario_id, id),
    foreign key (usuario_id, cuenta_id) references cuentas (usuario_id, id),
    foreign key (usuario_id, cuenta_destino_id) references cuentas (usuario_id, id),
    foreign key (usuario_id, categoria_id) references categorias (usuario_id, id) on delete set null (categoria_id),
    foreign key (usuario_id, recurrente_id) references recurrentes (usuario_id, id) on delete set null (recurrente_id),
    check ((tipo = 'transferencia') = (cuenta_destino_id is not null)),
    check (cuenta_destino_id <> cuenta_id),
    check (tipo <> 'transferencia' or categoria_id is null)
);
create index movimientos_fecha on movimientos (usuario_id, fecha);

-- Cada ocurrencia de un recurrente se registra una sola vez, aunque dos dispositivos
-- abran la app al mismo tiempo.
create unique index movimientos_ocurrencia on movimientos (usuario_id, recurrente_id, fecha) where recurrente_id is not null;
