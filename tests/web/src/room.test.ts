// The room at /api/ws, driven through crossws's own Cloudflare adapter — the
// code that runs it inside the Durable Object on Workers — over a stand-in
// Durable Object with the WebSocket Hibernation API's shape. Two things are
// proven here that a live room only shows when it goes quiet:
//
// - the room keeps nothing in module memory: a wake (a fresh adapter, fresh
//   socket wrappers, every peer's `context` gone, only each socket's
//   serialized attachment kept — what the runtime hands back after
//   hibernating the object) still routes cursors with their sender's id,
//   rebuilds the roster for the next joiner, and announces a leave;
// - each identity is stored in its socket's attachment, beside crossws's
//   own state (peer id, URL, topics), which crossws then keeps writing.
import cloudflareAdapter from "crossws/adapters/cloudflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { room } from "@web/server/api/ws";

interface Wire {
  attachment: unknown;
  received: unknown[];
  closed: boolean;
}

/** A hibernatable WebSocket as the Durable Object sees it: a wrapper over one wire. */
class Socket {
  constructor(readonly wire: Wire) {}
  serializeAttachment(value: unknown) {
    this.wire.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return this.wire.attachment === undefined ? null : structuredClone(this.wire.attachment);
  }
  send(data: string | ArrayBuffer | Uint8Array) {
    this.wire.received.push(JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)));
  }
  close() {
    this.wire.closed = true;
  }
}

const newWire = (): Wire => ({ attachment: undefined, received: [], closed: false });

/** The stand-in Durable Object: `ctx.acceptWebSocket` / `ctx.getWebSockets`, and a wake. */
function durableObject() {
  let sockets: Socket[] = [];
  const obj = {
    ctx: {
      acceptWebSocket(ws: Socket) {
        sockets.push(ws);
      },
      getWebSockets() {
        return sockets.filter((s) => !s.wire.closed);
      },
    },
  };
  return {
    obj,
    /** The runtime's hibernation: the same wires, new wrappers, no JS state on them. */
    wake() {
      sockets = sockets.filter((s) => !s.wire.closed).map((s) => new Socket(s.wire));
    },
    socketOf(wire: Wire) {
      const s = sockets.find((x) => x.wire === wire);
      if (!s) throw new Error("no socket on that wire");
      return s;
    },
  };
}

type Adapter = ReturnType<typeof cloudflareAdapter>;
const URL_WS = "https://room.test/api/ws";

async function connect(adapter: Adapter, obj: unknown): Promise<Wire> {
  const res = (await adapter.handleDurableUpgrade(obj as never, new Request(URL_WS))) as unknown as { status: number };
  expect(res.status).toBe(101);
  return lastServerWire!;
}
const say = (adapter: Adapter, d: ReturnType<typeof durableObject>, wire: Wire, msg: unknown) =>
  adapter.handleDurableMessage(d.obj as never, d.socketOf(wire) as never, JSON.stringify(msg));
const leave = (adapter: Adapter, d: ReturnType<typeof durableObject>, wire: Wire) => {
  const s = d.socketOf(wire);
  s.close();
  return adapter.handleDurableClose(d.obj as never, s as never, 1000, "bye", true);
};
interface Identity {
  id: string;
  name: string;
  color: string;
}
/** A frame the room sent, as the client reads it (shared/types/realtime.ts). */
interface Frame {
  t: string;
  self: Identity;
  peers: Identity[];
  peer: Identity;
  id: string;
}
const of = (wire: Wire, t: string) => wire.received.filter((m) => (m as Frame).t === t) as Frame[];
const welcome = (wire: Wire) => of(wire, "welcome")[0]!;

