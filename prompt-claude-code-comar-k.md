# Brief para Claude Code — Sistema Comar-K (Facturación CFDI)

Pega esto en Claude Code, en la terminal abierta dentro de la carpeta del proyecto (`figma-make-app`).

---

## Contexto

Este repo es un prototipo visual (Figma Make) de un sistema de facturación electrónica CFDI para pequeños negocios en México. Es solo frontend: React 19 + Vite + Tailwind v4, sin backend, sin persistencia, sin autenticación. Todo el "timbrado" es falso (folio fijo, sin XML, sin sello).

Archivos existentes en `src/`:
- `App.tsx` — shell con `useState<View>` y mapeo vista→componente (sin router)
- `Sidebar.tsx` — menú de navegación
- `Dashboard.tsx` — KPIs y tabla de facturas (datos hardcodeados)
- `Catalogo.tsx` — productos con clave SAT; botón "Nuevo artículo" sin handler
- `Clientes.tsx` — lista + modal "Nuevo cliente" que no persiste
- `NuevaFactura.tsx` — la más completa: autocomplete de cliente, conceptos con cálculo real de subtotal/IVA/total; "Timbrar factura" solo hace `setTimbrada(true)`, folio fijo "A-00422"
- `Historial.tsx` — filtro de facturas; botones XML/PDF/Cancelar inertes
- `Reportes.tsx` — gráficas recharts sobre arrays estáticos
- `Configuracion.tsx` — 4 tabs, inputs controlados; "Guardar cambios" y subida de CSD (.cer/.key) no funcionan
- `StatusBadge.tsx` — presentación de estatus (`'timbrada' | 'cancelada' | 'pendiente'`, duplicado en 2 archivos)

Modelo de datos implícito e inconsistente entre archivos (a unificar):
- **Cliente**: nombre, rfc, regimen fiscal, código postal, uso CFDI, facturas asociadas
- **Producto**: claveSAT, claveUnidad, nombre, precio, iva
- **Factura**: folio, cliente, rfc, fecha, total, status, uuid (fiscal)
- **Concepto** (renglón de factura): id, claveSAT, descripcion, cantidad, precio, iva

## Objetivo

Convertir este prototipo en una app funcional real, de punta a punta. Quiero que hagas TODO, en este orden:

### 1. Arquitectura y base de datos
- Elegir stack backend (recomendado: Next.js con API routes o un backend Node/Express separado + Postgres vía Prisma). Justifica la elección brevemente antes de empezar.
- Definir esquema de base de datos formal para: Usuario/Empresa (emisor), Cliente, Producto/Catálogo, Factura, Concepto, y su relación. Migrar el modelo implícito del prototipo a este esquema, unificando las interfaces duplicadas (`Status`, etc.) en un solo lugar compartido.
- Prisma migrations o SQL equivalente.

### 2. Autenticación
- Login/registro básico para la empresa emisora (email + password, sesión con JWT o cookies).
- Proteger todas las rutas de la app detrás de auth.

### 3. CRUD real
- Clientes: crear, editar, eliminar, listar — reemplazar el modal falso de `Clientes.tsx`.
- Catálogo de productos: CRUD real, incluyendo el botón "Nuevo artículo" que hoy no hace nada.
- Facturas: crear factura real (persistir cliente + conceptos + totales), listar en Historial con datos reales de la base de datos, cancelar factura de verdad (cambia estatus, no solo UI).

### 4. Timbrado CFDI real
Aquí es donde el prototipo es 100% falso y hay que decidir el enfoque real:
- El timbrado real requiere un PAC (Proveedor Autorizado de Certificación) autorizado por el SAT — no se puede timbrar CFDI sin uno. Opciones comunes con API: Facturama, SW Sapien, Finkok.
- Pregúntame qué PAC voy a usar (o si por ahora se implementa en modo sandbox/demo de alguno de ellos) antes de escribir el código de integración, porque cada uno tiene API distinta y requiere credenciales/CSD reales de la empresa.
- Mientras tanto, implementa el flujo completo dejando el punto de llamada al PAC claramente aislado (un servicio `timbrado.ts` o similar) para poder conectarlo después sin rehacer el resto.
- Guardar CSD (.cer/.key + contraseña) de forma segura (nunca en texto plano) desde `Configuracion.tsx`, que hoy no tiene esa función implementada.
- Generar y almacenar el XML timbrado y permitir descarga real de XML/PDF (hoy los botones no tienen handler en `NuevaFactura.tsx` y `Historial.tsx`).

### 5. Reportes y Dashboard
- Sustituir los arrays estáticos de `Reportes.tsx` y `Dashboard.tsx` por consultas reales agregadas desde la base de datos (ventas por periodo, facturas por estatus, top clientes, etc.).

### 6. Calidad
- Tipar todo correctamente en TypeScript, sin `any`.
- Tests básicos para cálculo de IVA/totales y para el flujo de timbrado (con el PAC mockeado en tests).
- Mantener Tailwind v4 y el estilo visual existente; no rehacer el diseño, solo conectar la funcionalidad real.

## Cómo quiero que trabajes

Ve mostrándome el plan de arquitectura antes de empezar a escribir código masivamente, y avísame en qué paso te encuentras. Pregúntame si necesitas decidir algo de negocio (ej. qué PAC, si hay multiempresa o una sola empresa emisora, si se requiere multiusuario con roles).
