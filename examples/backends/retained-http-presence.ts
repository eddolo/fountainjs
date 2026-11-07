import type { YjsAwareness } from '../../src/yjs';

export type PresenceState = Record<string, unknown>;
export type PresencePeer = readonly [number, PresenceState];
export const presenceVisibilityMs = 2_500;
export const presenceRenewalMs = 1_000;
export const presenceLeaseMs = 120_000;
export const presenceCapacity = 64;

export function encodeRetainedPresence(state: PresenceState | null): string | null {
  if (state === null) return null;
  if (typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid presence state.');
  const encoded = JSON.stringify(state);
  if (!encoded || new TextEncoder().encode(encoded).length > 16_384) throw new Error('Invalid presence state.');
  return encoded;
}

/** Ephemeral adapter for the existing retained cursor/selection renderer. */
export function createRetainedHttpAwareness(clientID: number) {
  let local: PresenceState = {};
  let peers: readonly PresencePeer[] = [];
  let signature = '[]';
  const listeners = new Set<() => void>();
  const awareness: YjsAwareness = {
    clientID,
    getLocalState: () => local,
    getStates: () => new Map([[clientID, local], ...peers]),
    setLocalStateField(field, value) {
      local = { ...local };
      if (value === null) delete local[field];
      else local[field] = value;
    },
    on(_event, listener) { listeners.add(listener); },
    off(_event, listener) { listeners.delete(listener); },
  };
  return {
    awareness,
    local: () => Object.keys(local).length ? local : null,
    replace(received: readonly PresencePeer[]) {
      const next = received.filter(([id]) => id !== clientID);
      const digest = JSON.stringify(next);
      if (signature === digest) return;
      signature = digest;
      peers = next;
      listeners.forEach(listener => listener());
    },
  };
}

interface PeerLease {
  readonly id: number;
  seen: number;
  state: PresenceState | null;
}

/** Loopback host reference. Call only after authenticating and fencing the
 * room operation. Presence never enters the durable document checkpoint. */
export function createRetainedPresenceRegistry(ttl = presenceVisibilityMs, now = Date.now) {
  const rooms = new Map<string, { epoch: string; nextId: number; peers: Map<string, PeerLease> }>();

  function prune(peers: Map<string, PeerLease>, time: number) {
    for (const [token, peer] of peers) {
      if (time - peer.seen >= presenceLeaseMs) peers.delete(token);
    }
  }

  return {
    bind(key: string, epoch: string): string {
      let room = rooms.get(key);
      if (!room || room.epoch !== epoch) {
        room = { epoch, nextId: -1, peers: new Map() };
        rooms.set(key, room);
      }
      const time = now();
      prune(room.peers, time);
      if (room.peers.size >= presenceCapacity) throw new Error('Presence capacity exceeded.');
      const token = crypto.randomUUID();
      // Server-issued display ids cannot collide with the local Yjs client id.
      room.peers.set(token, { id: room.nextId--, seen: time, state: null });
      return token;
    },
    exchange(key: string, epoch: string, token: string, state: PresenceState | null): PresencePeer[] {
      const room = rooms.get(key);
      const time = now();
      if (room) prune(room.peers, time);
      const peer = room?.peers.get(token);
      if (!room || room.epoch !== epoch || !peer) throw new Error('Presence session is no longer active.');
      encodeRetainedPresence(state);
      peer.state = state;
      peer.seen = time;
      const visible: PresencePeer[] = [];
      for (const other of room.peers.values()) {
        if (other !== peer && other.state && time - other.seen < ttl) visible.push([other.id, other.state]);
      }
      return visible;
    },
    leave(key: string, epoch: string, token: string): void {
      const room = rooms.get(key);
      if (room?.epoch === epoch) room.peers.delete(token);
    },
    close(key: string): void { rooms.delete(key); },
  };
}
