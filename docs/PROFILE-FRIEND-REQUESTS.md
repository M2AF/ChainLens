# Profile friend requests

The owner Profile sidebar shows Friend requests directly below Sign out and
above Public profile visibility. Incoming requests include the sender's existing
NFT-aware avatar, display name, UUID, profile link, Accept and Decline controls.
Long lists scroll within the card. Empty, loading and retryable error states
are distinct; failed mutations keep requests visible.

Uses existing authenticated GET /api/chat/friends, POST
/api/chat/friends/:friendshipId/accept and DELETE /api/chat/friends/:friendshipId.
Existing backend ownership, recipient, block and chat-eligibility guards remain
unchanged. No schema/backend/auth changes or production friendships modified.

The component mounts only in the owner Profile tab. It refreshes every20seconds
while visible, on focus and on cl-social-change. Mutation results invalidate
older reads; successful actions remove a row, announce status and refresh the
shared server state. Accept/Decline buttons are disabled while updating. Sender
profile navigation stays available. Poll/listener cleanup runs on unmount or
account change. Chat reads the same friendship state when opened.

On user HEAD9e14feb plus local changes,14JSX scripts compile and12 affected
browser cases pass across runs (3new request flows,6public-profile/gallery
regressions,3username regressions). Final acceptance-to-Chat flow passes in
profile-requests-accept-e2e.log. Error/retry, failed mutation retention, decline,
placement, mobile scrolling/overflow, sender deep link and shared friends list
are verified. Desktop/mobile screenshots reviewed. Browser API responses are
fixtures; no real users' relationships were accepted/declined during QA.

Evidence: .local-artifacts/search-expansion/profile-requests-{e2e,final-e2e,accept-e2e}.log
and screenshot names profile-requests-desktop.png/profile-requests-mobile.png.
Source files: public/profile-controls.jsx,public/profile-social.css,public/index.html.
Tests: e2e/profile-friend-requests.spec.js, plus updated prior placement/empty-list
fixtures in profile-public-v2.spec.js and profile-usernames.spec.js.

Source/tests/docs are local and uncommitted. Deploy frontend when authorized;
existing backend friendship endpoints already provide the operations.
