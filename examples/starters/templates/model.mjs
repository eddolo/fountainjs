import { Schema } from 'fountainjs-editor/core';

export const schemaSpec = {
  nodes: {
    doc: { content: 'block+' },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1, validate: (n) => n === 1 || n === 2 } },
      toDOM: (node) => ['h' + node.attrs.level, 0],
    },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    em: { toDOM: () => ['em', 0] },
  },
};
const schema = new Schema(schemaSpec);
export const paragraph = (text = '') =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
export const documentOf = (text = '') => ({ type: 'doc', content: [paragraph(text)] });

export class InputError extends Error {}
function check(condition, message) {
  if (!condition) throw new InputError(message);
}
export function shape(value, keys) {
  check(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) => keys.includes(key)),
    'Unexpected document property.',
  );
}
function label(value, name) {
  check(
    typeof value === 'string' && value.trim() && value.length <= 160,
    'Enter a ' + name + ' of up to 160 characters.',
  );
}

function rich(doc) {
  shape(doc, ['type', 'content']);
  check(
    doc.type === 'doc' && Array.isArray(doc.content) && doc.content.length > 0 && doc.content.length <= 128,
    'Enter 1 to 128 paragraphs.',
  );
  let length = 0;
  for (const block of doc.content) {
    shape(block, ['type', 'content']);
    check(
      block.type === 'paragraph' && (!Object.hasOwn(block, 'content') || Array.isArray(block.content)),
      'Use paragraphs in a rich-text field.',
    );
    for (const run of block.content ?? []) {
      shape(run, ['type', 'text', 'marks']);
      check(run.type === 'text' && typeof run.text === 'string', 'Invalid text.');
      length += run.text.length;
      check(length <= 16000, 'Rich text is limited to 16,000 characters.');
      if (Object.hasOwn(run, 'marks')) {
        check(Array.isArray(run.marks) && run.marks.length <= 2, 'Invalid text formatting.');
        const seen = new Set();
        for (const mark of run.marks) {
          shape(mark, ['type']);
          check(['strong', 'em'].includes(mark.type) && !seen.has(mark.type), 'Use bold or italic text.');
          seen.add(mark.type);
        }
      }
    }
  }
  return schema.nodeFromJSON(doc).toJSON();
}

export function validateTemplate(template) {
  shape(template, ['version', 'title', 'blocks']);
  check(template.version === 1, 'Unsupported template version.');
  label(template.title, 'title');
  check(
    Array.isArray(template.blocks) && template.blocks.length > 0 && template.blocks.length <= 64,
    'Use 1 to 64 blocks.',
  );
  const keys = new Set();
  for (const block of template.blocks) {
    if (block?.type === 'prose') {
      shape(block, ['type', 'document']);
      rich(block.document);
      continue;
    }
    check(block?.type === 'field' || block?.type === 'reference', 'Unknown template block.');
    check(
      typeof block.key === 'string' &&
        /^[a-z][a-z0-9_]{0,47}$/.test(block.key) &&
        !Object.hasOwn(Object.prototype, block.key),
      'Use a lowercase field key with letters, numbers or underscores.',
    );
    if (block.type === 'reference') {
      shape(block, ['type', 'key']);
      continue;
    }
    shape(block, ['type', 'key', 'label', 'kind', 'required']);
    label(block.label, 'field label');
    check(
      ['text', 'rich'].includes(block.kind) && typeof block.required === 'boolean',
      'Invalid field settings.',
    );
    check(!keys.has(block.key), 'Each field needs a unique key.');
    keys.add(block.key);
  }
  check(keys.size > 0, 'Add at least one field.');
  check(
    template.blocks.every((b) => b.type !== 'reference' || keys.has(b.key)),
    'Choose an existing field for every reference.',
  );
  return template;
}

export function validateAnswers(template, answers, submitting) {
  const fields = template.blocks.filter((b) => b.type === 'field');
  shape(
    answers,
    fields.map((b) => b.key),
  );
  for (const field of fields) {
    let text = '';
    if (Object.hasOwn(answers, field.key)) {
      const value = answers[field.key];
      if (field.kind === 'text') {
        check(
          typeof value === 'string' && value.length <= 4000 && !/[\r\n]/.test(value),
          field.label + ' needs a single line of up to 4,000 characters.',
        );
        text = value;
      } else {
        const doc = rich(value);
        text = doc.content.flatMap((p) => (p.content ?? []).map((t) => t.text)).join('');
      }
    }
    check(
      !submitting || !field.required || !!text.trim(),
      'Complete the required field “' + field.label + '”.',
    );
  }
}

export function renderResponse(template, answers) {
  validateTemplate(template);
  validateAnswers(template, answers, true);
  const heading = (text, level) => ({ ...paragraph(text), type: 'heading', attrs: { level } });
  const content = [heading(template.title, 1)];
  let size = 0;
  for (const block of template.blocks) {
    if (block.type === 'prose') {
      content.push(...block.document.content);
      continue;
    }
    if (block.type === 'field') content.push(heading(block.label, 2));
    const value = answers[block.key];
    const paragraphs =
      typeof value === 'string' ? documentOf(value).content : (value?.content ?? [paragraph()]);
    size += JSON.stringify(paragraphs).length;
    check(size <= 1_000_000, 'Repeated answers exceed the completed document limit.');
    content.push(...paragraphs);
  }
  return schema.nodeFromJSON({ type: 'doc', content }).toJSON();
}

export const initialTemplate = () => ({
  version: 1,
  title: 'Research handoff',
  blocks: [
    {
      type: 'prose',
      document: documentOf('Record the findings another researcher needs to reproduce your work.'),
    },
    { type: 'field', key: 'study', label: 'Study title', kind: 'text', required: true },
    { type: 'field', key: 'findings', label: 'Findings', kind: 'rich', required: true },
  ],
});
