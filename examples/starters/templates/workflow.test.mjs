import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspace } from './server.mjs';
import { createEditor, composeExtensions, createHistoryPlugin, undo, redo } from 'fountainjs-editor';
import { NodeSelection, Selection, Schema, textPointToPosition } from 'fountainjs-editor/core';
import { templateFieldExtension, resolveTemplateFields } from './inline-fields.mjs';
import { initialTemplate, documentOf, renderResponse, validateTemplate } from './model.mjs';

test('a custom nested schema can insert, undo, redo and resolve inline fields without a DOM', () => {
  const kit = composeExtensions([
    {
      name: 'laboratory',
      nodes: {
        doc: { content: 'section+' },
        section: { content: 'caption+', attrs: { ref: { default: '' } } },
        caption: { content: 'inline*' },
        text: { group: 'inline' },
      },
      marks: { em: {} },
    },
    templateFieldExtension,
  ]);
  const spec = kit.schema;
  const document = {
    type: 'doc',
    content: [
      {
        type: 'section',
        attrs: { ref: 'figure-3' },
        content: [
          {
            type: 'caption',
            content: [{ type: 'text', text: 'Before SAMPLE after', marks: [{ type: 'em' }] }],
          },
          { type: 'caption' },
        ],
      },
    ],
  };
  let mapping;
  const editor = createEditor({
    schema: spec,
    content: document,
    plugins: [createHistoryPlugin()],
    onUpdate: (_state, tr) => {
      if (tr.docChanged) mapping = tr.mapping;
    },
  });
  try {
    const select = (s) => editor.dispatch(editor.createTransaction().setSelection(s));
    select(new Selection([0, 0, 0], 7, 13));
    const earlier = textPointToPosition(editor.state.doc, [0, 0, 0], 3),
      later = textPointToPosition(editor.state.doc, [0, 0, 0], 17);
    assert.equal(kit.commands.insertTemplateField(editor, 'instrument'), true);
    assert.equal(mapping.map(earlier), earlier);
    assert.equal(mapping.map(later), textPointToPosition(editor.state.doc, [0, 0, 2], 4));
    const authored = editor.getJSON();
    assert.equal(authored.content[0].content[0].content[1].type, 'template_field');
    assert.equal(undo(editor), true);
    assert.deepEqual(editor.getJSON(), document);
    assert.equal(redo(editor), true);
    assert.deepEqual(editor.getJSON(), authored);
    const result = resolveTemplateFields(authored, () => '<scope & 2>');
    new Schema(spec).nodeFromJSON(result);
    assert.deepEqual(result.content[0].content[0].content[1], {
      type: 'text',
      text: '<scope & 2>',
      marks: [{ type: 'em' }],
    });
    assert.deepEqual(result.content[0].attrs, { ref: 'figure-3' });
    assert.equal(resolveTemplateFields(authored, () => '').content[0].content[0].content.length, 2);
    assert.throws(() => resolveTemplateFields(authored, () => undefined), /text answer/);
    assert.equal(kit.commands.insertTemplateField(editor, 'bad key'), false);
    select(new NodeSelection(editor.state.doc, [0, 1]));
    assert.equal(kit.commands.insertTemplateField(editor, 'empty_caption'), true);
    assert.equal(editor.getJSON().content[0].content[1].content[0].attrs.key, 'empty_caption');
    const mixed = {
      type: 'caption',
      content: [
        { type: 'text', text: 'AA x', marks: [{ type: 'em' }] },
        { type: 'text', text: 'y BB' },
      ],
    };
    editor.dispatch(
      editor.createTransaction().replaceNode([0, 0], [editor.state.schema.nodeFromJSON(mixed)]),
    );
    select(Selection.range([0, 0, 0], 3, [0, 0, 1], 1));
    assert.equal(kit.commands.insertTemplateField(editor, 'instrument'), true);
    const formatted = resolveTemplateFields(editor.getJSON(), () => 'Ω').content[0].content[0];
    assert.deepEqual(
      formatted.content.map((run) => run.text),
      ['AA ', 'Ω', ' BB'],
    );
    assert.deepEqual(formatted.content[1].marks, [{ type: 'em' }]);
  } finally {
    editor.destroy();
  }
});