let lastServerWire: Wire | undefined;
beforeEach(() => {
  // The Workers runtime's WebSocketPair and its 101 Response, which Node lacks.
  vi.stubGlobal(
    "WebSocketPair",
    class {
      constructor() {
        lastServerWire = newWire();
        return [new Socket(newWire()), new Socket(lastServerWire)];
      }
    },
  );
  const RealResponse = globalThis.Response;
  vi.stubGlobal(
    "Response",
    class {
      status = 0;
      constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
        if (init?.status === 101) {
          this.status = 101;
          return;
        }
        return new RealResponse(body, init) as never;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const fresh = () => cloudflareAdapter({ hooks: room as never });

describe("the room on crossws's Cloudflare adapter", () => {
  it("welcomes each peer with the others, and announces it to them", async () => {
    const d = durableObject();
    const ws = fresh();
    const a = await connect(ws, d.obj);
    expect(welcome(a).peers).toEqual([]);
    const self = welcome(a).self;
    expect(self.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(self.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(self.color).toMatch(/^hsl\(\d+ 85% 60%\)$/);

    const b = await connect(ws, d.obj);
    expect(welcome(b).peers).toEqual([self]);
    expect(of(a, "join")).toEqual([{ t: "join", peer: welcome(b).self }]);
    expect(of(b, "join")).toEqual([]);
  });

  it("fans a cursor out to the others, clamped to 0..1, and never back to its sender", async () => {
    const d = durableObject();
    const ws = fresh();
    const a = await connect(ws, d.obj);
    const b = await connect(ws, d.obj);
    const c = await connect(ws, d.obj);
    await say(ws, d, a, { t: "cursor", x: 0.25, y: 1.7 });
    const expected = { t: "cursor", id: welcome(a).self.id, x: 0.25, y: 1 };
    expect(of(b, "cursor")).toEqual([expected]);
    expect(of(c, "cursor")).toEqual([expected]);
    expect(of(a, "cursor")).toEqual([]);
  });

  it("drops what it must not relay: a bad coordinate, an unknown emoji, a frame that is not JSON", async () => {
    const d = durableObject();
    const ws = fresh();
    const a = await connect(ws, d.obj);
    const b = await connect(ws, d.obj);
    await say(ws, d, a, { t: "cursor", x: "1", y: 0 });
    await say(ws, d, a, { t: "cursor", x: Number.NaN, y: 0 });
    await say(ws, d, a, { t: "reaction", emoji: "💩", x: 0.5, y: 0.5 });
    await ws.handleDurableMessage(d.obj as never, d.socketOf(a) as never, "not json");
    expect(b.received.filter((m) => !["welcome"].includes((m as { t: string }).t))).toEqual([]);
    await say(ws, d, a, { t: "reaction", emoji: "🔥", x: 0.5, y: 0.5 });
    expect(of(b, "reaction")).toEqual([{ t: "reaction", id: welcome(a).self.id, emoji: "🔥", x: 0.5, y: 0.5 }]);
  });

  it("answers a ping with a pong to its sender alone", async () => {
    const d = durableObject();
    const ws = fresh();
    const a = await connect(ws, d.obj);
    const b = await connect(ws, d.obj);
    await say(ws, d, a, { t: "ping" });
    expect(of(a, "pong")).toHaveLength(1);
    expect(of(b, "pong")).toHaveLength(0);
  });

  it("announces a leave to everyone still in the room", async () => {
    const d = durableObject();
    const ws = fresh();
    const a = await connect(ws, d.obj);
    const b = await connect(ws, d.obj);
    const c = await connect(ws, d.obj);
    await leave(ws, d, b);
    const expected = [{ t: "leave", id: welcome(b).self.id }];
    expect(of(a, "leave")).toEqual(expected);
    expect(of(c, "leave")).toEqual(expected);
    const e = await connect(ws, d.obj);
    expect(welcome(e).peers).toEqual([welcome(a).self, welcome(c).self]);
  });

  it("keeps each identity in its socket's attachment, beside crossws's own state", async () => {
    const d = durableObject();
    const ws = fresh();
    const a = await connect(ws, d.obj);
    const att = a.attachment as { p: unknown; i: string; u: string; t: Set<string> };
    expect(att.p).toEqual(welcome(a).self);
    expect(att.u).toBe(URL_WS);
    expect([...att.t]).toEqual(["room"]);
    expect(typeof att.i).toBe("string");
  });
});

describe("after the Durable Object hibernates", () => {
  it("still knows every peer: cursors carry their sender, the roster rebuilds, leaves are announced", async () => {
    const d = durableObject();
    const before = fresh();
    const a = await connect(before, d.obj);
    const b = await connect(before, d.obj);
    const selfA = welcome(a).self;
    const selfB = welcome(b).self;

    // The object is evicted: a new isolate (a new adapter, no module state),
    // new socket wrappers, every peer's context gone. Only the wires and
    // their attachments remain.
    d.wake();
    const after = fresh();

    await say(after, d, a, { t: "cursor", x: 0.1, y: 0.2 });
    expect(of(b, "cursor")).toEqual([{ t: "cursor", id: selfA.id, x: 0.1, y: 0.2 }]);

    const c = await connect(after, d.obj);
    expect(welcome(c).peers).toEqual([selfA, selfB]);
    expect(of(a, "join").map((m) => m.peer.id)).toContain(welcome(c).self.id);

    await leave(after, d, b);
    expect(of(a, "leave")).toEqual([{ t: "leave", id: selfB.id }]);
    expect(of(c, "leave")).toEqual([{ t: "leave", id: selfB.id }]);
  });
});
