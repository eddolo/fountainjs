import { readFileSync, writeFileSync } from 'node:fs';

const old = 'yjs-authority-admission';
const next = 'yjs-retained-provision';
const path = (audit, kind, extension) => 'artifacts/' + audit + '-' + kind + '-20261107.' + extension;
function replace(source, search, value) {
  if (source.split(search).length !== 2) throw new Error('Expected one reference to ' + search);
  return source.replace(search, value);
}

const build = readFileSync(`artifacts/build-${old}-20261107.mjs`, 'utf8');
writeFileSync(`artifacts/build-${next}-20261107.mjs`, build.replaceAll(old, next));

let server = readFileSync(path(old, 'server', 'mjs'), 'utf8');
server = replace(server, 'import {restoreRetainedCheckpoint}', 'import {captureRetainedCheckpoint,restoreRetainedCheckpoint}');
server = replace(server, 'sessions=new Map();', 'sessions=new Map();\n' + [
  "const peerRepository = new SQLiteRetainedRoomRepository(join(temporary, 'rooms.sqlite'));",
  'const provisioning = new Map();',
  'async function serverSeed() {',
  '  const document = new Y.Doc();',
  "  const kit = composeExtensions([CoreExtension, MathExtension, createRetainedYjsCollaborationExtension({ document, user: { id: 'server', name: 'Server seed', color: '#7048e8' } })]);",
  '  const content = { type: "doc", content: [',
  '    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Shared research brief" }] },',
  '    { type: "paragraph", content: [{ type: "text", text: "Created from the server template." }] },',
  '    { type: "image_super", attrs: { src: "/tests/fixtures/cross-container-figure.png", alt: "Research figure" } },',
  '    { type: "math_block", attrs: { latex: "x^2+y^2", label: "eq:one" } },',
  '  ] };',
  '  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });',
  "  try { return await captureRetainedCheckpoint(document, editor.state.schema, 'admission-browser-1'); }",
  '  finally { editor.destroy(); document.destroy(); }',
  '}',
].join('\n'));
server = replace(server, 'value={token};', [
  "provisioning.set(token, { peer: new CoordinatedDocumentRoom(peerRepository, key, schema, 'admission-browser-1'), loads: 0, attempts: [], both: Promise.withResolvers() });",
  'value={token,key};',
].join('\n'));
server = replace(server, "if(action==='initialize')value=await room.initialize(body.checkpoint);", [
  "const state = provisioning.get(req.headers['x-admission-session']);",
  "if (action === 'provision') {",
  "  if (body.id !== 'left' && body.id !== 'right') throw new Error('Unknown demo author');",
  "  const authority = body.id === 'left' ? room : state.peer;",
  '  const controller = new AbortController();',
  "  res.once('close', () => { if (!res.writableFinished) controller.abort(); });",
  '  value = await authority.provisionRetained({',
  '    signal: controller.signal,',
  '    async loadCheckpoint(signal) {',
  '      if (++state.loads === 2) state.both.resolve();',
  '      await state.both.promise;',
  '      signal.throwIfAborted();',
  '      const checkpoint = await serverSeed();',
  '      state.attempts.push(checkpoint.manifest.roomId);',
  '      return checkpoint;',
  '    },',
  '  });',
  "} else if (action === 'provision-stats') value = { loads: state.loads, attempts: state.attempts };",
].join('\n'));
server = replace(server, "sessions.delete(req.headers['x-admission-session']);", "sessions.delete(req.headers['x-admission-session']); provisioning.delete(req.headers['x-admission-session']);");
server = replace(server, 'repository.close();', 'repository.close(); peerRepository.close();');
writeFileSync(path(next, 'server', 'mjs'), server.replaceAll(old, next));

let page = readFileSync(path(old, 'fixture', 'html'), 'utf8');
page = replace(page, 'Join the current editing session', 'Open a shared document for the first time');
page = replace(page, 'Actual HTTP + Node/SQLite authority. Frozen rooms and retired epochs cannot accept this writer.', 'Join as both authors to create one saved document. Edit either copy, save, and refresh the other author.');
page = replace(page, '<header id="controls">', '<header id="controls"><button id="join-both">Join both authors</button>');
page = replace(page, "+(getCollaborationState(peer.editor).error?.message??'');}", [
  "+(getCollaborationState(peer.editor).error?.message??'');",
  "  const joining = message.textContent.startsWith('Ready') || message.textContent === 'Both authors joining…' || message.textContent === 'Admission retried';",
  "  if (joining && Object.keys(peers).length === 2 && Object.values(peers).every(author => getCollaborationState(author.editor).status === 'connected')) {",
  "    message.textContent = 'Both authors connected to the saved room';",
  "  }",
  "}",
].join('\n'));
page = replace(page, 'new Promise(resolve=>{peer.pending.push({resolve,signal});})', 'new Promise((resolve,reject)=>{peer.pending.push({resolve,reject,signal});})');
page = replace(page, "const snapshot=await request('snapshot');pending.resolve(snapshot);await new Promise(resolve=>setTimeout(resolve,70));renderStatus(peer);message.textContent='Admission response received';", "try { pending.resolve(await request('provision', {id}, pending.signal)); } catch(error) { pending.reject(error); throw error; }");
const initialize = page.split('\n').find(line => line.startsWith("({token}=await request('open'));"));
if (!initialize) throw new Error('Missing original fixture initialization.');
page = replace(page, initialize, "const opened = await request('open'); token = opened.token; current = { key: opened.key };");
page = replace(page, "mount('left');mount('right');await refresh();", [
  "mount('left'); mount('right');",
  "document.querySelector('#server pre').textContent = 'Room awaiting first join';",
  "document.querySelector('#join-both').onclick = event => {",
  "  event.currentTarget.disabled = true;",
  "  message.textContent = 'Both authors joining…';",
  "  for (const id of ['left', 'right']) document.querySelector('#' + id + ' header button').click();",
  "};",
].join('\n'));
page = replace(page, 'return {server:serverModel,epoch:', "return {provisioning:await request('provision-stats'),server:serverModel,epoch:");
page = replace(page, 'reader.view.destroy();reader.editor.destroy();await request', 'reader?.view.destroy();reader?.editor.destroy();await request');
writeFileSync(path(next, 'fixture', 'html'), page.replaceAll(old, next));
