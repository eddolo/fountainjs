import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, MarkdownExporter, MarkdownImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const options = { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, parseHTMLInline: ServerHTMLImporter.parseInline };

describe('source-recovered code keeps authored endings, not synthetic renderer endings', () => {
  for (const ending of ['\n', '\r\n']) {
    it.each([
      ['```js\nx\n```', 'x'],
      ['```js\nx\n\n```', 'x\n'],
      ['```js\n\nx\n```', '\nx'],
      ['```js\n\nx\n\n```', '\nx\n'],
      ['    x\n    y', 'x\ny'],
      ['```c++\nπ = 2\n```', 'π = 2'],
    ])(`preserves %s with ${JSON.stringify(ending)}`, (code, expected) => {
      const source = `<div>\n\n${code}\n\n</div>`.replaceAll('\n', ending);
      const fallbacks: unknown[] = [];
      const parsed = MarkdownImporter.parseWithSource(source, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
      expect(fallbacks).toEqual([]);
      expect(parsed.document.child(0).type.name).toBe('code_block');
      expect(parsed.document.child(0).textContent).toBe(expected);
      expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
      expect(ServerHTMLImporter.parse(HTMLExporter.export(parsed.document, { document: false }), schema).child(0).textContent).toBe(expected);
    });
  }

  it('handles CommonMark 191 foster parenting without adding a line to the displaced code', () => {
    const source = '<table>\n\n  <tr>\n\n    <td>\n      Hi\n    </td>\n\n  </tr>\n\n</table>\n';
    const parsed = MarkdownImporter.parse(source, schema, options);
    expect(parsed.child(0).type.name).toBe('code_block');
    expect(parsed.child(0).textContent).toBe('<td>\n  Hi\n</td>');
    expect(parsed.child(1).type.name).toBe('table');
  });

  it('does not trim actual HTML code endings or leak generated-code rules between blocks', () => {
    const source = '<pre><code>raw\n\n</code></pre>\n\n<div>\n\n```\ngenerated\n```\n\n</div>\n\n<pre>last\n</pre>';
    const parsed = MarkdownImporter.parse(source, schema, options);
    expect(parsed.content.map(node => node.textContent)).toEqual(['raw\n\n', 'generated', 'last\n']);
  });

  it('retains the renderer LF when generated code is flattened inside a different raw pre', () => {
    const source = '<div><pre>\n\n```\nx\n```\n\n</pre></div>';
    const parsed = MarkdownImporter.parse(source, schema, options);
    expect(parsed.child(0).textContent).toBe('x\n\n');
  });

  it('does not confuse a declined host parse rule with the generated wrapper', () => {
    const target = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      code_block: { ...CoreSchemaSpec.nodes.code_block, parseHTML: [{ tag: 'pre', contentElement: 'strong' }] },
    } });
    const parsed = MarkdownImporter.parse('<div>\n\n```\nx\n```\n\n</div>', target, options);
    expect(parsed.child(0).textContent).toBe('x');
  });
});
