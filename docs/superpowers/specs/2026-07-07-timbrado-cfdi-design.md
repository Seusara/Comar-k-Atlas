# Sub-proyecto 4: Timbrado CFDI (Facturama, ambiente sandbox) — Sistema Comar-K

Fecha: 2026-07-07

## Contexto

Sub-proyectos 1 (arquitectura base), 2 (autenticación) y 3 (CRUD real) ya están completos. Este sub-proyecto conecta `NuevaFactura.tsx` y `Historial.tsx` a un timbrado real de CFDI 4.0 vía Facturama, en su ambiente sandbox.

Orden general del proyecto completo:
1. Arquitectura base y modelo de datos — completo
2. Autenticación — completo
3. CRUD real — completo
4. **Timbrado CFDI** (este documento)
5. Reportes y Dashboard con datos reales
6. Calidad (transversal, aplicada en cada sub-proyecto)

## Decisiones tomadas

- PAC: **Facturama**, ambiente sandbox (`apisandbox.facturama.mx`). Credenciales sandbox (usuario/contraseña de Basic Auth) ya recibidas y guardadas en `.env.local` como `FACTURAMA_API_USER` / `FACTURAMA_API_PASSWORD` (no versionadas).
- **API Multiemisor/Lite** (`/api-lite/...`), no la API Web de un solo emisor: cada empresa de la plataforma tiene su propio RFC real (`empresas.rfc_emisor`) y debe timbrar bajo su propia identidad fiscal, no bajo un RFC de pruebas compartido. Esto requiere que cada empresa registre su propio CSD (Certificado de Sello Digital) ante Facturama antes de poder timbrar.
- Alcance sandbox: se prueba el flujo completo (registro de CSD, timbrado, descarga, cancelación) contra el ambiente de pruebas de Facturama. Pasar a producción (CSD reales del SAT, cuenta de producción) es un paso posterior, fuera de este sub-proyecto.
- El folio se sigue generando en `crear_factura()` (sub-proyecto 3), no lo asigna Facturama.
- Timbrado y creación de la factura ocurren en una sola acción de usuario ("Timbrar factura"): se crea la factura (folio asignado, `status='pendiente'`) y, en la misma solicitud, se intenta timbrar. Si Facturama falla, la factura permanece `pendiente` con el error guardado — el folio no se pierde, y el timbrado puede reintentarse.
- Cancelación de una factura `pendiente` sigue siendo una simple actualización de estatus (sin llamar a Facturama, porque nunca se timbró). Cancelación de una factura `timbrada` es un flujo distinto y nuevo: llama a Facturama con un motivo SAT (01–04) y, si el motivo es 01, un UUID de sustitución.
- Los conceptos de una factura ya no se capturan como texto libre: se seleccionan del catálogo de productos (`productos`), que ya trae `clave_sat`, `clave_unidad`, `precio` e `iva` correctos. Esto es necesario para que cada concepto tenga una `ClaveUnidad` SAT válida, campo que CFDI 4.0 exige y que hoy no existe en ningún punto del flujo.
- Descarga de XML/PDF: rutas propias que hacen proxy a Facturama en el momento de la descarga (no se guardan copias en Supabase Storage), porque los endpoints de Facturama requieren Basic Auth y no pueden exponerse como URLs públicas directas.

## Limitación conocida (documentada, no bloqueante)

Los endpoints exactos de descarga de XML/PDF y cancelación bajo el prefijo `/api-lite/...` (Multiemisor) no pudieron confirmarse al 100% contra la documentación pública durante el diseño (sí se confirmaron para `POST /api-lite/3/cfdis` y `PUT /api-lite/csds/{rfc}`). Se verificarán contra el sandbox real durante la implementación; si el prefijo difiere del asumido aquí, es un ajuste de una línea en `src/lib/facturama/client.ts`, no un cambio de diseño.

## Diseño

### Modelo de datos

**`empresas`** (nuevas columnas):
- `csd_status text not null default 'sin_registrar'` — `'sin_registrar' | 'registrado'`.
- `csd_actualizado_en timestamptz` — última vez que se registró/resincronizó el CSD.

