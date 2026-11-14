import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';

// Render the room with deterministic hook values, without a browser or socket.
// This guards the accidental panel nesting that collapsed the room layout.
for (const phase of ['lobby', 'choosing', 'drawing', 'reveal', 'finished']) {
 test(`room panels remain siblings during ${phase}`, () => {
  const room = {
   phase, players: [{ id: 'me', name: 'Artist', score: 0 }],
   settings: { rounds: 3, maxPlayers: 8 }, guessed: [], messages: [],
   options: ['elephant', 'butterfly'], drawer: 'me', host: 'me',
  };
  let stateIndex = 0, tree;
  vm.runInNewContext(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), {
   React: { ...React, useState: value => [stateIndex++ === 0 ? room : value, () => {}],
    useEffect: () => {}, useRef: () => ({ current: null }) },
   ReactDOM: { createRoot: () => ({ render: element => { tree = element.type(); } }) },
   io: () => ({ id: 'me' }), localStorage: { getItem: () => '' },
   location: { search: '' }, URLSearchParams, document: { getElementById: () => null },
  });
  const children = node => React.Children.toArray(node?.props?.children);
  const find = (node, cls) => node?.props?.className === cls ? node : children(node).map(n => find(n, cls)).find(Boolean);
  const panels = children(find(tree, 'game-grid'));
  assert.deepEqual(panels.map(p => p.props.className), ['card players', 'board card', 'card chat']);
  assert.ok(find(panels[1], 'canvas-wrap'));
  assert.ok(find(panels[1], 'toolbar'));
 });
}
