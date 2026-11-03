import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Optional engine path is for isolated parent/current comparisons. Ordinary CI
// always exercises the built package next to this script.
const engine = process.argv[2] ? pathToFileURL(resolve(process.argv[2])) : new URL('../dist/index.js', import.meta.url);
const { Schema, CoreSchemaSpec, Transform, textPointToPosition, topLevelPosition } = await import(engine.href);
if (typeof globalThis.gc !== 'function') throw new Error('Position retention requires --expose-gc.');
const collect = () => { globalThis.gc(); globalThis.gc(); globalThis.gc(); };
const memory = () => { const value = process.memoryUsage(); return value.heapUsed + value.arrayBuffers; };
const blocks = 5000, snapshots = 500;
const retainedLimitBytes = 32 * 1024 * 1024;
const releasedLimitBytes = 4 * 1024 * 1024;
collect();
const baseline = memory();
function retain() {
  const schema = new Schema(CoreSchemaSpec);
  let doc = schema.node('doc', {}, Array.from({ length: blocks }, (_, index) =>
    schema.node('paragraph', {}, [schema.text(`Paragraph ${index}`)])));
  // Exercise validation certificates as well as mapping checkpoints. Merely
  // transforming an unvalidated fixture would never populate the former.
  schema.validate(doc);
  const versions = [doc];
  for (let index = 0; index < snapshots; index++) {
    const target = [blocks - 1, blocks - 2, 2500, 2501, 1000][index % 5];
    doc = new Transform(doc).insertText([target, 0], 0, '!').doc;
    schema.validate(doc);
    // Query both directions and both snapshots; hold the historical versions.
    textPointToPosition(doc, [blocks - 1, 0], 0);
    topLevelPosition(versions[versions.length - 1], 1000);
    topLevelPosition(doc, blocks);
    versions.push(doc);
  }
  return versions;
}
let versions = retain();
collect();
const retainedBytes = Math.max(0, memory() - baseline);
if (versions.length !== snapshots + 1 || versions.some(doc => doc.childCount !== blocks)) throw new Error('Incomplete retention fixture.');
versions = undefined;
collect();
const releasedBytes = Math.max(0, memory() - baseline);
console.log(JSON.stringify({ blocks, snapshots, validatedEverySnapshot: true, measurement: 'heapUsed + arrayBuffers after forced GC',
  retainedBytes, retainedLimitBytes, releasedBytes, releasedLimitBytes }, null, 2));
if (retainedBytes > retainedLimitBytes) throw new Error('Historical position mapping retains too much memory.');
if (releasedBytes > releasedLimitBytes) throw new Error('Released mapping snapshots retain too much memory.');
