import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
import type { Stroke } from "../shared/game";

test(
  "complete two-round game reaches final scores and host can rematch",
  { timeout: 25000 },
  async (t) => {
    const { app, connect, action, until, url } = await fixture(t);
    const [a, b] = await Promise.all([connect(), connect()]);
    assert.equal((await fetch(url + "/health")).status, 200);
    assert.equal((await fetch(url + "/app.js")).status, 200);
    await action(a, "create", {
      name: "Sunny",
      settings: { rounds: 2, drawTime: 15, wordCount: 5 },
    });
    await action(b, "join", { name: "Pickle", code: a.state.code });
    await action(b, "ready");
    assert.equal(b.state.players.find((p) => p.id === b.id)!.ready, true);
    await action(a, "start");
    for (let turn = 0; turn < 4; turn++) {
      const drawer = turn % 2 ? b : a,
        guesser = turn % 2 ? a : b;
      await until(
        drawer,
        (s) => s.phase === "choosing" && s.drawer === drawer.id,
      );
      assert.equal(drawer.state.round, Math.floor(turn / 2) + 1);
      assert.equal(drawer.state.options.length, 5);
      const word = drawer.state.options[0];
      await action(drawer, "choose", { word });
      await until(guesser, (s) => s.phase === "drawing");
      assert.equal(guesser.state.word, null);
      assert.deepEqual(guesser.state.options, []);
      assert.ok((await action(drawer, "guess", { text: "spoiler" })).error);
      const stroke: Stroke = {
        id: "gesture-" + turn,
        color: "#ff743d",
        size: 8,
        points: [
          [0.1, 0.2],
          [0.8, 0.7],
        ],
      };
      await action(drawer, "stroke", { stroke });
      await action(drawer, "stroke", {
        stroke: {
          ...stroke,
          points: [
            [0.8, 0.7],
            [0.9, 0.8],
          ],
        },
      });
      assert.equal([...app.rooms.values()][0].strokes.length, 2);
      await action(drawer, "undo");
      assert.equal(
        [...app.rooms.values()][0].strokes.length,
        0,
        "undo removes the full multi-segment gesture",
      );
      await action(drawer, "stroke", { stroke });
      await action(drawer, "clear");
      assert.equal([...app.rooms.values()][0].strokes.length, 0);
      await action(guesser, "guess", { text: "wrong guess" });
      await action(guesser, "guess", { text: " " + word.toUpperCase() + " " });
      await until(drawer, (s) => s.phase === "reveal");
      assert.equal(drawer.state.word, word);
      assert.equal(drawer.state.guessed.length, 1);
    }
    await until(a, (s) => s.phase === "finished");
    assert.equal(a.state.deadline, null);
    assert.ok(a.state.players.every((p) => p.score > 1000));
    assert.ok((await action(b, "start")).error);
    await action(a, "start");
    await until(b, (s) => s.phase === "choosing");
    assert.ok(b.state.players.every((p) => p.score === 0));
  },
);

test(
  "public matchmaking, validation, host migration and fresh reconnection",
  { timeout: 10000 },
  async (t) => {
    const { app, connect, action, until } = await fixture(t);
    const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
    assert.ok((await action(a, "create", { name: "" })).error);
    await action(a, "create", {
      name: "Host",
      settings: { private: false, maxPlayers: 2, mode: "hidden", hints: 0 },
    });
    const code = a.state.code;
    await action(b, "join", { name: "Guest", random: true });
    assert.equal(b.state.code, code);
    assert.ok((await action(c, "join", { name: "Extra", code })).error);
    assert.ok((await action(b, "start")).error);
    await action(a, "start");
    await action(a, "choose", { word: a.state.options[0] });
    await until(b, (s) => s.phase === "drawing");
    assert.equal(b.state.mask, "?");
    assert.ok(
      (
        await action(b, "stroke", {
          stroke: { points: [[0.5, 0.5]], color: "#ff743d", size: 4 },
        })
      ).error,
    );
    assert.ok(
      (
        await action(a, "stroke", {
          stroke: { points: [[-1, 0.5]], color: "#ff743d", size: 4 },
        })
      ).error,
    );
    a.disconnect();
    await until(b, (s) => s.phase === "lobby");
    assert.equal(b.state.host, b.id);
    const returning = await connect();
    await action(returning, "join", { name: "Host", code });
    assert.equal(
      returning.state.players.find((p) => p.id === returning.id)!.score,
      0,
    );
    assert.equal([...app.rooms.values()][0].players.length, 2);
  },
);
