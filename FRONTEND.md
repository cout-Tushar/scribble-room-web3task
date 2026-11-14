# Frontend contract and implementation

The existing Express server serves a buildless React 18 app and local React UMD bundles. Socket.IO shares its HTTP origin. No authentication or persistent session exists. The backend remains unchanged.

| Experience      | Existing contract                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create          | `action { type: 'create', name, settings }`; settings: maxPlayers 2–20, rounds 2–10, drawTime 15–240, wordCount 1–5, hints 0–5, private, mode normal/hidden                                                           |
| Join            | `action { type: 'join', name, code }` or `random: true` for public lobbies                                                                                                                                            |
| Lobby           | Personalized `state`; `ready` toggles readiness; host `start` needs two players, readiness is advisory                                                                                                                |
| Choose          | Drawer receives `options`; `choose { word }`; 15-second automatic fallback                                                                                                                                            |
| Draw            | `stroke { stroke: { id, points, color, size } }`; normalized coordinates, 1000×650 logical surface, sizes 1–40; authoritative `canvas` event                                                                          |
| Tools           | Drawer-only `undo` groups segments by gesture ID; `clear`; eraser uses white strokes                                                                                                                                  |
| Guess/chat      | `guess { text }`; server scores correct guesses and supplies messages, scores, and guessed IDs in `state`                                                                                                             |
| Results         | `reveal` lasts four seconds; `finished` exposes final scores; host can `start` a rematch                                                                                                                              |
| Leave/reconnect | Disconnect removes player, transfers host and may return room to lobby. No resume token or score restoration. New joins only allowed in lobby/finished. Leaving intentionally disconnects then reconnects the socket. |

All actions return `{ ok: true }` or `{ error }` acknowledgements. Secret words and options are never inferred on guessing clients. Drawing broadcasts bypass React state, use an animation-frame canvas scheduler, and preserve a fixed logical aspect ratio on all screens. Socket listeners, timers, pointer gestures and observers are cleaned up.

The visual system uses cream #FFF9EB, forest #20382B, orange #FF743D, yellow #FFD93D and green #A8E65C, with custom SVG characters and CSS motion respecting reduced-motion preferences. The project retains its no-bundler architecture; `npm run build` syntax-checks and packages the actual served frontend into `dist`.
