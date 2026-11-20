# Expedition API

`POST /api/expeditions` accepts JSON containing string `dwarfId` and `destination`. A successful response contains an expedition id, `completed` status, a partial resource reward, and a narrative message. Invalid input returns 400, an unknown destination returns 404, and `blocked-pass` or `?fail=true` returns 503.

Destinations: `crystal-cave` (8 stone + 1 tool), `old-mine` (12 stone + 2 wood), `goblin-warrens` (6 wood + 6 food, added for D7), `blocked-pass` (always 503). The server only returns the reward; the goblin raid that follows a successful `goblin-warrens` trip is a game rule in the client (`raidAfterExpedition` in `src/simulation.ts`), so a failed request never starts a raid.

The deterministic result arrives after a configurable delay and there is no polling or server-side persisted task. Restarting the server resets expedition numbering. During Vite development, `/api` is proxied to port 4200.
