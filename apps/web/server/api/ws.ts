import { defineWebSocketHandler } from 'nitro'
import { REACTIONS, type ClientMessage, type ServerMessage } from '../../shared/types/realtime'
import { createIdentity } from '../utils/identity'
import { othersOf, recallIdentity, rememberIdentity } from '../utils/presence'

const CHANNEL = 'room'

/** Clamp an untrusted coordinate into the normalized 0..1 range, or reject it. */
function toUnit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : null
}

function send(peer: { send: (data: string) => void }, msg: ServerMessage) {
  peer.send(JSON.stringify(msg))
}

type RoomHooks = NonNullable<Parameters<typeof defineWebSocketHandler>[0]>

/**
 * The room: every hook the WebSocket at /api/ws runs. Exported beside the
 * handler so the tests can drive the same hooks through crossws's Cloudflare
 * adapter. Nothing is kept in module memory: on Workers the room is one
 * Durable Object that may hibernate between messages, so each connection's
 * identity lives with its socket (server/utils/presence.ts) and the roster is
 * read from the live sockets.
 */
export const room = {
  open(peer) {
    const identity = createIdentity()
    rememberIdentity(peer, identity)

    peer.subscribe(CHANNEL)

    // The roster excludes self (the client tracks self separately via
    // `welcome.self`).
    const roster = othersOf(peer)

    send(peer, { t: 'welcome', self: identity, peers: roster })
    peer.publish(CHANNEL, JSON.stringify({ t: 'join', peer: identity } satisfies ServerMessage))
  },
  message(peer, message) {
    const identity = recallIdentity(peer)
    if (!identity) return

    let msg: ClientMessage
    try {
      msg = JSON.parse(message.text()) as ClientMessage
    }
    catch {
      return
    }

    switch (msg.t) {
      case 'cursor': {
        const x = toUnit(msg.x)
        const y = toUnit(msg.y)
        if (x === null || y === null) return
        peer.publish(CHANNEL, JSON.stringify({ t: 'cursor', id: identity.id, x, y } satisfies ServerMessage))
        break
      }
      case 'reaction': {
        const x = toUnit(msg.x)
        const y = toUnit(msg.y)
        if (x === null || y === null) return
        if (!(REACTIONS as readonly string[]).includes(msg.emoji)) return
        peer.publish(CHANNEL, JSON.stringify({ t: 'reaction', id: identity.id, emoji: msg.emoji, x, y } satisfies ServerMessage))
        break
      }
      case 'ping':
        send(peer, { t: 'pong' })
        break
    }
  },
  close(peer) {
    const identity = recallIdentity(peer)
    if (!identity) return
    peer.publish(CHANNEL, JSON.stringify({ t: 'leave', id: identity.id } satisfies ServerMessage))
  },
  error(peer, error) {
    console.error('[realtime] ws error', peer.id, error)
    const identity = recallIdentity(peer)
    if (!identity) return
    peer.publish(CHANNEL, JSON.stringify({ t: 'leave', id: identity.id } satisfies ServerMessage))
  },
} satisfies RoomHooks

export default defineWebSocketHandler(room)