**`facturas`** (nuevas columnas):
- `facturama_id text` — id interno de Facturama del CFDI, necesario para descargar XML/PDF y cancelar después.
- `error_timbrado text` — último mensaje de error de Facturama, visible en Historial mientras `status='pendiente'` y ya hubo un intento fallido.
- `forma_pago text not null` — el formulario ya la captura en UI pero nunca se enviaba ni persistía; ahora es necesaria tanto para el timbrado inicial como para reintentos (que ocurren después, sin la solicitud original).
- `metodo_pago text not null` — mismo caso que `forma_pago`.

`xml_url` / `pdf_url` (ya existentes) se llenan con rutas propias (`/api/facturas/:id/xml`, `/api/facturas/:id/pdf`) cuando `status='timbrada'`, no con URLs externas.

**`conceptos`** (nueva columna):
- `clave_unidad text not null` — clave de unidad SAT (ej. "H87"), tomada del catálogo de productos al construir la factura.

**`crear_factura(p_cliente_id, p_conceptos, p_forma_pago, p_metodo_pago)`**: se extiende para aceptar `clave_unidad` por concepto y los nuevos parámetros de forma/método de pago, insertándolos en `facturas`/`conceptos`.

**Storage**: nuevo bucket privado `csd-backups` (sin acceso público ni de rol autenticado normal — solo el cliente admin/service-role del servidor lo toca), un objeto por empresa en `csd-backups/{empresa_id}.enc`.

**Nueva variable de entorno**: `CSD_ENCRYPTION_KEY` — 32 bytes aleatorios en base64 (`openssl rand -base64 32`), guardada en `.env.local`, nunca commiteada, mismo trato que las credenciales de Facturama.

### Registro de CSD por empresa

`src/lib/csd-crypto.ts`: cifrado AES-256-GCM.
- `encryptCsd({ certificateBase64, privateKeyBase64, password })` → serializa a JSON, cifra con IV aleatorio de 12 bytes, retorna `iv‖authTag‖ciphertext` como un solo Buffer.
- `decryptCsd(buffer)` → operación inversa.

`POST /api/empresas/csd` (multipart: archivos `cer`, `key`, campo `password`):
1. Resuelve la empresa del usuario en sesión (patrón existente de sub-proyecto 1/3).
2. Codifica ambos archivos a base64.
3. Llama `PUT https://apisandbox.facturama.mx/api-lite/csds/{rfc}` con `{ Rfc: empresa.rfc_emisor, Certificate, PrivateKey, PrivateKeyPassword: password }`.
4. Si Facturama acepta: cifra `{certificateBase64, privateKeyBase64, password}` y sube el resultado a `csd-backups/{empresa_id}.enc` (cliente admin); actualiza `csd_status='registrado'`, `csd_actualizado_en=now()`.
5. Si Facturama rechaza (contraseña incorrecta, certificado no corresponde a la llave, CSD vencido, etc.): retorna el mensaje de error, sin tocar Storage ni la base de datos.

`POST /api/empresas/csd/resync` (sin body):
1. Resuelve la empresa. Si `csd_status !== 'registrado'`, 409 ("no hay un respaldo de CSD para esta empresa").
2. Descarga y descifra `csd-backups/{empresa_id}.enc`.
3. Reenvía el mismo `PUT api-lite/csds/{rfc}` a Facturama, sin pedir archivos de nuevo al usuario.
4. Actualiza `csd_actualizado_en` en éxito; en falla retorna el error sin cambiar `csd_status` (el respaldo local sigue siendo válido aunque el reenvío falle).

**`Configuracion.tsx` → pestaña Certificados**: hoy es un stub estático (empresa "Demo", badge fijo, botones sin función). Pasa a recibir datos reales de la empresa (`nombre`, `rfc_emisor`, `csd_status`) desde un wrapper de servidor. Los botones "Subir .cer" / "Subir .key" abren selectores de archivo; un campo de contraseña captura la clave privada; un botón "Registrar CSD" llama a la ruta de carga. El badge refleja `csd_status` real. Cuando ya existe un registro, aparece "Reintentar registro" (llama a `/resync`).

### Timbrado

