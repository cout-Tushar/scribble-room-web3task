/* Scribble Room · typed React frontend and real Socket.IO rooms. */
import type {
  Settings as GameSettings,
  RoomState,
  Player,
  Stroke,
  Point,
  GameAction,
  ActionArgs,
} from "../shared/game";
import type {
  Dispatch,
  SetStateAction,
  MutableRefObject,
  ButtonHTMLAttributes,
  SVGProps,
  CSSProperties,
  ChangeEvent,
  FormEvent,
  MouseEvent,
  SyntheticEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
type Setter<T> = Dispatch<SetStateAction<T>>;
type Act = (...args: ActionArgs) => void;
type Join = (type: "create" | "join", extra?: { random?: boolean }) => void;
type Confirmation =
  | { type: "leave" | "clear" }
  | { type: "invite"; url: string };
interface CanvasApi {
  replace: (strokes: Stroke[]) => void;
  cancel: () => void;
}
interface ActiveStroke extends Stroke {
  pointerId: number;
}
interface CanvasStore {
  strokes: Stroke[];
  pending: Map<number, Stroke>;
  active: ActiveStroke | null;
  frame: number;
  seq: number;
  lastFlush: number;
  canDraw: boolean;
}
interface DrawingCanvasProps {
  room: Pick<RoomState, "strokes">;
  canDraw: boolean;
  color: string;
  size: number;
  tool: string;
  act: Act;
  canvasApi: MutableRefObject<CanvasApi | null>;
}
interface SettingsProps {
  settings: GameSettings;
  setSettings: Setter<GameSettings>;
}
interface WelcomeProps extends SettingsProps {
  name: string;
  setName: Setter<string>;
  code: string;
  setCode: Setter<string>;
  join: Join;
  busy: boolean;
  connected: boolean;
  rejoin: boolean;
}

const h = React.createElement;
const { useState: S, useEffect: E, useRef: R } = React;
const socket = io();
const COLORS = [
  "#20382b",
  "#ffffff",
  "#ff743d",
  "#ffd93d",
  "#a8e65c",
  "#37b9a5",
  "#62b8ef",
  "#9d85df",
  "#f18db2",
  "#a57550",
];

const DEFAULTS: GameSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  private: true,
  mode: "normal",
};

const cn = (...parts: (string | boolean | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");
function savedName() {
  try {
    return localStorage.getItem("scribble-name") || "";
  } catch {
    return "";
  }
}

function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: string; size?: number }) {
  const paths: Record<string, string> = {
    arrow: "M4 12h16m-6-6 6 6-6 6",
    pencil: "m4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7a4 4 0 0 1 0 8",
    copy: "M9 9h12v12H9zM5 15H3V3h12v2",
    check: "m5 12 4 4L19 6",
    close: "m6 6 12 12M6 18 18 6",
    expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
    collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5",
    undo: "M3 10h11a7 7 0 0 1 0 14M3 10l6-6M3 10l6 6",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    eraser: "m3 14 10-11 8 8-10 10H8l-5-4v-3Zm5-5 8 8M11 21h10",
    clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    crown: "m3 6 5 5 4-8 4 8 5-5-2 14H5L3 6Z",
    exit: "M9 4H3v16h6m5-13 5 5-5 5M8 12h13",
    shuffle: "m3 5 4 0 10 14h4m-4-4 4 4-4 4M3 19h4l3-5m4-4 3-5h4m-4-4 4 4-4 4",
    star: "m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z",
  };
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      ...props,
    },
    h("path", { d: paths[name] || paths.star }),
  );
}

function Button({
  children,
  icon,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  variant?: string;
}) {
  return h(
    "button",
    { className: cn("button", variant, className), ...props },
    children,
    icon && h(Icon, { name: icon }),
  );
}

function Avatar({ seed = "", size = 44 }) {
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  return h(
    "svg",
    {
      className: "avatar",
      width: size,
      height: size,
      viewBox: "0 0 64 64",
      "aria-hidden": true,
    },
    h("rect", {
      x: 2,
      y: 2,
      width: 60,
      height: 60,
      rx: 20,
      fill: ["#FFD93D", "#A8E65C", "#FFAA86", "#cabaf0"][n],
      stroke: "#20382B",
      strokeWidth: 2,
    }),
    n === 1
      ? h("path", {
          d: "M12 27 20 12l9 10 15-10 8 17",
          fill: "#fff9eb",
          stroke: "#20382B",
          strokeWidth: 2,
        })
      : null,
    h("ellipse", {
      cx: 32,
      cy: 35,
      rx: 19,
      ry: 18,
      fill: "#fff9eb",
      stroke: "#20382B",
      strokeWidth: 2,
    }),
    h("path", {
      d: n === 2 ? "M20 30h7m10 0h7" : "M24 28v5m16-5v5",
      stroke: "#20382B",
      strokeWidth: 3,
      strokeLinecap: "round",
    }),
    h("path", {
      d: "M25 40q7 8 14 0",
      fill: "none",
      stroke: "#20382B",
      strokeWidth: 2.5,
      strokeLinecap: "round",
    }),
    h("circle", { cx: 19, cy: 37, r: 3, fill: "#ffab8e" }),
    h("circle", { cx: 45, cy: 37, r: 3, fill: "#ffab8e" }),
  );
}

