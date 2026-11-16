import { expect, it } from 'vitest';
import { CoreSchemaSpec, Schema, MarkdownImporter } from '../src';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(CoreSchemaSpec);

it.each(['ordered_list', 'bullet_list'])('reports each lost checkbox in a mixed %s DOCX export', type => {
  const parsed = MarkdownImporter.parse('3. [ ] Pending\n4. Ordinary\n5. [x] Done', schema);
  const doc = schema.node('doc', {}, [schema.node(type, type === 'ordered_list' ? { start: 3 } : {}, parsed.child(0).content)]);
  const result = exportDOCX(doc);
  expect(result.report.issues.filter(issue => issue.code === 'task-state-omitted').map(issue => issue.path)).toEqual([[0, 0], [0, 2]]);
  const reopened = importDOCX(result.bytes, schema).document.child(0);
  expect(reopened.type.name).toBe(type);
  expect(reopened.content.map(item => item.textContent)).toEqual(['Pending', 'Ordinary', 'Done']);
  expect(reopened.content.every(item => item.type.name === 'list_item')).toBe(true);
  if (type === 'ordered_list') expect(reopened.attrs.start).toBe(3);
});
