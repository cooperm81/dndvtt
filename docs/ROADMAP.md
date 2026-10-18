# D&D VTT — Roadmap

**Stable production baseline:** v0.4.0 (October 2026). This roadmap describes shipped behavior separately from planned work.

## Shipped

- [x] **v0.1:** Shared rooms, DM/player roles, tokens, initiative, dice, and real-time synchronization.
- [x] **v0.2:** Optional LiveKit voice/video and media layout.
- [x] **v0.2.1–v0.2.3:** Private site access, invitations, Railway hosting, and reconnection/synchronization improvements.
- [x] **v0.3.1:** DM map uploads, adjustable grid, zoom/pan, token editing, snapping, and movement permissions based on ownership.
- [x] **v0.3.2:** DM staging tray, hidden token placement, explicit reveal controls, and server filtering of hidden tokens.
- [x] **v0.3.2.3:** More reliable drag completion, DM Debug Recorder, and shared staging/prepared token schema.

## v0.4.0 — Encounter Management (released)

- [x] DM-controlled Exploration and Combat modes.
- [x] Initiative panel unobtrusive in Exploration, prominent in Combat.
- [x] DM-only token movement by default.
- [x] DM option to allow players to move only assigned tokens; enforced server-side.
- [x] Reject movement into occupied grid squares; do not auto-relocate.
- [x] Deliberate DM override for exceptional token stacking.
- [x] No hidden-position disclosure from collision feedback.
- [x] Hidden enemy reveal remains a separate DM action, never triggered by switching modes.
- [x] Keep README and supporting documentation accurate as features ship.

## Beyond v0.4 — candidates, not commitments

- [ ] Player requests movement; DM approves/rejects.
- [ ] Movement-distance limits, obstacles, and terrain rules.
- [ ] Durable room/campaign persistence and reliable player identity recovery.
- [ ] Character sheets, fog of war, campaign library, and richer encounter tools.
- [ ] Broader browser/device testing, accessibility, and production security hardening.

## Release process

Test changes locally, including multiple connected participants when relevant. Review the entire Git working tree before committing. Push tested changes to GitHub, confirm Railway deployment, and smoke-test production.
