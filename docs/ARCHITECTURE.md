# D&D VTT — Architecture

**Implemented baseline:** v0.4.0. This document distinguishes shipped functionality from proposed v0.4 changes.

## Components

- `apps/web`: React + TypeScript + Vite frontend, Socket.IO client, tactical board, and optional LiveKit media UI.
- `apps/server`: Fastify HTTP API, Socket.IO server, LiveKit token endpoint, and static hosting of the compiled frontend.
- `packages/shared`: TypeScript game-state types and Zod schemas.
- Railway hosts the production service; GitHub `main` is the deployment source when Auto Deploy is enabled.

## Current data flow

1. A DM creates a room with `POST /api/rooms` and receives a room ID and DM secret.
2. Participants join with `room:join`; the server tracks their room membership and DM role.
3. The server validates game mutations and broadcasts room snapshots using `room:state`.
4. The server filters staged/hidden tokens from non-DM snapshots. A hidden token is **not** simply concealed in the player's browser.
5. Dice are generated server-side and shared through `dice:result`.

Game state and membership are currently held **in server memory**, not a database. Restarting the server loses rooms, maps, tokens, and initiative state. Player membership/ownership uses live socket IDs, so reconnection identity remains limited.

## Current game operations

- Room: `room:join`, `room:state`
- Map: `map:update` (DM)
- Tokens: `token:add`, `token:edit`, `token:delete`, `token:move`, `token:stage`, `token:reveal`
- Initiative: `initiative:add`, `initiative:next`
- Dice: `dice:roll`, `dice:result`
- Diagnostics: DM-side Debug Recorder and `debug:server` token-movement events

The browser has grid snapping, zoom, scroll/pan, map uploads, staging-tray controls, and a document-level pointer-release handler introduced in v0.3.2.3.

## Authentication and media

A shared site password can be configured with `GAME_ACCESS_PASSWORD`. The production Railway environment requires it. Successful login sets a signed, HttpOnly access cookie. A room-specific DM secret separately determines the DM role. Neither mechanism is a substitute for durable individual accounts.

Optional LiveKit voice/video uses a server-issued token. Media availability depends on LiveKit configuration and service availability.

## v0.4 encounter management (implemented)

- DM-controlled Exploration/Combat mode; initiative prominent in Combat.
- DM-only token movement by default, with a DM setting to grant assigned players movement.
- Server-side rejection of moves into occupied grid squares; deliberate DM override for exceptional stacking.
- Collision behavior must not disclose hidden token locations to players.
- Switching encounter modes must **never** reveal staged enemies; reveal remains an explicit DM operation.

The server should remain authoritative for movement permissions and collision decisions. Clients should display rejected-move feedback without exposing private state.

## Future architecture

Durable storage, persistent player identities, better session recovery, production security hardening, and richer encounter tooling remain future work.
