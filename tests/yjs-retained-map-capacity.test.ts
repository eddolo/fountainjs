// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { retainedMapExceeds } from '../src/yjs/retained-map-capacity';

it('accepts the exact capacity without enumerating live keys and rejects the next live key', () => {
  const document = new Y.Doc(), map = document.getMap('pool');
  try {
    expect(retainedMapExceeds(map, 0)).toBe(false);
    expect(retainedMapExceeds(map, -1)).toBe(true);
    document.transact(() => { for (let index = 0; index < 1_000; index++) map.set(String(index), index); });
    const exact = vi.spyOn(map, 'size', 'get');
    for (let index = 0; index < 1_000; index++) expect(retainedMapExceeds(map, 1_000)).toBe(false);
    expect(exact).not.toHaveBeenCalled();
    map.set('overflow', true);
    expect(retainedMapExceeds(map, 1_000)).toBe(true);
    expect(exact).toHaveBeenCalledOnce();
  } finally { vi.restoreAllMocks(); document.destroy(); }
});

it('falls back to live size when deleted physical keys exceed capacity', () => {
  const document = new Y.Doc(), map = document.getMap('pool');
  try {
    document.transact(() => {
      map.set('kept', true); map.set('removed', true); map.delete('removed');
    });
    expect(map._map.size).toBe(2); expect(map.size).toBe(1);
    const exact = vi.spyOn(map, 'size', 'get');
    expect(retainedMapExceeds(map, 1)).toBe(false);
    expect(exact).toHaveBeenCalledOnce();
    expect(retainedMapExceeds(map, 0)).toBe(true);
    map.delete('kept');
    expect(retainedMapExceeds(map, 0)).toBe(false);
  } finally { vi.restoreAllMocks(); document.destroy(); }
});

it('observes insertion, deletion and revival before a caller-owned transaction emits observers', () => {
  const document = new Y.Doc(), map = document.getMap('pool'), observed = vi.fn();
  map.observe(observed);
  try {
    document.transact(() => {
      map.set('one', true); expect(retainedMapExceeds(map, 1)).toBe(false);
      map.set('two', true); expect(retainedMapExceeds(map, 1)).toBe(true);
      map.delete('one'); expect(retainedMapExceeds(map, 1)).toBe(false);
      map.set('one', false); expect(retainedMapExceeds(map, 1)).toBe(true);
      map.set('one', null); expect(retainedMapExceeds(map, 1)).toBe(true);
      map.delete('two'); expect(retainedMapExceeds(map, 1)).toBe(false);
      expect(observed).not.toHaveBeenCalled();
    });
    expect(observed).toHaveBeenCalledOnce();
  } finally { map.unobserve(observed); document.destroy(); }
});

it('checks remote additions and deletions immediately inside an active transaction', () => {
  const source = new Y.Doc(), target = new Y.Doc();
  const remote = source.getMap('pool'), local = target.getMap('pool');
  try {
    remote.set('one', true); Y.applyUpdate(target, Y.encodeStateAsUpdate(source));
    const beforeAdd = Y.encodeStateVector(target);
    remote.set('two', true);
    const addition = Y.encodeStateAsUpdate(source, beforeAdd);
    target.transact(() => {
      expect(retainedMapExceeds(local, 1)).toBe(false);
      Y.applyUpdate(target, addition);
      expect(retainedMapExceeds(local, 1)).toBe(true);
      const beforeDelete = Y.encodeStateVector(target);
      remote.delete('one');
      Y.applyUpdate(target, Y.encodeStateAsUpdate(source, beforeDelete));
      expect(local._map.size).toBe(2);
      expect(retainedMapExceeds(local, 1)).toBe(false);
    });
    expect(retainedMapExceeds(local, 1)).toBe(false);
  } finally { source.destroy(); target.destroy(); }
});

it('tracks undo and redo without confusing retained index tombstones for live entries', () => {
  const document = new Y.Doc(), map = document.getMap('pool'), origin = {};
  map.set('kept', true);
  const undo = new Y.UndoManager(map, { trackedOrigins: new Set([origin]), captureTimeout: 0 });
  try {
    document.transact(() => { map.set('new-a', true); map.set('new-b', true); }, origin);
    expect(retainedMapExceeds(map, 2)).toBe(true);
    undo.undo();
    expect(map._map.size).toBe(3); expect(map.size).toBe(1);
    expect(retainedMapExceeds(map, 2)).toBe(false);
    undo.redo();
    expect(retainedMapExceeds(map, 2)).toBe(true);
    document.transact(() => map.delete('new-a'), origin);
    expect(retainedMapExceeds(map, 2)).toBe(false);
    undo.undo(); expect(retainedMapExceeds(map, 2)).toBe(true);
  } finally { undo.destroy(); document.destroy(); }
});
