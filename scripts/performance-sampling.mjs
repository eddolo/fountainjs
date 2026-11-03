import { performance } from 'node:perf_hooks';

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

/** Keep initial edits observable instead of discarding a JIT/GC settling window.
 * Injecting a clock lets the gate be checked with deterministic slow workloads.
 */
export function sampleLatency(run, { initialCount = 1, sampleCount = 12, now = () => performance.now() } = {}) {
  if (![initialCount, sampleCount].every(count => Number.isSafeInteger(count) && count > 0 && count <= 10_000)) {
    throw new RangeError('Latency sample counts must be integers between 1 and 10,000.');
  }
  const measure = count => Array.from({ length: count }, () => {
    const start = now();
    run();
    const elapsed = now() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Latency clock must be finite and monotonic.');
    return elapsed;
  });
  const initialSamples = measure(initialCount);
  const samples = measure(sampleCount);
  return {
    first: initialSamples[0],
    initialP95: percentile(initialSamples, 0.95),
    initialMax: Math.max(...initialSamples),
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    initialSamples,
    samples,
  };
}

export function editLatencyFailures(result, limit, label) {
  const failures = [];
  if (result.first > limit) failures.push(`${label} first edit ${result.first.toFixed(2)} ms exceeds ${limit} ms`);
  if (result.initialP95 > limit) failures.push(`${label} initial-edit p95 ${result.initialP95.toFixed(2)} ms exceeds ${limit} ms`);
  if (result.p95 > limit) failures.push(`${label} p95 ${result.p95.toFixed(2)} ms exceeds ${limit} ms`);
  return failures;
}
