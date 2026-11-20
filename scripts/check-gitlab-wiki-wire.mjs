import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { openGitLabWikiRoom, GitLabContentEditor } from '../artifacts/gitlab-native-runtime/fountain-runtime.mjs';

const checkout = resolve(process.argv[2] ?? '.');
const pin = JSON.parse(await readFile(new URL('../integrations/gitlab/runtime/upstream.json', import.meta.url)));
assert.equal(execFileSync('git',['-C',checkout,'rev-parse','HEAD'],{encoding:'utf8'}).trim(), pin.commit);
const stock = createRequire(resolve(checkout,'package.json'));
const Y = stock('yjs');
const { prosemirrorJSONToYDoc, updateYFragment, yDocToProsemirrorJSON } = stock('y-prosemirror');
const stockSchema = stock('@tiptap/core').getSchema(['document','paragraph','text','bold'].map(name =>
  stock('@tiptap/extension-' + name).default));
const recorded = JSON.parse(await readFile(new URL('../artifacts/gitlab-compatibility/live-wiki-20261120/original-3/report.json', import.meta.url)));
assert.equal(recorded.buildIdentity.expected.gitlabCommit, pin.commit);
assert.equal(recorded.collectionComplete, true);
const [item] = recorded.observations;
assert.equal(item.stage,'complete');
const contents = item.stockWire.map(({name, attrs, children}) => ({
  type:name, attrs, content:children.flat().map(({insert,attributes}) => ({
    type:'text',text:insert,marks:Object.entries(attributes ?? {}).map(([type,attrs]) => ({type,attrs})),
  })),
}));
const original = prosemirrorJSONToYDoc(stockSchema,{type:'doc',content:contents},'default');
const candidate = new Y.Doc();
const service = new GitLabContentEditor({renderMarkdown:async () => {throw new Error('Unexpected Markdown render');},describeLabels:() => ''});
const origin = {};
let undo;
try {
  Y.applyUpdate(candidate,Y.encodeStateAsUpdate(original));
  const room = candidate.getXmlFragment('default');
  const wire = {types:Y,stockSchema,updateYFragment};
  const schema = service.editor.state.schema;
  const initialBytes = Y.encodeStateAsUpdate(candidate);
  const shouldNotSeed = () => {throw new Error('Joining client attempted to seed from Markdown');};
  const joined = await openGitLabWikiRoom({doc:candidate, whenSynced:Promise.resolve({seed:false}), connected:true,
    seed:shouldNotSeed}, schema,wire,shouldNotSeed);
  const {binding,document:first} = joined;
  assert.equal(first.child(0).child(1).marks[0].type.name,'strong');
  assert.equal(first.child(1).textContent,item.afterPeerRedo);
  assert.deepEqual(Y.encodeStateAsUpdate(candidate),initialBytes);
  const text = room.get(1).get(0);
  const cursor = Y.createRelativePositionFromTypeIndex(text,7);
  undo = new Y.UndoManager(room,{trackedOrigins:new Set([origin])});

  // Partition the two Y.Docs. Stock appends a word while Fountain inserts at
  // the beginning of the same text. Deliver incremental updates in both directions.
  const originalText = original.getXmlFragment('default').get(1).get(0);
  originalText.insert(originalText.length,' Stock.');
  const prefix = 'Fountain: ';
  const tr = service.editor.createTransaction().replaceDocument(first);
  assert.equal(service.editor.dispatch(tr),true);
  const state = service.editor.state;
  const after = service.editor.createTransaction().insertText([1,0],0,prefix);
  assert.equal(service.editor.dispatch(after),true);
  binding.apply(state.doc,service.editor.state.doc,origin);
  assert.equal(room.get(1).get(0),text);
  assert.equal(Y.createAbsolutePositionFromRelativePosition(cursor,candidate).index,7+prefix.length);

  function exchange() {
    const toOriginal = Y.encodeStateAsUpdate(candidate,Y.encodeStateVector(original));
    const toCandidate = Y.encodeStateAsUpdate(original,Y.encodeStateVector(candidate));
    Y.applyUpdate(original,toOriginal);
    Y.applyUpdate(candidate,toCandidate);
    const candidateView = stockSchema.nodeFromJSON(yDocToProsemirrorJSON(candidate,'default'));
    const originalView = stockSchema.nodeFromJSON(yDocToProsemirrorJSON(original,'default'));
    candidateView.check();
    originalView.check();
    assert.equal(candidateView.eq(originalView),true);
  }
  exchange();
  const merged = prefix + item.afterPeerRedo + ' Stock.';
  assert.equal(binding.read().child(1).textContent,merged);
  assert.equal(originalText.toString(),merged);
  const mergedBytes = Y.encodeStateAsUpdate(candidate);
  assert.throws(() => binding.apply(first,service.editor.state.doc,origin),/draft changed/);
  assert.deepEqual(Y.encodeStateAsUpdate(candidate),mergedBytes);
  undo.undo();
  exchange();
  assert.equal(originalText.toString(),item.afterPeerRedo + ' Stock.');
  undo.redo();
  exchange();
  assert.equal(originalText.toString(),merged);
  // GitLab may acknowledge a joining client before the elected writer finishes
  // converting the saved Markdown. The joiner waits for the first real update.
  const elected = new Y.Doc(), waiting = new Y.Doc();
  try {
    let seedCalls = 0;
    const wait = openGitLabWikiRoom({doc:waiting,connected:true,whenSynced:Promise.resolve({seed:false}),seed:shouldNotSeed},
      schema,wire,shouldNotSeed);
    const seeded = await openGitLabWikiRoom({doc:elected,connected:true,whenSynced:Promise.resolve({seed:true}),
      async seed(populate) { seedCalls++; await populate(); }}, schema,wire,async () => first);
    Y.applyUpdate(waiting,Y.encodeStateAsUpdate(elected));
    assert.equal((await wait).document.eq(seeded.document),true);
    assert.equal(seedCalls,1);
  } finally { elected.destroy(); waiting.destroy(); }
  const aborted = new Y.Doc();
  try {
    let started, finish;
    const decoding = new Promise(resolve => { started = resolve; });
    const pendingSeed = new Promise(resolve => { finish = resolve; });
    const controller = new AbortController();
    const waiting = openGitLabWikiRoom({doc:aborted,connected:true,whenSynced:Promise.resolve({seed:true}),seed:shouldNotSeed},
      schema,wire,() => { started(); return pendingSeed; },{signal:controller.signal});
    await decoding;
    controller.abort(new Error('left wiki'));
    await assert.rejects(waiting,/left wiki/);
    finish(first);
    await Promise.resolve();
    assert.equal(aborted.getXmlFragment('default').length,0);
  } finally { aborted.destroy(); }
  console.log(JSON.stringify({cancelledSeedLeftRoomEmpty:true,joinedBeforeSeed:true,gitlab:pin.commit,stockWiki: item.slug,joined:first.child(1).textContent,
    merged,relativeCursorPreserved:true,peerEditSurvivedUndo:true,staleWriteRefused:true}));
} finally {
  undo?.destroy();
  service.dispose();
  candidate.destroy();
  original.destroy();
}
