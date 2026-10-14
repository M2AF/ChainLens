# ChainLens usernames

Each ChainLens ID has one optional, globally unique username. UUIDs remain the
stable identity and profile-link target; display names remain independently
customizable, including Unicode and duplicate display names. No usernames are
automatically derived or assigned.

## Rules and UI

- 3–24 ASCII letters, numbers or underscores; trim, remove a leading @, lowercase.
- Claim and edit from the profile, directly above ChainLens ID. Copy yields @name.
- Changing to an available username releases the old name. Blank/null removal
  is not offered. One username column per account; a unique database index
  arbitrates concurrent claims across accounts.
- Public profiles show username, display name and UUID. Unclaimed public profiles
  omit the username panel. Display-name editing stays in the banner.
- Username search works with @name, bare name, username name or handle name.
  Exact/prefix/substring username matches rank before display-name matches.
  Even @swap and bare swap are searchable; action discovery remains available
  for bare action words. Profiles retain canonical UUID links and NFT avatars.

## Implementation

`profile-username.js` mounts authenticated, rate-limited PUT /api/profile/username.
Only req.user.sub is updated; posted IDs and unrelated fields are ignored.
The update is atomic, relying on PostgreSQL uniqueness rather than an advisory
availability check. A conflicting claim returns409, invalid input400, missing
account404 and provider/schema failures503. Only id and username are returned.

`people-search-service.js` searches username and display_name with six bounded,
parallel reads (exact/prefix/contains, max11 each), dedupes by UUID, and returns
only allowlisted public fields. Username is public identity. Wallet visibility,
block filtering and row limits remain enforced.

`public/profile-username.jsx` is shared by owner and public profiles. Owner success
merges only the username into the matching profile ID. Public copy, UUID search,
and people search use the same identity fields. No signing/auth-core/wallet-native
code changes or new dependencies.

## Database and deployment

Supabase project vxrhosrktbknogyeyewy migration cl_profile_usernames was applied
on October13,2026 (local timezone), remote version20261014022747. The CLI-created
local migration filename was aligned with the actual remote version:
`supabase/migrations/20261014022747_cl_profile_usernames.sql`.
It adds nullable username, a lowercase/format check, and a unique lower(username)
index for non-null values. Existing account rows, UUIDs, RLS and browser-role
revocations remain unchanged. No real account was assigned a username.

Source is local/uncommitted on user HEAD1fc7cb3. Deploy frontend AND backend
with all new modules included. The schema is live; new claim/search/UI behavior
has not been verified deployed. Existing backend remains compatible with null
usernames. Username handling in Magic Money native UI is outside this change.

## Verification

- Full279Node tests pass; syntax checks and14compiled JSX scripts pass.
- Username route tests verify normalization, authentication, owner-only updates,
  duplicate conflict, missing account, outage and no-store responses.
- People tests verify username ranking over duplicate display names, @ lookup,
  private-field exclusions, caps, wallet privacy and blocks.
- Production uniqueness test clones cl_users into a temporary table including
  its indexes/checks, rejects duplicate and noncanonical usernames, then rolls
  back. The actual unique index and nullable column were read back. No production
  account claims or test accounts were created.
- 20 affected browser cases pass across runs:12 existing profile/chat regressions,
  3 username workflows and5 existing search/action/ID-avatar cases. Final3 username
  cases rerun to capture claim-form/public-profile screenshots. Claim conflicts,
  copy, editing/reload, position above ID, anonymous public identity, search,
  action-word usernames and mobile overflow are covered. Screenshots reviewed.
- Supabase security advisors checked: existing server-only RLS tables remain
  denied to browser roles; no grants/policies were added.

Evidence: `.local-artifacts/search-expansion/username-{unit,check,e2e,final-e2e,visual-e2e}.log`
and `test-results/profile-username*.png`, `profile-public-username.png`,
`search-username.png`. Browser providers and claims are stubbed; DB constraints
were measured against a temporary production-schema clone.

Architecture: a nullable field and unique index preserve the existing account
model and avoid a separate handle registry or identity rewrite. If username
history/redirects become a requirement, introduce explicit alias records then.
PostgreSQL uniqueness reference: https://www.postgresql.org/docs/current/indexes-unique.html
