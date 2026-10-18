# D&D VTT — Security Notes

**Status:** Private alpha, v0.5.0 release candidate. Not security-audited for untrusted public multi-tenant use.

## Implemented safeguards

- Optional site-wide `GAME_ACCESS_PASSWORD`, required by current production configuration; signed HttpOnly access cookie.
- Room-specific DM secret; server-side role checks and input validation.
- Server-side token ownership and movement permissions, including occupied-square checks.
- Hidden/staged tokens excluded from player-facing room snapshots.
- Case-insensitive duplicate display-name checks within a room; a name is not an ownership credential.
- Character export restricted to DM or the assigned player; campaign export/import restricted to DM.
- Browser-local persistent player ID is used for character/token association across reconnections.

## Important limitations

- **Player identity is not authenticated.** Browser-stored UUIDs are convenient continuity identifiers, not secure proof of identity. Clearing storage, switching browsers, or deliberately spoofing an ID can undermine ownership assumptions.
- Display-name checks reduce accidental collisions but are not an authentication or impersonation defense.
- Room and member state are memory-only; a server restart loses the active session. DMs must save and back up `.dndcamp` files.
- Campaign and character files may contain private game information. Handle exported files and local recovery data accordingly.
- DM room secrets are bearer credentials; do not share them with players.
- No comprehensive rate limiting, automated security testing, durable audit trail, or full account system.

## Before wider public hosting

Introduce authenticated accounts, stronger authorization/reconnect credentials, durable storage and backup strategy, rate limiting, automated tests, operational monitoring, and a dedicated security review. Keep secrets in Railway environment variables rather than source control.
