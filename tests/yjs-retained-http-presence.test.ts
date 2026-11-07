// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createRetainedHttpAwareness, createRetainedPresenceRegistry } from '../examples/backends/retained-http-presence';

it('expires silent presence without deleting a same-epoch session during a short outage', () => {
  let now = 0;
  const registry = createRetainedPresenceRegistry(2_500, () => now);
  const ada = registry.bind('paper', 'epoch');
  const grace = registry.bind('paper', 'epoch');
  const cursor = { fountain: { user: 'Grace' } };
  registry.exchange('paper', 'epoch', grace, cursor);
  expect(registry.exchange('paper', 'epoch', ada, null)).toEqual([[-2, cursor]]);
  now = 2_500;
  expect(registry.exchange('paper', 'epoch', ada, null)).toEqual([]);
  registry.exchange('paper', 'epoch', grace, cursor);
  expect(registry.exchange('paper', 'epoch', ada, null)).toEqual([[-2, cursor]]);
});

it('does not let another room, a retired epoch or an old leave clear the new peer', () => {
  const registry = createRetainedPresenceRegistry();
  const previous = registry.bind('paper', 'old');
  const active = registry.bind('paper', 'new');
  const observer = registry.bind('paper', 'new');
  registry.bind('other', 'new');
  registry.leave('paper', 'old', active);
  expect(() => registry.exchange('other', 'new', active, null)).toThrow('no longer active');
  expect(() => registry.exchange('paper', 'old', previous, null)).toThrow('no longer active');
  expect(() => registry.exchange('paper', 'new', previous, null)).toThrow('no longer active');
  const cursor = { fountain: { user: 'Ada' } };
  registry.exchange('paper', 'new', active, cursor);
  expect(registry.exchange('paper', 'new', observer, null)).toEqual([[-1, cursor]]);
  registry.leave('paper', 'new', active);
  expect(registry.exchange('paper', 'new', observer, null)).toEqual([]);
});

it('bounds per-peer payload and reclaims inactive admission slots', () => {
  let now = 0;
  const registry = createRetainedPresenceRegistry(2_500, () => now);
  const tokens = Array.from({ length: 64 }, () => registry.bind('paper', 'epoch'));
  expect(() => registry.bind('paper', 'epoch')).toThrow('capacity');
  expect(() => registry.exchange('paper', 'epoch', tokens[0], { value: 'x'.repeat(16_384) })).toThrow('Invalid presence state');
  now = 120_000;
  expect(registry.bind('paper', 'epoch')).toBeTruthy();
  expect(() => registry.exchange('paper', 'epoch', tokens[0], null)).toThrow('no longer active');
});

it('does not emit a view update for an unchanged heartbeat', () => {
  const presence = createRetainedHttpAwareness(7);
  const listener = vi.fn();
  presence.awareness.on('change', listener);
  presence.awareness.setLocalStateField('fountain', { user: 'local' });
  expect(presence.local()).toEqual({ fountain: { user: 'local' } });
  presence.replace([[-1, { fountain: { user: 'peer' } }]]);
  presence.replace([[-1, { fountain: { user: 'peer' } }]]);
  expect(listener).toHaveBeenCalledOnce();
  presence.replace([]);
  expect(listener).toHaveBeenCalledTimes(2);
  expect([...presence.awareness.getStates().keys()]).toEqual([7]);
});
