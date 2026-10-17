# LiveKit Cloud setup (v0.2.0)

1. Create a project at https://cloud.livekit.io.
2. Find the WebSocket URL and create an API key/secret.
3. Copy `apps/server/.env.example` to `apps/server/.env` and replace the placeholders.
4. Run `npm install` and `npm run dev` from the repository root.
5. Join a room in two browser contexts and click **Join voice & video**.
6. Grant camera/microphone permissions. Use headphones if testing two sessions on one Mac.

Secrets must remain on the server. Do not put them in frontend Vite environment variables.
Localhost is a secure context for browser camera access. Public deployment requires HTTPS and additional security hardening.

## Known limitations

The initial media panel embeds LiveKit's conference controls and needs further visual refinement. Game identity is currently tied to a Socket.IO connection; robust reconnect authentication, guest session tokens, and rate limiting are required before exposing the app publicly.
