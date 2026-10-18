# D&D VTT

A private browser-based Dungeons & Dragons virtual tabletop with shared tactical maps, initiative, dice, player presence, campaign files, and optional LiveKit voice/video.

**Release candidate:** v0.5.0 (October 2026). **Current production baseline:** v0.4.0 until deployment and smoke testing are complete.

Production: https://dndvtt-production.up.railway.app

## Features

- DM-created rooms and invite codes, with private access gate and room-specific DM secret.
- Live Socket.IO multiplayer synchronization, roster/presence notifications, and optional LiveKit media.
- Battle maps, configurable grid, zoom/pan, creature-size token footprints, initiative, and server-generated dice.
- DM staging tray and hidden enemies, revealed only by explicit DM action.
- Exploration/Combat modes, DM-controlled movement by default, optional player movement of assigned tokens, and occupied-space checks.
- **v0.5 campaigns:** multiple named scenes with independent maps/encounters; portable `.dndcamp` save and open.
- **Saving:** Save, Save As, Cmd+S, unsaved-change indicator, optional direct-file autosave where supported, and browser-local recovery snapshots.
- **Characters:** create/import/export portable `.dndchar` records, assign to players, and preserve character/token associations through persistent browser-local player IDs.
- Player-name matching is case-insensitive; duplicate names are blocked within a room.

## How to use campaign files

The DM opens or creates a room, manages scenes, and saves a `.dndcamp` file. Keep a separate backup: the server holds the active room in memory and loses it on restart. In supported browsers, granting file access enables saving back to the selected file and optional autosave. IndexedDB recovery is a convenience, not a durable backup. A `.dndchar` file contains an individual character record and is distinct from the full campaign file.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev
```

Open http://localhost:5173 (API server on http://localhost:3001). Use a second browser session for multiplayer testing. LiveKit requires separate configuration; the tabletop works without it.

## Verify before release

```bash
npm run typecheck
npm run build
npm run test
```

`npm run test` currently invokes workspace test scripts when present; it may finish without running automated test cases. Perform manual multi-browser campaign, reconnect, and file round-trip tests as well. Before a release, inspect the full Git working tree including untracked files. Pushing to `main` may trigger Railway Auto Deploy. Verify the live deployment and multiplayer behavior after pushing.

## Layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React/Vite frontend, battle board, file saving, local recovery, and media UI |
| `apps/server` | Fastify/Socket.IO authoritative game server and production static hosting |
| `packages/shared` | Shared game-state schemas and TypeScript types |
| `docs/` | Roadmap, architecture, LiveKit, and security documentation |

## Security and limitations

This is a private alpha, not a public hosted gaming service. The site password and DM secret are not full account authentication. Player IDs stored in browser local storage are not cryptographically authenticated and should not be treated as proof of identity. The server has no durable campaign database. Do not store sensitive information or host untrusted users without further hardening. See `docs/SECURITY.md`.
