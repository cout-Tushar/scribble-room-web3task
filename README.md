# Scribble Room

A multiplayer Pictionary game built with TypeScript, React, Express, HTML5 Canvas, and Socket.IO. Create a private room, share its invite link, and draw and guess with friends. Public matchmaking joins available public lobbies.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 in two browser tabs, use different nicknames, create a room in one and join by code in the other. The host starts the game. Run `npm test` for the frontend regression checks and real two-client Socket.IO integration tests.

`npm run dev` compiles and watches TypeScript, restarts the compiled server when it changes, and copies updated HTML/CSS assets. Refresh the browser after frontend edits.

Run `npm run typecheck` for strict checking across the frontend, server, shared protocol, build scripts, and tests. `npm run build` checks types and compiles with esbuild into `dist/`; then `npm start` serves the production build. For a standalone deployment, copy `dist/`, run `npm ci --omit=dev` inside it, then `npm start`. TypeScript tooling is only needed while building.

Source lives in `client/app.ts`, `server.ts`, `shared/game.ts`, `scripts/*.ts`, and `test/*.ts`. `public/` contains HTML/CSS assets. Generated JavaScript and source maps stay in the ignored `dist/` directory.

## Features

- Private invite links and public room matching, player list, ready indicator, host-controlled start and rematch.
- Settings: 2–20 players, 2–10 rounds, 15–240 seconds, 1–5 word choices, 0–5 hints, normal or hidden word mode.
- Each player draws once per round. Word selection automatically falls back after 15 seconds. Turns finish when everyone guesses or time expires, followed by a four-second reveal.
- Color palette, brush width, eraser, undo of the latest brush gesture, and clear canvas.
- Stable phone board sizing and an expand button for a larger landscape drawing view.
- Live guesses, exact case-insensitive trimmed matching, countdown, progressive hints, leaderboard and tied winners.
- Drawer and successful guessers cannot send chat during drawing, preventing accidental spoilers.
- Pop-art cream/orange/yellow/green design, custom SVG character avatars, illustrated home screen, responsive room setup and lobby, word selection countdown, reveal scores and final podium.
- Focus-visible controls, native modal focus handling, reduced-motion support, animated leaderboard reordering, and correct-guess confetti.
- Copy invitation feedback with a selectable-link fallback, friendly validation, acknowledgement timeouts, and an explicit explanation of session loss on disconnect.

## Architecture and walkthrough

`server.ts` owns all authoritative room state in memory. `createApp()` creates isolated HTTP and Socket.IO servers, which also makes integration tests independent. Each room contains its roster, host, settings, turn order, score totals, canvas strokes and bounded chat history.

The lifecycle is lobby → choosing → drawing → reveal → next turn → finished. Every player receives a personalized `state` event: only the drawer gets word choices and the secret word before reveal. The server validates room capacity, start permissions, word choices, drawing authority, stroke coordinates and sizes. Messages have size and rate limits. Names and chat render as React text rather than HTML.

`client/app.ts` compiles to the browser script at `dist/public/app.js`, using locally served React 18 bundles. `shared/game.ts` defines room state, players, drawing strokes, action payloads and typed Socket.IO events; the frontend and server consume the same protocol. It separates reusable controls, SVG artwork, setup, chat, podium, dialog, and drawing into components. See `FRONTEND.md` for the screen-to-server contract map. Pointer coordinates are normalized to 0–1 against a fixed 1000×650 logical canvas so the shared drawing scales consistently. The canvas stores incoming strokes and optimistic outgoing segments in refs, redraws at most once per animation frame, and streams segments approximately every 40 milliseconds without updating React state. White strokes implement the eraser. Undo groups transmitted segments by gesture ID and removes the last complete gesture. All game actions use the `action` event with an acknowledgement containing success or an error.

Correct guesses earn 100 base points plus up to 400 based on remaining time. The drawer receives 100 per successful guess. A player scores only once per turn. Partial matches do not count. The server controls deadlines and scoring; client clocks only display the countdown.

Disconnecting removes the player, transfers host ownership, skips absent drawers, and returns a room with fewer than two players to the lobby. Empty rooms and their timers are deleted. Reconnection requires joining again; scores are not restored.

## Deployment

The included `render.yaml` provisions a free Node web service with `npm ci --include=dev && npm run build`, `npm start`, and `/health`. Node 22 is selected by `.node-version`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment steps. Render provides `PORT` automatically. Socket.IO uses the same origin as the frontend, so no separate frontend environment variables or CORS setup are needed.

Deploy a single instance: rooms currently live in memory. Restarts clear games. Horizontal scaling requires shared room persistence, a Socket.IO adapter and compatible session routing. This server needs persistent WebSocket connections and does not fit a standalone Vercel/Netlify serverless deployment. Free hosting may sleep when idle; allow time for the first request to wake it.

## Validation

The 12 automated tests verify every room phase's panel structure, the ticking selection countdown, normal and rotated canvas coordinate scaling and gesture cleanup, full two-round game completion, rematches, public matchmaking, ready state, private words, host/drawer permissions, grouped undo, clearing, scoring, invalid coordinates, host migration and fresh rejoining. Browser QA also covers two real players, synchronized drawing, guessing and score updates, plus phone-width layouts. Public deployment smoke testing remains necessary in the hosting environment.