test('inline substitutions use declared single-line answers and enforce the completed output limit', () => {
  const template = initialTemplate(),
    slot = { type: 'template_field', attrs: { key: 'study' } };
  const paragraph = template.blocks[0].document.content[0];
  paragraph.content = [{ type: 'text', text: 'Study ' }, slot, { type: 'text', text: ' completed.' }];
  const answers = { study: 'α', findings: documentOf('Reviewed') };
  const result = renderResponse(template, answers);
  assert.equal(result.content[1].content.map((n) => n.text).join(''), 'Study α completed.');
  assert.equal(JSON.stringify(result).includes('template_field'), false);
  assert.throws(
    () =>
      renderResponse(template, {
        ...answers,
        findings: { type: 'doc', content: [{ type: 'paragraph', content: [slot] }] },
      }),
    /Unexpected document property|Invalid text/,
  );
  slot.attrs.key = 'findings';
  assert.throws(() => validateTemplate(template), /single-line/);
  slot.attrs.key = 'missing';
  assert.throws(() => validateTemplate(template), /single-line/);
  slot.attrs.key = 'study';
  paragraph.content = Array(129).fill(slot);
  assert.throws(() => validateTemplate(template), /128 inline/);
  paragraph.content = Array(128).fill(slot);
  assert.throws(() => renderResponse(template, { ...answers, study: '"'.repeat(4000) }), /output limit/);
});

