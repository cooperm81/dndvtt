# D&D VTT — Security Notes

**Status:** Private alpha, v0.3.2.3. Not a security-audited public multi-tenant service.

## Implemented controls

- Production requires a configured `GAME_ACCESS_PASSWORD`; local development can run without it.
- Password login issues a signed HttpOnly cookie with SameSite=Lax and Secure in Railway.
- Login has an in-memory per-IP attempt limit.
- The DM role is determined using a room-specific secret, not a client-supplied role flag.
- Socket.IO game actions check room membership, DM permissions, ownership where applicable, and validate payloads.
- Hidden/staged tokens are excluded from non-DM room-state broadcasts.
- Map image type and size are validated, with upload conversion performed in the browser.
- Dice rolls are generated server-side.

## Limitations and risks

- Rooms, maps, members, and game state are stored in memory; server restart loses them.
- The shared access password is a group-wide gate, not a distinct player account.
- DM secrets are bearer credentials stored in browser session storage. Anyone with the secret may assume DM privileges in that room.
- Player token ownership is tied to a live socket identity and is not durable across reconnects.
- Rate limiting is limited; there is no comprehensive security audit, full session/account system, or durable audit log.
- Private alpha access is not sufficient protection for sensitive documents or public untrusted hosting.
- A room invitation code identifies a room; it must not be treated as a security credential.

## v0.4 security requirements

- Enforce DM-only movement by default on the server; never rely solely on disabling browser controls.
- If player movement is enabled, enforce token ownership on the server.
- Validate token occupancy on the server to prevent concurrent clients from overlapping tokens unintentionally.
- Ensure rejected moves do **not** disclose hidden enemy presence or positions to non-DM clients.
- Switching to Combat mode must not implicitly reveal staged tokens.

## Before wider public use

Introduce durable individual identity, authorization and reconnect credentials; persistent state and backups; comprehensive rate limiting; security tests; media/token configuration review; and operational monitoring. Keep production secrets in Railway environment variables rather than in source control.
