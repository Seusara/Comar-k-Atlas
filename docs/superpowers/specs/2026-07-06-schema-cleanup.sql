-- Limpieza: borra todo lo del sub-proyecto 1 para poder correr el schema desde cero.
-- Correr esto ANTES de volver a correr 2026-07-06-schema.sql

drop table if exists conceptos cascade;
drop table if exists facturas cascade;
drop table if exists productos cascade;
drop table if exists clientes cascade;
drop table if exists usuarios_empresa cascade;
drop table if exists super_admins cascade;
drop table if exists empresas cascade;

drop function if exists public.empresa_id() cascade;
drop function if exists public.is_super_admin() cascade;
drop function if exists auth.empresa_id() cascade;
drop function if exists auth.is_super_admin() cascade;

drop type if exists factura_status cascade;
