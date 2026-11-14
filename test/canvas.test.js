import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import React from "react";

function canvasHarness(canDraw = true, rotated = false) {
  const effects = [],
    sent = [],
    events = {},
    refs = [];
  let clock = 0,
    stateUpdates = 0,
    frame;
  const context = {
    React: {
      ...React,
      useState: () => {
        stateUpdates++;
        throw Error("Canvas must not use React state for strokes");
      },
      useEffect: (fn) => effects.push(fn),
      useRef: (value) => {
        const ref = { current: value };
        refs.push(ref);
        return ref;
      },
    },
    ReactDOM: { createRoot: () => ({ render() {} }) },
    document: { getElementById: () => null },
    io: () => ({
      on: (event, fn) => {
        events[event] = fn;
      },
      off: (event) => delete events[event],
    }),
    requestAnimationFrame: (fn) => {
      frame = fn;
      return 1;
    },
    cancelAnimationFrame() {},
    crypto: { randomUUID: () => "gesture-1" },
    performance: { now: () => clock },
    getComputedStyle: () => ({ getPropertyValue: () => (rotated ? "1" : "0") }),
  };
  vm.createContext(context);
  vm.runInContext(
    readFileSync(new URL("../public/app.js", import.meta.url), "utf8") +
      "\nthis.CanvasUnderTest = DrawingCanvas;",
    context,
  );
  const api = { current: null };
  const element = context.CanvasUnderTest({
    room: { strokes: [] },
    canDraw,
    color: "#ff743d",
    size: 6,
    tool: "pen",
    canvasApi: api,
    act: (type, payload, callback) => sent.push({ type, payload, callback }),
  });
  const ctx = new Proxy(
    {},
    { get: (_, key) => (key === "canvas" ? null : () => {}), set: () => true },
  );
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      left: 20,
      top: 30,
      width: rotated ? 325 : 500,
      height: rotated ? 500 : 325,
    }),
    setPointerCapture() {},
  };
  refs[0].current = canvas;
  const cleanups = effects.map((fn) => fn());
  const pointer = (x, y, id = 1) => ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: id,
    currentTarget: canvas,
    preventDefault() {},
  });
  return {
    element,
    sent,
    events,
    api,
    pointer,
    setTime: (value) => (clock = value),
    paint: () => frame?.(),
    cleanups,
    updates: () => stateUpdates,
  };
}

test("canvas scales pointer coordinates and streams segments with one gesture id", () => {
  const c = canvasHarness();
  c.element.props.onPointerDown(c.pointer(70, 95));
  c.setTime(50);
  c.element.props.onPointerMove(c.pointer(270, 192.5));
  c.element.props.onPointerUp(c.pointer(270, 192.5));
  assert.equal(c.sent.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(c.sent[0].payload.stroke.points)),
    [
      [0.1, 0.2],
      [0.5, 0.5],
    ],
  );
  assert.equal(c.sent[0].payload.stroke.id, c.sent[1].payload.stroke.id);
  c.events.canvas(c.sent.map((s) => s.payload.stroke));
  c.sent.forEach((s) => s.callback(true));
  c.paint();
  assert.equal(c.updates(), 0);
  c.cleanups.forEach((fn) => fn?.());
  assert.equal(c.events.canvas, undefined);
  assert.equal(c.api.current, null);
});

test("spectators cannot draw and cancelled gestures do not leak across turns", () => {
  const spectator = canvasHarness(false);
  spectator.element.props.onPointerDown(spectator.pointer(70, 95));
  spectator.element.props.onPointerUp(spectator.pointer(70, 95));
  assert.equal(spectator.sent.length, 0);
  const artist = canvasHarness();
  artist.element.props.onPointerDown(artist.pointer(70, 95));
  artist.api.current.cancel();
  artist.element.props.onPointerUp(artist.pointer(70, 95));
  assert.equal(artist.sent.length, 0);
});

test("expanded portrait canvas maps rotated touch positions to unchanged drawing coordinates", () => {
  const c = canvasHarness(true, true);
  c.element.props.onPointerDown(c.pointer(280, 80));
  c.element.props.onPointerMove(c.pointer(182.5, 280));
  c.element.props.onPointerUp(c.pointer(182.5, 280));
  const points = c.sent[0].payload.stroke.points;
  assert.equal(points[0][0], 0.1);
  assert.ok(Math.abs(points[0][1] - 0.2) < 1e-10);
  assert.equal(points[1][0], 0.5);
  assert.equal(points[1][1], 0.5);
});
