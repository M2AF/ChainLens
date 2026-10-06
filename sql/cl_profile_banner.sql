-- Additive profile banner field. Apply before deploying banner uploads.
-- Existing cl_users authorization/RLS and service-only PATCH remain unchanged.
alter table public.cl_users add column if not exists banner_url text;
