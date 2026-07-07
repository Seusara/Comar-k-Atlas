-- Sub-proyecto 3: folio atómico + creación transaccional de facturas — correr en Supabase SQL Editor

create table folios_empresa (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  siguiente_folio integer not null default 1
);

alter table folios_empresa enable row level security;
-- Sin policies: solo crear_factura() (SECURITY INVOKER, pero esta tabla nunca se
-- consulta directo desde el cliente) y el service role la tocan.

create or replace function crear_factura(p_cliente_id uuid, p_conceptos jsonb)
returns facturas
language plpgsql
security invoker
as $$
declare
  v_empresa_id uuid;
  v_folio_numero integer;
  v_folio text;
  v_factura facturas;
  v_subtotal numeric(12,2) := 0;
  v_iva_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_concepto jsonb;
  v_cantidad numeric(12,2);
  v_precio_unitario numeric(12,2);
  v_iva numeric(5,2);
  v_importe numeric(12,2);
begin
  v_empresa_id := public.empresa_id();
  if v_empresa_id is null then
    raise exception 'No se pudo determinar la empresa del usuario autenticado';
  end if;

  if not exists (
    select 1 from clientes where id = p_cliente_id and empresa_id = v_empresa_id
  ) then
    raise exception 'El cliente % no pertenece a la empresa del usuario autenticado', p_cliente_id;
  end if;

  if jsonb_array_length(p_conceptos) = 0 then
    raise exception 'La factura debe tener al menos un concepto';
  end if;

  for v_concepto in select * from jsonb_array_elements(p_conceptos)
  loop
    v_cantidad := (v_concepto->>'cantidad')::numeric(12,2);
    v_precio_unitario := (v_concepto->>'precio_unitario')::numeric(12,2);
    v_iva := (v_concepto->>'iva')::numeric(5,2);
    v_importe := v_cantidad * v_precio_unitario;
    v_subtotal := v_subtotal + v_importe;
    v_iva_total := v_iva_total + (v_importe * v_iva / 100);
  end loop;
  v_total := v_subtotal + v_iva_total;

  insert into folios_empresa (empresa_id, siguiente_folio)
  values (v_empresa_id, 1)
  on conflict (empresa_id) do nothing;

  update folios_empresa
  set siguiente_folio = siguiente_folio + 1
  where empresa_id = v_empresa_id
  returning siguiente_folio - 1 into v_folio_numero;

  v_folio := 'A-' || lpad(v_folio_numero::text, 4, '0');

  insert into facturas (empresa_id, cliente_id, folio, subtotal, iva_total, total, status)
  values (v_empresa_id, p_cliente_id, v_folio, v_subtotal, v_iva_total, v_total, 'pendiente')
  returning * into v_factura;

  for v_concepto in select * from jsonb_array_elements(p_conceptos)
  loop
    v_cantidad := (v_concepto->>'cantidad')::numeric(12,2);
    v_precio_unitario := (v_concepto->>'precio_unitario')::numeric(12,2);
    v_iva := (v_concepto->>'iva')::numeric(5,2);
    insert into conceptos (factura_id, clave_sat, descripcion, cantidad, precio_unitario, iva, importe)
    values (
      v_factura.id,
      v_concepto->>'clave_sat',
      v_concepto->>'descripcion',
      v_cantidad,
      v_precio_unitario,
      v_iva,
      v_cantidad * v_precio_unitario
    );
  end loop;

  return v_factura;
end;
$$;

grant execute on function crear_factura(uuid, jsonb) to authenticated;