function HeroArt() {
  return h(
    "div",
    { className: "hero-art", "aria-hidden": true },
    h(
      "svg",
      { viewBox: "0 0 620 300", fill: "none" },
      h("path", {
        d: "M60 160C22 49 169 10 267 48c124-60 284-15 284 101 74 103-56 166-196 130C195 326 50 270 60 160Z",
        fill: "#FFD93D",
      }),
      h("path", {
        d: "M88 72h435v192H88z",
        fill: "#20382B",
        transform: "rotate(-5 305 168)",
      }),
      h("rect", {
        x: 78,
        y: 53,
        width: 435,
        height: 192,
        rx: 12,
        fill: "#fff",
        stroke: "#20382B",
        strokeWidth: 3,
        transform: "rotate(-5 295 149)",
      }),
      h("path", {
        d: "M169 166q-10-21 3-40l-5-32 33 16q20-5 38 0l30-20-2 39q13 44-40 54-44 9-57-17Zm22-28v5m47-10v5m-30 13 9 5 7-8m-7 8q-2 12-12 9m12-9q8 10 16 2m-57-8-25-4m26 14-23 5m98-25 23-10m-22 21 25 1",
        stroke: "#20382B",
        strokeWidth: 5,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
      h("path", {
        d: "M327 173c-55-38-21-70 4-44 13-39 61-18 31 17Z",
        fill: "#FF743D",
        stroke: "#20382B",
        strokeWidth: 3,
      }),
      h("path", {
        d: "m134 202 184-14",
        stroke: "#A8E65C",
        strokeWidth: 9,
        strokeLinecap: "round",
      }),
      h(
        "g",
        { transform: "translate(428 4) rotate(22)" },
        h("path", {
          d: "M0 17Q0 0 18 0h18q18 0 18 17v161l-27 42L0 178Z",
          fill: "#FF743D",
          stroke: "#20382B",
          strokeWidth: 3,
        }),
        h("path", {
          d: "M0 36h54M0 47h54M18 47v131m18-131v131",
          stroke: "#20382B",
          strokeWidth: 2,
        }),
        h("path", {
          d: "M0 178h54l-27 42Z",
          fill: "#fff9eb",
          stroke: "#20382B",
          strokeWidth: 3,
        }),
        h("path", { d: "m17 205 10 15 10-15", fill: "#20382B" }),
        h("path", {
          d: "M17 89v7m20-7v7m-20 12q10 11 20 0",
          stroke: "#20382B",
          strokeWidth: 3,
          strokeLinecap: "round",
        }),
      ),
      h(
        "g",
        { transform: "translate(42 169) rotate(-12)" },
        h("path", {
          d: "M0 43C-7-6 80-16 87 30l-6 65H5Z",
          fill: "#A8E65C",
          stroke: "#20382B",
          strokeWidth: 3,
        }),
        h("path", {
          d: "M23 39v7m27-7v7m-26 15q13 12 26-2M17 96l-6 16m53-17 7 14",
          stroke: "#20382B",
          strokeWidth: 4,
          strokeLinecap: "round",
        }),
      ),
      h("path", {
        d: "m548 202 8 15 17 2-12 12 2 17-16-8-15 8 2-17-12-12 18-2Z",
        fill: "#a8e65c",
        stroke: "#20382B",
        strokeWidth: 2,
      }),
      h("path", {
        d: "m28 76 8-12m-15 27-15-3M552 73l20-10m-15 26 23 3M334 264l7 16m-27-13-4 17",
        stroke: "#20382B",
        strokeWidth: 3,
        strokeLinecap: "round",
      }),
    ),
    h("span", { className: "art-sticker" }, "100% talent optional ✦"),
  );
}

function Settings({ settings, setSettings }: SettingsProps) {
  const field = (
    label: string,
    key: "maxPlayers" | "rounds" | "drawTime" | "wordCount" | "hints",
    min: number,
    max: number,
    unit = "",
  ) =>
    h(
      "label",
      { className: "range-field", key },
      h("span", null, label, h("b", null, settings[key], unit)),
      h("input", {
        type: "range",
        min,
        max,
        value: settings[key],
        style: {
          "--range-progress": `${((settings[key] - min) / (max - min)) * 100}%`,
        } as CSSProperties,
        onChange: (e: ChangeEvent<HTMLInputElement>) =>
          setSettings({ ...settings, [key]: Number(e.target.value) }),
      }),
    );
  return h(
    "div",
    { className: "settings" },
    field("Players", "maxPlayers", 2, 20),
    field("Rounds", "rounds", 2, 10),
    field("Drawing time", "drawTime", 15, 240, "s"),
    field("Word choices", "wordCount", 1, 5),
    field("Hints", "hints", 0, 5),
    h(
      "label",
      { className: "field" },
      "Word mode",
      h(
        "select",
        {
          value: settings.mode,
          onChange: (e: ChangeEvent<HTMLSelectElement>) =>
            setSettings({
              ...settings,
              mode: e.currentTarget.value === "hidden" ? "hidden" : "normal",
            }),
        },
        h("option", { value: "normal" }, "Letters + hints"),
        h("option", { value: "hidden" }, "Mystery word"),
      ),
    ),
    h(
      "label",
      { className: "privacy" },
      h(
        "span",
        null,
        h("strong", null, "Private party"),
        h("small", null, "Only people with your code can join."),
      ),
      h("input", {
        type: "checkbox",
        role: "switch",
        checked: settings.private,
        onChange: (e: ChangeEvent<HTMLInputElement>) =>
          setSettings({ ...settings, private: e.target.checked }),
      }),
    ),
  );
}

function Welcome({
  name,
  setName,
  code,
  setCode,
  settings,
  setSettings,
  join,
  busy,
  connected,
  rejoin,
}: WelcomeProps) {
  const [tab, setTab] = S<"join" | "create">(code ? "join" : "create");
  return h(
    "main",
    { className: "welcome" },
    h(
      "section",
      { className: "intro" },
      h(
        "div",
        { className: "eyebrow" },
        h("span", { className: "mini-star" }, "✦"),
        "THE DRAWING GAME FOR YOUR KIND OF WEIRD",
      ),
      h(
        "h1",
        null,
        "Little scribbles.",
        h("br"),
        h(
          "span",
          { className: "orange-word" },
          "Big laughs.",
          h(
            "svg",
            { viewBox: "0 0 380 20", "aria-hidden": true },
            h("path", {
              d: "M5 12Q175-5 375 9M38 18q180-12 290-2",
              stroke: "#20382b",
              strokeWidth: 4,
              fill: "none",
              strokeLinecap: "round",
            }),
          ),
        ),
      ),
      h(
        "p",
        { className: "hero-copy" },
        "Draw something questionable. Guess something ridiculous. Make a little chaos with your favorite people.",
      ),
      h(HeroArt),
      h(
        "div",
        { className: "hero-notes" },
        h(
          "span",
          null,
          h(Icon, { name: "people", size: 17 }),
          "2–20 happy humans",
        ),
        h("span", null, "✧ No downloads. Just doodles."),
      ),
    ),
    h(
      "section",
      { className: "card setup" },
      h("div", { className: "card-corner" }, "LET’S PLAY"),
      h(
        "div",
        { className: "setup-heading" },
        h(Avatar, { seed: name || "hello", size: 62 }),
        h(
          "div",
          null,
          h("span", { className: "eyebrow" }, "GOOD VIBES START HERE"),
          h("h2", null, "You’re invited."),
        ),
      ),
      h(
        "label",
        { className: "field" },
        "What should we call you?",
        h("input", {
          value: name,
          maxLength: 24,
          autoComplete: "nickname",
          placeholder: "Your excellent nickname",
          onChange: (e) => setName(e.target.value),
        }),
      ),
      h(
        "div",
        { className: "tabs", role: "tablist", "aria-label": "Room action" },
        ...(["create", "join"] as const).map((t) =>
          h(
            "button",
            {
              key: t,
              role: "tab",
              "aria-selected": tab === t,
              className: tab === t ? "active" : "",
              onClick: () => setTab(t),
            },
            t === "create" ? "Create a room" : "Join a room",
          ),
        ),
      ),
      h(
        "form",
        {
          onSubmit: (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            join(tab);
          },
        },
        tab === "create"
          ? h(
              React.Fragment,
              null,
              h(Settings, { settings, setSettings }),
              h(
                Button,
                {
                  className: "wide",
                  icon: "arrow",
                  disabled: busy || !connected,
                  type: "submit",
                },
                busy ? "Making room for fun…" : "Let’s make a room",
              ),
            )
          : h(
              "div",
              { className: "join-panel" },
              h("div", { className: "join-doodle" }, "✉"),
              h("h3", null, "Got a secret code?"),
              h(
                "p",
                null,
                "Your friends saved you a seat. Pop in their 8-character room code.",
              ),
              h(
                "label",
                { className: "field" },
                "Room code",
                h("input", {
                  value: code,
                  maxLength: 8,
                  placeholder: "A1B2C3D4",
                  className: "code-input",
                  autoCapitalize: "characters",
                  onChange: (e) => setCode(e.target.value.toUpperCase()),
                }),
              ),
              h(
                Button,
                {
                  className: "wide",
                  icon: "arrow",
                  disabled: busy || !connected,
                  type: "submit",
                },
                busy
                  ? "Joining the party…"
                  : rejoin
                    ? "Rejoin the room"
                    : "Join the party",
              ),
            ),
      ),
      h(
        "div",
        { className: "divider" },
        h("span", null, "more of a spontaneous type?"),
      ),
      h(
        "button",
        {
          className: "public-link",
          disabled: busy || !connected,
          onClick: () => join("join", { random: true }),
        },
        h(Icon, { name: "shuffle", size: 17 }),
        "Find a public room",
        h("span", null, "↗"),
      ),
      h(
        "p",
        { className: "setup-footnote" },
        "Free to play. No account. Zero art degree.",
      ),
    ),
    h(
      "section",
      { className: "how-to", id: "how-to" },
      h(
        "div",
        { className: "how-title" },
        h("span", { className: "eyebrow" }, "THE RULES? RIDICULOUSLY SIMPLE."),
        h("h2", null, "Three steps to a good time."),
      ),
      ...[
        [
          "01",
          "Gather your gang",
          "Create a room. Send the link. Bring the funny people.",
          "people",
        ],
        [
          "02",
          "Draw. Guess. Panic.",
          "One secret word. One ticking clock. Many questionable guesses.",
          "pencil",
        ],
        [
          "03",
          "Earn bragging rights",
          "Guess fast, rack up points, and claim your very tiny crown.",
          "crown",
        ],
      ].map(([n, title, copy, icon]) =>
        h(
          "div",
          { className: "how-step", key: n },
          h(
            "div",
            { className: "step-icon" },
            h(Icon, { name: icon, size: 26 }),
          ),
          h("span", { className: "step-number" }, n),
          h("h3", null, title),
          h("p", null, copy),
        ),
      ),
    ),
  );
}

// Canvas updates never pass through React state. Canonical strokes and optimistic
// segments are merged by gesture id + segment index until acknowledged.
function DrawingCanvas({
  room,
  canDraw,
  color,
  size,
  tool,
  act,
  canvasApi,
}: DrawingCanvasProps) {
  const ref = R<HTMLCanvasElement | null>(null),
    store = R<CanvasStore>({
      strokes: [],
      pending: new Map(),
      active: null,
      frame: 0,
      seq: 0,
      lastFlush: 0,
      canDraw: false,
    });

  const paint = () => {
    const s = store.current,
      c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1000, 650);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1000, 650);
    const draw = (stroke: Stroke) => {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) =>
        i ? ctx.lineTo(x * 1000, y * 650) : ctx.moveTo(x * 1000, y * 650),
      );
      ctx.stroke();
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(
          stroke.points[0][0] * 1000,
          stroke.points[0][1] * 650,
          stroke.size / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };

    s.strokes.forEach(draw);
    s.pending.forEach(draw);
    if (s.active) draw(s.active);
    s.frame = 0;
  };

  const schedule = () => {
    if (!store.current.frame)
      store.current.frame = requestAnimationFrame(paint);
  };
  E(() => {
    const onCanvas = (strokes: Stroke[]) => {
      store.current.strokes = strokes;
      schedule();
    };
    socket.on("canvas", onCanvas);
    canvasApi.current = {
      replace: onCanvas,
      cancel: () => {
        store.current.active = null;
        store.current.pending.clear();
        schedule();
      },
    };

    onCanvas(room.strokes || []);
    return () => {
      socket.off("canvas", onCanvas);
      cancelAnimationFrame(store.current.frame);
      canvasApi.current = null;
    };
  }, []);

  E(() => {
    store.current.strokes = room.strokes || [];
    if (!canDraw) {
      store.current.active = null;
      store.current.pending.clear();
    }
    schedule();
  }, [room.strokes, canDraw]);
  store.current.canDraw = canDraw;
  const point = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const b = ref.current!.getBoundingClientRect();
    // The phone's expanded board is rotated as one surface, including tools.
    // Invert that rotation before normalizing to the shared logical canvas.
    const rotated =
      getComputedStyle(ref.current!)
        .getPropertyValue("--canvas-rotated")
        .trim() === "1";
    return [
      Math.max(
        0,
        Math.min(
          1,
          rotated
            ? (e.clientY - b.top) / b.height
            : (e.clientX - b.left) / b.width,
        ),
      ),
      Math.max(
        0,
        Math.min(
          1,
          rotated
            ? 1 - (e.clientX - b.left) / b.width
            : (e.clientY - b.top) / b.height,
        ),
      ),
    ];
  };

  const flush = (continuing = false) => {
    const s = store.current,
      a = s.active;
    if (!a) return;
    const sent = { ...a, points: [...a.points] },
      key = s.seq++;
    s.pending.set(key, sent);
    s.active = continuing
      ? { ...a, points: [a.points[a.points.length - 1]] }
      : null;
    s.lastFlush = performance.now();
    act("stroke", { stroke: sent }, () => {
      s.pending.delete(key);
      schedule();
    });
    schedule();
  };

  return h("canvas", {
    ref,
    width: 1000,
    height: 650,
    className: cn(canDraw && "drawable", tool === "eraser" && "erasing"),
    "aria-label": canDraw
      ? "Your drawing canvas. Draw with a mouse, pen, or touch."
      : "Live shared drawing canvas",
    onPointerDown: (e) => {
      if (!store.current.canDraw || e.button !== 0 || store.current.active)
        return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      store.current.active = {
        id: crypto.randomUUID(),
        points: [point(e)],
        color: tool === "eraser" ? "#ffffff" : color,
        size,
        pointerId: e.pointerId,
      };
      store.current.lastFlush = performance.now();
      schedule();
    },

    onPointerMove: (e) => {
      const s = store.current;
      if (!s.active || s.active.pointerId !== e.pointerId) return;
      s.active.points.push(point(e));
      if (performance.now() - s.lastFlush > 40 || s.active.points.length >= 64)
        flush(true);
      schedule();
    },

    onPointerUp: (e) => {
      if (store.current.active?.pointerId === e.pointerId) flush();
    },

    onPointerCancel: () => flush(),
    onLostPointerCapture: () => flush(),
  });
}

