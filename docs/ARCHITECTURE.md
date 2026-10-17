# Architecture

## Current
React + Vite frontend connects via Socket.IO to a Fastify/Node.js server. Shared Zod schemas are in `packages/shared`. Server is authoritative for token movement, initiative and dice. All rooms are currently in-memory.

## Planned
- LiveKit for camera/microphone tracks, adaptive streaming and TURN connectivity; managed service first
- SQLite + Drizzle for campaign and room persistence, transactional state updates
- Uploaded image storage, metadata, image size/type checks and quotas
- PixiJS renderer with map-coordinate transforms, zoom and pan
- Secure authenticated DM and guest reconnect credentials

## Protocol (foundation)
HTTP `POST /api/rooms` returns roomId and dmSecret. Socket.IO: `room:join`, `room:state`, `token:add`, `token:move`, `initiative:add`, `initiative:next`, `dice:roll`, `dice:result`. All mutating events validate permission and payload.

## Architectural constraints
Never send hidden DM-only data to player sockets. Store persistent state server-side. Do not trust client role flags. Treat invite codes as room identifiers, not authentication.
