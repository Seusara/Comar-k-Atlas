# Sub-proyecto 2: Autenticación (alta/baja real de empresas) — Sistema Comar-K

Fecha: 2026-07-06

## Contexto

Del sub-proyecto 1 (arquitectura base) ya quedaron implementados: login contra Supabase Auth, middleware con guards por rol (super-admin confinado a `/admin`, usuarios de empresa fuera de `/admin`), y un panel `/admin` de solo lectura que lista empresas reales. Este sub-proyecto agrega lo que falta de autenticación/gestión de acceso: alta y baja real de empresas (hoy el panel solo lee), y logout.

Orden general del proyecto completo:
1. Arquitectura base y modelo de datos — completo
2. **Autenticación** (este documento)
3. CRUD real (Clientes, Catálogo, Facturas)
4. Timbrado CFDI
5. Reportes y Dashboard con datos reales
6. Calidad (transversal, aplicada en cada sub-proyecto 2–5)

## Decisiones tomadas

- El super-admin define manualmente la contraseña del primer usuario al crear una empresa (no hay invitación por correo).
- Una empresa tiene exactamente un usuario por ahora (`usuarios_empresa` sigue siendo 1 a 1). Soporte multiusuario por empresa se deja fuera de alcance; se agregaría en un sub-proyecto futuro si hace falta.
- Eliminar empresa usa confirmación simple (sí/no), no confirmación reforzada por nombre.
- No hay flujo de "olvidé mi contraseña" en este sub-proyecto; el super-admin resetea contraseñas manualmente desde el panel de Supabase.

## Diseño

### Alta de empresa

Formulario en `/admin` (nueva sección/modal) con: nombre, RFC emisor, régimen fiscal, CP emisor (campos de la tabla `empresas`), más email y password del primer usuario.

Al enviar, un route handler server-side (ej. `POST /admin/empresas`) usa el cliente admin (service role key, ya aislado en `admin.ts` desde el sub-proyecto 1) para, en este orden:
1. Insertar la fila en `empresas`.
2. Crear el usuario en Supabase Auth vía `auth.admin.createUser({ email, password, email_confirm: true })` — confirmado directamente, sin correo de invitación.
3. Insertar el vínculo en `usuarios_empresa` (user_id + empresa_id).

Si el paso 2 o 3 falla, el handler hace rollback manual: borra la empresa creada en el paso 1 (y el usuario de Auth si ya se alcanzó a crear en el paso 2 pero falló el paso 3), para no dejar registros huérfanos. No hay transacción nativa cross-servicio (Auth + Postgres), así que el rollback se implementa explícitamente en el handler, con manejo de errores en cada paso.

### Baja de empresa

Botón "Eliminar" por fila en la lista de `/admin`, con `confirm()` simple del navegador (sí/no). Al confirmar, un route handler (ej. `DELETE /admin/empresas/:id`) usa el cliente admin para:
1. Obtener el `user_id` asociado desde `usuarios_empresa`.
2. Borrar el usuario en Supabase Auth (`auth.admin.deleteUser`).
3. Borrar la fila de `empresas` — el `on delete cascade` ya definido en el esquema (sub-proyecto 1) elimina en cascada clientes, productos, facturas, conceptos y el vínculo en `usuarios_empresa`.

Errores de cualquier paso se muestran como mensaje simple en la misma página de `/admin` (sin modal de error separado).

### Logout

Botón visible en el layout protegido de la app (junto al sidebar o header, en las rutas de empresa y en `/admin`). Llama a `supabase.auth.signOut()` desde el cliente y redirige a `/login`.

## Testing / criterios de aceptación

- Test de integración: crear una empresa completa vía el route handler de alta, verificar que login con el email/password recién creados funciona y que la sesión resultante redirige a `/dashboard` (no a `/admin`).
- Mismo test, tras eliminar la empresa vía el route handler de baja: verificar que el login con esas credenciales ya no funciona, y que no quedan filas huérfanas en `clientes`, `productos`, `facturas`, `conceptos` ni `usuarios_empresa` para esa empresa.
- Logout verificado manualmente: tras cerrar sesión, acceder a una ruta protegida redirige a `/login`.
- Rollback de alta probado: si se fuerza un fallo en el paso 2 o 3 (ej. email inválido), no debe quedar una fila huérfana en `empresas`.