function Chat({
  room,
  drawer,
  act,
  connected,
}: {
  room: RoomState;
  drawer: boolean;
  act: Act;
  connected: boolean;
}) {
  const [text, setText] = S(""),
    [sending, setSending] = S(false),
    log = R<HTMLDivElement | null>(null);
  const locked =
    room.phase === "drawing" &&
    (drawer || room.guessed.includes(socket.id || ""));
  E(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [room.messages]);
  return h(
    React.Fragment,
    null,
    h(
      "h3",
      null,
      "The guessing corner",
      h("span", { className: "live-label" }, "LIVE"),
    ),
    h(
      "div",
      { className: "chat-tip" },
      h("span", null, "✦"),
      room.phase === "lobby"
        ? "Say hello to your fellow scribblers."
        : "Good guesses. Bad guesses. All welcome.",
    ),
    h(
      "div",
      {
        className: "messages",
        ref: log,
        role: "log",
        "aria-live": "polite",
        "aria-relevant": "additions",
      },
      ...room.messages.map((m, i) =>
        h(
          "div",
          {
            key: i,
            className: cn(
              "message",
              m.name === "Game" && "system",
              m.name === "Game" &&
                m.text.includes("guessed the word!") &&
                "correct",
            ),
          },
          m.name === "Game"
            ? h("span", null, m.text)
            : h(
                React.Fragment,
                null,
                h("strong", null, m.name),
                h("p", null, m.text),
              ),
        ),
      ),
    ),
    h(
      "form",
      {
        className: "guess-form",
        onSubmit: (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          if (!text.trim() || locked || sending) return;
          setSending(true);
          act("guess", { text }, (ok) => {
            setSending(false);
            if (ok) setText("");
          });
        },
      },
      h(
        "label",
        { className: "sr-only", htmlFor: "guess-input" },
        "Your guess or message",
      ),
      h("input", {
        id: "guess-input",
        value: text,
        maxLength: 200,
        autoComplete: "off",
        disabled: locked || !connected,
        placeholder: locked
          ? drawer
            ? "Your drawing does the talking…"
            : "You got it! Enjoy the art."
          : room.phase === "drawing"
            ? "Type your guess…"
            : "Say something nice…",
        onChange: (e) => setText(e.target.value),
      }),
      h(Button, {
        type: "submit",
        disabled: locked || sending || !connected || !text.trim(),
        icon: "arrow",
        "aria-label": "Send guess or message",
      }),
    ),
    h(
      "span",
      { className: "chat-footnote" },
      locked
        ? "Chat returns when the word is revealed."
        : "Press Enter to send a little brilliance.",
    ),
  );
}

