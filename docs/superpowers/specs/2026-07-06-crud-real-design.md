# Sub-proyecto 3: CRUD real (Clientes, Catálogo, Facturas) — Sistema Comar-K

Fecha: 2026-07-06

## Contexto

Sub-proyectos 1 (arquitectura base) y 2 (autenticación: alta/baja de empresas, logout) ya están completos e implementados. Este sub-proyecto conecta las pantallas de negocio del prototipo a datos reales en Supabase: `Clientes.tsx`, `Catalogo.tsx`, `NuevaFactura.tsx`, `Historial.tsx`.

Orden general del proyecto completo:
1. Arquitectura base y modelo de datos — completo
2. Autenticación — completo
3. **CRUD real** (este documento)
4. Timbrado CFDI
5. Reportes y Dashboard con datos reales
6. Calidad (transversal, aplicada en cada sub-proyecto)

## Decisiones tomadas

- Clientes y productos: CRUD completo (crear, editar, eliminar), no solo crear/listar.
- Facturas: solo crear, listar y cancelar. No se editan una vez creadas — si algo estuvo mal, se cancela y se crea una nueva (patrón fiscal estándar).
- El folio se genera automáticamente, consecutivo por empresa (ej. A-0001, A-0002...), no lo escribe el usuario.
- Descarga de XML/PDF queda deshabilitada en la UI hasta el sub-proyecto 4 (timbrado); no tiene sentido generarlos sin timbrado real.

## Diseño

### Clientes y Productos

Mismo patrón para ambas entidades:
- `GET /api/clientes`, `POST /api/clientes`, `PATCH /api/clientes/:id`, `DELETE /api/clientes/:id` (análogo para `/api/productos`).
- Usan el cliente de Supabase autenticado normal (no el admin) — RLS filtra automáticamente por `empresa_id` del usuario en sesión; el handler no necesita pasar `empresa_id` explícito en las queries de lectura, Postgres lo resuelve vía policy. Al insertar, el handler sí debe fijar `empresa_id` al de la sesión actual (RLS también lo valida en el insert).
- Validación de body en servidor con el mismo patrón reforzado del sub-proyecto 2: parseo seguro, sin `any`, rechazo de campos faltantes o de tipo incorrecto con 400.
- `Clientes.tsx`: reemplaza el modal actual (que solo cierra sin guardar) por llamadas reales a estos endpoints. Se agrega edición y eliminación en la lista, que hoy no existen.
- `Catalogo.tsx`: conecta el botón "Nuevo artículo" (hoy sin handler) a `POST /api/productos`. Se agrega edición y eliminación en la lista.

### Facturas

- `POST /api/facturas`: recibe cliente_id + array de conceptos (clave_sat, descripción, cantidad, precio_unitario, iva). Inserta la factura y sus conceptos en una sola operación transaccional vía función de Postgres (`crear_factura(...)`), para evitar una factura sin conceptos o viceversa si algo falla a medio camino.
  - El folio se calcula dentro de la misma función de Postgres, usando una tabla `folios_empresa (empresa_id primary key, siguiente_folio integer not null default 1)`. La función hace `UPDATE folios_empresa SET siguiente_folio = siguiente_folio + 1 WHERE empresa_id = ... RETURNING siguiente_folio` de forma atómica (el `UPDATE ... RETURNING` de Postgres serializa las escrituras concurrentes por fila), evitando folios duplicados si dos facturas se crean al mismo tiempo. Si no existe fila en `folios_empresa` para la empresa, se crea con valor inicial 1 en la misma función (upsert).
  - `NuevaFactura.tsx` ya calcula subtotal/IVA/total correctamente en cliente; se conecta para que "Timbrar factura" (este sub-proyecto no timbra de verdad, solo persiste) llame a este endpoint en vez de `setTimbrada(true)`. La factura se crea con `status = 'pendiente'`.
- `GET /api/facturas`: lista facturas reales de la empresa (RLS), usado por `Historial.tsx`. El Dashboard con KPIs agregados (sumas, conteos por periodo) se deja para el sub-proyecto 5; en este sub-proyecto el Dashboard puede seguir con datos estáticos si mostrarlos en tiempo real no es prioridad aquí.
- `PATCH /api/facturas/:id/cancelar`: cambia `status` a `cancelada`. Solo permitido si el status actual es `pendiente`; si la factura ya está `cancelada` o `timbrada`, el endpoint responde 409 (conflicto) sin modificar nada. (Cancelar una factura ya timbrada de verdad, vía el PAC, es un flujo distinto que se implementará en el sub-proyecto 4).
- Botones de descarga XML/PDF en `NuevaFactura.tsx` y `Historial.tsx` quedan visualmente presentes pero deshabilitados (o sin handler funcional), documentado como pendiente del sub-proyecto 4.

## Testing / criterios de aceptación

- CRUD de clientes y productos: crear, editar, eliminar verificado; una empresa no puede leer, editar ni eliminar registros de otra empresa (test de aislamiento, igual que el patrón de RLS ya probado en sub-proyecto 1).
- Test de concurrencia de folio: disparar dos creaciones de factura simultáneas para la misma empresa y verificar que los folios resultantes son consecutivos y no se repiten.
- Test de cancelación: cancelar una factura `pendiente` funciona; intentar cancelar una ya `cancelada` (o `timbrada`, aunque timbrada no es alcanzable todavía en este sub-proyecto) es rechazado con 409.
- Test de que `POST /api/facturas` no crea la factura si falla la inserción de conceptos (atomicidad verificada, por ejemplo forzando un concepto inválido).
