-- Patch: folios_empresa had RLS enabled with zero policies. crear_factura()
-- is SECURITY INVOKER (intentionally, so RLS still backstops its facturas/
-- conceptos inserts even if the function's own logic has a bug), which means
-- its internal writes to folios_empresa are ALSO subject to RLS as the
-- calling user -- and with no policy at all, that's an unconditional block,
-- not just a concurrency edge case. Every crear_factura() call fails.
--
-- Fix: add the same per-empresa policy already used for clientes/productos/
-- facturas, rather than switching the function to SECURITY DEFINER (which
-- would bypass RLS for ALL of its writes, including facturas/conceptos,
-- removing the defense-in-depth this design deliberately relies on).

create policy "folios_por_empresa" on folios_empresa
  for all using (empresa_id = public.empresa_id());
