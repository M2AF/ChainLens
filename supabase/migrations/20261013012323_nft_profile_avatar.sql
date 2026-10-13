-- Shared by ChainLens and Magic Money. Existing photos stay circular until the
-- user explicitly selects an NFT; URLs cannot reliably identify their source.
alter table public.cl_users add column if not exists avatar_nft_key text;
alter table public.cl_users add constraint cl_users_avatar_nft_key_valid
  check (avatar_nft_key is null or
    (length(avatar_nft_key) <= 400 and avatar_nft_key ~ '^[a-zA-Z0-9_-]+:n:[^[:space:]]+$'
      and avatar_url ~* '^https://'));
comment on column public.cl_users.avatar_nft_key is
  'Canonical selected NFT identity for avatar presentation, not a live ownership proof; null for uploaded/social/legacy photos.';