`src/lib/facturama/client.ts`:
- `facturamaFetch()` — wrapper con Basic Auth (`FACTURAMA_API_USER`/`FACTURAMA_API_PASSWORD`).
- `crearCfdi(empresa, cliente, conceptos, formaPago, metodoPago, folio)`:
  - Si `empresa.csd_status !== 'registrado'`, falla de inmediato sin llamar a Facturama: "Esta empresa no tiene un CSD registrado. Configúralo en Configuración → Certificados antes de timbrar."
  - Si no, arma el payload para `POST https://apisandbox.facturama.mx/api-lite/3/cfdis`:
    - `Issuer: { Rfc: empresa.rfc_emisor, Name: empresa.nombre, FiscalRegime: empresa.regimen_fiscal }`
    - `Receiver: { Rfc, Name, CfdiUse, FiscalRegime, TaxZipCode }` desde el cliente.
    - `Items[]`: por cada concepto, `ProductCode` (clave_sat), `UnitCode` (clave_unidad), `Description`, `Quantity`, `UnitPrice`, `Subtotal`, `TaxObject: "02"`, `Taxes: [{ Name: "IVA", Rate: iva/100, Base: subtotal, Total: subtotal*iva/100, IsRetention: false }]` (siempre se incluye el arreglo de impuestos, incluso con IVA 0%).
    - `CfdiType: "I"`, `ExpeditionPlace: empresa.cp_emisor`, `Exportation: "01"`, `PaymentForm`, `PaymentMethod`, `Folio` (nuestro folio, ej. "A-0007").
  - Retorna `{ facturamaId, uuidFiscal }` en éxito o lanza con el mensaje de error de Facturama.
- `obtenerXml(facturamaId)` / `obtenerPdf(facturamaId)` — bytes crudos + content-type, para las rutas de descarga.
- `cancelarCfdi(facturamaId, motivo, uuidSustitucion?)`.

**Flujo compartido `intentarTimbrado(supabase, facturaId)`**: carga factura + cliente + conceptos + empresa (con RLS), llama `crearCfdi`. Éxito: `status='timbrada'`, guarda `facturama_id`, `uuid_fiscal`, `xml_url`/`pdf_url` (rutas propias). Falla: guarda `error_timbrado`, `status` permanece `pendiente`.

- `POST /api/facturas`: llama `crear_factura()` (folio asignado, `pendiente`) y de inmediato `intentarTimbrado` en la misma solicitud. Responde con la factura resultante (`status`, `uuid_fiscal`, `error_timbrado`) para que la pantalla de éxito de `NuevaFactura.tsx` muestre el resultado real.
- `POST /api/facturas/:id/timbrar` (nueva): reintenta `intentarTimbrado` para una factura existente. Solo permitido si `status='pendiente'`; si ya está `timbrada`/`cancelada`, 409.

### NuevaFactura.tsx: conceptos desde catálogo

- `facturas/nueva/page.tsx` también obtiene `productos` (`id, clave_sat, clave_unidad, nombre, precio, iva`) y los pasa como prop.
- El botón "Agregar" se convierte en "Agregar desde catálogo", con un buscador (mismo patrón visual que el buscador de cliente ya existente en este archivo). Elegir un producto agrega una fila con `claveSat`, `claveUnidad`, `descripcion`, `precio`, `iva` precargados desde el catálogo; `cantidad` y `precio` siguen editables por fila, pero `claveSat`/`claveUnidad`/`descripcion` pasan a ser texto de solo lectura (ya no inputs libres).
- Se elimina el concepto de ejemplo hardcodeado; el formulario inicia vacío y "Timbrar factura" está deshabilitado sin conceptos. Si el catálogo de la empresa está vacío, se muestra una nota apuntando a Catálogo.
- El body de `POST /api/facturas` agrega `claveUnidad` por concepto y `formaPago`/`metodoPago` a nivel raíz (ya se calculaban en el estado de UI pero nunca se enviaban).
- La pantalla de éxito deja de mostrar el mensaje estático "queda pendiente de timbrado"; ahora depende del resultado real: si `timbrada`, muestra el UUID fiscal y habilita los enlaces de descarga XML/PDF ahí mismo; si falló el timbrado, muestra el folio y el mensaje de error, indicando que puede reintentarse desde Historial.

### Historial.tsx: reintentar, cancelar real, descargar

Las acciones por fila dependen del estatus:

