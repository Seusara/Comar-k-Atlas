-- Sub-proyecto 1: Esquema base multiempresa — correr en Supabase SQL Editor
-- (v2: funciones helper movidas a esquema public; auth es reservado por Supabase)

-- Enum de estatus de factura (única fuente de verdad)
create type factura_status as enum ('pendiente', 'timbrada', 'cancelada');

-- Empresas (tenants)
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc_emisor text not null,
  regimen_fiscal text not null,
  cp_emisor text not null,
  creada_en timestamptz not null default now()
);

-- Super admins de la plataforma (tú)
create table super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);

-- Vínculo usuario <-> empresa (un usuario pertenece a una sola empresa)
create table usuarios_empresa (
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  rfc text not null,
  regimen_fiscal text not null,
  codigo_postal text not null,
  uso_cfdi text not null,
  creado_en timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  clave_sat text not null,
  clave_unidad text not null,
  nombre text not null,
  precio numeric(12,2) not null,
  iva numeric(5,2) not null,
  creado_en timestamptz not null default now()
);

create table facturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  folio text not null,
  uuid_fiscal text,
  fecha timestamptz not null default now(),
  subtotal numeric(12,2) not null,
  iva_total numeric(12,2) not null,
  total numeric(12,2) not null,
  status factura_status not null default 'pendiente',
  xml_url text,
  pdf_url text
);

create table conceptos (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas(id) on delete cascade,
  clave_sat text not null,
  descripcion text not null,
  cantidad numeric(12,2) not null,
  precio_unitario numeric(12,2) not null,
  iva numeric(5,2) not null,
  importe numeric(12,2) not null
);

-- Función helper: empresa del usuario autenticado (en public, no en auth: auth es reservado)
create or replace function public.empresa_id()
returns uuid
language sql stable
security definer
as $$
  select empresa_id from public.usuarios_empresa where user_id = auth.uid()
$$;

-- Función helper: ¿es super admin?
create or replace function public.is_super_admin()
returns boolean
language sql stable
security definer
as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid())
$$;

-- Habilitar RLS
alter table empresas enable row level security;
alter table clientes enable row level security;
alter table productos enable row level security;
alter table facturas enable row level security;
alter table conceptos enable row level security;
alter table usuarios_empresa enable row level security;

-- Policies: cada tabla de negocio solo visible/editable por su propia empresa,
-- o por el super admin (acceso total vía service role, que bypassa RLS de por sí,
-- así que estas policies son solo para el cliente autenticado normal).

create policy "empresa_propia_select" on empresas
  for select using (id = public.empresa_id());

create policy "clientes_por_empresa" on clientes
  for all using (empresa_id = public.empresa_id());

create policy "productos_por_empresa" on productos
  for all using (empresa_id = public.empresa_id());

create policy "facturas_por_empresa" on facturas
  for all using (empresa_id = public.empresa_id());

create policy "conceptos_por_factura" on conceptos
  for all using (
    factura_id in (select id from facturas where empresa_id = public.empresa_id())
  );

create policy "usuario_ve_su_propio_vinculo" on usuarios_empresa
  for select using (user_id = auth.uid());

-- Nota: las operaciones de super-admin (crear/eliminar empresa, crear primer usuario)
-- se hacen desde Next.js usando la service role key (bypassa RLS), nunca desde el cliente.
