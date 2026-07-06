-- Patch: super_admins was missing RLS entirely, which meant the anon key
-- could read (and, if a future migration ever adds default grants, write)
-- this table directly. No select/insert/update/delete policy is added on
-- purpose: only the service-role client (which bypasses RLS) should ever
-- touch this table. App code must never query super_admins with the
-- anon-key client.

alter table super_admins enable row level security;
