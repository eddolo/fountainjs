import { createEditor, EditorView, toggleMark, createHistoryPlugin, undo, redo } from 'fountainjs-editor';
import { schemaSpec, initialTemplate, documentOf, validateTemplate } from './model.mjs';
import { insertTemplateField, resolveTemplateFields, validFieldKey } from './inline-fields.mjs';
import './style.css';

const root = document.querySelector('#workspace'),
  status = document.querySelector('#status');
let views = [],
  dirty = false,
  documentState,
  workspace,
  route,
  invitation,
  review,
  busy = false;
const markDirty = () => {
  dirty = true;
  status.textContent = 'Unsaved changes';
};
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(label, fn, primary = false) {
  const b = el('button', label, primary ? 'primary' : '');
  b.type = 'button';
  b.addEventListener('click', () => {
    if (!busy)
      Promise.resolve()
        .then(fn)
        .catch((e) => (status.textContent = e.message));
  });
  return b;
}
function link(label, href) {
  const a = el('a', label);
  a.href = href;
  return a;
}
function box(parent, title) {
  const card = el('section', undefined, 'card');
  if (title) card.append(el('h2', title));
  parent.append(card);
  return card;
}
function row(parent, cls = 'row') {
  const r = el('div', undefined, cls);
  parent.append(r);
  return r;
}
function input(parent, label, value, set, choices) {
  const l = el('label', label),
    c = el(choices ? 'select' : 'input');
  if (choices)
    for (const [key, text] of choices) {
      const opt = el('option', text);
      opt.value = key;
      c.append(opt);
    }
  c.value = value;
  c.addEventListener(choices ? 'change' : 'input', () => {
    if (set(c.value) === false) return;
    markDirty();
  });
  l.append(c);
  parent.append(l);
  return c;
}
function rich(parent, label, content, onUpdate, fields) {
  const card = el('div', undefined, onUpdate ? 'rich' : 'reader'),
    mount = el('div');
  parent.append(card);
  const editor = createEditor({
    schema: schemaSpec,
    content,
    editable: !!onUpdate,
    plugins: onUpdate ? [createHistoryPlugin()] : [],
    onUpdate: (_state, tr) => {
      if (onUpdate && tr.docChanged) {
        onUpdate(editor.getJSON());
        markDirty();
      }
    },
  });
  if (onUpdate) {
    const tools = row(card, 'tools');
    for (const [name, act] of [
      ['Bold', () => toggleMark(editor, 'strong')],
      ['Italic', () => toggleMark(editor, 'em')],
      ['Undo', () => undo(editor)],
      ['Redo', () => redo(editor)],
    ]) {
      const b = button(name, () => {
        act();
        view.focus();
      });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      tools.append(b);
    }
    if (fields) {
      const select = el('select');
      select.setAttribute('aria-label', 'Field to insert');
      const populate = () => {
        const previous = select.value;
        const single = fields().filter((field) => field.kind === 'text');
        select.replaceChildren(
          ...single.map((field) => {
            const option = el('option', field.label);
            option.value = field.key;
            return option;
          }),
        );
        if (single.some((field) => field.key === previous)) select.value = previous;
      };
      populate();
      select.addEventListener('focus', populate);
      const insert = button('Insert field', () => {
        populate();
        if (!select.value) throw Error('Add a single-line field to the template first.');
        if (!insertTemplateField(editor, select.value))
          throw Error('Place the cursor in a paragraph or select text within that paragraph.');
        view.focus();
      });
      insert.addEventListener('mousedown', (e) => e.preventDefault());
      tools.append(select, insert);
    }
  }
  card.append(mount);
  const view = new EditorView(mount, editor, { ariaLabel: label });
  views.push(() => {
    view.destroy();
    editor.destroy();
  });
  return editor;
}
async function request(path, method = 'GET', value) {
  const headers = { 'X-Fountain-Workspace': '1' };
  if (route?.key && workspace?.mode === 'links' && path !== 'workspace')
    headers.Authorization = 'Bearer ' + route.key;
  if (value !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api/' + path, {
    method,
    headers,
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(Error(data.error), { signInUrl: data.signInUrl });
  return data;
}
function path() {
  return route.kind + '/' + route.id;
}
function downloadJSON(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const anchor = link('Download', url);
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function createTemplate(template) {
  const saved = await request('templates', 'POST', template);
  location.assign(makeURL('templates', saved));
}
function makeURL(kind, result) {
  return (
    location.origin +
    location.pathname +
    '#' +
    [kind, result.id, ...(result.key ? [result.key] : [])].join('/')
  );
}
function showError(error) {
  status.textContent = error.message;
  if (error.signInUrl) status.append(' ', link('Sign in', error.signInUrl));
}
async function action(fn) {
  if (busy) return;
  busy = true;
  root.inert = true;
  try {
    await fn();
  } catch (e) {
    showError(e);
  } finally {
    root.inert = false;
    busy = false;
  }
}
function redraw() {
  for (const dispose of views) dispose();
  views = [];
  root.replaceChildren();
  if (!route) {
    root.append(el('h1', 'Document templates'));
    if (workspace.mode === 'accounts') {
      for (const [heading, kind, entries] of [
        ['Your templates', 'templates', workspace.templates],
        ['Assigned responses', 'responses', workspace.responses],
      ]) {
        if (kind === 'templates' && !workspace.canCreate && !entries.length) continue;
        const section = box(root, heading);
        if (!entries.length) section.append(el('p', 'None yet.'));
        for (const entry of entries) {
          const item = el('p');
          item.append(link(entry.title + (entry.submitted ? ' · Submitted' : ''), makeURL(kind, entry)));
          if (kind === 'responses')
            item.append(
              el(
                'span',
                (entry.label ? entry.label + ' · ' : '') + 'Template revision ' + entry.templateRevision,
                'assignment-detail',
              ),
            );
          section.append(item);
        }
      }
      if (!workspace.canCreate) return;
    }
    root.append(
      el(
        'p',
        'Build a template with fixed instructions and fields. Each respondent gets a separate link to complete their copy.',
      ),
      button('Create template', () => action(() => createTemplate(initialTemplate())), true),
    );
    const importLabel = el('label', 'Open template file');
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.addEventListener('change', () =>
      action(async () => {
        const selected = file.files[0];
        if (!selected) return;
        file.value = '';
        if (selected.size > 524288) throw Error('Choose a template file of at most 512 KiB.');
        let template;
        try {
          template = JSON.parse(await selected.text());
        } catch {
          throw Error('Choose a valid template JSON file.');
        }
        await createTemplate(validateTemplate(template));
      }),
    );
    importLabel.append(file);
    box(root, 'Start from a saved template').append(importLabel);
    return;
  }
  if (workspace.mode === 'accounts') root.append(link('My documents', location.pathname));
  if (route.kind === 'templates') author();
  else respondent();
}
function author() {
  const { template, revision, responses } = documentState;
  if (review) {
    root.append(
      el('p', 'Submitted response · revision ' + review.templateRevision, 'small'),
      button('Back to template', () => {
        review = undefined;
        redraw();
      }),
    );
    rich(box(root), 'Completed document', review.document);
    return;
  }
  root.append(
    el('h1', 'Edit template'),
    el(
      'p',
      workspace.mode === 'accounts'
        ? 'Your account owns this template.'
        : 'Bookmark this page to reopen the author workspace. Anyone with its link can edit this template.',
      'small',
    ),
  );
  input(root, 'Template title', template.title, (v) => (template.title = v));
  const fields = () => template.blocks.filter((b) => b.type === 'field');
  const usesInline = (key) =>
    template.blocks.some(
      (block) =>
        block.type === 'prose' &&
        block.document.content.some((p) =>
          p.content?.some((run) => run.type === 'template_field' && run.attrs.key === key),
        ),
    );
  const add = (block) => {
    template.blocks.push(block);
    markDirty();
    redraw();
  };
  template.blocks.forEach((b, i) => {
    const card = box(
      root,
      b.type === 'field' ? 'Response field' : b.type === 'prose' ? 'Fixed instructions' : 'Repeated answer',
    );
    if (b.type === 'prose')
      rich(card, 'Instructions ' + (i + 1), b.document, (v) => (b.document = v), fields);
    if (b.type === 'field') {
      const r = row(card);
      input(r, 'Field label', b.label, (v) => (b.label = v));
      const keyLabel = el('label', 'Field key'),
        keyInput = el('input');
      keyInput.value = b.key;
      keyLabel.append(keyInput);
      r.append(keyLabel);
      keyInput.addEventListener('change', () => {
        const key = keyInput.value;
        if (key !== b.key && usesInline(b.key)) {
          keyInput.value = b.key;
          status.textContent = 'Remove inline uses before changing this field key.';
          return;
        }
        if (!validFieldKey(key) || fields().some((f) => f !== b && f.key === key)) {
          keyInput.value = b.key;
          status.textContent = 'Choose a unique lowercase field key.';
          return;
        }
        const old = b.key;
        b.key = key;
        for (const mirror of template.blocks)
          if (mirror.type === 'reference' && mirror.key === old) mirror.key = key;
        for (const select of root.querySelectorAll('select[data-reference]'))
          for (const option of select.options) if (option.value === old) option.value = key;
        markDirty();
      });
      const kind = input(
        r,
        'Answer type',
        b.kind,
        (v) => {
          if (v !== 'text' && usesInline(b.key)) {
            kind.value = b.kind;
            status.textContent = 'Remove inline uses before changing this answer type.';
            return false;
          }
          b.kind = v;
        },
        [
          ['text', 'Single line'],
          ['rich', 'Rich text'],
        ],
      );
      const l = el('label', undefined, 'check'),
        c = el('input');
      c.type = 'checkbox';
      c.checked = b.required;
      c.onchange = () => {
        b.required = c.checked;
        markDirty();
      };
      l.append(c, ' Required');
      card.append(l);
    }
    if (b.type === 'reference') {
      const select = input(
        card,
        'Repeat field',
        b.key,
        (v) => (b.key = v),
        fields().map((f) => [f.key, f.label]),
      );
      select.dataset.reference = '';
    }
    const controls = row(card, 'row actions');
    for (const [name, delta] of [
      ['Move up', -1],
      ['Move down', 1],
    ]) {
      const j = i + delta,
        move = button(name, () => {
          [template.blocks[i], template.blocks[j]] = [template.blocks[j], b];
          markDirty();
          redraw();
        });
      move.disabled = j < 0 || j >= template.blocks.length;
      controls.append(move);
    }
    controls.append(
      button('Remove block', () => {
        if (b.type === 'field' && usesInline(b.key)) throw Error('Remove its inline uses first.');
        if (
          b.type === 'field' &&
          template.blocks.some((ref) => ref.type === 'reference' && ref.key === b.key)
        )
          throw Error('Remove its repeated answers first.');
        template.blocks.splice(i, 1);
        markDirty();
        redraw();
      }),
    );
  });
  const adders = row(root, 'row actions');
  adders.append(
    button('Add instructions', () => add({ type: 'prose', document: documentOf() })),
    button('Add field', () => {
      let n = 1;
      while (fields().some((f) => f.key === 'field_' + n)) n++;
      add({ type: 'field', key: 'field_' + n, label: 'New field', kind: 'text', required: false });
    }),
    button('Repeat an answer', () => {
      if (!fields().length) throw Error('Add a field first.');
      add({ type: 'reference', key: fields()[0].key });
    }),
  );
  const commands = row(root, 'row actions');
  commands.append(
    button(
      'Save template',
      () =>
        action(async () => {
          const data = await request(path(), 'PUT', { revision, template });
          documentState.revision = data.revision;
          dirty = false;
          redraw();
          status.textContent = 'Template saved.';
        }),
      true,
    ),
  );
  commands.append(
    button('Download template JSON', () => {
      validateTemplate(template);
      downloadJSON('document-template.json', template);
    }),
  );
  const links = box(root, 'Respondent invitations');
  const recipient = el('input');
  if (workspace.mode === 'accounts') {
    recipient.maxLength = 256;
    const recipientLabel = el('label', 'Recipient account');
    recipientLabel.append(recipient);
    links.append(recipientLabel);
  }
  const label = el('label', 'Invitation label (optional)');
  const name = el('input');
  name.maxLength = 120;
  label.append(name);
  links.append(
    label,
    button('Create respondent link', () =>
      action(async () => {
        if (dirty) throw Error('Save the template before inviting a respondent.');
        const label = name.value.trim();
        const assignment = workspace.mode === 'accounts' ? { recipient: recipient.value.trim() } : {};
        const result = await request(path() + '/invite', 'POST', { revision, label, ...assignment });
        invitation = { id: result.id, url: makeURL('responses', result) };
        documentState.invitations.unshift({
          id: result.id,
          label: label || assignment.recipient || '',
          templateRevision: revision,
          revoked: false,
        });
        redraw();
        status.textContent = 'Respondent link created.';
      }),
    ),
  );
  if (invitation) {
    const share = box(links, 'Respondent link');
    share.classList.add('share');
    const openLink = link('Open response', invitation.url);
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    share.append(
      el(
        'p',
        workspace.mode === 'accounts'
          ? 'The assigned recipient can open this link after signing in.'
          : 'This link opens one response to the saved template. Give each respondent a separate link.',
      ),
      openLink,
    );
    const field = el('input');
    field.readOnly = true;
    field.value = invitation.url;
    field.setAttribute('aria-label', 'Respondent link');
    field.onclick = () => field.select();
    share.append(field);
  }
  for (const entry of documentState.invitations) {
    const line = row(links, 'row invitation-entry');
    const title = entry.label || 'Invitation ' + entry.id.slice(0, 8);
    line.append(el('span', title + ' · revision ' + entry.templateRevision));
    if (entry.revoked) {
      line.append(el('span', 'Access revoked'));
    } else {
      line.append(
        button('Revoke access', () =>
          action(async () => {
            if (!window.confirm('Revoke access for ' + title + '? This link will stop working.')) return;
            await request('responses/' + entry.id + '/revoke', 'POST');
            entry.revoked = true;
            if (invitation?.id === entry.id) invitation = undefined;
            redraw();
            status.textContent = 'Access revoked for ' + title + '.';
          }),
        ),
      );
    }
  }
  const received = box(root, 'Submitted responses');
  received.append(
    button('Refresh submissions', () =>
      action(async () => {
        const fresh = await request(path());
        documentState.responses = fresh.responses;
        documentState.invitations = fresh.invitations;
        if (fresh.invitations.some((entry) => entry.id === invitation?.id && entry.revoked))
          invitation = undefined;
        redraw();
        status.textContent = dirty
          ? 'Submissions refreshed. Template has unsaved changes.'
          : 'Submissions refreshed.';
      }),
    ),
  );
  if (!responses.length) received.append(el('p', 'No submissions yet.'));
  responses.forEach((r, i) => {
    received.append(
      button('Read submission ' + (responses.length - i) + ' · revision ' + r.templateRevision, () =>
        action(async () => {
          review = await request('responses/' + r.id);
          status.textContent = '';
          redraw();
        }),
      ),
    );
  });
}
function respondent() {
  const { template, answers, submitted, revision } = documentState;
  if (submitted) {
    root.append(el('p', 'Submitted · template revision ' + documentState.templateRevision));
    rich(box(root, 'Completed document'), 'Completed document', documentState.document);
    root.append(
      button('Download Fountain JSON', () => downloadJSON('completed-document.json', documentState.document)),
    );
    return;
  }
  root.append(el('h1', template.title));
  const mirrors = new Map(),
    inlinePreviews = new Map();
  function refresh(key) {
    for (const update of inlinePreviews.get(key) ?? []) update();
    for (const target of mirrors.get(key) ?? []) {
      const val = answers[key];
      target.replaceChildren();
      const paragraphs = typeof val === 'string' ? [{ content: [{ text: val }] }] : (val?.content ?? []);
      for (const p of paragraphs) {
        const block = el('p');
        for (const run of p.content ?? []) {
          let child = document.createTextNode(run.text);
          for (const mark of run.marks ?? []) {
            const outer = el(mark.type === 'strong' ? 'strong' : 'em');
            outer.append(child);
            child = outer;
          }
          block.append(child);
        }
        target.append(block);
      }
      if (!target.textContent) target.textContent = 'Awaiting answer';
    }
  }
  for (const b of template.blocks) {
    if (b.type === 'prose') {
      const keys = new Set();
      const project = () =>
        resolveTemplateFields(b.document, (key) => {
          keys.add(key);
          return answers[key] || '{{' + key + '}}';
        });
      const editor = rich(box(root), 'Fixed instructions', project());
      for (const key of keys) {
        if (!inlinePreviews.has(key)) inlinePreviews.set(key, []);
        inlinePreviews
          .get(key)
          .push(() =>
            editor.dispatch(
              editor.createTransaction().replaceDocument(editor.state.schema.nodeFromJSON(project())),
            ),
          );
      }
      continue;
    }
    if (b.type === 'reference') {
      const target = box(
        root,
        'Repeated answer · ' + template.blocks.find((f) => f.type === 'field' && f.key === b.key).label,
      );
      const output = row(target, 'reader');
      if (!mirrors.has(b.key)) mirrors.set(b.key, []);
      mirrors.get(b.key).push(output);
      refresh(b.key);
      continue;
    }
    const card = box(root),
      label = b.label + (b.required ? ' (required)' : '');
    const set = (v) => {
      answers[b.key] = v;
      refresh(b.key);
    };
    if (b.kind === 'rich') {
      card.append(el('h2', label));
      rich(card, label, answers[b.key] ?? documentOf(), set);
    } else input(card, label, answers[b.key] ?? '', set);
  }
  const commands = row(root, 'row actions');
  for (const submitting of [false, true]) {
    commands.append(
      button(
        submitting ? 'Submit response' : 'Save draft',
        () =>
          action(async () => {
            const data = await request(path() + (submitting ? '/submit' : ''), submitting ? 'POST' : 'PUT', {
              revision,
              answers,
            });
            documentState.revision = data.revision;
            dirty = false;
            if (submitting) documentState = await request(path());
            redraw();
            status.textContent = submitting ? 'Response submitted.' : 'Draft saved.';
          }),
        submitting,
      ),
    );
  }
}
async function open() {
  const parts = location.hash.slice(1).split('/');
  route = parts[0] ? { kind: parts[0], id: parts[1], key: parts[2] } : undefined;
  dirty = false;
  invitation = undefined;
  status.textContent = '';
  try {
    workspace = await request('workspace');
    if (!route && workspace.mode === 'accounts') Object.assign(workspace, await request('documents'));
    if (route) {
      if (
        parts.length !== (workspace.mode === 'accounts' ? 2 : 3) ||
        !['templates', 'responses'].includes(route.kind) ||
        !/^[-a-f0-9]{36}$/.test(route.id) ||
        (workspace.mode === 'links' && !/^[-\w]{43}$/.test(route.key))
      )
        throw Error('Invalid workspace link.');
      documentState = await request(path());
    }
    redraw();
  } catch (e) {
    for (const dispose of views) dispose();
    views = [];
    root.replaceChildren();
    showError(e);
  }
}
window.addEventListener('hashchange', () => location.reload());
open();
