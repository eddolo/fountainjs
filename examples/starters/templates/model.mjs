import { Schema } from 'fountainjs-editor/core';

import { templateFieldExtension, validFieldKey, resolveTemplateFields } from './inline-fields.mjs';

export const schemaSpec = {
  nodes: {
    doc: { content: 'block+' },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1, validate: (n) => n === 1 || n === 2 } },
      toDOM: (node) => ['h' + node.attrs.level, 0],
    },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    ...templateFieldExtension.nodes,
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

function rich(doc, acceptField) {
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
      if (acceptField && run?.type === 'template_field') {
        shape(run, ['type', 'attrs', 'marks']);
        shape(run.attrs, ['key']);
        check(validFieldKey(run.attrs.key), 'Invalid inline field key.');
        acceptField(run.attrs.key);
      } else {
        shape(run, ['type', 'text', 'marks']);
        check(run.type === 'text' && typeof run.text === 'string', 'Invalid text.');
        length += run.text.length;
        check(length <= 16000, 'Rich text is limited to 16,000 characters.');
      }
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
  shape(template, ['version', 'title', 'blocks', 'rules', 'checks', 'calculations']);
  check(template.version === 1, 'Unsupported template version.');
  label(template.title, 'title');
  check(
    Array.isArray(template.blocks) && template.blocks.length > 0 && template.blocks.length <= 64,
    'Use 1 to 64 blocks.',
  );
  const keys = new Set(),
    inline = [];
  const textKeys = new Set();
  for (const block of template.blocks) {
    if (block?.type === 'prose') {
      shape(block, ['type', 'document']);
      rich(block.document, (key) => {
        check(inline.length < 128, 'Use up to 128 inline fields per template.');
        inline.push(key);
      });
      continue;
    }
    check(block?.type === 'field' || block?.type === 'reference', 'Unknown template block.');
    check(validFieldKey(block.key), 'Use a lowercase field key with letters, numbers or underscores.');
    if (block.type === 'reference') {
      shape(block, ['type', 'key', 'editable']);
      check(!Object.hasOwn(block,'editable') || typeof block.editable === 'boolean','Invalid repeated answer editing option.');
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
    if (block.kind === 'text') textKeys.add(block.key);
  }
  const calculated = new Set();
  if (Object.hasOwn(template, 'calculations')) {
    check(Array.isArray(template.calculations) && template.calculations.length <= 64, 'Use up to 64 calculated values.');
    for (const calculation of template.calculations) {
      shape(calculation, ['key', 'label', 'operation', 'start', 'end']);
      check(validFieldKey(calculation.key) && !keys.has(calculation.key) && !calculated.has(calculation.key),
        'Each calculated value needs a unique field key.');
      label(calculation.label, 'calculation label');
      check(calculation.operation === 'elapsedDays', 'Unknown calculation.');
      check(textKeys.has(calculation.start) && textKeys.has(calculation.end) && calculation.start !== calculation.end,
        'Choose two different single-line date fields for each calculation.');
      calculated.add(calculation.key);
    }
  }
  check(
    inline.every((key) => textKeys.has(key) || calculated.has(key)),
    'Inline fields require an existing single-line answer or calculated value.',
  );
  check(keys.size > 0, 'Add at least one field.');
  check(
    template.blocks.every((b) => b.type !== 'reference' || keys.has(b.key)),
    'Choose an existing field for every reference.',
  );
  if (Object.hasOwn(template, 'checks')) {
    check(Array.isArray(template.checks) && template.checks.length <= 64, 'Use up to 64 application checks.');
    for (const binding of template.checks) {
      shape(binding, ['name', 'fields']);
      check(validFieldKey(binding.name), 'Use a valid application check name.');
      check(Array.isArray(binding.fields) && binding.fields.length >= 1 && binding.fields.length <= 8 &&
        binding.fields.every((key) => keys.has(key)) && new Set(binding.fields).size === binding.fields.length,
        'Choose distinct existing fields for each application check.');
    }
  }
  if (Object.hasOwn(template, 'rules')) {
    check(Array.isArray(template.rules) && template.rules.length <= 64, 'Use up to 64 answer rules.');
    for (const rule of template.rules) {
      shape(rule, ['field', 'other', 'operator']);
      check(textKeys.has(rule.field) && textKeys.has(rule.other) && rule.field !== rule.other,
        'Choose two different single-line fields for each answer rule.');
      check(typeof rule.operator === 'string' && Object.hasOwn(comparisonLabels, rule.operator),
        'Choose a supported answer comparison.');
    }
  }
  return template;
}

export const comparisonLabels = Object.freeze({
  matches: 'Must match',
  differs: 'Must differ from',
  onOrAfter: 'Date on or after',
});

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function elapsedDays(calculation, answers) {
  const start = answers[calculation.start], end = answers[calculation.end];
  if (!validDate(start) || !validDate(end)) return '';
  return String((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000);
}

function answerError(field, message) {
  throw Object.assign(new InputError(message), { field });
}

function compareAnswers(template, answers, fields) {
  const labels = new Map(fields.map((field) => [field.key, field.label]));
  for (const { field, other, operator } of template.rules ?? []) {
    const value = answers[field], reference = answers[other];
    if (value === undefined || value === '') continue;
    const name = labels.get(field), otherName = labels.get(other);
    if (reference === undefined || reference === '') {
      answerError(other, 'Complete “' + otherName + '” to check “' + name + '”.');
    }
    if (operator === 'onOrAfter') {
      for (const key of [other, field]) {
        if (!validDate(answers[key])) answerError(key, 'Enter a valid date in YYYY-MM-DD format for “' + labels.get(key) + '”.');
      }
      if (value < reference) answerError(field, '“' + name + '” must be on or after “' + otherName + '”.');
    } else if (operator === 'matches' && value !== reference) {
      answerError(field, '“' + name + '” must exactly match “' + otherName + '”.');
    } else if (operator === 'differs' && value === reference) {
      answerError(field, '“' + name + '” must differ from “' + otherName + '”.');
    }
  }
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
        if (typeof value !== 'string' || value.length > 4000 || /[\r\n]/.test(value))
          answerError(field.key, field.label + ' needs a single line of up to 4,000 characters.');
        text = value;
      } else {
        let doc;
        try {
          doc = rich(value);
        } catch (error) {
          if (error instanceof InputError) error.field = field.key;
          throw error;
        }
        text = doc.content.flatMap((p) => (p.content ?? []).map((t) => t.text)).join('');
      }
    }
    if (submitting && field.required && !text.trim())
      answerError(field.key, 'Complete the required field “' + field.label + '”.');
  }
  if (submitting) {
    for (const calculation of template.calculations ?? []) {
      if (!answers[calculation.start] && !answers[calculation.end]) continue;
      for (const key of [calculation.start, calculation.end]) {
        if (!validDate(answers[key])) answerError(key, 'Enter a valid date in YYYY-MM-DD format to calculate “' + calculation.label + '”.');
      }
    }
  }
  if (submitting && template.rules?.length) compareAnswers(template, answers, fields);
}

export function renderResponse(template, answers) {
  validateTemplate(template);
  validateAnswers(template, answers, true);
  const heading = (text, level) => ({ ...paragraph(text), type: 'heading', attrs: { level } });
  const values = { ...answers };
  for (const calculation of template.calculations ?? []) values[calculation.key] = elapsedDays(calculation, answers);
  const content = [heading(template.title, 1)];
  let size = 0;
  for (const block of template.blocks) {
    if (block.type === 'prose') {
      const resolved = resolveTemplateFields(block.document, (key) => values[key] ?? '');
      size += JSON.stringify(resolved.content).length;
      check(size <= 1_000_000, 'Completed document exceeds the output limit.');
      content.push(...resolved.content);
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
