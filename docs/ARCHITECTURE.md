# D&D VTT — Architecture

**Version:** v0.5.0 release candidate. Production remains v0.4.0 until deployment verification.

## Components

- `apps/web`: React/TypeScript/Vite client, tactical board, local campaign file operations, IndexedDB recovery, and optional LiveKit UI.
- `apps/server`: Fastify HTTP API, authoritative Socket.IO room/game logic, campaign validation, and static production hosting.
- `packages/shared`: Shared TypeScript/Zod game-state types.
- Railway hosts the service; GitHub `main` supplies the deployment source when Auto Deploy is enabled.

## State and persistence

The server is authoritative during a live session. Rooms and connected membership reside in memory, so a server restart loses the active session. The DM can export/import a versioned `.dndcamp` campaign containing scenes, maps, tokens, characters, and active scene state. The file is the portable durable copy; there is no server database. Supported browsers may write back to an authorized file, and the browser maintains an IndexedDB recovery snapshot. Browser recovery is not a substitute for a separate saved file or backup.

The DM can create/import/export `.dndchar` character records. Player IDs are stored in the browser and reused across connections; they are distinct from Socket.IO connection IDs and visible display names. Character assignments and token ownership refer to these player IDs. IDs are not authenticated credentials and can be lost when browser storage is cleared or a different browser is used.

## Operations and access control

- DM creates rooms with `POST /api/rooms` and receives a room secret.
- Participants join with `room:join`; room membership and presence are broadcast independently of LiveKit.
- Game state uses `room:state`; server validates token, initiative, map, and dice operations.
- DM campaign operations include `campaign:summary`, `campaign:export`, `campaign:import`, and scene create/rename/switch.
- Character operations include `character:save`, `character:mine`, and `character:export` with DM/owner access checks.
- Hidden/staged tokens are removed from non-DM snapshots on the server, not hidden only by client styling.
- DM-only movement is the default; enabling player movement permits assigned tokens, with server-side checks.

## Access and media

The configured `GAME_ACCESS_PASSWORD` gates the private site using a signed HttpOnly cookie. A separate room-specific secret controls DM actions. LiveKit media requires its own service configuration. Neither the site password nor the browser-local player ID provides individual authenticated accounts.
