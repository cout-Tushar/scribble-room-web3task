import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.ts";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test(
  "two-player flow, word privacy, permissions, drawing and scoring",
  { timeout: 10000 },
  async (t) => {
    const { app, connect, action } = await fixture(t);
    const [a, b] = await Promise.all([connect(), connect()]);
    assert.equal(
      (
        await action(a, "create", {
          name: "Alice",
          settings: { drawTime: 15, rounds: 2 },
        })
      ).ok,
      true,
    );
    await wait(40);
    assert.ok(a.state.code);
    assert.equal(
      (await action(b, "join", { name: "Bob", code: a.state.code })).ok,
      true,
    );
    assert.ok((await action(b, "start")).error);
    await action(a, "start");
    await wait(40);
    assert.equal(a.state.phase, "choosing");
    assert.equal(b.state.options.length, 0);
    const word = a.state.options[0];
    await action(a, "choose", { word });
    await wait(40);
    assert.equal(a.state.word, word);
    assert.equal(b.state.word, null);
    assert.ok(!b.state.mask.includes(word));
    assert.ok((await action(b, "clear")).error);
    await action(a, "stroke", {
      stroke: {
        points: [
          [0.1, 0.2],
          [0.2, 0.3],
        ],
        color: "#292742",
        size: 5,
      },
    });
    assert.equal([...app.rooms.values()][0].strokes.length, 1);
    await action(a, "undo");
    assert.equal([...app.rooms.values()][0].strokes.length, 0);
    await action(b, "guess", { text: "  " + word.toUpperCase() + "  " });
    await wait(40);
    assert.equal(b.state.phase, "reveal");
    assert.ok(b.state.players.find((p) => p.name === "Bob")!.score >= 100);
    const points = b.state.players.find((p) => p.name === "Bob")!.score;
    await action(b, "guess", { text: word });
    await wait(40);
    assert.equal(b.state.players.find((p) => p.name === "Bob")!.score, points);
    b.disconnect();
    await wait(40);
    assert.equal(a.state.phase, "lobby");
  },
);