- **`pendiente`**: botón "Reintentar timbrado" (llama `POST /api/facturas/:id/timbrar`) junto al "Cancelar" ya existente (sin cambios — sigue sin llamar a Facturama). Si hay `error_timbrado` de un intento previo, se muestra como nota bajo el folio.
- **`timbrada`**: "XML"/"PDF" se vuelven enlaces reales a `GET /api/facturas/:id/xml` / `/pdf` (verifican sesión + pertenencia por RLS, hacen proxy a Facturama con Basic Auth, responden con `Content-Disposition: attachment`). "Cancelar" abre un modal (mismo patrón visual que los modales de creación en Clientes/Catálogo) pidiendo el motivo SAT — `01` (comprobante emitido con errores, con relación; requiere UUID de sustitución), `02` (con errores, sin relación), `03` (la operación no se llevó a cabo), `04` (operación nominativa relacionada en factura global) — y, solo si el motivo es `01`, un UUID de sustitución. Envía a una ruta **nueva y separada**, `POST /api/facturas/:id/cancelar-timbrado` — deliberadamente distinta de la ruta `PATCH .../cancelar` existente (esa solo edita nuestra base de datos; esta llama a una autoridad fiscal externa con parámetros legalmente significativos e irreversibles). El estatus cambia a `cancelada` solo si Facturama confirma.
- **`cancelada`**: sin acciones.

## Testing / criterios de aceptación

**Registro de CSD:**
- Subir un `.cer`/`.key`/contraseña válidos (CSD de pruebas de Facturama) para el RFC de una empresa: Facturama lo acepta, `csd_status` pasa a `registrado`, existe un respaldo cifrado en `csd-backups/{empresa_id}.enc`.
- Subir un CSD inválido (contraseña incorrecta o certificado que no corresponde a la llave): Facturama lo rechaza, se muestra el error, `csd_status` no cambia, no se sube ningún respaldo.
- El contenido subido a Storage está cifrado: no debe ser posible encontrar el certificado/llave/contraseña en texto plano dentro del objeto almacenado.
- `resync` después de un registro exitoso reenvía el mismo CSD sin pedir archivos de nuevo. `resync` sin un registro previo responde 409.
- Aislamiento: una empresa no puede registrar ni resincronizar el CSD de otra (mismo patrón de test de aislamiento por RLS ya usado en sub-proyectos anteriores).

**Timbrado:**
- Timbrar una factura de una empresa con `csd_status='registrado'` resulta en `status='timbrada'`, con `uuid_fiscal`, `facturama_id`, `xml_url`, `pdf_url` poblados.
- Timbrar una factura de una empresa con `csd_status='sin_registrar'` no llama a Facturama; la factura queda `pendiente` con `error_timbrado` indicando que falta registrar el CSD.
- El objeto `Issuer` enviado a Facturama corresponde al RFC/nombre/régimen real de la empresa (no un emisor de sandbox compartido) — es la validación directa del cambio de alcance de este sub-proyecto.
- `clave_unidad` del producto seleccionado llega intacta hasta `Items[].UnitCode` en el payload enviado a Facturama.
- `forma_pago`/`metodo_pago` capturados en el formulario llegan tanto a la fila persistida de `facturas` como al payload de Facturama.
- Reintentar timbrado (`POST /api/facturas/:id/timbrar`) sobre una factura `pendiente` después de registrar el CSD la deja `timbrada` y limpia `error_timbrado`.
- Reintentar sobre una factura ya `timbrada` o `cancelada` responde 409 sin duplicar el timbrado.

**Cancelación:**
- Cancelar una factura `pendiente` (ruta existente) sigue funcionando sin cambios; cancelar una ya cancelada o timbrada por esa misma ruta sigue rechazándose con 409 (regresión de sub-proyecto 3).
- Cancelar una factura `timbrada` con motivo 02/03/04 llama a Facturama y, en éxito, cambia el estatus a `cancelada`.
- Cancelar con motivo 01 sin UUID de sustitución se rechaza con 400 antes de llamar a Facturama.
- Cancelar una factura ya `cancelada` mediante la ruta de cancelación timbrada responde 409.

**Descargas:**
- `GET /api/facturas/:id/xml` y `/pdf` de una factura `timbrada` de la propia empresa devuelven el archivo con el content-type correcto.
- La misma solicitud sobre una factura de otra empresa responde 404 (aislamiento RLS, sin filtrar existencia).
- La misma solicitud sobre una factura `pendiente` o `cancelada` (sin `facturama_id`) responde 404.

**Prueba manual end-to-end contra el sandbox real de Facturama** (no simulado): registrar un CSD de pruebas, timbrar una factura, confirmar un UUID fiscal real, descargar XML/PDF, cancelar. Este paso es explícito porque parte de la validación (formato de folio aceptado, prefijos exactos de endpoints bajo Multiemisor) solo puede confirmarse contra el servicio real, no contra pruebas unitarias con mocks.
