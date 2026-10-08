/** Compiled/packed and workerd consumers; no DOM or reference-parser shim. */
export function checkHTMLAnchorLoss(core, server, spec = core.CoreSchemaSpec) {
  const schema = new core.Schema(spec);
  const importer = new server.ServerHTMLImporter();
  let checks = 0;
  const reported = (result) => {
    if (result.issues.length !== 1 || result.issues[0].code !== 'unmapped-inline-element'
      || result.issues[0].contribution !== 'element:a' || !Object.isFrozen(result.issues[0])
      || /private-bookmark|\/next|\/private-path/.test(JSON.stringify(result.issues))) {
      throw new Error('Named-anchor loss/privacy/immutable-report contract failed.');
    }
  };
  for (const anchor of ['<a id="private-bookmark">Section</a>', '<a id="private-bookmark"></a>',
    '<a>Section</a>', '<a href="/next" id="private-bookmark">Section</a>',
    '<a href="/next" name="private-bookmark">Section</a>', '<a href="" name="private-bookmark"></a>']) {
    const result = importer.parseWithReport(`<p>Before ${anchor} after.</p>`, schema);
    reported(result);
    if (result.document.textContent !== `Before ${anchor.includes('Section') ? 'Section' : ''} after.`) {
      throw new Error('Anchor loss report changed readable descendants.');
    }
    checks++;
  }
  for (const href of ['/next', '']) {
    const result = importer.parseWithReport(`<p>Before <a href="${href}"></a> after.</p>`, schema);
    if (result.issues.length || !result.document.child(0).content.some(node => node.isText && node.text === ''
      && node.marks.some(mark => mark.type.name === 'link' && mark.attrs.href === href))) {
      throw new Error('Safe empty hyperlink metadata was lost or misreported.');
    }
    const reopened = importer.parse(core.HTMLExporter.export(result.document, { document: false }), schema);
    if (JSON.stringify(reopened.toJSON()) !== JSON.stringify(result.document.toJSON())) {
      throw new Error('Empty hyperlink native HTML reopening differs.');
    }
    checks++;
  }
  const { link: _link, ...marks } = spec.marks;
  reported(importer.parseWithReport('<p><a href="/private-path">Readable</a></p>', new core.Schema({ ...spec, marks })));
  checks++;
  for (const kind of ['node', 'mark']) {
    const definition = { attrs: { id: { default: '' } }, parseHTML: [{ tag: 'a[id]',
      getAttrs: element => ({ id: element.getAttribute('id') }) }] };
    const custom = new core.Schema({ ...spec, ...(kind === 'node'
      ? { nodes: { ...spec.nodes, bookmark: { ...definition, inline: true, group: 'inline', content: 'inline*' } } }
      : { marks: { ...spec.marks, bookmark: definition } }) });
    const result = importer.parseWithReport('<p><a id="kept">Section</a></p>', custom);
    const first = result.document.child(0).child(0);
    if (result.issues.length || (kind === 'node' ? first.attrs.id : first.marks[0]?.attrs.id) !== 'kept') {
      throw new Error('Registered bookmark projection was lost or mislabeled.');
    }
    checks++;
  }
  const repeated = importer.parseWithReport(`<p>${'<a id="private-bookmark">Section</a>'.repeat(1000)}</p>`, schema);
  reported(repeated);
  if (repeated.document.textContent !== 'Section'.repeat(1000)) throw new Error('Repeated-anchor content lost.');
  checks++;
  const issues = [];
  const markdown = core.MarkdownImporter.parse('Before <a id="private-bookmark">Section</a> after.', schema, {
    parseHTMLInline(segments, target) {
      const result = importer.parseInlineWithReport(segments, target); issues.push(...result.issues); return result.nodes;
    },
  });
  // The inline adapter also reports its existing general projection boundary.
  // Require both reports rather than pretending this route returns only one.
  if (issues.map(issue => issue.code).join(',') !== 'unmapped-inline-element,inline-html-projection'
    || issues.some(issue => !Object.isFrozen(issue)) || /private-bookmark/.test(JSON.stringify(issues))) {
    throw new Error('Markdown inline anchor/projection/privacy reports differ.');
  }
  reported({ issues: [issues[0]] });
  if (markdown.textContent !== 'Before Section after.') throw new Error('Markdown anchor adapter lost text.');
  return checks + 1;
}
