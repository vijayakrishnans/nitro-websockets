import type { Peer } from '../../shared/types/realtime'

/**
 * Where a connection's identity lives.
 *
 * On Workers every connection is a hibernatable WebSocket inside one Durable
 * Object (Nitro's cloudflare_durable preset, crossws's Cloudflare adapter).
 * When the room goes quiet the runtime evicts the object and keeps only the
 * sockets: module memory and `peer.context` are gone when it wakes, and each
 * socket keeps nothing but its serialized attachment. crossws already keeps
 * the peer's id, URL and topics there; this keeps the identity beside them,
 * so a cursor sent after a wake still carries its sender, and the roster is
 * read from the live sockets rather than a module Map.
 *
 * In `vite dev` (Node) there is no attachment and `peer.context` is enough.
 */

/** The parts of a crossws peer this reads. */
export interface Socket {
  readonly id: string
  readonly context: Record<string, unknown>
  readonly peers: Iterable<Socket>
}

interface DurableSocket {
  serializeAttachment: (value: unknown) => void
  deserializeAttachment: () => unknown
  /** crossws's in-memory copy of the attachment; it writes this back on subscribe. */
  _crosswsState?: Record<string, unknown>
}

/** The Durable Object's WebSocket under a peer, when there is one (crossws 0.4 keeps it at `_internal.ws`). */
function durableSocket(peer: Socket): DurableSocket | undefined {
  const ws = (peer as unknown as { _internal?: { ws?: Partial<DurableSocket> } })._internal?.ws
  return ws && typeof ws.serializeAttachment === 'function' ? (ws as DurableSocket) : undefined
}

/** Give a new connection its identity, in memory and in its socket's attachment. */
export function rememberIdentity(peer: Socket, identity: Peer): void {
  peer.context.identity = identity
  const ws = durableSocket(peer)
  if (!ws) return
  // Extend crossws's own state object rather than writing a new one: crossws
  // serializes that object whole whenever the peer subscribes.
  const state = ws._crosswsState ?? ((ws.deserializeAttachment() as Record<string, unknown> | null) ?? {})
  state.p = identity
  ws._crosswsState = state
  ws.serializeAttachment(state)
}

/** A connection's identity, from memory or, after a wake, from its attachment. */
export function recallIdentity(peer: Socket): Peer | undefined {
  const known = peer.context.identity as Peer | undefined
  if (known) return known
  const stored = (durableSocket(peer)?.deserializeAttachment() as { p?: Peer } | null)?.p
  if (stored) peer.context.identity = stored
  return stored
}

/** Everyone else in the room, read from the live connections. */
export function othersOf(peer: Socket): Peer[] {
  const roster: Peer[] = []
  for (const other of peer.peers) {
    if (other.id === peer.id) continue
    const identity = recallIdentity(other)
    if (identity) roster.push(identity)
  }
  return roster
}
