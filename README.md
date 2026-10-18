# D&D VTT

A private, browser-based virtual tabletop for playing Dungeons & Dragons with a Dungeon Master (DM) and remote players. The app combines shared tactical maps, tokens, initiative, dice, and optional voice/video in one room.

**Current deployed version:** v0.3.2.3 (October 2026). **Next planned version:** v0.4 (encounter management). The root `package.json` and health endpoint still contain the original foundation version string (`0.1.0`); those strings are not the current feature/release version.

## Try it

Production: https://dndvtt-production.up.railway.app

This is a private alpha, not a public hosted game service. The production site requires the group's access password. The DM creates a room and shares its invite link or room code with players. Room and token state are held in server memory and are lost if the server restarts.

## Current features — v0.3.2.3

- **Rooms and roles:** Create or join a room; DM access is controlled by a room-specific secret. Share a room invite link with players.
- **Private access:** Optional shared access-password gate (required by the Railway deployment configuration).
- **Live multiplayer:** Socket.IO synchronizes room state, token positions, initiative, and dice results. Rejoining clients receive a current state snapshot.
- **Voice and video:** Optional LiveKit-powered voice/video conferencing with a collapsible video section, when the LiveKit service is configured.
- **Battle maps:** DM can upload PNG, JPEG, or WebP images, adjust grid cell size and offsets, toggle the grid, zoom, and scroll/pan the board. One square represents 5 feet.
- **Tokens:** DM can add, assign, edit, recolor, move, and delete tokens. Assigned players can currently move their own visible tokens.
- **DM staging tray and ambush:** New tokens begin hidden. The DM can place hidden tokens on the map, view their private positions, reveal them individually or together, and return visible tokens to the tray. Hidden tokens are filtered out of player state on the server.
- **Initiative:** DM adds combatants, advances turns, and tracks rounds.
- **Dice:** Server-generated dice rolls with a shared results feed.
- **Diagnostics:** DM-only Debug Recorder for investigating synchronization and token movement problems. Token drag completion was stabilized in v0.3.2.3.

### Current limitations

- **No durable game storage:** Rooms, maps, and game state are in memory; a server restart clears them. Save anything important separately.
- **Player token movement is currently enabled:** An assigned player can move their own token. DM-only movement by default is planned for v0.4.
- **Tokens can currently overlap:** Collision rejection is planned for v0.4.
- **Initiative is always visible:** Exploration/Combat modes are planned for v0.4.
- **No complete character-sheet, fog-of-war, or campaign-management system yet.**
- **Private alpha security:** A shared site password and DM room secret are not a replacement for full user accounts, durable player identities, and a production security review.

## Planned for v0.4 — not yet implemented

**Theme: Encounter Management.** The following decisions have been agreed during playtesting:

1. **Exploration and Combat modes.** The DM switches modes. Initiative becomes prominent in Combat and is unobtrusive or hidden in Exploration. Changing modes does **not** reveal hidden enemies.
2. **DM-only movement by default.** The DM can explicitly allow player movement. When allowed, a player may move only their assigned tokens. Permissions will be checked server-side and synchronized with the room.
3. **Reject occupied destinations.** A move onto an occupied grid square is rejected rather than automatically redirected to another square. The DM will have a deliberate override for exceptional stacking. Collision feedback must not expose hidden-token positions to players.
4. **Keep ambush reveals separate.** Revealing prepared/hidden enemies remains an explicit DM action, independent of mode changes.

Potential later additions, **not committed to v0.4**, include player movement requests for DM approval, movement-distance limits, terrain/obstacles, and richer encounter controls.

## Run locally

### Requirements

- Node.js 22+
- npm 10+

```bash
npm install
npm run dev
```

Open http://localhost:5173. The development game server runs on http://localhost:3001. You can open another private/incognito browser session to join the same room as a player.

If `GAME_ACCESS_PASSWORD` is not configured, the local server allows access without the shared password. LiveKit voice/video requires separate LiveKit configuration; the map, tokens, dice, and initiative do not depend on LiveKit.

### Checks and production build

```bash
npm run typecheck
npm run build
```

The server serves the built web frontend in the Railway deployment. Pushing to the GitHub `main` branch may trigger Railway Auto Deploy when the repository integration is enabled. Verify deployment status and test the live site after each release.

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React, TypeScript, and Vite client; battle board and LiveKit UI |
| `apps/server` | Fastify HTTP API, Socket.IO game server, LiveKit token endpoint |
| `packages/shared` | Shared TypeScript types and Zod validation schemas |
| `docs/` | Architecture, roadmap, and security notes |

## Architecture and security notes

The server is authoritative for game mutations and dice rolls. It validates roles and payloads; importantly, hidden staged tokens are excluded from player-facing room snapshots rather than merely hidden by CSS. DM credentials and access-password sessions are separate mechanisms. There is currently no durable database or account system.

This project is in active private-alpha development. Do not assume it is suitable for storing sensitive information or hosting untrusted public games without further security work.

## Development workflow

Feature patches are tested locally first, including multiplayer checks where relevant. Only tested changes are committed to GitHub and deployed to Railway. The current stable baseline is **v0.3.2.3**.
