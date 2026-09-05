import type { Node } from '../core';

export interface VirtualBlockLayoutOptions {
  /** Initial block height used until a rendered block is measured. */
  estimatedBlockHeight?: number;
  /** Extra content retained above and below the visible viewport. */
  overscanPx?: number;
  /** Neighboring blocks mounted around a pinned selection endpoint. */
  pinnedOverscanBlocks?: number;
}

export interface VirtualBlockMeasurement {
  readonly index: number;
  readonly height: number;
}

export interface VirtualBlockRange {
  /** Inclusive top-level block index. */
  readonly from: number;
  /** Exclusive top-level block index. */
  readonly to: number;
}

export interface VirtualBlockPlan {
  readonly ranges: readonly VirtualBlockRange[];
  readonly totalHeight: number;
  readonly mountedCount: number;
}

const MAX_BLOCK_HEIGHT = 1_000_000;

function finiteOption(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function integerOption(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function freezeRange(from: number, to: number): VirtualBlockRange {
  return Object.freeze({ from, to });
}

/**
 * Renderer-independent height and position index for a top-level virtual
 * document. Measurements follow immutable node identities through insertion,
 * removal, and movement; unknown or replaced blocks return to the estimate.
 */
export class VirtualBlockLayout {
  readonly estimatedBlockHeight: number;
  readonly overscanPx: number;
  readonly pinnedOverscanBlocks: number;

  private document?: Node;
  private nodes: readonly Node[] = Object.freeze([]);
  private heights = new Float64Array(0);
  private offsets = new Float64Array(1);
  private positions = new Float64Array(1);
  private readonly measuredByNode = new WeakMap<Node, number>();

  constructor(options: VirtualBlockLayoutOptions = {}) {
    this.estimatedBlockHeight = finiteOption(
      'estimatedBlockHeight', options.estimatedBlockHeight ?? 48, 1, MAX_BLOCK_HEIGHT,
    );
    this.overscanPx = finiteOption('overscanPx', options.overscanPx ?? 1_000, 0, 10_000_000);
    this.pinnedOverscanBlocks = integerOption(
      'pinnedOverscanBlocks', options.pinnedOverscanBlocks ?? 1, 0, 1_000,
    );
  }

  get blockCount(): number { return this.nodes.length; }
  get totalHeight(): number { return this.offsets[this.offsets.length - 1] ?? 0; }

  sync(document: Node): boolean {
    if (document.isText) throw new TypeError('Virtual block layout requires a document node.');
    if (document === this.document) return false;
    this.document = document;
    this.nodes = document.content;
    this.heights = new Float64Array(this.nodes.length);
    this.offsets = new Float64Array(this.nodes.length + 1);
    this.positions = new Float64Array(this.nodes.length + 1);
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index] as Node;
      this.heights[index] = this.measuredByNode.get(node) ?? this.estimatedBlockHeight;
      this.offsets[index + 1] = (this.offsets[index] ?? 0) + (this.heights[index] ?? 0);
      this.positions[index + 1] = (this.positions[index] ?? 0) + node.nodeSize;
    }
    return true;
  }

  nodeAt(index: number): Node | undefined {
    return Number.isSafeInteger(index) && index >= 0 ? this.nodes[index] : undefined;
  }

  indexOf(node: Node): number { return this.nodes.indexOf(node); }

  /** Applies one measurement batch and rebuilds cumulative offsets once. */
  measure(measurements: readonly VirtualBlockMeasurement[]): boolean {
    let changed = false;
    const accepted = new Map<number, number>();
    measurements.forEach(({ index, height }) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= this.nodes.length) return;
      if (!Number.isFinite(height) || height < 1 || height > MAX_BLOCK_HEIGHT) return;
      accepted.set(index, height);
    });
    accepted.forEach((height, index) => {
      if (Math.abs((this.heights[index] ?? 0) - height) < 0.5) return;
      this.heights[index] = height;
      this.measuredByNode.set(this.nodes[index] as Node, height);
      changed = true;
    });
    if (!changed) return false;
    for (let index = 0; index < this.nodes.length; index += 1) {
      this.offsets[index + 1] = (this.offsets[index] ?? 0) + (this.heights[index] ?? 0);
    }
    return true;
  }

  offsetAt(index: number): number {
    const bounded = Math.max(0, Math.min(this.nodes.length, Math.trunc(index)));
    return this.offsets[bounded] ?? 0;
  }

  heightBetween(from: number, to: number): number {
    const start = Math.max(0, Math.min(this.nodes.length, Math.trunc(from)));
    const end = Math.max(start, Math.min(this.nodes.length, Math.trunc(to)));
    return (this.offsets[end] ?? 0) - (this.offsets[start] ?? 0);
  }

  /** Absolute Fountain document position before a top-level block. */
  positionAt(index: number): number {
    const bounded = Math.max(0, Math.min(this.nodes.length, Math.trunc(index)));
    return this.positions[bounded] ?? 0;
  }

  indexAt(offset: number): number {
    if (!this.nodes.length) return 0;
    const target = Math.max(0, Math.min(this.totalHeight, Number.isFinite(offset) ? offset : 0));
    let low = 0;
    let high = this.nodes.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.offsets[middle + 1] ?? 0) <= target) low = middle + 1;
      else high = middle;
    }
    return Math.min(this.nodes.length - 1, low);
  }

  plan(viewportOffset: number, viewportHeight: number, pinnedIndices: readonly number[] = []): VirtualBlockPlan {
    if (!this.nodes.length) return Object.freeze({ ranges: Object.freeze([]), totalHeight: 0, mountedCount: 0 });
    const start = Math.max(0, (Number.isFinite(viewportOffset) ? viewportOffset : 0) - this.overscanPx);
    const height = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
    const end = Math.min(this.totalHeight, start + height + this.overscanPx * 2);
    const ranges: VirtualBlockRange[] = [freezeRange(
      this.indexAt(start),
      Math.min(this.nodes.length, this.indexAt(end) + 1),
    )];

    [...new Set(pinnedIndices)].sort((left, right) => left - right).forEach((rawIndex) => {
      if (!Number.isSafeInteger(rawIndex) || rawIndex < 0 || rawIndex >= this.nodes.length) return;
      ranges.push(freezeRange(
        Math.max(0, rawIndex - this.pinnedOverscanBlocks),
        Math.min(this.nodes.length, rawIndex + this.pinnedOverscanBlocks + 1),
      ));
    });

    ranges.sort((left, right) => left.from - right.from || left.to - right.to);
    const merged: VirtualBlockRange[] = [];
    ranges.forEach((range) => {
      const previous = merged.at(-1);
      if (!previous || range.from > previous.to) {
        merged.push(range);
        return;
      }
      merged[merged.length - 1] = freezeRange(previous.from, Math.max(previous.to, range.to));
    });
    const frozen = Object.freeze(merged.map((range) => freezeRange(range.from, range.to)));
    return Object.freeze({
      ranges: frozen,
      totalHeight: this.totalHeight,
      mountedCount: frozen.reduce((count, range) => count + range.to - range.from, 0),
    });
  }
}