test('existing invitation links survive a SQLite upgrade and can be revoked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fountain-template-upgrade-'));
  const file = join(directory, 'workspace.sqlite');
  const db = new DatabaseSync(file);
  const authorKey = 'a'.repeat(43),
    key = 'b'.repeat(43);
  const templateId = '11111111-1111-1111-1111-111111111111',
    id = '22222222-2222-2222-2222-222222222222';
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const source = JSON.stringify(initialTemplate());
  db.exec(
    'CREATE TABLE templates(id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE responses(id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES templates(id), respondent TEXT NOT NULL, template_revision INTEGER NOT NULL, template TEXT NOT NULL, revision INTEGER NOT NULL, answers TEXT NOT NULL, submitted INTEGER NOT NULL DEFAULT 0)',
  );
  db.prepare('INSERT INTO templates VALUES(?,?,1,?)').run(templateId, digest(authorKey), source);
  db.prepare('INSERT INTO responses VALUES(?,?,?,1,?,1,?,0)').run(
    id,
    templateId,
    digest(key),
    source,
    JSON.stringify({ study: 'Saved before upgrade' }),
  );
  db.close();
  const server = createWorkspace(file, directory);
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/api/responses/' + id;
    const headers = { Authorization: 'Bearer ' + key };
    const draft = await fetch(url, { headers });
    assert.equal(draft.status, 200);
    assert.equal((await draft.json()).answers.study, 'Saved before upgrade');
    assert.equal(
      (await fetch(url + '/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + authorKey } }))
        .status,
      200,
    );
    assert.equal((await fetch(url, { headers })).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('published revisions, protected prose, private rich drafts, bindings and durable submissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fountain-template-')),
    database = join(directory, 'records.sqlite');
  let server, base;
  const start = async () => {
    server = createWorkspace(database, directory);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
  };
  const stop = () => new Promise((resolve) => server.close(resolve));
  async function send(path, method = 'GET', key, data, expected = 200) {
    const response = await fetch(base + '/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    assert.equal(response.status, expected, result.error);
    return result;
  }
  try {
    await start();
    const template = initialTemplate();
    template.blocks.push({ type: 'reference', key: 'findings' });
    const author = await send('templates', 'POST', null, template),
      path = 'templates/' + author.id;
    const invite = () => send(path + '/invite', 'POST', author.key, { revision: 1 });
    const first = await invite(),
      second = await invite(),
      response = 'responses/' + first.id;
    const other = await send('templates', 'POST', null, initialTemplate());
    await send(path, 'GET', first.key, undefined, 404);
    await send(response, 'GET', other.key, undefined, 404);
    await send(response, 'GET', second.key, undefined, 404);
    await send(response, 'GET', author.key, undefined, 404);
    const revised = { ...template, title: 'Revised protocol' };
    await send(path, 'PUT', author.key, { revision: 1, template: revised });
    await send(path, 'PUT', author.key, { revision: 1, template }, 409);
    await send(path + '/invite', 'POST', author.key, { revision: 1 }, 409);
    await send(path + '/invite', 'POST', author.key, { revision: 2, label: 'x'.repeat(121) }, 422);
    const newer = await send(path + '/invite', 'POST', author.key, { revision: 2, label: 'North lab' });
    assert.equal((await send('responses/' + newer.id, 'GET', newer.key)).template.title, revised.title);
    const invitation = 'responses/' + newer.id;
    await send(invitation, 'PUT', newer.key, { revision: 1, answers: { study: 'Private draft' } });
    const issued = await send(path, 'GET', author.key);
    assert.deepEqual(
      issued.invitations.find((item) => item.id === newer.id),
      { id: newer.id, label: 'North lab', templateRevision: 2, revoked: 0 },
    );
    await send(invitation + '/revoke', 'POST', newer.key, undefined, 404);
    await send(invitation + '/revoke', 'POST', other.key, undefined, 404);
    await send(invitation + '/revoke', 'POST', author.key);
    await send(invitation + '/revoke', 'POST', author.key);
    await send(invitation, 'GET', author.key, undefined, 404);
    await send(invitation, 'GET', newer.key, undefined, 404);
    await send(invitation, 'PUT', newer.key, { revision: 2, answers: {} }, 404);
    await send(invitation + '/submit', 'POST', newer.key, { revision: 2, answers: {} }, 404);
    const draft = { study: 'Cohort study', findings: documentOf('Reproduced') };
    draft.findings.content[0].content[0].marks = [{ type: 'strong' }];
    await send(response, 'PUT', first.key, { revision: 1, answers: draft, template: revised }, 422);
    await send(response + '/submit', 'POST', first.key, { revision: 1, answers: {} }, 422);
    await send(response, 'PUT', first.key, { revision: 1, answers: { unknown: 'value' } }, 422);
    await send(
      response,
      'PUT',
      first.key,
      { revision: 1, answers: { findings: { type: 'doc', content: [{ type: 'image' }] } } },
      422,
    );
    assert.equal((await send(response, 'GET', first.key)).revision, 1);
    const competing = await Promise.all(
      [1, 2].map(() =>
        fetch(base + '/api/' + response, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + first.key },
          body: JSON.stringify({ revision: 1, answers: draft }),
        }),
      ),
    );
    assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
    await stop();
    await start();
    let saved = await send(response, 'GET', first.key);
    assert.deepEqual(saved.answers, draft);
    assert.equal(saved.template.title, template.title);
    await send(response + '/submit', 'POST', first.key, { revision: 2, answers: draft });
    await send(response, 'PUT', first.key, { revision: 3, answers: {} }, 409);
    await stop();
    await start();
    await send(invitation, 'GET', newer.key, undefined, 404);
    await send(response + '/revoke', 'POST', author.key);
    await send(response, 'GET', first.key, undefined, 404);
    saved = await send(response, 'GET', author.key);
    assert.equal(saved.submitted, true);
    assert.equal(saved.templateRevision, 1);
    assert.equal(saved.document.content[0].content[0].text, template.title);
    assert.deepEqual(
      saved.document.content.filter((p) => p.content?.[0]?.text === 'Reproduced'),
      [...draft.findings.content, ...draft.findings.content],
    );
    assert.equal((await send(path, 'GET', author.key)).responses.length, 1);
    assert.deepEqual((await send('responses/' + second.id, 'GET', second.key)).answers, {});
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
