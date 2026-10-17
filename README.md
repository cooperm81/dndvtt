# Tabletop — online D&D (v0.1.0 foundation)

A browser-based shared tabletop, with a balanced video-first layout. **This is a foundation build, not the finished v0.1.0 playable alpha.** The participant video tiles are placeholders; there is no camera/microphone capture yet. Game rooms live in server memory and are lost on restart.

## Prerequisites
- Node.js 22+ and npm 10+

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:5173 and enter your name. Create a room, then copy the invitation link into another browser window and join as another player. The game server runs at http://localhost:3001.

## Build / checks
```bash
npm run typecheck
npm run build
```

## Included now
- Create and join ephemeral rooms via URL
- DM privilege using an unguessable secret (stored in browser session storage)
- Balanced layout with participant placeholders, shared grid and initiative sidebar
- Server-validated token creation, ownership and movement
- Initiative ordering, rounds and turns
- Server-side cryptographic dice rolls and shared roll feed
- WebSocket reconnection and state snapshot

## Known limitations
- No webcam, audio, LiveKit, uploadable maps, accounts or durable persistence yet
- No production authentication, rate limiting, guest identity recovery or security audit
- Guest identities change after reconnect, so ownership needs redesign before production
- Token movement uses a fixed 50px grid and has no viewport zoom/pan
- A DM cannot remove tokens or initiative entries yet
- Rooms are held only in memory and do not survive restart
- No deployed hosting or cross-browser QA has been completed

## Documentation
See docs/ARCHITECTURE.md, docs/ROADMAP.md and docs/SECURITY.md.
