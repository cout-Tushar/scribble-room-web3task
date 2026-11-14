import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';

test('word selection renders a ticking countdown for drawer and guesser', () => {
 for (const playerId of ['drawer', 'guesser']) {
  let clock = 100000, index = 0, tick, component;
  const room = { phase: 'choosing', deadline: clock + 15000, drawer: 'drawer',
   players: [{ id: 'drawer', name: 'Artist', score: 0 }],
   settings: { rounds: 3, maxPlayers: 8 }, options: ['cat'], guessed: [], messages: [] };
  const states = [], effects = [];
  vm.runInNewContext(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), {
   React: { ...React,
    useState(value) {
     const slot = index++;
     if (!(slot in states)) states[slot] = slot === 0 ? room : value;
     return [states[slot], v => { states[slot] = v; }];
    }, useEffect: fn => effects.push(fn), useRef: () => ({ current: null }) },
   ReactDOM: { createRoot: () => ({ render: e => { component = e.type; } }) },
   io: () => ({ id: playerId, on() {}, off() {} }), Date: { now: () => clock },
   setInterval: fn => { tick = fn; }, clearInterval() {},
   localStorage: { getItem: () => '' }, location: { search: '' }, URLSearchParams,
   document: { getElementById: () => null },
  });
  const findTimer = node => node?.props?.role === 'timer' ? node :
   React.Children.toArray(node?.props?.children).map(findTimer).find(Boolean);
  const render = () => { index = 0; return findTimer(component()); };
  assert.equal(render().props.children[0].props.children, 15);
  effects[0]();
  clock += 7000; tick();
  assert.equal(render().props.children[0].props.children, 8);
  clock += 4000; tick();
  assert.equal(render().props.children[0].props.children, 4);
  assert.match(render().props.className, /urgent/);
  clock += 5000; tick();
  assert.equal(render().props.children[0].props.children, 0);
  room.phase = 'drawing';
  assert.equal(render(), undefined);
 }
});
