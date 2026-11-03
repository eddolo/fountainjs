import { describe, expect, it } from 'vitest';
// The performance CLI and its sampler run as plain ESM without a build step.
// @ts-expect-error The internal Node script has no public declaration file.
import { sampleLatency, editLatencyFailures } from '../scripts/performance-sampling.mjs';

function sampleDurations(durations: number[], initialCount: number) {
  let clock = 0, position = 0;
  return sampleLatency(() => { clock += durations[position++]; }, {
    initialCount, sampleCount: durations.length - initialCount, now: () => clock,
  });
}

describe('performance gate sampling', () => {
  it('does not hide a slow first edit behind fast steady typing', () => {
    const result = sampleDurations([500, ...Array(199).fill(1)], 100);
    expect(result.median).toBe(1);
    expect(result.p95).toBe(1);
    expect(editLatencyFailures(result, 45, 'local')).toEqual(['local first edit 500.00 ms exceeds 45 ms']);
  });

  it('does not hide a slow burst elsewhere in the initial window', () => {
    const durations = Array(200).fill(1);
    durations.fill(60, 94, 100);
    expect(editLatencyFailures(sampleDurations(durations, 100), 55, 'remote')).toEqual(['remote initial-edit p95 60.00 ms exceeds 55 ms']);
  });

  it('reports isolated initial outliers without mislabelling a p95 ceiling as a maximum', () => {
    const durations = Array(200).fill(1);
    durations[45] = 60;
    const result = sampleDurations(durations, 100);
    expect(result.initialMax).toBe(60);
    expect(result.initialSamples[45]).toBe(60);
    expect(result.first).toBe(1);
    expect(result.initialP95).toBe(1);
    expect(editLatencyFailures(result, 55, 'remote')).toEqual([]);
  });

  it('retains steady-state p95 failures after a fast initial window', () => {
    const durations = [...Array(100).fill(1), ...Array(94).fill(1), ...Array(6).fill(60)];
    const result = sampleDurations(durations, 100);
    expect(result.initialSamples).toHaveLength(100);
    expect(result.samples).toHaveLength(100);
    expect(editLatencyFailures(result, 55, 'remote')).toEqual(['remote p95 60.00 ms exceeds 55 ms']);
  });

  it('preserves a quadratic scaling signal despite startup effects', () => {
    const small = sampleDurations([...Array(100).fill(20), ...Array(100).fill(1)], 100);
    const large = sampleDurations([...Array(100).fill(20), ...Array(100).fill(100)], 100);
    expect(large.median / Math.max(small.median, 0.01)).toBe(100);
    expect(large.median / Math.max(small.median, 0.01)).toBeGreaterThan(15);
  });

  it('retains raw readings and accepts linear growth at the existing threshold', () => {
    const durations = [...Array(100).fill(20), ...Array(100).fill(10)];
    const result = sampleDurations(durations, 100);
    expect([...result.initialSamples, ...result.samples]).toEqual(durations);
    expect(editLatencyFailures(result, 45, 'local')).toEqual([]);
    expect(result.median).toBe(10);
  });

  it('propagates rejected edits in either phase', () => {
    for (const failedCall of [1, 101]) {
      let calls = 0;
      expect(() => sampleLatency(() => { if (++calls === failedCall) throw new Error('Rejected edit'); },
        { initialCount: 100, sampleCount: 100, now: () => 0 })).toThrow('Rejected edit');
    }
  });

  it('rejects invalid clocks and unbounded sample counts', () => {
    expect(() => sampleLatency(() => {}, { now: () => Number.NaN })).toThrow('finite and monotonic');
    let time = 0;
    expect(() => sampleLatency(() => {}, { now: () => --time })).toThrow('finite and monotonic');
    for (const count of [0, -1, 1.5, 10_001, Infinity]) {
      expect(() => sampleLatency(() => {}, { sampleCount: count })).toThrow(RangeError);
      expect(() => sampleLatency(() => {}, { initialCount: count })).toThrow(RangeError);
    }
  });
});
