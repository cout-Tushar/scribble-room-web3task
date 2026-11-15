import { test } from "node:test";
import assert from "node:assert/strict";
import { frontendSource, children, findNode } from "./helpers.ts";
import type { ReactNode, ReactElement } from "react";
import vm from "node:vm";
import React from "react";

// Render the room with deterministic hook values, without a browser or socket.
// This guards the accidental panel nesting that collapsed the room layout.
for (const phase of ["lobby", "choosing", "drawing", "reveal", "finished"]) {
  test(`room panels remain siblings during ${phase}`, () => {
    const room = {
      phase,
      players: [{ id: "me", name: "Artist", score: 0 }],
      settings: { rounds: 3, maxPlayers: 8 },
      guessed: [],
      messages: [],
      options: ["elephant", "butterfly"],
      drawer: "me",
      host: "me",
    };
    let stateIndex = 0;
    let tree: ReactNode;
    vm.runInNewContext(frontendSource, {
      React: {
        ...React,
        useState: (value: unknown) => [
          stateIndex++ === 0 ? room : value,
          () => {},
        ],
        useEffect: () => {},
        useRef: () => ({ current: null }),
      },
      ReactDOM: {
        createRoot: () => ({
          render: (element: ReactElement<unknown, () => ReactNode>) => {
            tree = element.type();
          },
        }),
      },
      io: () => ({ id: "me" }),
      localStorage: { getItem: () => "" },
      location: { search: "" },
      URLSearchParams,
      document: { getElementById: () => null },
    });
    const find = (node: ReactNode, cls: string) =>
      findNode(node, (n) => n.props.className === cls);
    const panels = children(find(tree, "game-grid"));
    assert.deepEqual(
      panels.map((p) => p.props.className),
      ["card players", "board card", "card chat"],
    );
    assert.ok(find(panels[1], "canvas-wrap"));
    assert.ok(find(panels[1], "toolbar"));
  });
}
