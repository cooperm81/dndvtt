# D&D VTT — Roadmap

**Release candidate:** v0.5.0 (October 2026). **Production baseline:** v0.4.0 until the v0.5 deployment is verified.

## Delivered in v0.1–v0.4.0

- Shared DM/player rooms, tokens, dice, initiative, synchronization, and optional LiveKit media.
- Private site access, room invitations, Railway deployment, and reconnection improvements.
- Battle maps, adjustable grids, token movement, staging tray, hidden enemies, and explicit reveals.
- Exploration/Combat modes, DM-controlled movement permissions, occupied-square collision checks, and multi-square creature sizes.

## v0.5.0 — Campaign management and player presence (release candidate)

- [x] Connected-player roster and join/leave presence notices independent of video.
- [x] Multi-scene campaigns with scene names, maps, tokens, and encounter state.
- [x] Portable `.dndcamp` campaign export/import with format validation.
- [x] Save/Save As, Cmd+S, optional direct-file autosave, unsaved status, and browser-local recovery.
- [x] Portable `.dndchar` character export/import and character assignment.
- [x] Browser-local persistent player IDs for reconnect and token ownership.
- [x] Case-insensitive player-name matching and duplicate-name protection.
- [x] Local multiplayer acceptance tests reported passing.
- [ ] Final production deployment and post-deploy smoke test.

## Beyond v0.5 — candidates, not commitments

- Full character sheets, stronger authenticated player identities, and database-backed storage.
- Movement requests and approval, movement distances, obstacles, terrain, and fog of war.
- Broader browser/device testing, accessibility, automated integration tests, and security hardening.

## Release discipline

Audit all modified and untracked files; run typecheck and build; validate campaign and character round trips and multi-browser reconnection; commit and push only after local approval; verify Railway health and multiplayer behavior after deployment.
