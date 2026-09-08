import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema, type MarkdownHTMLFlowContext } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('task-aware Markdown HTML source recovery', () => {
  const schema = new Schema(CoreSchemaSpec);
  const find = (node: ReturnType<typeof MarkdownImporter.parse>, type: string): typeof node[] =>
    [...(node.type.name === type ? [node] : []), ...node.content.flatMap(child => find(child, type))];
  const bodies = [
    '- [ ] Inspect logs\n- [x] Notify team',
    '- [X] **Notify** team\n\n- [ ] Check again',
    '- [ ] Inspect logs  \n  Check timestamps\n- [x] Notify team',
    '- [ ] Parent\n  - [x] Child\n  - [ ] Second child',
    '3. Tasks\n   - [ ] First\n   - [x] Second',
    '> - [x] ![Diagram](/diagram.png "Caption") reviewed\n> - [ ] Follow up',
    '- [ ] # Heading\n- [x] Done',
    '- [ ] Parent\n\n  > Nested quote\n\n- [x] Done',
    '- [ ] Code\n\n  ```js\n  const x = 1;\n  ```\n\n- [x] Done',
  ];
  it.each(bodies)('preserves complete task trees and exact source: %s', body => {
    for (const ending of ['\n', '\r\n']) {
      const source = `<blockquote>\n\n${body}\n\n</blockquote>\n`.replaceAll('\n', ending);
      const fallback = vi.fn();
      const result = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
      });
      expect(fallback).not.toHaveBeenCalled();
      expect(result.document.child(0).type.name).toBe('blockquote');
      expect(find(result.document, 'task_list').map(node => node.toJSON())).toEqual(
        find(MarkdownImporter.parse(body, schema), 'task_list').map(node => node.toJSON()));
      expect(find(result.document, 'task_list').length).toBeGreaterThan(0);
      expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
      schema.validate(result.document);
    }
  });

  it.each(['pre', 'select', 'textarea', 'script'])('refuses task flattening inside %s', tag => {
    const source = `<div><${tag}>\n\n- [x] Done\n- [ ] Pending\n\n</${tag}></div>`;
    const fallback = vi.fn();
    const result = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalled();
    expect(result.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  });

  it.each(['task_list', 'task_item'])('refuses custom %s metadata rather than dropping it', type => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      [type]: { ...CoreSchemaSpec.nodes[type], attrs: { ...CoreSchemaSpec.nodes[type].attrs, owner: { default: 'Alice' } } },
    } });
    const source = '<blockquote>\n\n- [x] Done\n\n</blockquote>';
    const fallback = vi.fn();
    const result = MarkdownImporter.parseWithSource(source, custom, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.document.toJSON()).toEqual(MarkdownImporter.parse(source, custom).toJSON());
    expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  });

  it('exposes cached, deeply frozen task syntax with explicit checked state', () => {
    let context: MarkdownHTMLFlowContext | undefined;
    const inline = vi.fn(() => null);
    MarkdownImporter.parse('<blockquote>\n\n- [x] **Done**\n- [ ] Pending\n\n</blockquote>', schema, {
      parseHTMLInline: inline, parseHTMLFlow(_segments, _schema, value) { context = value; return null; },
    });
    const calls = inline.mock.calls.length;
    const tree = context!.readBlockSources!();
    expect(context!.readBlockSources!()).toBe(tree);
    const tasks = tree.find(source => source.kind === 'taskList');
    expect(tasks?.kind).toBe('taskList');
    if (tasks?.kind !== 'taskList') throw new Error('Missing task source');
    expect(Object.isFrozen(tasks.children)).toBe(true);
    expect(tasks.children.map(item => item.kind === 'taskItem' && item.checked)).toEqual([true, false]);
    for (const item of tasks.children) {
      expect(Object.isFrozen(item)).toBe(true);
      if (item.kind !== 'taskItem') throw new Error('Missing task item source');
      expect(Object.isFrozen(item.children)).toBe(true);
      expect(item.children.flatMap(child => child.blocks)).toEqual(item.blocks[0].content);
    }
    expect(inline).toHaveBeenCalledTimes(calls);
  });

  it('refuses HTML that changes task text instead of silently reinterpreting it', () => {
    const source = '<blockquote>\n\n- [x] <b>Done</b>\n\n</blockquote>';
    const fallback = vi.fn();
    const result = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  });
});
