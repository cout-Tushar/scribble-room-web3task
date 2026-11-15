import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { io, type Socket } from "socket.io-client";
import type { TestContext } from "node:test";
import React, { type ReactElement, type ReactNode } from "react";
import { createApp } from "../server.ts";
import type {
  ActionType,
  ActionPayloads,
  GameAction,
  ActionResult,
  ServerEvents,
  ClientEvents,
  RoomState,
} from "../shared/game";

// Type erasure only: execute the real frontend with deterministic hook/socket mocks.
export const frontendSource = transformSync(
  readFileSync(new URL("../client/app.ts", import.meta.url), "utf8"),
  { loader: "ts", target: "es2022" },
).code;
export interface NodeProps {
  children?: ReactNode;
  className?: string;
  role?: string;
}
export type ElementNode = ReactElement<NodeProps>;
export const children = (node: ReactNode): ElementNode[] =>
  React.isValidElement<NodeProps>(node)
    ? React.Children.toArray(node.props.children).filter(
        (n): n is ElementNode => React.isValidElement<NodeProps>(n),
      )
    : [];
export function findNode(
  node: ReactNode,
  predicate: (node: ElementNode) => boolean,
): ElementNode | undefined {
  if (!React.isValidElement<NodeProps>(node)) return;
  if (predicate(node)) return node;
  for (const child of children(node)) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
}
export type TestClient = Socket<ServerEvents, ClientEvents> & {
  readonly state: RoomState;
};
export async function fixture(t: TestContext) {
  const app = createApp();
  const clients: TestClient[] = [];
  t.after(() => {
    clients.forEach((s) => s.disconnect());
    app.close();
  });
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const address = app.http.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const connect = async (): Promise<TestClient> => {
    const socket = io(url, {
      autoConnect: false,
      reconnection: false,
    }) as TestClient;
    let state: RoomState | undefined;
    Object.defineProperty(socket, "state", {
      get: () => {
        assert.ok(state, "Expected a room state event");
        return state;
      },
    });
    clients.push(socket);
    socket.on("state", (value) => {
      state = value;
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
    return socket;
  };
  const action = <K extends ActionType>(
    socket: TestClient,
    type: K,
    payload: ActionPayloads[K] = {} as ActionPayloads[K],
  ) =>
    new Promise<ActionResult>((resolve, reject) => {
      socket
        .timeout(3000)
        .emit("action", { type, ...payload } as GameAction, (error, result) =>
          error ? reject(error) : resolve(result),
        );
    });
  const until = (
    socket: TestClient,
    predicate: (state: RoomState) => boolean,
  ): Promise<RoomState> =>
    predicate(socket.state)
      ? Promise.resolve(socket.state)
      : new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            socket.off("state", onState);
            reject(Error("Timed out waiting for phase"));
          }, 6000);
          function onState(state: RoomState) {
            if (predicate(state)) {
              clearTimeout(timer);
              socket.off("state", onState);
              resolve(state);
            }
          }
          socket.on("state", onState);
        });
  return { app, connect, action, until, url };
}
