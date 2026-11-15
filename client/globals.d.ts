import type * as ReactType from "react";
import type * as ReactDOMType from "react-dom/client";
import type { Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "../shared/game";
declare global {
  const React: typeof ReactType;
  const ReactDOM: typeof ReactDOMType;
  function io(): Socket<ServerEvents, ClientEvents>;
}
export {};
