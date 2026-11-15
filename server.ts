import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import type { RoomState, ClientEvents, ServerEvents } from "./shared/game";
interface Room extends Omit<RoomState, "mask"> {
  order: string[];
  turn: number;
  revealed: number[];
  timer?: ReturnType<typeof setTimeout>;
}
const require = createRequire(import.meta.url);

const root = path.dirname(fileURLToPath(import.meta.url));

const words =
  "elephant butterfly penguin giraffe dolphin octopus bicycle airplane umbrella telescope guitar rainbow volcano castle rocket waterfall snowman pizza hamburger pineapple dinosaur robot lighthouse skateboard mountain jellyfish kangaroo camera treasure submarine sunflower dragon spaceship".split(
    " ",
  );
const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  Number.isFinite(Number(v))
    ? Math.max(min, Math.min(max, Math.floor(Number(v))))
    : fallback;

export function createApp() {
  const app = express(),
    http = createServer(app),
    io = new Server<ClientEvents, ServerEvents>(http, {
      maxHttpBufferSize: 100000,
    });

  const rooms = new Map<string, Room>();

  app.get("/health", (_, res) => res.json({ ok: true }));

  app.use(
    "/vendor/react",
    express.static(
      path.join(path.dirname(require.resolve("react/package.json")), "umd"),
    ),
  );

  app.use(
    "/vendor/react-dom",
    express.static(
      path.join(path.dirname(require.resolve("react-dom/package.json")), "umd"),
    ),
  );

  app.use(
    express.static(
      path.join(
        root,
        import.meta.url.endsWith(".ts") ? "dist/public" : "public",
      ),
    ),
  );

  const message = (r: Room, text: string) => {
    r.messages.push({ name: "Game", text });
    r.messages = r.messages.slice(-100);
  };

  const send = (r: Room) => {
    for (const p of r.players)
      io.to(p.id).emit("state", {
        code: r.code,
        settings: r.settings,
        players: r.players,
        host: r.host,
        phase: r.phase,
        round: r.round,
        drawer: r.drawer,
        deadline: r.deadline,
        word:
          r.phase === "reveal" || r.phase === "finished" || p.id === r.drawer
            ? r.word
            : null,
        mask: r.word
          ? r.settings.mode === "hidden"
            ? "?"
            : r.word
                .split("")
                .map((c, i) => (r.revealed.includes(i) ? c : "_"))
                .join(" ")
          : "",
        options: p.id === r.drawer ? r.options : [],
        messages: r.messages,
        guessed: r.guessed,
        strokes: r.strokes,
      });
  };

  const later = (r: Room, fn: () => void, ms: number) => {
    clearTimeout(r.timer);
    r.timer = setTimeout(fn, ms);
  };

  const finish = (r: Room): void => {
    r.phase = "finished";
    r.deadline = null;
    message(r, "Game over! Check the final leaderboard.");
    send(r);
  };

  const next = (r: Room): void => {
    if (r.players.length < 2) {
      r.phase = "lobby";
      r.deadline = null;
      send(r);
      return;
    }
    r.turn++;
    if (r.turn >= r.order.length) {
      r.turn = 0;
      r.round++;
    }
    if (r.round > r.settings.rounds) return finish(r);
    r.drawer = r.order[r.turn];
    if (!r.players.some((p) => p.id === r.drawer)) return next(r);
    r.phase = "choosing";
    r.word = null;
    r.guessed = [];
    r.revealed = [];
    r.strokes = [];
    r.options = [...words]
      .sort(() => Math.random() - 0.5)
      .slice(0, r.settings.wordCount);
    r.deadline = Date.now() + 15000;
    send(r);
    later(r, () => choose(r, r.options[0]), 15000);
  };
  const end = (r: Room): void => {
    if (r.phase !== "drawing" && r.phase !== "choosing") return;
    r.phase = "reveal";
    r.deadline = Date.now() + 4000;
    message(r, `The word was ${r.word || "not selected"}.`);
    send(r);
    later(r, () => next(r), 4000);
  };

  const choose = (r: Room, word: string) => {
    if (r.phase !== "choosing" || !r.options.includes(word)) return;
    r.word = word;
    r.options = [];
    r.phase = "drawing";
    r.deadline = Date.now() + r.settings.drawTime * 1000;
    send(r);
    later(r, () => end(r), r.settings.drawTime * 1000);
  };

  const hintTimer = setInterval(() => {
    for (const r of rooms.values()) {
      if (r.phase !== "drawing" || !r.word || r.deadline === null) continue;
      const elapsed =
        1 -
        ((r.deadline ?? Date.now()) - Date.now()) /
          (r.settings.drawTime * 1000);
      const count = Math.min(
        r.word.length - 1,
        Math.floor(elapsed * (r.settings.hints + 1)),
      );
      if (r.settings.mode !== "hidden" && count > r.revealed.length) {
        r.revealed.push(r.revealed.length);
        send(r);
      }
    }
  }, 1000);
  io.on("connection", (socket) => {
    let room: Room | null | undefined;
    let last = 0,
      burst = 0;
    const allowed = () => {
      const now = Date.now();
      if (now - last > 1000) {
        last = now;
        burst = 0;
      }
      return ++burst < 180;
    };
    socket.on("action", (data, ack = () => {}) => {
      try {
        if (!data || typeof data !== "object") throw Error("Invalid action.");
        if (!allowed()) throw Error("Please slow down.");
        const { type } = data;
        if (type === "create" || type === "join") {
          if (room) throw Error("Leave your current room first.");
          const name = String(data.name || "")
            .trim()
            .slice(0, 24);
          if (!name) throw Error("Enter your name.");
          if (type === "create") {
            const s = data.settings || {};
            const code = randomBytes(4).toString("hex").toUpperCase();
            room = {
              code,
              host: socket.id,
              players: [],
              settings: {
                maxPlayers: clamp(s.maxPlayers, 2, 20, 8),
                rounds: clamp(s.rounds, 2, 10, 3),
                drawTime: clamp(s.drawTime, 15, 240, 80),
                wordCount: clamp(s.wordCount, 1, 5, 3),
                hints: clamp(s.hints, 0, 5, 2),
                private: s.private !== false,
                mode: s.mode === "hidden" ? "hidden" : "normal",
              },
              phase: "lobby",
              drawer: null,
              deadline: null,
              word: null,
              order: [],
              turn: -1,
              round: 0,
              strokes: [],
              messages: [],
              guessed: [],
              revealed: [],
              options: [],
            };
            rooms.set(code, room);
          } else {
            room = data.random
              ? [...rooms.values()].find(
                  (r) =>
                    !r.settings.private &&
                    r.phase === "lobby" &&
                    r.players.length < r.settings.maxPlayers,
                )
              : rooms.get(
                  String(data.code || "")
                    .toUpperCase()
                    .trim(),
                );
            if (!room) throw Error("Room not found.");
            if (room.players.length >= room.settings.maxPlayers) {
              room = null;
              throw Error("Room is full.");
            }
            if (room.phase !== "lobby" && room.phase !== "finished") {
              room = null;
              throw Error("Game is already in progress.");
            }
          }
          room.players.push({ id: socket.id, name, score: 0, ready: false });
          socket.join(room.code);
          message(room, `${name} joined the room.`);
          send(room);
          return ack({ ok: true });
        }

        if (!room) throw Error("Join a room first.");
        const r = room,
          p = r.players.find((p) => p.id === socket.id);
        if (!p) throw Error("Player not found.");
        if (type === "ready") {
          p.ready = !p.ready;
          send(r);
        } else if (type === "start") {
          if (r.host !== socket.id || !["lobby", "finished"].includes(r.phase))
            throw Error("Only the host can start from the lobby.");
          if (r.players.length < 2)
            throw Error("Invite at least one more player.");
          r.players.forEach((p) => (p.score = 0));
          r.order = r.players.map((p) => p.id);
          r.turn = -1;
          r.round = 1;
          next(r);
        } else if (type === "choose") {
          if (r.drawer !== socket.id)
            throw Error("Only the drawer can choose.");
          choose(r, data.word);
        } else if (type === "guess") {
          const text = String(data.text || "")
            .trim()
            .slice(0, 200);
          if (!text) return;
          const correct =
            r.phase === "drawing" &&
            text.toLowerCase() === r.word?.toLowerCase();
          if (correct) {
            if (socket.id === r.drawer || r.guessed.includes(socket.id)) return;
            r.guessed.push(socket.id);
            const points =
              100 +
              Math.round(
                (400 * Math.max(0, (r.deadline ?? Date.now()) - Date.now())) /
                  (r.settings.drawTime * 1000),
              );
            p.score += points;
            const drawer = r.players.find((p) => p.id === r.drawer);
            if (drawer) drawer.score += 100;
            message(r, `${p.name} guessed the word! +${points}`);
            if (r.guessed.length >= r.players.length - 1) end(r);
          } else {
            if (
              r.phase === "drawing" &&
              (socket.id === r.drawer || r.guessed.includes(socket.id))
            )
              throw Error("Wait until the reveal to chat.");
            r.messages.push({ name: p.name, text });
            r.messages = r.messages.slice(-100);
          }
          send(r);
        } else if (type === "stroke" || type === "clear" || type === "undo") {
          if (r.phase !== "drawing" || r.drawer !== socket.id)
            throw Error("Only the active drawer can draw.");
          if (type === "clear") r.strokes = [];
          else if (type === "undo") {
            const removed = r.strokes.pop();
            if (removed?.id)
              while (r.strokes.length && r.strokes.at(-1)?.id === removed.id)
                r.strokes.pop();
          } else {
            const s = data.stroke;
            if (
              !s ||
              !Array.isArray(s.points) ||
              !s.points.length ||
              s.points.length > 1000 ||
              !/^#[0-9a-f]{6}$/i.test(s.color) ||
              !s.points.every(
                (p) =>
                  Array.isArray(p) &&
                  p.length === 2 &&
                  p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
              )
            )
              throw Error("Invalid stroke.");
            if (r.strokes.length >= 3000)
              throw Error("Canvas limit reached. Clear the canvas.");
            r.strokes.push({
              id: typeof s.id === "string" ? s.id.slice(0, 64) : null,
              points: s.points,
              color: s.color,
              size: clamp(s.size, 1, 40, 4),
            });
          }
          io.to(r.code).emit("canvas", r.strokes);
        }
        ack({ ok: true });
      } catch (e) {
        ack({
          error: e instanceof Error ? e.message : "Something went wrong.",
        });
      }
    });
    socket.on("disconnect", () => {
      if (!room) return;
      const r = room;
      r.players = r.players.filter((p) => p.id !== socket.id);
      if (!r.players.length) {
        clearTimeout(r.timer);
        rooms.delete(r.code);
        return;
      }
      if (r.host === socket.id) r.host = r.players[0].id;
      message(r, "A player disconnected.");
      if (r.players.length < 2) {
        clearTimeout(r.timer);
        r.phase = "lobby";
        r.deadline = null;
      } else if (
        r.drawer === socket.id &&
        ["choosing", "drawing"].includes(r.phase)
      )
        end(r);
      else if (
        r.phase === "drawing" &&
        r.players
          .filter((p) => p.id !== r.drawer)
          .every((p) => r.guessed.includes(p.id))
      )
        end(r);
      send(r);
    });
  });
  return {
    http,
    io,
    rooms,
    close: () => {
      clearInterval(hintTimer);
      for (const r of rooms.values()) clearTimeout(r.timer);
      io.close();
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { http } = createApp();
  http.listen(process.env.PORT || 3000, () =>
    console.log(
      "Scribble Room running on http://localhost:" + (process.env.PORT || 3000),
    ),
  );
}
