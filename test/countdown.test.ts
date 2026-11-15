import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { frontendSource, findNode, children } from "./helpers.ts";
import type { ReactNode, ReactElement } from "react";
import React from "react";

test("word selection renders a ticking countdown for drawer and guesser", () => {
  for (const playerId of ["drawer", "guesser"]) {
    let clock = 100000,
      index = 0;
    let tick!: () => void;
    let component!: () => ReactNode;
    const room = {
      phase: "choosing",
      deadline: clock + 15000,
      drawer: "drawer",
      players: [{ id: "drawer", name: "Artist", score: 0 }],
      settings: { rounds: 3, maxPlayers: 8 },
      options: ["cat"],
      guessed: [],
      messages: [],
    };
    const states: unknown[] = [],
      effects: (() => void)[] = [];
    vm.runInNewContext(frontendSource, {
      React: {
        ...React,
        useState(value: unknown) {
          const slot = index++;
          if (!(slot in states)) states[slot] = slot === 0 ? room : value;
          return [
            states[slot],
            (v: unknown) => {
              states[slot] = v;
            },
          ];
        },
        useEffect: (fn: () => void) => effects.push(fn),
        useRef: () => ({ current: null }),
      },
      ReactDOM: {
        createRoot: () => ({
          render: (e: ReactElement<unknown, () => ReactNode>) => {
            component = e.type;
          },
        }),
      },
      io: () => ({ id: playerId, on() {}, off() {} }),
      Date: { now: () => clock },
      setInterval: (fn: () => void) => {
        tick = fn;
      },
      clearInterval() {},
      localStorage: { getItem: () => "" },
      location: { search: "" },
      URLSearchParams,
      document: { getElementById: () => null },
    });
    const findTimer = (node: ReactNode) =>
      findNode(node, (n) => n.props.role === "timer");
    const render = () => {
      index = 0;
      return findTimer(component());
    };
    assert.equal(children(render())[0].props.children, 15);
    effects[0]();
    clock += 7000;
    tick();
    assert.equal(children(render())[0].props.children, 8);
    clock += 4000;
    tick();
    assert.equal(children(render())[0].props.children, 4);
    assert.match(render()!.props.className!, /urgent/);
    clock += 5000;
    tick();
    assert.equal(children(render())[0].props.children, 0);
    room.phase = "drawing";
    assert.equal(render(), undefined);
  }
});
