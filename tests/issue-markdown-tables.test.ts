import { describe, expect, it } from 'vitest';
import { MarkdownExporter, MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { issueMarkdownOptions } from '../examples/react-app/src/issue-markdown-policy';

describe('issue workflow HTML table policy', () => {
  const schema = new Schema(StarterKit.schema);
  it.each([
    '<table><tr><td><strong>Ada</strong></td><td>Ready</td></tr></table>',
    '<table><tr><th scope="row">Owner</th><td>Ada</td></tr><tr><td colspan="2"><p>First</p><p>Second</p></td></tr></table>',
    '<table><tr><td rowspan="2">Team</td><td>Ada</td></tr><tr><td>Grace</td></tr></table>',
  ])('retains roles and structure through the actual host import policy: %s', html => {
    const doc = ServerHTMLImporter.parse(html, schema);
    const exported = MarkdownExporter.export(doc, { tableFormat: 'html' });
    const reopened = MarkdownImporter.parseWithSource(exported, schema, issueMarkdownOptions);
    expect(reopened.document.toJSON()).toEqual(doc.toJSON());
    expect(MarkdownExporter.exportWithSource(reopened.document, reopened.source, { tableFormat: 'pipe' }).markdown).toBe(exported);
  });
  it.each([
    '<div><p>Not a table</p></div>',
    '<table><tr><td>A</td></tr></table><p>Outside</p>',
  ])('declines unrelated HTML instead of enabling general HTML: %s', html => {
    expect(issueMarkdownOptions.parseHTMLBlock!(html, schema)).toBeNull();
    expect(MarkdownImporter.parse(html, schema, issueMarkdownOptions).textContent).toBe(html);
  });
  it('projects table HTML through schema sanitization, not a DOM injection', () => {
    const html = '<table onclick="alert(1)"><tr><td><script>alert(2)</script><a href="javascript:alert(3)">Safe label</a></td></tr></table>';
    const doc = MarkdownImporter.parse(html, schema, issueMarkdownOptions);
    expect(doc.child(0).type.name).toBe('table');
    const output = MarkdownExporter.export(doc, { tableFormat: 'html' });
    expect(output).not.toMatch(/onclick|<script|javascript:/u);
    expect(doc.textContent).toContain('Safe label');
    expect(typeof document).toBe('undefined');
  });
});