function Podium({ players }: { players: Player[] }) {
  const top = [...players].sort((a, b) => b.score - a.score).slice(0, 3);
  return h(
    "div",
    { className: "podium" },
    ...[1, 0, 2]
      .filter((i) => top[i])
      .map((i) =>
        h(
          "div",
          { key: top[i].id, className: "podium-place place-" + i },
          h(Avatar, { seed: top[i].name, size: 44 }),
          h("strong", null, top[i].name),
          h("span", null, top[i].score + " pts"),
          h(
            "div",
            { className: "podium-block" },
            i === 0 ? h(Icon, { name: "crown", size: 26 }) : i + 1,
          ),
        ),
      ),
  );
}

function App() {
  const [room, setRoom] = S<RoomState | null>(null),
    [name, setName] = S(savedName()),
    [code, setCode] = S(new URLSearchParams(location.search).get("room") || ""),
    [error, setError] = S(""),
    [connected, setConnected] = S(socket.connected || false),
    [busy, setBusy] = S(false),
    [color, setColor] = S(COLORS[0]),
    [size, setSize] = S(6),
    [tool, setTool] = S("pen"),
    [now, setNow] = S(Date.now()),
    [settings, setSettings] = S({ ...DEFAULTS }),
    [notice, setNotice] = S(""),
    [rejoin, setRejoin] = S(false),
    [confirm, setConfirm] = S<Confirmation | null>(null),
    [celebrating, setCelebrating] = S(false),
    [expanded, setExpanded] = S(false);
  const roomRef = R<RoomState | null>(null),
    canvasApi = R<CanvasApi | null>(null),
    intentionalLeave = R(false),
    celebrateTimer = R<ReturnType<typeof setTimeout> | undefined>(undefined),
    noticeTimer = R<ReturnType<typeof setTimeout> | undefined>(undefined),
    pendingTimers = R(new Set<ReturnType<typeof setTimeout>>()),
    playerNodes = R(new Map<string, HTMLElement>()),
    playerPositions = R(new Map<string, DOMRect>()),
    expandButton = R<HTMLButtonElement | null>(null);
  E(() => {
    const onConnect = () => {
      setConnected(true);
      setBusy(false);
    };
    const onDisconnect = () => {
      setConnected(false);
      setExpanded(false);
      setBusy(false);
      canvasApi.current?.cancel();
      if (!intentionalLeave.current && roomRef.current) {
        setCode(roomRef.current.code);
        setRejoin(true);
        setError(
          "Connection interrupted. Your seat and score could not be saved. Rejoin when the room is in the lobby, or create a new room.",
        );
      }
      setRoom(null);
      roomRef.current = null;
    };

    const onState = (r: RoomState) => {
      const prev = roomRef.current;
      if (!prev) window.scrollTo({ top: 0, behavior: "instant" });
      if (
        (r.guessed.includes(socket.id || "") &&
          !prev?.guessed.includes(socket.id || "")) ||
        (r.phase === "finished" && prev?.phase !== "finished")
      ) {
        setCelebrating(true);
        clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrating(false), 3000);
      }
      roomRef.current = r;
      setRoom(r);
      setCode(r.code);
      setRejoin(false);
      setNow(Date.now());
    };
    const onError = () =>
      setError(
        "The game server is taking a little longer to connect. We’re retrying…",
      );
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("connect_error", onError);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(t);
      clearTimeout(celebrateTimer.current);
      clearTimeout(noticeTimer.current);
      pendingTimers.current.forEach(clearTimeout);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("connect_error", onError);
    };
  }, []);
  E(() => {
    if (!expanded || !room) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setExpanded(false);
        expandButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, !!room]);
  E(() => {
    const nextPositions = new Map();
    playerNodes.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect();
      nextPositions.set(id, rect);
      const old = playerPositions.current.get(id);
      if (
        old &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        (old.y !== rect.y || old.x !== rect.x)
      )
        node.animate(
          [
            {
              transform: `translate(${old.x - rect.x}px, ${old.y - rect.y}px)`,
            },
            { transform: "translate(0,0)" },
          ],
          { duration: 350, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
    });

    playerPositions.current = nextPositions;
  }, [room?.players]);
  const act: Act = (type, extra = {}, done = () => {}) => {
    if (!socket.connected) {
      setError("Still reconnecting. Give us a moment.");
      done(false);
      return;
    }
    if (type !== "stroke") setError("");
    let settled = false;
    const timer = setTimeout(() => {
      pendingTimers.current.delete(timer);
      if (settled) return;
      settled = true;
      setError(
        "That action took too long. Check your connection before trying again.",
      );
      done(false);
    }, 7000);
    pendingTimers.current.add(timer);
    socket.emit("action", { type, ...extra } as GameAction, (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingTimers.current.delete(timer);
      if (result?.error)
        setError(
          result.error === "Room not found." &&
            "random" in extra &&
            extra.random
            ? "No public rooms are open yet. Create a room and switch off “Private party” to start one."
            : result.error,
        );
      done(!result?.error);
    });
  };
  const join: Join = (type, extra = {}) => {
    if (busy) return;
    if (!name.trim()) {
      setError("Every great artist needs a name. Add your nickname first.");
      return;
    }
    if (
      type === "join" &&
      !extra.random &&
      !/^[a-f0-9]{8}$/i.test(code.trim())
    ) {
      setError(
        "Room codes have 8 letters and numbers. Check the code your friend sent.",
      );
      return;
    }
    try {
      localStorage.setItem("scribble-name", name.trim());
    } catch {}
    setBusy(true);
    if (type === "create")
      act("create", { name: name.trim(), settings }, () => setBusy(false));
    else
      act("join", { name: name.trim(), code: code.trim(), ...extra }, () =>
        setBusy(false),
      );
  };

  const toast = (message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  };
  const invite = async () => {
    if (!room) return;
    const url = location.origin + "/?room=" + room.code;
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied. Go gather your gang!");
    } catch {
      setConfirm({ type: "invite", url });
    }
  };

  const leave = () => {
    intentionalLeave.current = true;
    socket.disconnect();
    setRoom(null);
    roomRef.current = null;
    setRejoin(false);
    setError("");
    setCode("");
    history.replaceState(null, "", location.pathname);
    socket.connect();
    intentionalLeave.current = false;
    setConfirm(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const drawer = room?.drawer === socket.id,
    host = room?.host === socket.id,
    canDraw = drawer && room?.phase === "drawing" && connected;
  const selectionSeconds = Math.max(
    0,
    Math.min(15, Math.ceil(((room?.deadline || now) - now) / 1000)),
  );
  const seconds = Math.max(
    0,
    Math.ceil(((room?.deadline || now) - now) / 1000),
  );
  const ranked = room
    ? [...room.players].sort((a, b) => b.score - a.score)
    : [];
  const currentArtist =
    room?.players.find((p) => p.id === room.drawer)?.name || "The next artist";
  const phaseLabel = {
    lobby: "THE PRE-PARTY",
    choosing: "A LITTLE SUSPENSE",
    drawing: "LET THE SCRIBBLING BEGIN",
    reveal: "THE BIG REVEAL",
    finished: "THAT’S A MASTERPIECE",
  };
  const button = (
    label: string,
    onClick: () => void,
    variant = "primary",
    disabled = false,
    icon?: string,
  ) => h(Button, { onClick, variant, disabled, icon }, label);
  return h(
    "div",
    {
      className: cn(
        "shell",
        room && "in-room",
        expanded && room && "board-expanded",
      ),
    },
    h(
      "header",
      { className: "site-header" },
      h(
        "a",
        {
          className: "brand",
          href: "/",
          onClick: (e: MouseEvent<HTMLAnchorElement>) => {
            if (room) {
              e.preventDefault();
              setConfirm({ type: "leave" });
            }
          },
        },
        h(
          "span",
          { className: "brand-icon" },
          h(Icon, { name: "pencil", size: 26 }),
        ),
        h(
          "span",
          null,
          "scribble",
          h("span", { className: "brand-room" }, "room"),
          h("span", { className: "brand-dot" }, "."),
        ),
      ),
      h(
        "nav",
        null,
        !room &&
          h(
            "a",
            { href: "#how-to", className: "how-link" },
            "How to play",
            h("span", null, "↗"),
          ),
        h(
          "span",
          { className: "connection" },
          h("i", { className: connected ? "online" : "" }),
          connected ? "All systems doodle" : "Connecting…",
        ),
        room &&
          h(
            "button",
            {
              className: "icon-button",
              title: "Leave room",
              "aria-label": "Leave room",
              onClick: () => setConfirm({ type: "leave" }),
            },
            h(Icon, { name: "exit" }),
          ),
      ),
    ),
    error &&
      h(
        "div",
        { className: "error", role: "alert" },
        h("span", null, error),
        h(
          "button",
          { "aria-label": "Dismiss error", onClick: () => setError("") },
          h(Icon, { name: "close", size: 18 }),
        ),
      ),
    notice &&
      h(
        "div",
        { className: "toast", role: "status" },
        h(Icon, { name: "check" }),
        notice,
      ),
    !room
      ? h(Welcome, {
          name,
          setName,
          code,
          setCode,
          settings,
          setSettings,
          join,
          busy,
          connected,
          rejoin,
        })
      : h(
          "main",
          { className: "game-main" },
          h(
            "div",
            { className: "game-heading" },
            h(
              "div",
              null,
              h("span", { className: "eyebrow" }, phaseLabel[room.phase]),
              h(
                "h2",
                null,
                room.phase === "lobby"
                  ? "A room full of possibilities."
                  : room.phase === "finished"
                    ? "A round of applause."
                    : "Good company. Questionable art.",
              ),
            ),
            h(
              "div",
              { className: "room-invite" },
              h(
                "span",
                { className: "room-code" },
                h("small", null, "ROOM CODE"),
                room.code,
              ),
              button("Invite friends", invite, "secondary", false, "copy"),
            ),
          ),
          h(
            "div",
            { className: "game-grid" },
            h(
              "aside",
              { className: "card players" },
              h(
                "h3",
                null,
                "The little art club",
                h(
                  "span",
                  { className: "count" },
                  room.players.length + "/" + room.settings.maxPlayers,
                ),
              ),
              h(
                "div",
                { className: "player-list" },
                ...ranked.map((p, i) =>
                  h(
                    "div",
                    {
                      className: cn(
                        "player",
                        p.id === room.drawer &&
                          room.phase === "drawing" &&
                          "is-drawer",
                        room.guessed.includes(p.id) && "has-guessed",
                      ),
                      key: p.id,
                      ref: (node) => {
                        if (node) playerNodes.current.set(p.id, node);
                        else playerNodes.current.delete(p.id);
                      },
                    },
                    h("span", { className: "rank" }, i + 1),
                    h(Avatar, { seed: p.name }),
                    h(
                      "div",
                      { className: "player-info" },
                      h(
                        "strong",
                        null,
                        p.name,
                        p.id === socket.id &&
                          h("span", { className: "you" }, " you"),
                      ),
                      h(
                        "small",
                        null,
                        p.id === room.drawer &&
                          ["drawing", "choosing"].includes(room.phase)
                          ? "✎ The artist"
                          : room.guessed.includes(p.id)
                            ? "✓ Nailed it!"
                            : p.id === room.host
                              ? "♛ Party host"
                              : p.ready
                                ? "✓ Ready to roll"
                                : "Here for the doodles",
                      ),
                    ),
                    h(
                      "b",
                      { className: "score" },
                      p.score,
                      h("small", null, "pts"),
                    ),
                  ),
                ),
              ),
              h(
                "div",
                { className: "room-summary" },
                h("span", { className: "eyebrow" }, "THE GAME PLAN"),
                h(
                  "div",
                  null,
                  h(Icon, { name: "pencil", size: 16 }),
                  room.settings.rounds + " rounds",
                ),
                h(
                  "div",
                  null,
                  h(Icon, { name: "clock", size: 16 }),
                  room.settings.drawTime + " seconds to shine",
                ),
                h(
                  "div",
                  null,
                  h(Icon, { name: "star", size: 16 }),
                  room.settings.mode === "hidden"
                    ? "Mystery words"
                    : room.settings.hints + " letter hints",
                ),
                h(
                  "span",
                  { className: "privacy-tag" },
                  room.settings.private ? "INVITE ONLY" : "OPEN TO EVERYONE",
                ),
              ),
            ),
            h(
              "section",
              { className: "board card" },
              h(
                "div",
                { className: "board-top" },
                h(
                  "span",
                  { className: "round-label" },
                  "ROUND",
                  h(
                    "b",
                    null,
                    Math.min(room.round || 1, room.settings.rounds),
                    h("small", null, " / " + room.settings.rounds),
                  ),
                ),
                h(
                  "div",
                  { className: "word-wrap" },
                  h(
                    "span",
                    { className: "word-caption" },
                    room.phase === "drawing"
                      ? drawer
                        ? "YOUR SECRET WORD"
                        : "GUESS THE WORD"
                      : room.phase === "reveal"
                        ? "THE WORD WAS"
                        : room.phase === "choosing"
                          ? "NEXT MASTERPIECE LOADING"
                          : "A BLANK CANVAS. ENDLESS POSSIBILITIES.",
                  ),
                  h(
                    "strong",
                    {
                      className: cn(
                        "word",
                        room.phase === "drawing" && !drawer && "masked",
                      ),
                    },
                    room.phase === "drawing"
                      ? drawer
                        ? room.word
                        : room.mask
                      : room.phase === "reveal"
                        ? room.word
                        : room.phase === "choosing"
                          ? "Choosing a word…"
                          : "Make a little happy mess.",
                  ),
                ),
                h(
                  "span",
                  {
                    className: cn(
                      "timer",
                      seconds <= 10 && room.phase === "drawing" && "urgent",
                    ),
                    "aria-label": room.deadline
                      ? seconds + " seconds remaining"
                      : "Waiting to start",
                  },
                  h(Icon, { name: "clock", size: 18 }),
                  room.deadline ? seconds : "—",
                ),
                h(
                  "button",
                  {
                    ref: expandButton,
                    className: "expand-board",
                    type: "button",
                    title: expanded ? "Return to game" : "Expand drawing board",
                    "aria-label": expanded
                      ? "Return to game"
                      : "Expand drawing board",
                    "aria-pressed": expanded,
                    onClick: () => setExpanded(!expanded),
                  },
                  h(Icon, { name: expanded ? "collapse" : "expand", size: 20 }),
                ),
              ),
              h(
                "div",
                { className: "time-track" },
                h("div", {
                  style: {
                    width:
                      (room.deadline
                        ? Math.min(
                            100,
                            (seconds /
                              (room.phase === "choosing"
                                ? 15
                                : room.phase === "reveal"
                                  ? 4
                                  : room.settings.drawTime)) *
                              100,
                          )
                        : 100) + "%",
                  },
                }),
              ),
              h(
                "div",
                { className: "canvas-wrap" },
                h(DrawingCanvas, {
                  room,
                  canDraw,
                  color,
                  size,
                  tool,
                  act,
                  canvasApi,
                }),
                room.phase !== "drawing" &&
                  h(
                    "div",
                    { className: cn("overlay", "phase-" + room.phase) },
                    h(
                      "div",
                      null,
                      room.phase === "lobby"
                        ? h(
                            React.Fragment,
                            null,
                            h(
                              "div",
                              { className: "lobby-illustration" },
                              h(Avatar, { seed: "Sunny", size: 75 }),
                              h("span", null, "+"),
                              h(Avatar, { seed: "Benny", size: 75 }),
                              h("span", { className: "orbit-star" }, "✦"),
                            ),
                            h(
                              "span",
                              { className: "eyebrow" },
                              "GREAT ART STARTS WITH GREAT COMPANY",
                            ),
                            h("h2", null, "The gang’s almost here."),
                            h(
                              "p",
                              null,
                              "Send the link. Pick your people. Let’s see what happens.",
                            ),
                            h(
                              "div",
                              { className: "lobby-status" },
                              h("i"),
                              room.players.length < 2
                                ? "Waiting for at least one more scribbler…"
                                : room.players.length +
                                    " scribblers. One very good time.",
                            ),
                            host
                              ? button(
                                  "Let’s play",
                                  () => act("start"),
                                  "primary",
                                  room.players.length < 2 || busy,
                                  "arrow",
                                )
                              : button(
                                  room.players.find((p) => p.id === socket.id)
                                    ?.ready
                                    ? "Ready to roll ✓"
                                    : "I’m ready!",
                                  () => act("ready"),
                                  "green",
                                ),
                            !host &&
                              h(
                                "small",
                                { className: "muted-block" },
                                "Your host will start the game.",
                              ),
                          )
                        : room.phase === "choosing"
                          ? h(
                              React.Fragment,
                              null,
                              h("span", { className: "overlay-symbol" }, "✦"),
                              h(
                                "h2",
                                null,
                                drawer
                                  ? "Pick your next masterpiece."
                                  : currentArtist + " is choosing…",
                              ),
                              h(
                                "p",
                                null,
                                drawer
                                  ? "Trust your gut. Or choose the weird one."
                                  : "Stretch those guessing muscles. You’re up in a moment.",
                              ),
                              h(
                                "div",
                                {
                                  className: cn(
                                    "selection-countdown",
                                    selectionSeconds <= 5 && "urgent",
                                  ),
                                  role: "timer",
                                  "aria-label":
                                    "Time remaining to choose a word",
                                },
                                h("strong", null, selectionSeconds),
                                h("span", null, "seconds to choose"),
                              ),
                              h(
                                "div",
                                { className: "choices" },
                                ...(drawer
                                  ? room.options.map((word) =>
                                      h(
                                        Button,
                                        {
                                          key: word,
                                          variant: "secondary",
                                          onClick: () =>
                                            act("choose", { word }),
                                        },
                                        word,
                                      ),
                                    )
                                  : []),
                              ),
                              h(
                                "small",
                                { className: "muted-block" },
                                drawer
                                  ? "Can’t decide? We’ll pick when the timer runs out."
                                  : "The artist has 15 seconds to choose.",
                              ),
                            )
                          : room.phase === "reveal"
                            ? h(
                                React.Fragment,
                                null,
                                h(
                                  "span",
                                  { className: "overlay-symbol" },
                                  room.guessed.length ? "✧" : "⌛",
                                ),
                                h(
                                  "span",
                                  { className: "eyebrow" },
                                  "PENCILS DOWN. MYSTERY SOLVED.",
                                ),
                                h("h2", null, room.word),
                                h(
                                  "p",
                                  null,
                                  room.guessed.length +
                                    " of " +
                                    (room.players.length - 1) +
                                    " players cracked this masterpiece.",
                                ),
                                h(
                                  "div",
                                  { className: "reveal-scores" },
                                  ...ranked
                                    .slice(0, 3)
                                    .map((p) =>
                                      h(
                                        "span",
                                        { key: p.id },
                                        h(Avatar, { seed: p.name, size: 28 }),
                                        p.name,
                                        h("b", null, p.score + " pts"),
                                      ),
                                    ),
                                ),
                                h(
                                  "small",
                                  { className: "muted-block" },
                                  "Next artist in " + seconds + "…",
                                ),
                              )
                            : h(
                                React.Fragment,
                                null,
                                h(
                                  "span",
                                  { className: "eyebrow" },
                                  "SOME SERIOUSLY QUESTIONABLE TALENT",
                                ),
                                h(
                                  "h2",
                                  null,
                                  ranked
                                    .filter((p) => p.score === ranked[0]?.score)
                                    .map((p) => p.name)
                                    .join(" & ") +
                                    " take" +
                                    (ranked.filter(
                                      (p) => p.score === ranked[0]?.score,
                                    ).length === 1
                                      ? "s"
                                      : "") +
                                    " the crown!",
                                ),
                                h(Podium, { players: room.players }),
                                host
                                  ? button(
                                      "One more masterpiece?",
                                      () => act("start"),
                                      "primary",
                                      false,
                                      "arrow",
                                    )
                                  : h(
                                      "p",
                                      null,
                                      "Waiting for the host to start a rematch.",
                                    ),
                              ),
                    ),
                  ),
              ),
              h(
                "div",
                { className: "toolbar" },
                h(
                  "div",
                  { className: "tool-group" },
                  h(
                    "button",
                    {
                      className: cn("tool", tool === "pen" && "selected"),
                      disabled: !canDraw,
                      "aria-label": "Pen",
                      "aria-pressed": tool === "pen",
                      title: "Pen",
                      onClick: () => setTool("pen"),
                    },
                    h(Icon, { name: "pencil" }),
                  ),
                  h(
                    "button",
                    {
                      className: cn("tool", tool === "eraser" && "selected"),
                      disabled: !canDraw,
                      "aria-label": "Eraser",
                      "aria-pressed": tool === "eraser",
                      title: "Eraser",
                      onClick: () => setTool("eraser"),
                    },
                    h(Icon, { name: "eraser" }),
                  ),
                ),
                h(
                  "div",
                  { className: "colors", "aria-label": "Ink colors" },
                  ...COLORS.map((c, i) =>
                    h(
                      "button",
                      {
                        key: c,
                        title: [
                          "Forest",
                          "White",
                          "Tangerine",
                          "Sunshine",
                          "Lime",
                          "Teal",
                          "Sky",
                          "Lilac",
                          "Pink",
                          "Brown",
                        ][i],
                        "aria-label":
                          [
                            "Forest",
                            "White",
                            "Tangerine",
                            "Sunshine",
                            "Lime",
                            "Teal",
                            "Sky",
                            "Lilac",
                            "Pink",
                            "Brown",
                          ][i] + " ink",
                        "aria-pressed": color === c && tool === "pen",
                        disabled: !canDraw,
                        className: cn(
                          "swatch",
                          color === c && tool === "pen" && "selected",
                        ),
                        style: { background: c },
                        onClick: () => {
                          setColor(c);
                          setTool("pen");
                        },
                      },
                      color === c &&
                        tool === "pen" &&
                        h(Icon, {
                          name: "check",
                          size: 14,
                          style: {
                            color: c === COLORS[0] ? "white" : "#20382b",
                          },
                        }),
                    ),
                  ),
                ),
                h(
                  "label",
                  { className: "brush-size" },
                  h("span", null, "Brush ", h("b", null, size)),
                  h("input", {
                    type: "range",
                    min: 1,
                    max: 40,
                    value: size,
                    disabled: !canDraw,
                    onChange: (e) => setSize(Number(e.target.value)),
                  }),
                ),
                h(
                  "div",
                  { className: "tool-group end-tools" },
                  h(
                    "button",
                    {
                      className: "tool",
                      disabled: !canDraw,
                      title: "Undo last stroke",
                      "aria-label": "Undo last stroke",
                      onClick: () => act("undo"),
                    },
                    h(Icon, { name: "undo" }),
                  ),
                  h(
                    "button",
                    {
                      className: "tool",
                      disabled: !canDraw,
                      title: "Clear canvas",
                      "aria-label": "Clear canvas",
                      onClick: () => setConfirm({ type: "clear" }),
                    },
                    h(Icon, { name: "trash" }),
                  ),
                ),
              ),
              h(
                "div",
                { className: "canvas-caption" },
                h("span", { className: "drawing-dot" }),
                room.phase === "drawing"
                  ? drawer
                    ? "You’re the artist. Let your pencil do the talking."
                    : currentArtist + " is making a masterpiece. Probably."
                  : room.phase === "lobby"
                    ? "Your next masterpiece is just a few friends away."
                    : "Every scribble tells a story.",
              ),
            ),
            h(
              "aside",
              { className: "card chat" },
              h(Chat, { room, drawer, act, connected }),
            ),
          ),
        ),
    h(
      "footer",
      null,
      h("span", null, "A little less scrolling. A little more scribbling."),
      h("span", null, "Made for happy accidents. ", h("b", null, "✦")),
    ),
    celebrating &&
      h(
        "div",
        { className: "confetti", "aria-hidden": true },
        ...Array.from({ length: 28 }, (_, i) =>
          h("i", {
            key: i,
            style: {
              left: ((i * 37) % 100) + "%",
              background: COLORS[2 + (i % 7)],
              animationDelay: (i % 6) * 0.09 + "s",
              transform: "rotate(" + i * 29 + "deg)",
            },
          }),
        ),
      ),
    confirm &&
      h(ConfirmDialog, {
        confirm,
        onCancel: () => setConfirm(null),
        onAccept: () => {
          if (confirm.type === "leave") leave();
          else {
            act("clear");
            setConfirm(null);
          }
        },
      }),
  );
}

function ConfirmDialog({
  confirm,
  onCancel,
  onAccept,
}: {
  confirm: Confirmation;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const dialog = R<HTMLDialogElement | null>(null);
  E(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return h(
    "dialog",
    {
      ref: dialog,
      className: "confirm-dialog",
      onCancel: (e: SyntheticEvent<HTMLDialogElement>) => {
        e.preventDefault();
        onCancel();
      },
    },
    h(
      "span",
      { className: "eyebrow" },
      confirm.type === "invite"
        ? "THE MORE THE MERRIER"
        : "JUST A LITTLE CHECK",
    ),
    h(
      "h2",
      null,
      confirm.type === "leave"
        ? "Heading out?"
        : confirm.type === "clear"
          ? "A fresh canvas?"
          : "Pass this to your people.",
    ),
    h(
      "p",
      null,
      confirm.type === "leave"
        ? "Leaving gives up your seat and score. You can join again when the room is in the lobby."
        : confirm.type === "clear"
          ? "This clears the whole drawing for everyone. It cannot be undone."
          : "Copy the invitation below to bring a friend.",
    ),
    confirm.type === "invite" &&
      h("input", {
        value: confirm.url,
        readOnly: true,
        "aria-label": "Invite link",
        onFocus: (e) => e.target.select(),
      }),
    h(
      "div",
      { className: "dialog-actions" },
      h(
        Button,
        { variant: "secondary", onClick: onCancel },
        confirm.type === "invite" ? "Done" : "Keep playing",
      ),
      confirm.type !== "invite" &&
        h(
          Button,
          { onClick: onAccept },
          confirm.type === "leave" ? "Leave room" : "Clear canvas",
        ),
    ),
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(h(App));

export type { CanvasApi, DrawingCanvasProps };
export type CanvasComponent = typeof DrawingCanvas;
