import { useEffect, useRef, useState } from 'react';
import { mountMarkdownDocumentAudit } from './markdown-document-audit';

// A fixed, safe reference sample. No reference parser enters the public bundle.
const reference = '<p><a href="/guide">First paragraph.</a></p>\n<a href="/guide">\n</a><p><a href="/guide">Second <strong>paragraph</strong>.</a></p>\n';
const blocksReference = '<section id="report">\n<p>Before.</p>\n<hr />\n<p><img src="/demo-media.svg" alt="A &amp; B" title="Diagram" /></p>\n<p>After <strong>review</strong>.</p>\n</section>\n';
const tableReference = '<section id="results"><p>Before.</p><table><thead><tr><th>Name</th><th style="text-align:right">Result</th></tr></thead><tbody><tr><td><strong>Alpha</strong></td><td style="text-align:right"><a href="/ready">Ready</a></td></tr><tr><td>Beta</td><td style="text-align:right"><code>x</code></td></tr></tbody></table><p>After.</p></section>';
export function HTMLFlowWorkshop() {
  const mount = useRef<HTMLDivElement>(null);
  const [sample, setSample] = useState<'html' | 'plain-flow' | 'empty-flow' | 'blocks' | 'tables'>('html');
  useEffect(() => {
    if (!mount.current) return;
    return mountMarkdownDocumentAudit(sample === 'html' ? reference : sample === 'plain-flow' ? 'Before' : sample === 'blocks' ? blocksReference : sample === 'tables' ? tableReference : '', sample, true, mount.current).destroy;
  }, [sample]);
  return <section id="anonymous-flow"><label htmlFor="anonymous-flow-sample">Anonymous flow sample</label>{' '}<select id="anonymous-flow-sample" value={sample} onChange={event => setSample(event.target.value as typeof sample)}>
    <option value="html">Linked whitespace between paragraphs</option><option value="plain-flow">Plain inline text: clear and reopen</option>
    <option value="empty-flow">Childless inline content: fill and reopen</option>
    <option value="blocks">Images and dividers inside a section</option>
    <option value="tables">Editable Markdown tables inside a section</option>
  </select><div ref={mount} /></section>;
}
