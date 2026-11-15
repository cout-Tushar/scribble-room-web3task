export interface Settings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  private: boolean;
  mode: "normal" | "hidden";
}
export type Phase = "lobby" | "choosing" | "drawing" | "reveal" | "finished";
export interface Player {
  id: string;
  name: string;
  score: number;
  ready: boolean;
}
export type Point = [number, number];
export interface Stroke {
  id?: string | null;
  points: Point[];
  color: string;
  size: number;
}
export interface Message {
  name: string;
  text: string;
}
export interface RoomState {
  code: string;
  settings: Settings;
  players: Player[];
  host: string;
  phase: Phase;
  round: number;
  drawer: string | null;
  deadline: number | null;
  word: string | null;
  mask: string;
  options: string[];
  messages: Message[];
  guessed: string[];
  strokes: Stroke[];
}
export interface ActionPayloads {
  create: { name: string; settings?: Partial<Settings> };
  join: { name: string; code?: string; random?: boolean };
  ready: Record<never, never>;
  start: Record<never, never>;
  choose: { word: string };
  guess: { text: string };
  stroke: { stroke: Stroke };
  clear: Record<never, never>;
  undo: Record<never, never>;
}
export type ActionType = keyof ActionPayloads;
export type ActionArgs = {
  [K in ActionType]: keyof ActionPayloads[K] extends never
    ? [type: K, payload?: ActionPayloads[K], done?: (ok: boolean) => void]
    : [type: K, payload: ActionPayloads[K], done?: (ok: boolean) => void];
}[ActionType];
export type GameAction = {
  [K in ActionType]: { type: K } & ActionPayloads[K];
}[ActionType];
export type ActionResult =
  | { ok: true; error?: never }
  | { error: string; ok?: never };
export interface ClientEvents {
  action: (data: GameAction, ack: (result: ActionResult) => void) => void;
}
export interface ServerEvents {
  state: (room: RoomState) => void;
  canvas: (strokes: Stroke[]) => void;
}
