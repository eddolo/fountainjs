import { expect, test, type Locator } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// This file deliberately combines browser layout, PDF parsing, 100k-block
// virtualization, and collaboration tests. Parallel Firefox on Windows can
// exceed Playwright's 30-second default despite the same case passing serially.
test.setTimeout(60_000);

async function selectBlockEnd(block: Locator): Promise<void> {
  await block.evaluate((element) => {
    const editor = element.closest<HTMLElement>('[contenteditable="true"]');
    const wrappers = element.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const wrapper = wrappers.item(wrappers.length - 1);
    const text = wrapper?.lastChild;
    if (!editor || !text || text.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected an editable terminal text node in the selected page block.');
    }
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

async function extractPDFPageText(pdf: Buffer): Promise<readonly string[]> {
  const task = getDocument({ data: new Uint8Array(pdf) });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      pages.push(content.items.flatMap((item) => ('str' in item ? [item.str] : [])).join(' ').replace(/\s+/gu, ' ').trim());
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

test.beforeEach(async ({ page, browserName }, testInfo) => {
  if (
    browserName !== 'chromium'
    && (
      testInfo.title.includes('PDF pages for every projected sheet in Chromium')
      || testInfo.title.includes('through Chromium clipboard')
      || testInfo.title.includes('into an external browser editor')
      || testInfo.title.includes('into a plain-text external editor')
      || testInfo.title.includes('copies math to external rich and plain-text editors')
    )
  ) {
    test.skip(true, 'This browser-specific bridge is exercised in Chromium.');
  }
  await page.goto('/browser-tests.html');
});

test('keeps comparison names separate from their copy in a mobile desktop-site viewport', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 800 });
  await page.goto('/#compare');
  const rows = page.getByRole('table', { name: 'Rich text editor comparison' }).getByRole('row');
  await expect(rows).toHaveCount(4);
  const layout = await rows.evaluateAll((items) => items.map((item) => {
    const label = item.querySelector<HTMLElement>('strong');
    const details = [...item.querySelectorAll<HTMLElement>('span')];
    if (!label || details.length !== 3) throw new Error('Expected one comparison label and three detail cells.');
    const labelBox = label.getBoundingClientRect();
    const rowBox = item.getBoundingClientRect();
    const detailBoxes = details.map((detail) => detail.getBoundingClientRect());
    return {
      labelRight: labelBox.right,
      firstDetailLeft: detailBoxes[0].left,
      detailTops: detailBoxes.map((box) => box.top),
      contained: [labelBox, ...detailBoxes].every((box) => box.left >= rowBox.left && box.right <= rowBox.right),
    };
  }));
  for (const row of layout) {
    expect(row.firstDetailLeft - row.labelRight).toBeGreaterThanOrEqual(20);
    expect(row.detailTops[1]).toBeGreaterThan(row.detailTops[0]);
    expect(row.detailTops[2]).toBeGreaterThan(row.detailTops[1]);
    expect(row.contained).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('renders, edits, and measures portable page intent in a real browser', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Page intent contract editor' });
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.insertBreak())).toBe(true);
  await expect(editor.locator('hr[data-fountain-page-break="true"]')).toHaveCount(1);
  await expect(editor.locator('[role="separator"]')).toHaveAttribute('aria-label', 'Page break');

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.insertFootnote())).toBe(true);
  const reference = editor.locator('sup[data-fountain-footnote-reference="browser-note"]');
  const definition = editor.locator('section[data-fountain-footnote-definition="browser-note"]');
  await expect(reference).toHaveCount(1);
  await expect(reference).toHaveAttribute('role', 'doc-noteref');
  await expect(reference).toHaveAttribute('data-fountain-footnote-number', '1');
  await expect(reference).toHaveAttribute('aria-label', 'Footnote 1');
  await expect(reference).toHaveText('1');
  await expect(definition).toHaveAttribute('role', 'doc-footnote');
  await expect(definition).toHaveAttribute('data-fountain-footnote-number', '1');
  await expect(definition).toHaveAttribute('aria-label', 'Footnote 1');
  await expect(definition).toContainText('Browser footnote definition');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.inspect().valid)).toBe(true);

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.selectDefinition())).toBe(true);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.state.selection.path)).toEqual([3, 0, 0]);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.removeFootnote())).toBe(true);
  await expect(reference).toHaveCount(0);
  await expect(definition).toHaveCount(0);

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.setHeader())).toBe(true);
  const header = editor.locator('header[data-fountain-page-header="default"]');
  await expect(header).toHaveCount(1);
  await expect(header).toHaveAttribute('aria-label', 'Header template (default)');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.insertPageNumber())).toBe(true);
  const field = header.locator('[data-fountain-page-field="page-number"]');
  await expect(field).toHaveCount(1);
  await expect(field).toHaveAttribute('contenteditable', 'false');
  await expect(field).toHaveText('{page}');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.inspectTemplates().valid)).toBe(true);

  const measured = await page.evaluate(() => {
    const snapshot = (globalThis as any).fountainBrowserTest.pages.measure();
    return {
      itemCount: snapshot.measurement.items.length,
      templates: snapshot.measurement.templates,
      warnings: snapshot.measurement.warnings,
      measurementCount: snapshot.measurement.measurementCount,
      pages: snapshot.layout.pages.length,
      presentationPages: snapshot.presentation.pages.map((projected: any) => ({
        number: projected.number,
        header: projected.header && {
          variant: projected.header.variant,
          fields: projected.header.fields.map((field: any) => field.value),
        },
      })),
      presentationWarnings: snapshot.presentation.warnings,
      hasManualBreak: snapshot.measurement.items.some((item: any) => item.breakAfter === true),
    };
  });
  expect(measured.itemCount).toBeGreaterThanOrEqual(3);
  expect(measured.templates).toMatchObject([{ kind: 'header', variant: 'default' }]);
  expect(measured.warnings).toEqual([]);
  expect(measured.measurementCount).toBeGreaterThan(0);
  expect(measured.pages).toBeGreaterThanOrEqual(2);
  expect(measured.presentationWarnings).toEqual([]);
  expect(measured.presentationPages.slice(0, 2)).toMatchObject([
    { number: 1, header: { variant: 'default', fields: ['1'] } },
    { number: 2, header: { variant: 'default', fields: ['2'] } },
  ]);
  expect(measured.hasManualBreak).toBe(true);
});

test('measures browser line boxes, list items, rowspan groups, and footnotes as legal page fragments', async ({ page }) => {
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.loadMeasurementFixture())).toBe(true);
  const result = await page.evaluate(() => {
    const snapshot = (globalThis as any).fountainBrowserTest.pages.measure();
    const summarize = (id: string) => {
      const item = snapshot.measurement.items.find((candidate: any) => candidate.id === id);
      return {
        fragments: item?.fragments?.length ?? (item ? 1 : 0),
        continuationHeight: item?.continuationHeight ?? 0,
        footnotes: item?.fragments?.flatMap((fragment: any) => fragment.footnotes ?? []).map((note: any) => note.id) ?? [],
      };
    };
    return {
      paragraph: summarize('block:1:paragraph'),
      list: summarize('block:2:bullet_list'),
      table: summarize('block:3:table'),
      sources: snapshot.measurement.fragmentSources,
      content: snapshot.content,
      warnings: snapshot.measurement.warnings,
      layoutWarnings: snapshot.layout.warnings,
      pages: snapshot.layout.pages.length,
    };
  });

  expect(result.warnings).toEqual([]);
  expect(result.paragraph.fragments).toBeGreaterThan(2);
  expect(result.paragraph.footnotes).toContain('measure-note');
  expect(result.list.fragments).toBe(3);
  expect(result.table.fragments).toBe(2);
  expect(result.table.continuationHeight).toBeGreaterThan(0);
  const paragraphSources = result.sources.filter((source: any) => source.itemId === 'block:1:paragraph');
  expect(paragraphSources).toHaveLength(result.paragraph.fragments);
  expect(paragraphSources[0]).toMatchObject({
    kind: 'text-line', sourcePath: [1], fragmentIndex: 0, clipOffset: 0,
  });
  expect(paragraphSources.every((source: any, index: number) => (
    index === 0 || source.clipOffset > paragraphSources[index - 1].clipOffset
  ))).toBe(true);
  expect(result.sources.filter((source: any) => source.itemId === 'block:2:bullet_list'))
    .toMatchObject([
      { kind: 'list-item', sourcePath: [2], partPaths: [[2, 0]] },
      { kind: 'list-item', sourcePath: [2], partPaths: [[2, 1]] },
      { kind: 'list-item', sourcePath: [2], partPaths: [[2, 2]] },
    ]);
  expect(result.sources.filter((source: any) => source.itemId === 'block:3:table'))
    .toMatchObject([
      { kind: 'table-row-group', sourcePath: [3], partPaths: [[3, 0]] },
      { kind: 'table-row-group', sourcePath: [3], partPaths: [[3, 1], [3, 2]] },
    ]);
  expect(result.content.pages.flatMap((page: any) => page.placements)
    .flatMap((placement: any) => placement.sources)).toHaveLength(result.sources.length);
  expect(result.content.pages.flatMap((page: any) => page.placements)
    .every((placement: any) => placement.sources.length === placement.fragmentTo - placement.fragmentFrom)).toBe(true);
  expect(result.pages).toBeGreaterThan(1);

  const preview = await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.preview(true));
  expect(preview).toMatchObject({
    pageCount: result.pages,
    printPageName: 'fountain-preview-w260-h120',
    visualPagesHidden: true,
    accessibleDocuments: 1,
    manualBreaks: 0,
    sourceUnchanged: true,
  });
  expect(preview.printStyle).toContain('@page { size: 260px 120px; margin: 0; }');
  expect(preview.pageNumbers).toEqual(Array.from({ length: result.pages }, (_value, index) => String(index + 1)));
  expect(preview.clippedPlacements).toBeGreaterThan(0);
  await page.emulateMedia({ media: 'print' });
  const printStyles = await page.locator('#browser-page-preview').evaluate((target) => {
    const sheet = target.querySelector<HTMLElement>('[data-fountain-page]');
    if (!sheet) throw new Error('Expected one rendered preview sheet.');
    return {
      display: getComputedStyle(target).display,
      background: getComputedStyle(target).backgroundColor,
      accessibleDisplay: getComputedStyle(target.querySelector<HTMLElement>('.fountain-page-preview__accessible')!).display,
      boxShadow: getComputedStyle(sheet).boxShadow,
      breakAfter: getComputedStyle(sheet).breakAfter,
    };
  });
  expect(printStyles.display).toBe('block');
  expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(printStyles.background);
  expect(printStyles.accessibleDisplay).toBe('none');
  expect(printStyles.boxShadow).toBe('none');
  expect(['page', 'always']).toContain(printStyles.breakAfter);
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#browser-page-preview').evaluate((target) => target.remove());

  const controller = await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.controllerProbe());
  const sortedDurations = [...controller.cycles].sort((left: number, right: number) => left - right);
  const p95 = sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * .95))];
  expect(controller).toMatchObject({ lastRevision: 12, lastReason: 'manual', destroyed: true });
  expect(p95).toBeLessThan(75);
});

test('continues measured long footnotes through editable and print page projections', async ({ page, browserName }) => {
  await page.goto('/browser-tests.html?fixture=pages-preview');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.loadLongFootnoteFixture())).toBe(true);
  const measured = await page.evaluate(() => {
    const snapshot = (globalThis as any).fountainBrowserTest.pages.measureLongFootnote();
    const measurement = snapshot.measurement.items
      .flatMap((item: any) => item.fragments ?? [])
      .flatMap((fragment: any) => fragment.footnotes ?? [])
      .find((footnote: any) => footnote.id === 'long-note');
    const placements = snapshot.layout.pages.flatMap((layoutPage: any) => (
      layoutPage.footnotes
        .filter((footnote: any) => footnote.id === 'long-note')
        .map((footnote: any) => ({ page: layoutPage.number, ...footnote }))
    ));
    return {
      measurement,
      placements,
      warnings: snapshot.layout.warnings,
      footnoteText: document.querySelector<HTMLElement>(
        '#pages-editor [data-fountain-footnote-definition="long-note"]',
      )?.textContent ?? '',
      footnoteSources: snapshot.measurement.footnoteSources,
      presentationPaths: snapshot.presentation.pages.flatMap((presentationPage: any) => (
        presentationPage.footnotes
          .filter((footnote: any) => footnote.id === 'long-note')
          .map((footnote: any) => footnote.sourcePath)
      )),
    };
  });

  expect(measured.measurement).toBeDefined();
  expect(measured.measurement.fragments.length).toBeGreaterThan(4);
  expect(measured.footnoteSources).toHaveLength(measured.measurement.fragments.length);
  expect(measured.footnoteSources[0]?.textFrom).toBe(0);
  expect(measured.footnoteSources.at(-1)?.textTo).toBe(measured.footnoteText.length);
  measured.footnoteSources.forEach((source: any, index: number) => {
    if (index > 0) expect(source.textFrom).toBe(measured.footnoteSources[index - 1].textTo);
    expect(measured.footnoteText.slice(source.textFrom, source.textTo)).toMatch(/\S/u);
  });
  expect(measured.footnoteSources.map((source: any) => (
    measured.footnoteText.slice(source.textFrom, source.textTo)
  )).join('')).toBe(measured.footnoteText);
  expect(measured.placements.length).toBeGreaterThan(1);
  expect(measured.placements[0]).toMatchObject({
    fragmentFrom: 0, clipOffset: 0, continuedBefore: false, continuedAfter: true,
  });
  expect(measured.placements.at(-1)).toMatchObject({
    fragmentTo: measured.measurement.fragments.length, continuedBefore: true, continuedAfter: false,
  });
  for (let index = 1; index < measured.placements.length; index += 1) {
    expect(measured.placements[index].fragmentFrom).toBe(measured.placements[index - 1].fragmentTo);
    expect(measured.placements[index].clipOffset).toBeCloseTo(
      measured.placements[index - 1].clipOffset + measured.placements[index - 1].height,
      5,
    );
  }
  expect(measured.placements.reduce((total: number, placement: any) => total + placement.height, 0))
    .toBeCloseTo(measured.measurement.height, 5);
  expect(measured.presentationPaths).toEqual(measured.placements.map(() => [2]));
  expect(measured.warnings).toEqual([]);

  const preview = await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.previewLongFootnote());
  expect(preview.sourceUnchanged).toBe(true);
  expect(preview.footnoteClips).toHaveLength(measured.placements.length);
  expect(preview.footnoteClips[0]).toMatchObject({ before: 'false', after: 'true', transform: 'translateY(0px)' });
  expect(preview.footnoteClips.at(-1)).toMatchObject({ before: 'true', after: 'false' });
  expect(preview.footnoteClips.every((clip: any) => clip.height > 0)).toBe(true);
  expect(preview.footnoteClips.every((clip: any) => clip.exact === 'true')).toBe(true);
  preview.footnoteClips.forEach((clip: any, index: number) => {
    expect(clip.height).toBeCloseTo(measured.placements[index].height, 1);
    expect(Number.parseFloat(clip.transform.match(/-?[\d.]+/u)?.[0] ?? 'NaN'))
      .toBeCloseTo(-measured.placements[index].clipOffset, 2);
  });
  await expect(page.locator('#pages-editor [data-fountain-footnote-definition="long-note"]')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#browser-page-preview .fountain-page-preview__footnote-clip')).toHaveCount(
    measured.placements.length,
  );
  if (browserName === 'chromium') {
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    const pageText = await extractPDFPageText(pdf);
    const tokens = pageText.flatMap((text) => text.match(/FN\d{3}/gu) ?? []);
    expect(pageText).toHaveLength(preview.pageCount);
    expect(tokens).toHaveLength(120);
    expect(new Set(tokens).size).toBe(120);
    expect(tokens[0]).toBe('FN001');
    expect(tokens.at(-1)).toBe('FN120');
  }
  await page.emulateMedia({ media: 'screen' });

  await page.goto('/browser-tests.html?fixture=editable-long-footnote-pages');
  const editor = page.getByRole('textbox', { name: 'Long footnote page editor' });
  await expect(editor.locator(':scope > [data-fountain-footnote-definition="long-note"]')).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().pages
  ))).toBeGreaterThan(1);
  const editableSummary = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary()
  ));
  expect(editableSummary).toMatchObject({ mode: 'paged', issues: [], errors: [] });
  const editableClips = page.locator('.fountain-editable-pages__footnote-clip');
  expect(await editableClips.count()).toBeGreaterThan(1);
  await expect(editableClips.first()).toHaveAttribute('data-fountain-footnote-continued-before', 'false');
  await expect(editableClips.first()).toHaveAttribute('data-fountain-footnote-continued-after', 'true');
  await expect(editableClips.last()).toHaveAttribute('data-fountain-footnote-continued-before', 'true');
  await expect(editableClips.last()).toHaveAttribute('data-fountain-footnote-continued-after', 'false');
});

test('prints a mixed repeated-footnote, merged-table, and manual-break document without loss', async ({ page, browserName }) => {
  await page.goto('/browser-tests.html?fixture=pages-preview');
  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.loadAdversarialPrintFixture()
  ))).toBe(true);
  const measured = await page.evaluate(() => {
    const snapshot = (globalThis as any).fountainBrowserTest.pages.measureAdversarialPrint();
    const notes = snapshot.layout.pages.flatMap((layoutPage: any) => (
      layoutPage.footnotes.map((footnote: any) => ({ page: layoutPage.number, ...footnote }))
    ));
    return {
      pages: snapshot.layout.pages.length,
      measurementWarnings: snapshot.measurement.warnings,
      layoutWarnings: snapshot.layout.warnings,
      presentationWarnings: snapshot.presentation.warnings,
      alpha: notes.filter((note: any) => note.id === 'alpha-proof'),
      beta: notes.filter((note: any) => note.id === 'beta-proof'),
      tablePlacements: snapshot.content.pages.flatMap((contentPage: any) => (
        contentPage.placements.filter((placement: any) => placement.itemId === 'block:3:table')
      )),
    };
  });
  expect(measured.measurementWarnings).toEqual([]);
  expect(measured.layoutWarnings).toEqual([]);
  expect(measured.presentationWarnings).toEqual([]);
  expect(measured.pages).toBeGreaterThan(3);
  expect(measured.alpha.length).toBeGreaterThan(1);
  expect(measured.beta).toHaveLength(1);
  expect(measured.tablePlacements.length).toBeGreaterThan(1);
  await expect(page.locator('#pages-editor [data-fountain-footnote-reference]')).toHaveCount(4);

  const preview = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.previewAdversarialPrint()
  ));
  expect(preview).toMatchObject({
    pageCount: measured.pages,
    visualPagesHidden: true,
    accessibleDocuments: 1,
    sourceUnchanged: true,
  });
  const contract = await page.locator('#browser-page-preview').evaluate((target) => {
    const sheets = [...target.querySelectorAll<HTMLElement>('.fountain-page-preview__sheet')];
    const references = [...target.querySelectorAll<HTMLElement>(
      '.fountain-page-preview__sheet [data-fountain-footnote-reference]',
    )].map((reference) => ({
      id: reference.dataset.fountainFootnoteReference,
      number: reference.dataset.fountainFootnoteNumber,
      href: reference.querySelector('a')?.getAttribute('href'),
      page: reference.closest<HTMLElement>('[data-fountain-page]')?.dataset.fountainPage,
    }));
    const definitions = [...target.querySelectorAll<HTMLElement>(
      '.fountain-page-preview__sheet [data-fountain-footnote-definition]',
    )].map((definition) => ({
      id: definition.dataset.fountainFootnoteDefinition,
      number: definition.dataset.fountainFootnoteNumber,
      domId: definition.id,
      page: definition.closest<HTMLElement>('[data-fountain-page]')?.dataset.fountainPage,
    }));
    return {
      references,
      definitions,
      linksResolve: references.every((reference) => (
        typeof reference.href === 'string' && target.querySelector(reference.href) !== null
      )),
      uniqueDefinitionIds: new Set(definitions.map((definition) => definition.domId)).size,
      exactAlphaClips: [...target.querySelectorAll<HTMLElement>(
        '[data-fountain-page-footnote="alpha-proof"]',
      )].every((clip) => clip.dataset.fountainFootnoteExactTextSlice === 'true'),
      overflowPages: sheets.filter((sheet) => sheet.dataset.fountainPageOverflow === 'true').length,
      headerText: sheets.map((sheet) => (
        sheet.querySelector('.fountain-page-preview__header')?.textContent?.replace(/\s+/gu, ' ').trim()
      )),
    };
  });
  const betaReferences = contract.references.filter((reference) => reference.id === 'beta-proof');
  const alphaReferences = contract.references.filter((reference) => reference.id === 'alpha-proof');
  expect(betaReferences.length).toBeGreaterThanOrEqual(2);
  expect(betaReferences.every((reference) => reference.number === '1')).toBe(true);
  expect(alphaReferences.length).toBeGreaterThanOrEqual(2);
  expect(alphaReferences.every((reference) => reference.number === '2')).toBe(true);
  expect(contract.definitions.filter((definition) => definition.id === 'beta-proof').map((definition) => definition.number))
    .toEqual(['1']);
  expect(contract.definitions.filter((definition) => definition.id === 'alpha-proof').every((definition) => (
    definition.number === '2'
  ))).toBe(true);
  expect(contract.linksResolve).toBe(true);
  expect(contract.uniqueDefinitionIds).toBe(contract.definitions.length);
  expect(contract.exactAlphaClips).toBe(true);
  expect(contract.overflowPages).toBe(0);
  expect(contract.headerText).toEqual(Array.from(
    { length: preview.pageCount },
    (_value, index) => `Adversarial report · ${index + 1} / ${preview.pageCount}`,
  ));

  await page.emulateMedia({ media: 'print' });
  if (browserName === 'chromium') {
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    const pageText = await extractPDFPageText(pdf);
    const alphaTokens = pageText.flatMap((text) => text.match(/ALPHA\d{3}/gu) ?? []);
    expect(pageText).toHaveLength(preview.pageCount);
    expect(alphaTokens).toHaveLength(80);
    expect(new Set(alphaTokens).size).toBe(80);
    expect(pageText.join(' ').match(/BETAONLY/gu)).toHaveLength(1);
    expect(pageText.join(' ').match(/AFTERBREAK/gu)).toHaveLength(1);
  }
  await page.emulateMedia({ media: 'screen' });
});

test('paginates imported styled semantic HTML without structural or PDF text loss', async ({ page, browserName }) => {
  await page.goto('/browser-tests.html?fixture=pages-preview');
  const imported = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.loadImportedStyledFixture()
  ));
  expect(imported).toMatchObject({
    types: ['heading', 'paragraph', 'blockquote', 'table', 'math_block', 'page_break', 'paragraph'],
    headingAlign: 'right',
    headingMarks: {
      text_color: { color: '#123456' },
      font_family: { family: 'Georgia, serif' },
      font_size: { size: '22px' },
    },
    paragraphAlign: 'justify',
    paragraphMarks: {
      text_color: { color: '#6547ff' },
      highlight: { color: '#e1dafe' },
      font_family: { family: 'Arial, sans-serif' },
      font_size: { size: '18px' },
      line_height: { lineHeight: '1.8' },
    },
    ruby: {
      type: 'ruby', attrs: { rt: 'とうきょう' },
      content: [{ type: 'text', marks: [{ type: 'strong' }], text: '東京' }],
    },
    nestedListStart: 4,
    secondItemBlocks: 2,
    tableHeader: { colspan: 2, rowspan: 1, colwidth: null, scope: 'col' },
    tableRowspan: 2,
    tableColspan: 2,
    math: { latex: 'x^2+y^2=z^2', ariaLabel: 'Pythagorean theorem' },
  });

  const measured = await page.evaluate(() => {
    const snapshot = (globalThis as any).fountainBrowserTest.pages.measureImportedStyled();
    return {
      pages: snapshot.layout.pages.length,
      measurementWarnings: snapshot.measurement.warnings,
      layoutWarnings: snapshot.layout.warnings,
      presentationWarnings: snapshot.presentation.warnings,
      paragraphPlacements: snapshot.content.pages.flatMap((contentPage: any) => (
        contentPage.placements
          .filter((placement: any) => placement.itemId === 'block:1:paragraph')
          .map(() => contentPage.number)
      )),
      blockquotePlacements: snapshot.content.pages.flatMap((contentPage: any) => (
        contentPage.placements
          .filter((placement: any) => placement.itemId === 'block:2:blockquote')
          .map(() => contentPage.number)
      )),
      tablePlacements: snapshot.content.pages.flatMap((contentPage: any) => (
        contentPage.placements
          .filter((placement: any) => placement.itemId === 'block:3:table')
          .map(() => contentPage.number)
      )),
    };
  });
  expect(measured.measurementWarnings).toEqual([]);
  expect(measured.layoutWarnings).toEqual([]);
  expect(measured.presentationWarnings).toEqual([]);
  expect(measured.pages).toBeGreaterThan(3);
  expect(measured.paragraphPlacements.length).toBeGreaterThan(1);
  expect(measured.blockquotePlacements.length).toBeGreaterThan(1);
  expect(measured.tablePlacements.length).toBeGreaterThan(1);

  const preview = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.previewImportedStyled()
  ));
  expect(preview).toMatchObject({
    pageCount: measured.pages,
    visualPagesHidden: true,
    accessibleDocuments: 1,
    sourceUnchanged: true,
  });
  const contract = await page.locator('#browser-page-preview').evaluate((target) => {
    const heading = target.querySelector<HTMLElement>(
      '.fountain-page-preview__sheet [data-fountain-page-item="block:0:heading"]',
    )!;
    const styledRoot = target.querySelector<HTMLElement>(
      '.fountain-page-preview__sheet [data-fountain-page-item="block:1:paragraph"]',
    )!;
    const colored = styledRoot.querySelector<HTMLElement>('span[style^="color:"]')!;
    const highlighted = styledRoot.querySelector<HTMLElement>('mark[style^="background-color:"]')!;
    const family = styledRoot.querySelector<HTMLElement>('[style*="font-family"]')!;
    const sized = styledRoot.querySelector<HTMLElement>('[style*="font-size"]')!;
    const blockquotes = [...target.querySelectorAll<HTMLElement>(
      '.fountain-page-preview__sheet blockquote[data-fountain-page-item="block:2:blockquote"]',
    )];
    const pageOf = (selector: string) => target.querySelector<HTMLElement>(selector)
      ?.closest<HTMLElement>('[data-fountain-page]')?.dataset.fountainPage;
    return {
      headingPage: pageOf('[data-fountain-page-item="block:0:heading"]'),
      paragraphPage: pageOf('[data-fountain-page-item="block:1:paragraph"]'),
      afterBreakPage: pageOf('[data-fountain-page-item="block:6:paragraph"]'),
      headingAlign: getComputedStyle(heading).textAlign,
      color: getComputedStyle(colored).color,
      background: getComputedStyle(highlighted).backgroundColor,
      family: getComputedStyle(family).fontFamily,
      size: getComputedStyle(sized).fontSize,
      lineHeight: getComputedStyle(sized).lineHeight,
      blockquoteChildCounts: blockquotes.map((blockquote) => blockquote.children.length),
      ruby: target.querySelectorAll('.fountain-page-preview__sheet ruby').length,
      math: target.querySelectorAll('.fountain-page-preview__sheet [data-fountain-math="block"]').length,
      pageBreaks: target.querySelectorAll('.fountain-page-preview__sheet [data-fountain-page-break]').length,
      tableHeaderColspan: target.querySelector('th')?.getAttribute('colspan'),
      tableBodyRowspan: target.querySelector('td[rowspan]')?.getAttribute('rowspan'),
    };
  });
  expect(contract).toMatchObject({
    headingPage: contract.paragraphPage,
    headingAlign: 'right',
    color: 'rgb(101, 71, 255)',
    background: 'rgb(225, 218, 254)',
    family: 'Arial, sans-serif',
    size: '18px',
    ruby: 1,
    math: 1,
    pageBreaks: 0,
    tableHeaderColspan: '2',
    tableBodyRowspan: '2',
  });
  expect(Number.parseFloat(contract.lineHeight)).toBeCloseTo(32.4, 1);
  expect(contract.blockquoteChildCounts).toHaveLength(measured.blockquotePlacements.length);
  expect(contract.blockquoteChildCounts.every((count) => count === 1)).toBe(true);
  expect(Number(contract.afterBreakPage)).toBeGreaterThan(Math.max(...measured.tablePlacements));

  await page.emulateMedia({ media: 'print' });
  if (browserName === 'chromium') {
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    const pageText = await extractPDFPageText(pdf);
    const importedTokens = pageText.flatMap((text) => text.match(/IMPORT\d{3}/gu) ?? []);
    expect(pageText).toHaveLength(preview.pageCount);
    expect(importedTokens).toHaveLength(72);
    expect(new Set(importedTokens).size).toBe(72);
    expect(importedTokens[0]).toBe('IMPORT001');
    expect(importedTokens.at(-1)).toBe('IMPORT072');
    const completeText = pageText.join(' ');
    expect(completeText.match(/Semantic quotation/gu)).toHaveLength(1);
    expect(completeText.match(/Nested imported item four/gu)).toHaveLength(1);
    expect(completeText.match(/A second paragraph remains/gu)).toHaveLength(1);
    expect(completeText.match(/AFTERIMPORTEDBREAK/gu)).toHaveLength(1);
  }
  await page.emulateMedia({ media: 'screen' });
});

test('uses a host print renderer without moving or exposing live custom DOM', async ({ page }) => {
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.loadMeasurementFixture())).toBe(true);
  const preview = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.previewWithHostRenderer()
  ));
  expect(preview.sourceUnchanged).toBe(true);
  const projection = page.locator(
    '#browser-page-preview .fountain-page-preview__sheet [data-host-print-projection="heading"]',
  );
  await expect(projection).toHaveCount(1);
  await expect(projection).toContainText('Host-rendered heading');
  await expect(projection).toHaveAttribute('contenteditable', 'false');
  await expect(projection).toHaveAttribute('id', /^fountain-preview-\d+-\d+-host-print-heading$/u);
  await expect(projection).not.toHaveAttribute('data-fountain-path', /.+/u);
  await expect(projection.locator('button')).toBeDisabled();
  await expect(page.locator('#pages-editor h2')).toHaveText('Measured layout');
  await expect(page.locator('#pages-editor [data-host-print-projection]')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(projection).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
});

test('projects exact A4 and Letter print sheets in every browser engine', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=pages-preview');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.setHeader())).toBe(true);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.insertPageNumber())).toBe(true);

  for (const format of [
    {
      name: 'a4', width: 210 * 96 / 25.4, height: 297 * 96 / 25.4,
      cssWidth: '793.700787', cssHeight: '1122.519685',
      pageName: 'fountain-preview-w793p700787-h1122p519685',
    },
    {
      name: 'letter', width: 8.5 * 96, height: 11 * 96,
      cssWidth: '816', cssHeight: '1056',
      pageName: 'fountain-preview-w816-h1056',
    },
  ] as const) {
    const preview = await page.evaluate((name) => (
      (globalThis as any).fountainBrowserTest.pages.previewPhysical(name)
    ), format.name);
    expect(preview).toMatchObject({
      visualPagesHidden: true,
      accessibleDocuments: 1,
      manualBreaks: 0,
      sourceUnchanged: true,
    });
    expect(preview.pageWidth).toBeCloseTo(format.width, 8);
    expect(preview.pageHeight).toBeCloseTo(format.height, 8);
    expect(preview.pageCount).toBeGreaterThan(1);
    expect(preview.printPageName).toBe(format.pageName);
    expect(preview.pageNumbers).toEqual(
      Array.from({ length: preview.pageCount }, (_value, index) => String(index + 1)),
    );
    expect(preview.printStyle).toContain(
      `@page { size: ${format.cssWidth}px ${format.cssHeight}px; margin: 0; }`,
    );

    await page.emulateMedia({ media: 'print' });
    const contract = await page.locator('#browser-page-preview').evaluate((target) => {
      const sheets = [...target.querySelectorAll<HTMLElement>('.fountain-page-preview__sheet')];
      const transientSelector = [
        '[contenteditable="true"]',
        '[data-fountain-path]',
        '[data-fountain-text-path]',
        '[data-fountain-selected-node]',
        '[data-fountain-selected-cell]',
        '[data-fountain-gap]',
        '[data-fountain-dragging]',
        '[data-fountain-resizing]',
        '[draggable]',
      ].join(',');
      return {
        root: {
          display: getComputedStyle(target).display,
          background: getComputedStyle(target).backgroundColor,
          accessibleDisplay: getComputedStyle(
            target.querySelector<HTMLElement>('.fountain-page-preview__accessible')!,
          ).display,
        },
        sheets: sheets.map((sheet) => {
          const rect = sheet.getBoundingClientRect();
          const header = sheet.querySelector<HTMLElement>('.fountain-page-preview__header')!;
          const body = sheet.querySelector<HTMLElement>('.fountain-page-preview__body')!;
          const footer = sheet.querySelector<HTMLElement>('.fountain-page-preview__footer')!;
          return {
            number: sheet.dataset.fountainPage,
            ariaHidden: sheet.getAttribute('aria-hidden'),
            width: rect.width,
            height: rect.height,
            headerHeight: header.getBoundingClientRect().height,
            bodyHeight: body.getBoundingClientRect().height,
            footerHeight: footer.getBoundingClientRect().height,
            headerText: header.textContent?.replace(/\s+/gu, ' ').trim(),
            footnotes: sheet.querySelectorAll('.fountain-page-preview__footnotes').length,
            shadow: getComputedStyle(sheet).boxShadow,
            breakAfter: getComputedStyle(sheet).breakAfter,
            pageBreakAfter: getComputedStyle(sheet).pageBreakAfter,
            namedPage: sheet.style.getPropertyValue('page'),
            transientNodes: sheet.querySelectorAll(transientSelector).length,
            interactiveControls: sheet.querySelectorAll(
              'input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
            ).length,
          };
        }),
      };
    });

    expect(contract.root.display).toBe('block');
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(contract.root.background);
    expect(contract.root.accessibleDisplay).toBe('none');
    expect(contract.sheets).toHaveLength(preview.pageCount);
    contract.sheets.forEach((sheet, index) => {
      expect(sheet.number).toBe(String(index + 1));
      expect(sheet.ariaHidden).toBe('true');
      expect(Math.abs(sheet.width - format.width)).toBeLessThanOrEqual(.05);
      expect(Math.abs(sheet.height - format.height)).toBeLessThanOrEqual(.05);
      expect(Math.abs(sheet.headerHeight - 48)).toBeLessThanOrEqual(.05);
      expect(Math.abs(sheet.bodyHeight - (format.height - 144))).toBeLessThanOrEqual(.05);
      expect(sheet.footerHeight).toBe(0);
      expect(sheet.headerText).toBe(`Browser report · ${index + 1}`);
      expect(sheet.footnotes).toBe(index === 0 ? 1 : 0);
      expect(sheet.shadow).toBe('none');
      expect(sheet.namedPage).toBe(preview.printPageName);
      expect(sheet.transientNodes).toBe(0);
      expect(sheet.interactiveControls).toBe(0);
      if (index === contract.sheets.length - 1) {
        expect(sheet.breakAfter).toBe('auto');
        expect(sheet.pageBreakAfter).toBe('auto');
      } else {
        expect(['page', 'always']).toContain(sheet.breakAfter);
        expect(sheet.pageBreakAfter).toBe('always');
      }
    });
    await page.emulateMedia({ media: 'screen' });
  }
});

test('emits exact A4 and Letter PDF pages for every projected sheet in Chromium', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright exposes PDF generation only for Chromium.');
  await page.goto('/browser-tests.html?fixture=pages-preview');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.setHeader())).toBe(true);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.insertPageNumber())).toBe(true);
  for (const format of [
    { name: 'a4', widthPoints: 210 * 72 / 25.4, heightPoints: 297 * 72 / 25.4 },
    { name: 'letter', widthPoints: 8.5 * 72, heightPoints: 11 * 72 },
  ] as const) {
    const preview = await page.evaluate((name) => (
      (globalThis as any).fountainBrowserTest.pages.previewPhysical(name)
    ), format.name);
    expect(preview.pageCount).toBeGreaterThan(1);
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    const source = pdf.toString('latin1');
    expect(source.match(/\/Type\s*\/Page\b/g)).toHaveLength(preview.pageCount);
    const mediaBoxes = [...source.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((match) => (
      match[1]?.trim().split(/\s+/u).map(Number) ?? []
    ));
    expect(mediaBoxes).toHaveLength(preview.pageCount);
    mediaBoxes.forEach(([left, bottom, right, top]) => {
      expect(left).toBe(0);
      expect(bottom).toBe(0);
      expect(Math.abs((right ?? 0) - format.widthPoints)).toBeLessThanOrEqual(.5);
      expect(Math.abs((top ?? 0) - format.heightPoints)).toBeLessThanOrEqual(.5);
    });

    const pageText = await extractPDFPageText(pdf);
    expect(pageText).toHaveLength(preview.pageCount);
    expect(pageText[0]).toMatch(/^Browser report · 1 /u);
    expect(pageText[0]).toContain('Measured layout');
    expect(pageText[0]).toContain('First list item');
    expect(pageText[0]).toContain('A measured footnote body.');
    expect(pageText.at(-1)).toMatch(/^Browser report · 2 /u);
    expect(pageText.at(-1)).toContain('After the manual break');
    expect(pageText.at(-1)).not.toContain('Measured layout');
    expect(pageText.join(' ').match(/Measured layout/gu)).toHaveLength(1);
  }
});

test('keeps 1,000-block pagination reflow local to the changed block', async ({ page }) => {
  const result = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.incrementalProbe()
  ));
  const durations = [...result.incrementalDurations].sort((left: number, right: number) => left - right);
  const p95 = durations[Math.max(0, Math.ceil(durations.length * .95) - 1)];
  expect(result).toMatchObject({ initialReads: 1001, retainedBlocks: 999, blockCount: 1000 });
  expect(result.incrementalReads).toHaveLength(20);
  expect(Math.max(...result.incrementalReads)).toBeLessThanOrEqual(2);
  expect(p95).toBeLessThan(75);
});

test('bounds alternating edge reflow across 5,000 rendered page blocks', async ({ page }) => {
  const mutationIndexes = Array.from({ length: 20 }, (_, iteration) => (
    iteration % 2 === 0 ? iteration / 2 : 4_999 - Math.floor(iteration / 2)
  ));
  const result = await page.evaluate((indexes) => (
    (globalThis as any).fountainBrowserTest.pages.incrementalProbe({
      blockCount: 5_000,
      mutationIndexes: indexes,
    })
  ), mutationIndexes);
  const durations = [...result.incrementalDurations].sort((left: number, right: number) => left - right);
  const p95 = durations[Math.max(0, Math.ceil(durations.length * .95) - 1)];
  expect(result).toMatchObject({
    initialReads: 5_001,
    retainedBlocks: 4_980,
    blockCount: 5_000,
    mutationIndexes,
  });
  expect(result.incrementalReads).toHaveLength(20);
  expect(Math.max(...result.incrementalReads)).toBeLessThanOrEqual(2);
  expect(p95).toBeLessThan(250);
});

test('keeps 5,000 unchanged page blocks cached through leading insertion and removal', async ({ page }) => {
  const result = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.structuralProbe()
  ));
  const durations = [...result.insertionDurations, ...result.removalDurations]
    .sort((left: number, right: number) => left - right);
  const p95 = durations[Math.max(0, Math.ceil(durations.length * .95) - 1)];
  expect(result).toMatchObject({
    blockCount: 5_000,
    iterations: 6,
    initialReads: 5_001,
    insertedRetainedBlocks: 5_000,
    restoredRetainedBlocks: 5_000,
    insertedLastPath: '5000',
    insertedLastTextPath: '5000.0',
    insertedLastItem: 'block:5000:paragraph',
    insertedLastSourcePath: [5_000],
    restoredLastPath: '4999',
    restoredLastTextPath: '4999.0',
    warnings: 0,
  });
  expect(result.insertionReads).toEqual(Array(6).fill(2));
  expect(result.removalReads).toEqual(Array(6).fill(1));
  expect(p95).toBeLessThan(500);
});

test('edits, selects, and composes across guarded page shells in one contenteditable', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-pages');
  const editor = page.getByRole('textbox', { name: 'Editable page canvas editor' });
  const host = page.getByLabel('Editable pages browser contract').locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect(host.locator('.fountain-editable-pages__sheet')).toHaveCount(2);
  await expect(editor.locator(':scope > [data-fountain-path]')).toHaveCount(4);
  await expect(editor.locator(':scope > [data-fountain-editable-page="1"]')).toHaveCount(2);
  await expect(editor.locator(':scope > [data-fountain-editable-page="2"]')).toHaveCount(2);
  expect(await editor.evaluate((element) => (
    [...element.children].every((child) => child.hasAttribute('data-fountain-path'))
  ))).toBe(true);
  expect(await editor.locator(':scope > [data-fountain-path="2"]').evaluate((element) => (
    getComputedStyle(element).translate !== 'none'
  ))).toBe(true);

  const firstIdentity = await editor.locator(':scope > [data-fountain-path="0"]').evaluate((element) => {
    (element as HTMLElement).dataset.browserIdentity = 'retained';
    return element.getAttribute('data-browser-identity');
  });
  expect(firstIdentity).toBe('retained');
  const secondText = editor.locator('[data-fountain-text-path="2.0"]');
  await secondText.evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text) throw new Error('Expected editable second-page text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await editor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '漢字' }));
  });
  await expect(editor).toContainText('Second editable page漢字');
  await expect(editor.locator(':scope > [data-fountain-path="0"]')).toHaveAttribute('data-browser-identity', 'retained');
  await expect(editor.locator(':scope > [data-fountain-path="2"]')).toHaveAttribute('data-fountain-editable-page', '2');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(editor).not.toContainText('漢字');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(editor).toContainText('Second editable page漢字');

  await editor.evaluate((element) => {
    const start = element.querySelector('[data-fountain-text-path="0.0"]')?.firstChild;
    const end = element.querySelector('[data-fountain-text-path="2.0"]')?.firstChild;
    if (!start || !end) throw new Error('Expected text on both editable pages.');
    const range = document.createRange();
    range.setStart(start, 6);
    range.setEnd(end, 6);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().selection
  ))).toMatchObject({ type: 'text', path: [0, 0], from: 6, endPath: [2, 0], to: 6 });
  expect(await editor.evaluate((element) => element.querySelectorAll('[data-fountain-text-path="0.0"]').length)).toBe(1);
  expect(await editor.evaluate((element) => element.querySelectorAll('[data-fountain-text-path="2.0"]').length)).toBe(1);

  const region = page.getByLabel('Editable pages browser contract');
  await region.evaluate((element) => { (element as HTMLElement).style.width = '360px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'continuous');
  await expect(host.locator('.fountain-editable-pages__sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().selection
  ))).toMatchObject({ type: 'text', path: [0, 0], from: 6, endPath: [2, 0], to: 6 });
  await region.evaluate((element) => { (element as HTMLElement).style.width = '900px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect(host.locator('.fountain-editable-pages__sheet')).toHaveCount(2);
  await expect(editor.locator(':scope > [data-fountain-path="0"]')).toHaveAttribute('data-browser-identity', 'retained');
});

test('keeps one paragraph editable when its measured lines span page shells', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-split-pages');
  const editor = page.getByRole('textbox', { name: 'Split paragraph page editor' });
  const host = page.getByLabel('Editable pages browser contract').locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const pageCount = await host.locator('.fountain-editable-pages__sheet').count();
  expect(pageCount).toBeGreaterThan(1);
  await expect(editor.locator(':scope > [data-fountain-path]')).toHaveCount(1);
  await expect(editor.locator('[data-fountain-editable-page-break]')).toHaveCount(pageCount - 1);
  expect(await editor.locator('[data-fountain-editable-page-break]').evaluateAll((breaks) => breaks.every((element) => (
    element.getAttribute('aria-hidden') === 'true'
    && (element as HTMLElement).contentEditable === 'false'
    && element.getAttribute('data-fountain-widget') === 'editable-page-break'
  )))).toBe(true);
  const initial = await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      nodeCount: summary.document.content.length,
      nodeType: summary.document.content[0]?.type,
      pageIntents: summary.document.content.filter((node: any) => node.type === 'page_break').length,
      text: summary.document.content[0]?.content[0]?.text,
    };
  });
  expect(initial).toMatchObject({ nodeCount: 1, nodeType: 'paragraph', pageIntents: 0 });
  await expect(editor).toHaveText(initial.text);

  const alignment = await page.evaluate(() => {
    const breaks = [...document.querySelectorAll<HTMLElement>('[data-fountain-editable-page-break]')];
    const bodies = [...document.querySelectorAll<HTMLElement>('.fountain-editable-pages__body')];
    return breaks.map((element, index) => ({
      page: element.dataset.fountainEditablePageBreak,
      delta: element.getBoundingClientRect().bottom - (bodies[index + 1]?.getBoundingClientRect().top ?? 0),
    }));
  });
  alignment.forEach((entry, index) => {
    expect(entry.page).toBe(String(index + 2));
    expect(Math.abs(entry.delta)).toBeLessThan(3);
  });
  const textNodeCount = await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let count = 0;
    while (walker.nextNode()) count += 1;
    return count;
  });
  expect(await page.evaluate(() => {
    for (let iteration = 0; iteration < 6; iteration += 1) {
      (globalThis as any).fountainBrowserTest.pages.editable.refresh();
    }
    const editor = document.querySelector<HTMLElement>('[aria-label="Split paragraph page editor"]');
    if (!editor) return -1;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let count = 0;
    while (walker.nextNode()) count += 1;
    return count;
  })).toBe(textNodeCount);

  await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first || !last) throw new Error('Expected split paragraph text nodes.');
    const range = document.createRange();
    range.setStart(first, 5);
    range.setEnd(last, Math.max(5, last.data.length - 5));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().selection
  ))).toMatchObject({
    type: 'text', path: [0, 0], from: 5, endPath: [0, 0], to: initial.text.length - 5,
  });

  await editor.evaluate((element) => {
    const wrapper = element.querySelector<HTMLElement>('[data-fountain-text-path="0.0"]');
    const walker = wrapper && document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let last: Text | null = null;
    let current = walker?.nextNode() ?? null;
    while (current) {
      last = current as Text;
      current = walker?.nextNode() ?? null;
    }
    if (!last) throw new Error('Expected a final paragraph text node.');
    const range = document.createRange();
    range.setStart(last, last.data.length);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '終' }));
  });
  await expect(editor).toContainText('終');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(editor).not.toContainText('終');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(editor).toContainText('終');

  const region = page.getByLabel('Editable pages browser contract');
  await region.evaluate((element) => { (element as HTMLElement).style.width = '360px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'continuous');
  await expect(editor.locator('[data-fountain-editable-page-break]')).toHaveCount(0);
  await region.evaluate((element) => { (element as HTMLElement).style.width = '900px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect.poll(async () => (
    await host.locator('.fountain-editable-pages__sheet').count()
      - await editor.locator('[data-fountain-editable-page-break]').count()
  )).toBe(1);
});

test('maps carets, ranges, and composition around injected paragraph page gaps', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-split-pages');
  const editor = page.getByRole('textbox', { name: 'Split paragraph page editor' });
  const gap = editor.locator('[data-fountain-editable-page-break]').first();
  await expect(gap).toBeAttached();
  const initialText = await page.evaluate(() => {
    const document = (globalThis as any).fountainBrowserTest.pages.editable.summary().document;
    return document.content[0]?.content?.map((node: any) => node.text ?? '').join('') ?? '';
  });
  const boundary = await gap.evaluate((element) => {
    const wrapper = element.closest<HTMLElement>('[data-fountain-text-path]');
    if (!wrapper) throw new Error('Expected the page gap inside a text-path wrapper.');
    const range = document.createRange();
    range.selectNodeContents(wrapper);
    range.setEndBefore(element);
    const fragment = range.cloneContents();
    fragment.querySelectorAll('[data-fountain-widget]').forEach((widget) => widget.remove());
    return {
      path: wrapper.dataset.fountainTextPath,
      offset: fragment.textContent?.length ?? 0,
    };
  });
  expect(boundary.path).toBe('0.0');
  expect(boundary.offset).toBeGreaterThan(1);
  expect(boundary.offset).toBeLessThan(initialText.length - 1);

  const placeAtGap = async (side: 'before' | 'after') => editor.evaluate((element, position) => {
    const pageGap = element.querySelector<HTMLElement>('[data-fountain-editable-page-break]');
    const parent = pageGap?.parentNode;
    if (!pageGap || !parent) throw new Error('Expected a mounted paragraph page gap.');
    const index = Array.prototype.indexOf.call(parent.childNodes, pageGap) as number;
    const range = document.createRange();
    range.setStart(parent, index + (position === 'after' ? 1 : 0));
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, side);
  const selection = () => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().selection
  ));

  for (const side of ['before', 'after'] as const) {
    await placeAtGap(side);
    await expect.poll(selection).toMatchObject({
      type: 'text', path: [0, 0], from: boundary.offset, endPath: [0, 0], to: boundary.offset,
    });
  }

  await editor.evaluate((element) => {
    const pageGap = element.querySelector<HTMLElement>('[data-fountain-editable-page-break]');
    const wrapper = pageGap?.closest<HTMLElement>('[data-fountain-text-path]');
    if (!pageGap || !wrapper) throw new Error('Expected a page gap inside a text-path wrapper.');
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      if (current.textContent) textNodes.push(current as Text);
      current = walker.nextNode();
    }
    const before = textNodes.filter((node) => (
      Boolean(node.compareDocumentPosition(pageGap) & Node.DOCUMENT_POSITION_FOLLOWING)
    )).at(-1);
    const after = textNodes.find((node) => (
      Boolean(pageGap.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
    ));
    if (!before || !after) throw new Error('Expected non-widget text on both sides of the page gap.');
    const range = document.createRange();
    range.setStart(before, Math.max(0, before.data.length - 1));
    range.setEnd(after, Math.min(1, after.data.length));
    const domSelection = document.getSelection();
    domSelection?.removeAllRanges();
    domSelection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(selection).toMatchObject({
    type: 'text', path: [0, 0], from: boundary.offset - 1,
    endPath: [0, 0], to: boundary.offset + 1,
  });

  for (const [side, text] of [['before', '前'], ['after', '後']] as const) {
    await placeAtGap(side);
    await expect.poll(selection).toMatchObject({ from: boundary.offset, to: boundary.offset });
    await editor.evaluate((element, data) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data }));
    }, text);
    const expected = `${initialText.slice(0, boundary.offset)}${text}${initialText.slice(boundary.offset)}`;
    await expect(editor).toHaveText(expected);
    expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
    await expect(editor).toHaveText(initialText);
    await expect(gap).toBeAttached();
  }
  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().document.content
      .filter((node: any) => node.type === 'page_break').length
  ))).toBe(0);
});

test('keeps one canonical ordered list editable and numbered across page shells', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-list-pages');
  const editor = page.getByRole('textbox', { name: 'Split list page editor' });
  const host = page.getByLabel('Editable pages browser contract').locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const pageCount = await host.locator('.fountain-editable-pages__sheet').count();
  expect(pageCount).toBeGreaterThan(1);
  const list = editor.locator(':scope > ol[data-fountain-node="ordered_list"]');
  await expect(list).toHaveCount(1);
  await expect(list).toHaveAttribute('start', '4');
  await expect(list.locator(':scope > li[data-fountain-node="list_item"]')).toHaveCount(16);
  const breaks = list.locator(':scope > li[data-fountain-editable-list-break]');
  await expect(breaks).toHaveCount(pageCount - 1);
  expect(await breaks.evaluateAll((items) => items.map((element) => ({
    page: element.getAttribute('data-fountain-editable-list-break'),
    path: element.getAttribute('data-fountain-path'),
    role: element.getAttribute('role'),
  })))).toEqual(Array.from({ length: pageCount - 1 }, (_, index) => expect.objectContaining({
    page: String(index + 2), path: expect.stringMatching(/^0\.\d+$/), role: null,
  })));

  const alignment = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('[data-fountain-editable-list-break]')];
    const bodies = [...document.querySelectorAll<HTMLElement>('.fountain-editable-pages__body')];
    return items.map((element) => {
      const pageNumber = Number(element.dataset.fountainEditableListBreak);
      return {
        page: pageNumber,
        delta: element.getBoundingClientRect().top - (bodies[pageNumber - 1]?.getBoundingClientRect().top ?? 0),
      };
    });
  });
  alignment.forEach((entry, index) => {
    expect(entry.page).toBe(index + 2);
    expect(Math.abs(entry.delta)).toBeLessThan(3);
  });

  const initial = await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      nodeCount: summary.document.content.length,
      type: summary.document.content[0]?.type,
      start: summary.document.content[0]?.attrs?.start,
      itemCount: summary.document.content[0]?.content.length,
      pageIntents: summary.document.content.filter((node: any) => node.type === 'page_break').length,
      text: summary.document.content[0]?.content.map((item: any) => item.content[0].content[0].text),
    };
  });
  expect(initial).toMatchObject({ nodeCount: 1, type: 'ordered_list', start: 4, itemCount: 16, pageIntents: 0 });
  expect(initial.text).toEqual(Array.from({ length: 16 }, (_, index) => (
    `Canonical list item ${index + 4} remains editable and correctly numbered.`
  )));

  const initialSpacing = await breaks.evaluateAll((items) => items.map((element) => (
    (element as HTMLElement).style.marginBlockStart
  )));
  expect(await page.evaluate(() => {
    for (let iteration = 0; iteration < 6; iteration += 1) {
      (globalThis as any).fountainBrowserTest.pages.editable.refresh();
    }
    return [...document.querySelectorAll<HTMLElement>('[data-fountain-editable-list-break]')]
      .map((element) => element.style.marginBlockStart);
  })).toEqual(initialSpacing);

  await editor.evaluate((element) => {
    const wrappers = [...element.querySelectorAll<HTMLElement>('[data-fountain-text-path]')];
    const first = wrappers[0]?.firstChild;
    const lastWrapper = wrappers.at(-1);
    const last = lastWrapper?.lastChild;
    if (!(first instanceof Text) || !(last instanceof Text)) throw new Error('Expected list text nodes.');
    const range = document.createRange();
    range.setStart(first, 5);
    range.setEnd(last, Math.max(5, last.data.length - 5));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().selection
  ))).toMatchObject({
    type: 'text', path: [0, 0, 0, 0], from: 5, endPath: [0, 15, 0, 0],
    to: initial.text[15].length - 5,
  });

  await breaks.first().evaluate((element) => {
    const wrapper = element.querySelector<HTMLElement>('[data-fountain-text-path]');
    const text = wrapper?.firstChild;
    if (!(text instanceof Text)) throw new Error('Expected continuation item text.');
    const range = document.createRange();
    range.setStart(text, text.data.length);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    element.closest('[contenteditable="true"]')?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.closest('[contenteditable="true"]')?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '続' }));
  });
  await expect(editor).toContainText('続');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(editor).not.toContainText('続');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(editor).toContainText('続');
  await expect(list).toHaveAttribute('start', '4');

  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.moveContainerAfterParagraph()
  ))).toBe(true);
  await expect(editor.locator(':scope > [data-fountain-path="0"]')).toContainText('Paragraph moved before the paginated container.');
  await expect(list).toHaveAttribute('data-fountain-path', '1');
  await expect(list.locator(':scope > li[data-fountain-node="list_item"]')).toHaveCount(16);
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  expect(await list.locator('[data-fountain-editable-list-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      types: summary.document.content.map((node: any) => node.type),
      itemCount: summary.document.content[1]?.content.length,
      start: summary.document.content[1]?.attrs?.start,
    };
  })).toEqual({ types: ['paragraph', 'ordered_list'], itemCount: 16, start: 4 });

  const region = page.getByLabel('Editable pages browser contract');
  await region.evaluate((element) => { (element as HTMLElement).style.width = '360px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'continuous');
  await expect(editor.locator('[data-fountain-editable-list-break]')).toHaveCount(0);
  await region.evaluate((element) => { (element as HTMLElement).style.width = '900px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect.poll(async () => (
    await host.locator('.fountain-editable-pages__sheet').count()
      - await editor.locator('[data-fountain-editable-list-break]').count()
  )).toBe(2);
});

test('keeps one canonical table editable with repeated headers across page shells', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-table-pages');
  const editor = page.getByRole('textbox', { name: 'Split table page editor' });
  const host = page.getByLabel('Editable pages browser contract').locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const pageCount = await host.locator('.fountain-editable-pages__sheet').count();
  expect(pageCount).toBeGreaterThan(1);
  const table = editor.locator(':scope > table[data-fountain-node="table"]');
  await expect(table).toHaveCount(1);
  await expect(table).toHaveAttribute('data-fountain-editable-table-split', 'true');
  const rows = table.locator('tr[data-fountain-node="table_row"]');
  await expect(rows).toHaveCount(13);
  const breaks = table.locator('tr[data-fountain-editable-table-break]');
  const headers = host.locator('.fountain-editable-pages__shells [data-fountain-editable-table-header]');
  await expect(breaks).toHaveCount(pageCount - 1);
  await expect(headers).toHaveCount(pageCount - 1);
  expect(await breaks.evaluateAll((items) => items.map((element) => ({
    page: element.getAttribute('data-fountain-editable-table-break'),
    widget: element.getAttribute('data-fountain-widget'),
    hidden: element.getAttribute('aria-hidden'),
    editable: (element as HTMLElement).contentEditable,
    path: element.getAttribute('data-fountain-path'),
  })))).toEqual(Array.from({ length: pageCount - 1 }, (_, index) => ({
    page: String(index + 2), widget: 'editable-table-break', hidden: 'true', editable: 'false', path: null,
  })));
  expect(await headers.evaluateAll((items) => items.map((element) => ({
    page: element.getAttribute('data-fountain-editable-table-header'),
    text: element.textContent,
    paths: element.querySelectorAll('[data-fountain-path]').length,
    editable: (element as HTMLElement).contentEditable,
  })))).toEqual(Array.from({ length: pageCount - 1 }, (_, index) => ({
    page: String(index + 2), text: 'RecordStatus', paths: 0, editable: 'false',
  })));

  const alignment = await page.evaluate(() => {
    const pageBreaks = [...document.querySelectorAll<HTMLTableRowElement>('[data-fountain-editable-table-break]')];
    const bodies = [...document.querySelectorAll<HTMLElement>('.fountain-editable-pages__body')];
    return pageBreaks.map((spacer) => {
      const pageNumber = Number(spacer.dataset.fountainEditableTableBreak);
      const row = spacer.nextElementSibling as HTMLElement | null;
      const header = document.querySelector<HTMLElement>(`[data-fountain-editable-table-header="${pageNumber}"]`);
      return {
        page: pageNumber,
        headerStart: (header?.getBoundingClientRect().top ?? 0) - (bodies[pageNumber - 1]?.getBoundingClientRect().top ?? 0),
        rowAfterHeader: (row?.getBoundingClientRect().top ?? 0) - (header?.getBoundingClientRect().bottom ?? 0),
      };
    });
  });
  alignment.forEach((entry, index) => {
    expect(entry.page).toBe(index + 2);
    expect(Math.abs(entry.headerStart)).toBeLessThan(3);
    expect(Math.abs(entry.rowAfterHeader)).toBeLessThan(5);
  });

  const initial = await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      nodeCount: summary.document.content.length,
      type: summary.document.content[0]?.type,
      rowCount: summary.document.content[0]?.content.length,
      header: summary.document.content[0]?.content[0]?.content.map((cell: any) => cell.content[0].content[0].text),
      pageIntents: summary.document.content.filter((node: any) => node.type === 'page_break').length,
    };
  });
  expect(initial).toEqual({ nodeCount: 1, type: 'table', rowCount: 13, header: ['Record', 'Status'], pageIntents: 0 });

  const initialSpacing = await breaks.locator(':scope > td').evaluateAll((cells) => cells.map((cell) => (
    (cell as HTMLElement).style.getPropertyValue('--fountain-editable-table-break-size')
  )));
  expect(await page.evaluate(() => {
    for (let iteration = 0; iteration < 6; iteration += 1) {
      (globalThis as any).fountainBrowserTest.pages.editable.refresh();
    }
    return [...document.querySelectorAll<HTMLElement>('[data-fountain-editable-table-break] > td')]
      .map((cell) => cell.style.getPropertyValue('--fountain-editable-table-break-size'));
  })).toEqual(initialSpacing);

  await selectBlockEnd(rows.first());
  await page.keyboard.type(' LIVE');
  await expect.poll(() => headers.allTextContents()).toEqual(Array(pageCount - 1).fill('RecordStatus LIVE'));
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect.poll(() => headers.allTextContents()).toEqual(Array(pageCount - 1).fill('RecordStatus'));
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect.poll(() => headers.allTextContents()).toEqual(Array(pageCount - 1).fill('RecordStatus LIVE'));

  await editor.evaluate((element) => {
    const first = element.querySelector<HTMLElement>('[data-fountain-text-path="0.1.0.0.0"]')?.firstChild;
    const last = element.querySelector<HTMLElement>('[data-fountain-text-path="0.12.1.0.0"]')?.lastChild;
    if (!(first instanceof Text) || !(last instanceof Text)) throw new Error('Expected canonical table text nodes.');
    const range = document.createRange();
    range.setStart(first, 4);
    range.setEnd(last, last.data.length - 2);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().selection
  ))).toMatchObject({
    type: 'text', path: [0, 1, 0, 0, 0], from: 4, endPath: [0, 12, 1, 0, 0], to: 'Editable value 12'.length - 2,
  });

  await selectBlockEnd(table.locator('[data-fountain-editable-table-break] + tr').first());
  await editor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '表' }));
  });
  await expect(editor).toContainText('表');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(editor).not.toContainText('表');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(editor).toContainText('表');
  await expect(rows).toHaveCount(13);

  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.moveContainerAfterParagraph()
  ))).toBe(true);
  await expect(editor.locator(':scope > [data-fountain-path="0"]')).toContainText('Paragraph moved before the paginated container.');
  await expect(table).toHaveAttribute('data-fountain-path', '1');
  await expect(table.locator('tr[data-fountain-node="table_row"]')).toHaveCount(13);
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  expect(await table.locator('[data-fountain-editable-table-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      types: summary.document.content.map((node: any) => node.type),
      rowCount: summary.document.content[1]?.content.length,
      pageIntents: summary.document.content.filter((node: any) => node.type === 'page_break').length,
    };
  })).toEqual({ types: ['paragraph', 'table'], rowCount: 13, pageIntents: 0 });

  const region = page.getByLabel('Editable pages browser contract');
  await region.evaluate((element) => { (element as HTMLElement).style.width = '360px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'continuous');
  await expect(editor.locator('[data-fountain-editable-table-break]')).toHaveCount(0);
  await expect(host.locator('[data-fountain-editable-table-header]')).toHaveCount(0);
  await expect(table).not.toHaveAttribute('data-fountain-editable-table-split', 'true');
  await region.evaluate((element) => { (element as HTMLElement).style.width = '900px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect.poll(async () => (
    await host.locator('.fountain-editable-pages__sheet').count()
      - await editor.locator('[data-fountain-editable-table-break]').count()
  )).toBe(1);
  await expect.poll(async () => (
    await host.locator('.fountain-editable-pages__sheet').count()
      - await host.locator('[data-fountain-editable-table-header]').count()
  )).toBe(1);
});

test('keeps merged header and body rowspans intact across editable table pages', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-complex-table-pages');
  const editor = page.getByRole('textbox', { name: 'Complex table page editor' });
  const host = page.getByLabel('Editable pages browser contract').locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const table = editor.locator(':scope > table[data-fountain-node="table"]');
  const rows = table.locator('tr[data-fountain-node="table_row"]');
  const breaks = table.locator('tr[data-fountain-editable-table-break]');
  const repeatedHeaders = host.locator('.fountain-editable-pages__shells [data-fountain-editable-table-header]');
  await expect(table).toHaveCount(1);
  await expect(rows).toHaveCount(10);
  expect(await breaks.count()).toBeGreaterThan(0);
  await expect(repeatedHeaders).toHaveCount(await breaks.count());

  expect(await page.evaluate(() => {
    const result = (globalThis as any).fountainBrowserTest.pages.editable.refresh();
    return result.snapshot.measurement.fragmentSources
      .filter((source: any) => source.kind === 'table-row-group')
      .map((source: any) => source.partPaths);
  })).toEqual([
    [[0, 0], [0, 1]],
    [[0, 2], [0, 3]],
    [[0, 4], [0, 5]],
    [[0, 6], [0, 7]],
    [[0, 8], [0, 9]],
  ]);

  const continuationStarts = await breaks.evaluateAll((items) => items.map((item) => (
    (item.nextElementSibling as HTMLElement | null)?.dataset.fountainPath
  )));
  expect(continuationStarts.length).toBeGreaterThan(0);
  expect(continuationStarts.every((path) => ['0.2', '0.4', '0.6', '0.8'].includes(path ?? ''))).toBe(true);
  expect(new Set(continuationStarts).size).toBe(continuationStarts.length);

  const headerContracts = await repeatedHeaders.evaluateAll((headers) => headers.map((header) => {
    const cells = [...header.querySelectorAll<HTMLTableCellElement>('th')];
    const report = cells.find((cell) => cell.textContent?.includes('Merged report'));
    const owner = cells.find((cell) => cell.textContent?.includes('Owner'));
    return {
      rows: header.querySelectorAll('tr').length,
      reportColspan: report?.colSpan,
      ownerRowspan: owner?.rowSpan,
      paths: header.querySelectorAll('[data-fountain-path]').length,
      editable: (header as HTMLElement).contentEditable,
      hidden: header.closest('[aria-hidden="true"]') !== null,
    };
  }));
  expect(headerContracts.every((contract) => (
    contract.rows === 2
      && contract.reportColspan === 2
      && contract.ownerRowspan === 2
      && contract.paths === 0
      && contract.editable === 'false'
      && contract.hidden
  ))).toBe(true);

  await selectBlockEnd(table.locator('[data-fountain-editable-table-break] + tr').first());
  await page.keyboard.type(' MERGED');
  await expect(table).toContainText('MERGED');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(table).not.toContainText('MERGED');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(table).toContainText('MERGED');
  await expect(rows).toHaveCount(10);
});

test('reports an oversized table row without clipping or splitting its editable model', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-oversized-table-pages');
  const editor = page.getByRole('textbox', { name: 'Oversized table page editor' });
  const host = page.getByLabel('Editable pages browser contract').locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const table = editor.locator(':scope > table[data-fountain-node="table"]');
  const rows = table.locator('tr[data-fountain-node="table_row"]');
  await expect(table).toHaveCount(1);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).locator('[data-fountain-node="paragraph"]')).toHaveCount(16);
  expect(await host.locator('[data-fountain-editable-page-overflow="true"]').count()).toBeGreaterThan(0);
  expect(await table.locator('[data-fountain-editable-table-break]').count()).toBeGreaterThan(0);
  const geometry = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[aria-label="Oversized table page editor"] tr[data-fountain-path="0.1"]');
    const body = document.querySelector<HTMLElement>('.fountain-editable-pages__body');
    return { rowHeight: row?.getBoundingClientRect().height ?? 0, bodyHeight: body?.getBoundingClientRect().height ?? 0 };
  });
  expect(geometry.rowHeight).toBeGreaterThan(geometry.bodyHeight);

  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      issues: summary.issues,
      nodeCount: summary.document.content.length,
      type: summary.document.content[0]?.type,
      rowCount: summary.document.content[0]?.content.length,
      paragraphCount: summary.document.content[0]?.content[1]?.content[0]?.content.length,
      pageIntents: summary.document.content.filter((node: any) => node.type === 'page_break').length,
    };
  })).toEqual({ issues: [], nodeCount: 1, type: 'table', rowCount: 2, paragraphCount: 16, pageIntents: 0 });

  await selectBlockEnd(rows.nth(1));
  await page.keyboard.type(' OVERSIZED ROW EDIT');
  await expect(rows.nth(1)).toContainText('OVERSIZED ROW EDIT');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(rows.nth(1)).not.toContainText('OVERSIZED ROW EDIT');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(rows.nth(1)).toContainText('OVERSIZED ROW EDIT');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect(rows).toHaveCount(2);
});

test('keeps canonical page furniture and footnotes editable while projecting every page copy', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-page-intent');
  const editor = page.getByRole('textbox', { name: 'Page furniture and footnote editor' });
  const region = page.getByLabel('Editable pages browser contract');
  const host = region.locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const pageCount = await host.locator('.fountain-editable-pages__sheet').count();
  expect(pageCount).toBeGreaterThan(1);

  const header = editor.locator(':scope > [data-fountain-node="page_header"]');
  const footer = editor.locator(':scope > [data-fountain-node="page_footer"]');
  const definition = editor.locator(':scope > [data-fountain-node="footnote_definition"]');
  await expect(header).toHaveAttribute('data-fountain-editable-page-intent', 'header');
  await expect(footer).toHaveAttribute('data-fountain-editable-page-intent', 'footer');
  await expect(definition).toHaveAttribute('data-fountain-editable-page-intent', 'footnote');
  await expect(header).toHaveCount(1);
  await expect(footer).toHaveCount(1);
  await expect(definition).toHaveCount(1);

  const projectedHeaders = host.locator('[data-fountain-editable-page-template^="header:default"]');
  const projectedFooters = host.locator('[data-fountain-editable-page-template^="footer:default"]');
  const projectedFootnotes = host.locator('[data-fountain-editable-page-footnote="intent-note"]');
  await expect(projectedHeaders).toHaveCount(pageCount);
  await expect(projectedFooters).toHaveCount(pageCount);
  await expect(projectedFootnotes).toHaveCount(1);
  expect(await projectedHeaders.allTextContents()).toEqual(
    Array.from({ length: pageCount }, (_, index) => `Canonical report · ${index + 1}`),
  );
  expect(await projectedFooters.allTextContents()).toEqual(Array(pageCount).fill(`Total pages · ${pageCount}`));
  expect(await host.locator(
    '.fountain-editable-pages__shells [data-fountain-path], '
    + '.fountain-editable-pages__shells [data-fountain-text-path], '
    + '.fountain-editable-pages__shells [id], '
    + '.fountain-editable-pages__shells [contenteditable="true"]',
  ).count()).toBe(0);

  const alignment = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-fountain-editable-page-intent="header"]');
    const footer = document.querySelector<HTMLElement>('[data-fountain-editable-page-intent="footer"]');
    const sheets = [...document.querySelectorAll<HTMLElement>('.fountain-editable-pages__sheet')];
    return {
      headerGap: (sheets[0]?.getBoundingClientRect().top ?? 0) - (header?.getBoundingClientRect().bottom ?? 0),
      footerGap: (footer?.getBoundingClientRect().top ?? 0) - (sheets.at(-1)?.getBoundingClientRect().bottom ?? 0),
    };
  });
  expect(alignment.headerGap).toBeGreaterThanOrEqual(20);
  expect(alignment.footerGap).toBeGreaterThanOrEqual(20);

  await selectBlockEnd(header);
  await page.keyboard.type(' LIVE');
  await expect.poll(() => projectedHeaders.allTextContents()).toEqual(
    Array.from({ length: pageCount }, (_, index) => `Canonical report ·  LIVE${index + 1}`),
  );
  await selectBlockEnd(footer);
  await page.keyboard.type(' VERIFIED');
  await expect.poll(() => projectedFooters.allTextContents()).toEqual(
    Array(pageCount).fill(`Total pages ·  VERIFIED${pageCount}`),
  );
  await selectBlockEnd(definition);
  await page.keyboard.type(' UPDATED');
  await expect.poll(() => projectedFootnotes.allTextContents()).toEqual([
    'Canonical editable footnote evidence. UPDATED',
  ]);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.editable.summary();
    return {
      mode: summary.mode,
      headerCount: summary.document.content.filter((node: any) => node.type === 'page_header').length,
      footerCount: summary.document.content.filter((node: any) => node.type === 'page_footer').length,
      definitionCount: summary.document.content.filter((node: any) => node.type === 'footnote_definition').length,
      automaticBreaks: summary.document.content.filter((node: any) => node.type === 'page_break').length,
    };
  })).toEqual({ mode: 'paged', headerCount: 1, footerCount: 1, definitionCount: 1, automaticBreaks: 0 });

  await region.evaluate((element) => { (element as HTMLElement).style.width = '360px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'continuous');
  await expect(host.locator('[data-fountain-editable-page-template], [data-fountain-editable-page-footnote]')).toHaveCount(0);
  await expect(editor.locator('[data-fountain-editable-page-intent]')).toHaveCount(0);
  await region.evaluate((element) => { (element as HTMLElement).style.width = '900px'; });
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect(host.locator('[data-fountain-editable-page-template^="header:default"]')).toHaveCount(pageCount);
  await expect(host.locator('[data-fountain-editable-page-template^="footer:default"]')).toHaveCount(pageCount);
  await expect(host.locator('[data-fountain-editable-page-footnote="intent-note"]')).toHaveCount(1);
});

test('keeps code, media, disclosures, and custom atoms canonical across editable pages', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-atomic-pages');
  const editor = page.getByRole('textbox', { name: 'Atomic and structural page editor' });
  const region = page.getByLabel('Editable pages browser contract');
  const host = region.locator('.fountain-editable-pages');
  await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().errors
  ))).toEqual([]);

  const image = editor.locator(':scope > [data-fountain-node="image_super"]');
  const audio = editor.locator(':scope > [data-fountain-node="audio"]');
  const details = editor.locator(':scope > [data-fountain-node="details"]');
  const code = editor.locator(':scope > [data-fountain-node="code_block"]');
  const counter = editor.locator(':scope > [data-fountain-node="browser_counter"]');
  await expect(image).toHaveCount(1);
  await expect(audio).toHaveCount(1);
  await expect(details).toHaveCount(1);
  await expect(code).toHaveCount(1);
  await expect(counter).toHaveCount(1);
  await expect(image).toHaveAttribute('data-fountain-editable-page', /\d+/);
  await expect(audio).toHaveAttribute('data-fountain-editable-page', /\d+/);
  await expect(details).toHaveAttribute('data-fountain-editable-page', /\d+/);
  await expect(code).toHaveAttribute('data-fountain-editable-page', /\d+/);
  await expect(counter).toHaveAttribute('data-fountain-editable-page', /\d+/);
  await expect(host.locator(
    '.fountain-editable-pages__shells .fountain-image, '
    + '.fountain-editable-pages__shells .fountain-media, '
    + '.fountain-editable-pages__shells .fountain-details, '
    + '.fountain-editable-pages__shells [data-browser-counter], '
    + '.fountain-editable-pages__shells [data-fountain-node="code_block"]',
  )).toHaveCount(0);

  const contract = await page.evaluate(() => {
    const editable = (globalThis as any).fountainBrowserTest.pages.editable;
    const result = editable.refresh();
    return {
      mode: result.mode,
      issues: result.issues,
      warnings: result.snapshot.layout.warnings.map((warning: any) => ({
        code: warning.code,
        itemId: warning.itemId,
      })),
      sources: result.snapshot.measurement.fragmentSources.map((source: any) => ({
        kind: source.kind,
        path: source.sourcePath,
      })),
    };
  });
  expect(contract.mode).toBe('paged');
  expect(contract.issues).toEqual([]);
  expect(contract.sources.filter((source: any) => [1, 2, 3, 4, 5].includes(source.path[0])))
    .toEqual([
      { kind: 'whole', path: [1] },
      { kind: 'whole', path: [2] },
      { kind: 'whole', path: [3] },
      { kind: 'whole', path: [4] },
      { kind: 'whole', path: [5] },
    ]);
  expect(contract.warnings).toEqual(expect.arrayContaining([
    { code: 'oversized-item', itemId: 'block:4:code_block' },
    { code: 'oversized-item', itemId: 'block:5:browser_counter' },
  ]));
  expect(contract.warnings.every((warning: any) => (
    warning.code === 'oversized-item'
      && ['block:2:audio', 'block:4:code_block', 'block:5:browser_counter'].includes(warning.itemId)
  ))).toBe(true);

  const oversizedNodeNames: string[] = contract.warnings
    .map((warning: any) => String(warning.itemId).split(':').at(-1) ?? '');
  const overflow = await page.evaluate((nodeNames: string[]) => {
    const editor = document.querySelector<HTMLElement>('[aria-label="Atomic and structural page editor"]');
    const atom = editor?.querySelector<HTMLElement>(':scope > [data-fountain-node="browser_counter"]');
    const body = document.querySelector<HTMLElement>('.fountain-editable-pages__body');
    const marked = nodeNames.map((nodeName: string) => {
      const node = editor?.querySelector<HTMLElement>(`:scope > [data-fountain-node="${nodeName}"]`);
      const pageNumber = node?.dataset.fountainEditablePage;
      const sheet = pageNumber
        ? document.querySelector<HTMLElement>(`.fountain-editable-pages__sheet[data-fountain-editable-page="${pageNumber}"]`)
        : null;
      return { nodeName, pageNumber, marked: sheet?.dataset.fountainEditablePageOverflow };
    });
    return {
      atomHeight: atom?.getBoundingClientRect().height ?? 0,
      bodyHeight: body?.getBoundingClientRect().height ?? 0,
      marked,
    };
  }, oversizedNodeNames);
  expect(overflow.atomHeight).toBeGreaterThan(overflow.bodyHeight);
  expect(overflow.marked.map((entry: { nodeName: string }) => entry.nodeName)).toEqual(oversizedNodeNames);
  expect(overflow.marked.every((entry: { pageNumber?: string; marked?: string }) => (
    /^\d+$/u.test(entry.pageNumber ?? '') && entry.marked === 'true'
  ))).toBe(true);

  const customPreview = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.previewCustomContinuation()
  ));
  expect(customPreview).toMatchObject({ mounted: true, sourceUnchanged: true });
  expect(customPreview.pages).toBeGreaterThan(1);
  expect(customPreview.sources).toMatchObject([
    { kind: 'custom', fragmentIndex: 0 },
    { kind: 'custom', fragmentIndex: 1 },
    { kind: 'custom', fragmentIndex: 2 },
  ]);
  expect(customPreview.warnings.some((warning: any) => warning.itemId === 'block:5:browser_counter')).toBe(false);
  const projectedBands = page.locator('[data-browser-counter-print-band]');
  await expect(projectedBands).toHaveCount(3);
  await expect(projectedBands).toHaveText([
    'Counter print band 1',
    'Counter print band 2',
    'Counter print band 3',
  ]);
  await expect(editor.locator(':scope > [data-browser-counter]')).toHaveCount(1);
  await expect(editor.locator('[data-browser-counter-print-projection]')).toHaveCount(0);

  await counter.click();
  await expect(counter).toHaveText('Count 1');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.editable.summary().document.content[3].attrs.open
  ))).toBe(true);
  await selectBlockEnd(code);
  await page.keyboard.type(' // verified');
  await expect(code).toContainText('// verified');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.undo())).toBe(true);
  await expect(code).not.toContainText('// verified');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editable.redo())).toBe(true);
  await expect(code).toContainText('// verified');
});

test('keeps tracked review and Yjs live between list items split across pages', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=split-list-page-integrations');
  const left = page.getByRole('textbox', { name: 'Collaborative editor left' });
  const right = page.getByRole('textbox', { name: 'Collaborative editor right' });
  const review = page.getByRole('textbox', { name: 'Tracked changes contract editor' });
  for (const editor of [left, right, review]) {
    await expect(editor.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
    await expect(editor.locator(':scope > ol[data-fountain-node="ordered_list"]')).toHaveCount(1);
    await expect(editor.locator(':scope > ol')).toHaveAttribute('start', '4');
    expect(await editor.locator('[data-fountain-editable-list-break]').count()).toBeGreaterThan(0);
  }

  await selectBlockEnd(left.locator('[data-fountain-editable-list-break]').first());
  await page.keyboard.type(' LEFT LIST REVIEW');
  await expect(right).toContainText('LEFT LIST REVIEW');
  await expect.poll(() => right.locator('[data-fountain-editable-list-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      leftAuthor: summary.left.suggestions[0]?.user.id,
      rightAuthor: summary.right.suggestions[0]?.user.id,
      converged: JSON.stringify(summary.left.document) === JSON.stringify(summary.right.document),
      nodeCounts: [summary.left.document.content.length, summary.right.document.content.length],
      itemCounts: [summary.left.document.content[0]?.content.length, summary.right.document.content[0]?.content.length],
      listStarts: [summary.left.document.content[0]?.attrs?.start, summary.right.document.content[0]?.attrs?.start],
      pageIntents: [...summary.left.document.content, ...summary.right.document.content]
        .filter((node: any) => node.type === 'page_break').length,
    };
  })).toEqual({
    leftAuthor: 'browser-left',
    rightAuthor: 'browser-left',
    converged: true,
    nodeCounts: [1, 1],
    itemCounts: [16, 16],
    listStarts: [4, 4],
    pageIntents: 0,
  });

  await selectBlockEnd(review.locator('[data-fountain-editable-list-break]').first());
  await page.keyboard.type(' LOCAL LIST DECISION');
  await expect(review.locator('ins')).toContainText('LOCAL LIST DECISION');
  const suggestionId = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.integrations.summary().review.suggestions[0].id
  ));
  expect(await page.evaluate((id) => (
    (globalThis as any).fountainBrowserTest.tracked.accept(id)
  ), suggestionId)).toBe(true);
  await expect(review).toContainText('LOCAL LIST DECISION');
  await expect(review.locator('ins, del')).toHaveCount(0);
  await expect.poll(() => review.locator('[data-fountain-editable-list-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      modes: [summary.left.mode, summary.right.mode, summary.review.mode],
      leftItems: summary.left.document.content[0]?.content.length,
      reviewItems: summary.review.document.content[0]?.content.length,
      reviewSuggestions: summary.review.suggestions.length,
    };
  })).toEqual({
    modes: ['paged', 'paged', 'paged'],
    leftItems: 16,
    reviewItems: 16,
    reviewSuggestions: 0,
  });
});

test('keeps tracked review and Yjs live between table rows split across pages', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=split-table-page-integrations');
  const left = page.getByRole('textbox', { name: 'Collaborative editor left' });
  const right = page.getByRole('textbox', { name: 'Collaborative editor right' });
  const review = page.getByRole('textbox', { name: 'Tracked changes contract editor' });
  for (const editor of [left, right, review]) {
    const host = editor.locator('..');
    await expect(host).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
    await expect(editor.locator(':scope > table[data-fountain-node="table"]')).toHaveCount(1);
    await expect(editor.locator('tr[data-fountain-node="table_row"]')).toHaveCount(13);
    expect(await editor.locator('[data-fountain-editable-table-break]').count()).toBeGreaterThan(0);
    expect(await host.locator('[data-fountain-editable-table-header]').count()).toBeGreaterThan(0);
  }

  await selectBlockEnd(left.locator('[data-fountain-editable-table-break] + tr').first());
  await page.keyboard.type(' LEFT TABLE REVIEW');
  await expect(right).toContainText('LEFT TABLE REVIEW');
  await expect.poll(() => right.locator('[data-fountain-editable-table-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      leftAuthor: summary.left.suggestions[0]?.user.id,
      rightAuthor: summary.right.suggestions[0]?.user.id,
      converged: JSON.stringify(summary.left.document) === JSON.stringify(summary.right.document),
      nodeCounts: [summary.left.document.content.length, summary.right.document.content.length],
      rowCounts: [summary.left.document.content[0]?.content.length, summary.right.document.content[0]?.content.length],
      types: [summary.left.document.content[0]?.type, summary.right.document.content[0]?.type],
      pageIntents: [...summary.left.document.content, ...summary.right.document.content]
        .filter((node: any) => node.type === 'page_break').length,
    };
  })).toEqual({
    leftAuthor: 'browser-left',
    rightAuthor: 'browser-left',
    converged: true,
    nodeCounts: [1, 1],
    rowCounts: [13, 13],
    types: ['table', 'table'],
    pageIntents: 0,
  });

  await selectBlockEnd(review.locator('[data-fountain-editable-table-break] + tr').first());
  await page.keyboard.type(' LOCAL TABLE DECISION');
  await expect(review.locator('ins')).toContainText('LOCAL TABLE DECISION');
  const suggestionId = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.integrations.summary().review.suggestions[0].id
  ));
  expect(await page.evaluate((id) => (
    (globalThis as any).fountainBrowserTest.tracked.accept(id)
  ), suggestionId)).toBe(true);
  await expect(review).toContainText('LOCAL TABLE DECISION');
  await expect(review.locator('ins, del')).toHaveCount(0);
  await expect.poll(() => review.locator('[data-fountain-editable-table-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      modes: [summary.left.mode, summary.right.mode, summary.review.mode],
      leftRows: summary.left.document.content[0]?.content.length,
      reviewRows: summary.review.document.content[0]?.content.length,
      reviewSuggestions: summary.review.suggestions.length,
    };
  })).toEqual({
    modes: ['paged', 'paged', 'paged'],
    leftRows: 13,
    reviewRows: 13,
    reviewSuggestions: 0,
  });
});

for (const continuation of [
  {
    label: 'list', fixture: 'split-list-page-integrations',
    breakSelector: '[data-fountain-editable-list-break]', expectedText: 'Before Canonical list item 9',
  },
  {
    label: 'table', fixture: 'split-table-page-integrations',
    breakSelector: '[data-fountain-editable-table-break]', expectedText: 'Before Canonical row 3',
  },
] as const) test(`keeps comments attached and synchronized inside a continued ${continuation.label}`, async ({ page }) => {
  await page.goto(`/browser-tests.html?fixture=${continuation.fixture}`);
  const left = page.getByRole('textbox', { name: 'Collaborative editor left' });
  const right = page.getByRole('textbox', { name: 'Collaborative editor right' });
  for (const editor of [left, right]) {
    await expect(editor.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
    await expect.poll(() => editor.locator(continuation.breakSelector).count()).toBeGreaterThan(0);
  }

  const threadId = await page.evaluate(async () => (
    await (globalThis as any).fountainBrowserTest.pages.integrations.createComment()
  ).id);
  await expect(left.locator(`[data-fountain-comment-thread="${threadId}"]`).first()).toBeVisible();
  await expect(right.locator(`[data-fountain-comment-thread="${threadId}"]`).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return [summary.left.comments.length, summary.right.comments.length];
  })).toEqual([1, 1]);
  const initialAnchors = await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return [summary.left.comments[0].anchor, summary.right.comments[0].anchor];
  });
  expect(initialAnchors[0]).toMatchObject({ status: 'attached', quote: 'Canonical' });
  expect(initialAnchors[1]).toEqual(initialAnchors[0]);

  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.integrations.insertBeforeComment()
  ))).toBe(true);
  await expect(right).toContainText(continuation.expectedText);
  await expect.poll(() => page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return [summary.left.comments[0]?.anchor, summary.right.comments[0]?.anchor];
  })).toEqual([
    expect.objectContaining({
      status: 'attached',
      from: initialAnchors[0].from + 7,
      to: initialAnchors[0].to + 7,
      quote: 'Canonical',
    }),
    expect.objectContaining({
      status: 'attached',
      from: initialAnchors[0].from + 7,
      to: initialAnchors[0].to + 7,
      quote: 'Canonical',
    }),
  ]);
  await expect(left.locator(`[data-fountain-comment-thread="${threadId}"]`).first()).toBeVisible();
  await expect(right.locator(`[data-fountain-comment-thread="${threadId}"]`).first()).toBeVisible();
  for (const editor of [left, right]) {
    await expect(editor.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
    await expect.poll(() => editor.locator(continuation.breakSelector).count()).toBeGreaterThan(0);
  }
});

test('keeps tracked review and Yjs live inside a paragraph split across pages', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=split-page-integrations');
  const left = page.getByRole('textbox', { name: 'Collaborative editor left' });
  const right = page.getByRole('textbox', { name: 'Collaborative editor right' });
  const review = page.getByRole('textbox', { name: 'Tracked changes contract editor' });
  for (const editor of [left, right, review]) {
    await expect(editor.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
    await expect(editor.locator(':scope > [data-fountain-path]')).toHaveCount(1);
    expect(await editor.locator('[data-fountain-editable-page-break]').count()).toBeGreaterThan(0);
  }

  await selectBlockEnd(left.locator(':scope > [data-fountain-path="0"]'));
  await page.keyboard.type(' LEFT SPLIT REVIEW');
  await expect(right).toContainText('LEFT SPLIT REVIEW');
  await expect.poll(() => right.locator('[data-fountain-editable-page-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      leftAuthor: summary.left.suggestions[0]?.user.id,
      rightAuthor: summary.right.suggestions[0]?.user.id,
      converged: JSON.stringify(summary.left.document) === JSON.stringify(summary.right.document),
      nodeCounts: [summary.left.document.content.length, summary.right.document.content.length],
      pageIntents: [...summary.left.document.content, ...summary.right.document.content]
        .filter((node: any) => node.type === 'page_break').length,
    };
  })).toEqual({
    leftAuthor: 'browser-left',
    rightAuthor: 'browser-left',
    converged: true,
    nodeCounts: [1, 1],
    pageIntents: 0,
  });

  await selectBlockEnd(review.locator(':scope > [data-fountain-path="0"]'));
  await page.keyboard.type(' LOCAL SPLIT DECISION');
  await expect(review.locator('ins')).toContainText('LOCAL SPLIT DECISION');
  const suggestionId = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.integrations.summary().review.suggestions[0].id
  ));
  expect(await page.evaluate((id) => (
    (globalThis as any).fountainBrowserTest.tracked.accept(id)
  ), suggestionId)).toBe(true);
  await expect(review).toContainText('LOCAL SPLIT DECISION');
  await expect(review.locator('ins, del')).toHaveCount(0);
  await expect.poll(() => review.locator('[data-fountain-editable-page-break]').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      modes: [summary.left.mode, summary.right.mode, summary.review.mode],
      leftNodes: summary.left.document.content.length,
      reviewNodes: summary.review.document.content.length,
      reviewSuggestions: summary.review.suggestions.length,
    };
  })).toEqual({
    modes: ['paged', 'paged', 'paged'],
    leftNodes: 1,
    reviewNodes: 1,
    reviewSuggestions: 0,
  });
});

test('keeps tracked review and Yjs collaboration live across automatic page boundaries', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=page-integrations');
  const left = page.getByRole('textbox', { name: 'Collaborative editor left' });
  const right = page.getByRole('textbox', { name: 'Collaborative editor right' });
  const review = page.getByRole('textbox', { name: 'Tracked changes contract editor' });

  await expect(left.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect(right.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  await expect(review.locator('..')).toHaveAttribute('data-fountain-editable-pages-mode', 'paged');
  const initial = await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      leftPages: summary.left.pages,
      rightPages: summary.right.pages,
      reviewPages: summary.review.pages,
      hasManualBreak: [summary.left, summary.right, summary.review].some((entry: any) => (
        entry.document.content.some((node: any) => node.type === 'page_break')
      )),
    };
  });
  expect(initial.hasManualBreak).toBe(false);
  expect(initial.leftPages).toBeGreaterThan(1);
  expect(initial.rightPages).toBe(initial.leftPages);
  expect(initial.reviewPages).toBe(initial.leftPages);

  const leftSecondPage = left.locator(':scope > [data-fountain-editable-page="2"]').first();
  await selectBlockEnd(leftSecondPage);
  await page.keyboard.type(' LEFT REVIEW');
  await expect(right).toContainText('LEFT REVIEW');
  await expect(right.locator(':scope > [data-fountain-editable-page="2"]')).toContainText('LEFT REVIEW');
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      leftAuthor: summary.left.suggestions[0]?.user.id,
      rightAuthor: summary.right.suggestions[0]?.user.id,
      converged: JSON.stringify(summary.left.document) === JSON.stringify(summary.right.document),
    };
  })).toEqual({ leftAuthor: 'browser-left', rightAuthor: 'browser-left', converged: true });

  const rightFirstPage = right.locator(':scope > [data-fountain-editable-page="1"]').first();
  await selectBlockEnd(rightFirstPage);
  await page.keyboard.type(' RIGHT REVIEW');
  await expect(left).toContainText('RIGHT REVIEW');
  expect(await page.evaluate(() => {
    const suggestions = (globalThis as any).fountainBrowserTest.pages.integrations.summary().left.suggestions;
    return suggestions.map((suggestion: any) => suggestion.user.id).sort();
  })).toEqual(['browser-left', 'browser-right']);

  const reviewSecondPage = review.locator(':scope > [data-fountain-editable-page="2"]').first();
  await selectBlockEnd(reviewSecondPage);
  await page.keyboard.type(' LOCAL DECISION');
  await expect(reviewSecondPage.locator('ins')).toContainText('LOCAL DECISION');
  const reviewSuggestionId = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.pages.integrations.summary().review.suggestions[0].id
  ));
  expect(await page.evaluate((id) => (globalThis as any).fountainBrowserTest.tracked.accept(id), reviewSuggestionId)).toBe(true);
  await expect(review).toContainText('LOCAL DECISION');
  await expect(review.locator('ins, del')).toHaveCount(0);
  await expect(review.locator(':scope > [data-fountain-editable-page="2"]')).toContainText('LOCAL DECISION');
  expect(await page.evaluate(() => {
    const summary = (globalThis as any).fountainBrowserTest.pages.integrations.summary();
    return {
      modes: [summary.left.mode, summary.right.mode, summary.review.mode],
      collaborativeDocumentsMatch: JSON.stringify(summary.left.document) === JSON.stringify(summary.right.document),
      collaborationStillPaged: summary.left.pages > 1 && summary.right.pages > 1,
      reviewStillPaged: summary.review.pages > 1,
    };
  })).toEqual({
    modes: ['paged', 'paged', 'paged'],
    collaborativeDocumentsMatch: true,
    collaborationStillPaged: true,
    reviewStillPaged: true,
  });
});

test('tracks real browser insertion and replacement with reversible review decisions', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Tracked changes contract editor' });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(editor.locator('ins')).toHaveText('!');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.tracked.state().suggestions[0])).toMatchObject({
    type: 'insert', text: '!', user: { id: 'browser-author', name: 'Browser author with a complete name' },
  });

  const insertionId = await page.evaluate(() => (globalThis as any).fountainBrowserTest.tracked.state().suggestions[0].id);
  expect(await page.evaluate((id) => (globalThis as any).fountainBrowserTest.tracked.reject(id), insertionId)).toBe(true);
  await expect(editor).toHaveText('Alpha review');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest.tracked;
    contract.commands.commands.selectText([0, 0], 0, 5);
    contract.view.focus();
  });
  await page.keyboard.type('Beta');
  await expect(editor.locator('del')).toHaveText('Alpha');
  await expect(editor.locator('ins')).toHaveText('Beta');
  const replacement = await page.evaluate(() => (globalThis as any).fountainBrowserTest.tracked.state().suggestions[0]);
  expect(replacement).toMatchObject({ type: 'replace', text: 'Beta', replacedText: 'Alpha' });
  expect(await page.evaluate((id) => (globalThis as any).fountainBrowserTest.tracked.accept(id), replacement.id)).toBe(true);
  await expect(editor).toHaveText('Beta review');
  await expect(editor.locator('ins, del')).toHaveCount(0);
});

test('runs the package-backed full-text tracked review panel', async ({ page }) => {
  await page.goto('/');
  const workspace = page.locator('.tracked-demo__workspace');
  await expect(workspace.getByRole('textbox', { name: 'Tracked changes demo editor' })).toBeVisible();
  await expect(workspace.getByRole('heading', { name: 'Review suggestions' })).toBeVisible();
  await expect(workspace.locator('.fountain-tracked-change-card')).toHaveCount(3);
  await expect(workspace.locator('.fountain-tracked-change-card__author')).toContainText(['Ada Lovelace', 'Ada Lovelace', 'Grace Hopper']);
  const summaries = workspace.locator('.fountain-tracked-change-card__summary');
  await expect(summaries.filter({ hasText: 'product → team' })).toBeVisible();
  await expect(summaries.filter({ hasText: 'Portable suggestions travel with the document' })).toBeVisible();

  const replacement = workspace.locator('.fountain-tracked-change-card').filter({ hasText: 'Replacement' });
  await replacement.locator('.fountain-tracked-change-card__focus').click();
  await expect(replacement).toHaveClass(/is-selected/);
  await replacement.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(workspace.getByRole('textbox', { name: 'Tracked changes demo editor' })).toContainText('Every team deserves');
});

test('runs package-backed named versions, exact comparison, preview, and guarded restoration', async ({ page }) => {
  await page.goto('/');
  const workspace = page.locator('.versions-demo__workspace');
  const panel = workspace.getByRole('region', { name: 'Saved versions' });
  const editor = workspace.getByRole('textbox', { name: 'Version history demo editor' });
  await expect(panel).toContainText('2 loaded · Unsaved changes');
  await expect(panel).toContainText('First complete draft — nothing hidden after an ellipsis');
  await expect(panel).toContainText('Team review with the complete descriptive name visible');
  await expect(editor).toContainText('The current working draft');

  const review = panel.locator('.fountain-version-card').filter({ hasText: 'Team review with the complete descriptive name visible' });
  await review.getByRole('button', { name: 'Compare to current' }).click();
  const comparison = panel.getByRole('region', { name: 'Version comparison' });
  await expect(comparison).toContainText('reviewed');
  await expect(comparison).toContainText('current working');

  const first = panel.locator('.fountain-version-card').filter({ hasText: 'First complete draft — nothing hidden after an ellipsis' });
  await first.getByRole('button', { name: 'Preview' }).click();
  await expect(panel.getByRole('region', { name: /Preview of First complete draft/ })).toContainText('The first complete draft explains the launch in plain language.');

  const restore = first.getByRole('button', { name: 'Restore', exact: true });
  await restore.click();
  const confirmRestore = first.getByRole('button', { name: 'Confirm restore' });
  await expect(confirmRestore).toBeVisible();
  await expect(editor).toContainText('The current working draft');
  await confirmRestore.click();
  await expect(editor).toContainText('The first complete draft explains the launch in plain language.');
  await expect(panel).toContainText('4 loaded · Current version saved');
});

test('edits and persists package-backed collapsible details in the public playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const disclosure = editor.locator('details').first();
  const summary = disclosure.locator('summary');
  await expect(summary).toHaveText('Open this collapsible section');
  await expect(disclosure).not.toHaveAttribute('open', '');

  await summary.click();
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure).toContainText('editable document content');
  await page.locator('.format-tabs').getByRole('button', { name: 'json' }).click();
  await expect(page.locator('.studio__export pre')).toContainText('"type": "details"');
  await expect(page.locator('.studio__export pre')).toContainText('"open": true');

  await page.getByRole('button', { name: '▸ Details' }).click();
  await expect(editor.locator('details')).toHaveCount(2);
  const inserted = editor.locator('details').last();
  await expect(inserted).toHaveAttribute('open', '');
  await expect(inserted.locator('summary')).toHaveText('Click to edit this summary');
  await inserted.locator('summary').click();
  await expect(inserted).not.toHaveAttribute('open', '');
});

test('edits semantic ruby annotations through the package-backed public playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const ruby = editor.locator('ruby').first();
  await expect(ruby.locator('rb')).toHaveText('東京');
  const annotation = ruby.getByRole('button', { name: /Edit pronunciation/ });
  await expect(annotation).toHaveText('とうきょう');
  await annotation.click();

  const dialog = page.getByRole('dialog', { name: 'Edit ruby annotation' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Ruby annotation' }).fill('トウキョウ');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(ruby.locator('rt')).toHaveText('トウキョウ');
  await expect(dialog).toBeHidden();

  await page.locator('.format-tabs').getByRole('button', { name: 'json' }).click();
  await expect(page.locator('.studio__export pre')).toContainText('"type": "ruby"');
  await expect(page.locator('.studio__export pre')).toContainText('"rt": "トウキョウ"');
  await page.locator('.format-tabs').getByRole('button', { name: 'html' }).click();
  await expect(page.locator('.studio__export pre')).toContainText('<ruby');
  await expect(page.locator('.studio__export pre')).toContainText('<rt');

  await ruby.locator('rt').focus();
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('converges live and offline Yjs edits and keeps collaborative undo author-local', async ({ page }) => {
  const left = page.getByRole('textbox', { name: 'Collaborative editor left' });
  const right = page.getByRole('textbox', { name: 'Collaborative editor right' });

  await left.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(right).toContainText('Shared collaboration!');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.collaboration.closeLeftHistory())).toBe(true);

  await page.evaluate(() => (globalThis as any).fountainBrowserTest.collaboration.pause());
  await left.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' LEFT');
  await right.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('RIGHT ');
  await expect(left).not.toContainText('RIGHT');
  await expect(right).not.toContainText('LEFT');

  await page.evaluate(() => (globalThis as any).fountainBrowserTest.collaboration.resume());
  await expect(left).toContainText('RIGHT Shared collaboration! LEFT');
  await expect(right).toContainText('RIGHT Shared collaboration! LEFT');

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.collaboration.undoLeft())).toBe(true);
  await expect(left).toContainText('RIGHT Shared collaboration!');
  await expect(right).toContainText('RIGHT Shared collaboration!');
});

test('runs reference links, recursive blocks, rich tables, and loss reports in a real browser', async ({ page }) => {
  const result = await page.evaluate(() => (globalThis as any).fountainBrowserTest.inspectMarkdown([
    '> First paragraph.',
    '>',
    '> - Nested item',
    '',
    '| Path \\| label | State |',
    '| --- | :---: |',
    '| C:\\\\tmp | [Ready][status] |',
    '',
    '[status]: https://example.com/status "Status page"',
  ].join('\n')));

  expect(result.document).toEqual(result.roundTrip);
  expect(result.document.content.map((node: any) => node.type)).toEqual(['blockquote', 'table']);
  expect(result.markdown).toContain('[Ready][ref-1]');
  expect(result.markdown).toContain('[ref-1]: https://example.com/status "Status page"');
  expect(result.losses).toEqual([]);

  const losses = await page.evaluate(() => (globalThis as any).fountainBrowserTest.markdownLosses());
  expect(losses).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'node', type: 'browser_counter', path: [2] }),
  ]));
});

test('round-trips variable-delimiter Markdown code spans in the browser package', async ({ page }) => {
  const result = await page.evaluate(() => ({
    code: (globalThis as any).fountainBrowserTest.inspectMarkdown('Use ``a ` tick`` and ` padded `.'),
    entities: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[Safe](https://example.com/?a=1&amp;b=2) \\&copy; &NotEqualTilde;',
    ),
    destinations: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[Angle](<docs/guide)v1>) and [Relative](guide.md "Guide") plus [Reference] and [Labelled][Multi line].\n\n[reference]:\n  docs/reference.md\n  "Reference title"\n[multi\n  line]: docs/multiline-label.md',
    ),
    precedence: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[foo](not a link) / [foo]() / [outer [inner](docs/inner.md)](docs/outer.md)\n\n[foo]: docs/reference.md',
    ),
    unicodeReferences: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[ẞ] [µ] [ς] [ﬃ]\n\n[SS]: docs/sharp-s.md\n[Μ]: docs/micro.md\n[Σ]: docs/sigma.md\n[FFI]: docs/ligature.md',
    ),
    opaquePrecedence: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[foo <bar attr="][ref]">\n\n[foo`][ref]`\n\n[foo<https://example.com/?search=][ref]>\n\n[ref]: docs/reference.md',
    ),
    sourceLabels: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[no][foo\\!] and [yes][foo\\[]\n\n[foo!]: docs/plain.md\n[foo\\[]: docs/escaped.md',
    ),
    adjacentReferences: [
      '[foo][bar][baz]\n\n[baz]: /url',
      '[foo][bar][baz]\n\n[baz]: /url1\n[bar]: /url2',
      '[foo][bar][baz]\n\n[baz]: /url1\n[foo]: /url2',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    imageDescription: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      'Before ![photo *with emphasis*, [a link](https://example.com), and ![an icon](icon.png)](hero.png "Hero") after',
    ),
    linkedImages: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '[![moon](moon.jpg "Moon")](/uri "Outer") and *![star](star.png)*',
    ),
    emphasis: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      'snake_case / ***important*** / __strong__ / a*b*c',
    ),
    whitespaceDelimiters: [
      '*foo bar *',
      '_foo bar _',
      '**foo bar **',
      '__foo bar __',
      '*foo bar\n*',
      '*\u00a0a\u00a0*',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    thematicBreaks: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '* Foo\n* * *\n* Bar\n\n**  * ** * ** * **',
    ),
    atxWhitespace: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '#                  foo                     \n## \n#\n### ###',
    ),
    listDelimiters: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '+ foo\n+ bar\n* baz\n\n1. one\n2. two\n3) three',
    ),
    orderedInterruption: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      'Existing paragraph\n14. stays in it\n\nExisting paragraph\n1. starts a list',
    ),
    orderedMarkerLimits: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '0. Zero\n1. One\n\n123456789. Valid\n\n1234567890. Literal',
    ),
    emptyListItems: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '-\n- Filled\n\n1.\n2. Filled',
    ),
    lazyBlockquotes: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '   > # Foo\n   > bar\n > baz\n\n> > > nested\ncontinuation',
    ),
    opaqueCodeLanguage: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '````;\ncode\n````',
    ),
    indentedListMarkers: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '  - foo\n\n    bar',
    ),
    tabIndentedCode: (globalThis as any).fountainBrowserTest.inspectMarkdown('  \tfoo\tbar'),
    tabbedListContainer: (globalThis as any).fountainBrowserTest.inspectMarkdown('  - foo\n\n\tbar'),
    multilineSetext: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      'Foo *bar\nbaz*\n====\n\nFoo\nBar\n---',
    ),
    nestedEmphasis: (globalThis as any).fountainBrowserTest.inspectMarkdown(
      '*outer **inner** outer* / **strong *inside* strong** / *[linked](https://example.com)* / *[literal *](https://example.com)',
    ),
    delimiterArithmetic: [
      '*foo**bar**baz*',
      '*foo**bar*',
      '***foo** bar*',
      '*foo **bar***',
      '*foo**bar***',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    surplusDelimiters: [
      '**foo*',
      '*foo**',
      '***foo**',
      '****foo*',
      '**foo***',
      '*foo****',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    sharedDelimiterRuns: [
      '__foo_ bar_',
      '*foo *bar**',
      '***foo* bar**',
      '**foo *bar***',
      'foo******bar*********baz',
      '*foo **bar *baz* bim** bop*',
      '*foo [*bar*](/url)*',
      '**foo *bar **baz** bim* bop**',
      '**foo [*bar*](/url)**',
      '*foo __bar *baz bim__ bam*',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    strikethroughRuns: [
      '~~Removed~~ and ~also removed~.',
      'Three ~~~stays literal~~~ here.',
      'This ~~does not\n\ncross paragraphs~~.',
      '~~before `~~` and [label~~](docs.md) after~~',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    extendedWebAutolinks: [
      'Visit www.docs.example/help.',
      '(https://docs.example/find?q=(work)).',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    extendedEmailAutolinks: [
      'Write to author+docs@mail.example.',
      "hello@mail+team.example is invalid, but hello+team@mail.example works.",
      'Keep author@mail.example_ literal.',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    protocolAutolinks: [
      '<MAILTO:FOO@BAR.BAZ>',
      '<xmpp:writer@chat.example/mobile>',
      '<javascript:alert(1)> / <made-up-scheme://host>',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
    linkWhitespace: [
      '[link](foo\nbar)',
      '[link](<foo\nbar>)',
      '[link](/url\u00a0"title")',
    ].map((source) => (globalThis as any).fountainBrowserTest.inspectMarkdown(source)),
  }));

  expect(result.code.document).toEqual(result.code.roundTrip);
  expect(result.code.markdown).toBe('Use ``a ` tick`` and `padded`.');
  expect(result.code.document.content[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'a ` tick', marks: [expect.objectContaining({ type: 'code' })] }),
    expect.objectContaining({ text: 'padded', marks: [expect.objectContaining({ type: 'code' })] }),
  ]));
  expect(result.code.losses).toEqual([]);
  expect(result.entities.document).toEqual(result.entities.roundTrip);
  expect(result.entities.document.content[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'Safe', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'https://example.com/?a=1&b=2' }),
    })] }),
    expect.objectContaining({ text: ' &copy; ≂̸' }),
  ]));
  expect(result.entities.losses).toEqual([]);
  expect(result.destinations.document).toEqual(result.destinations.roundTrip);
  expect(result.destinations.document.content[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'Angle', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'docs/guide)v1' }),
    })] }),
    expect.objectContaining({ text: 'Relative', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'guide.md', title: 'Guide' }),
    })] }),
    expect.objectContaining({ text: 'Reference', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'docs/reference.md', title: 'Reference title' }),
    })] }),
    expect.objectContaining({ text: 'Labelled', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'docs/multiline-label.md' }),
    })] }),
  ]));
  expect(result.destinations.losses).toEqual([]);
  expect(result.precedence.document).toEqual(result.precedence.roundTrip);
  expect(result.precedence.document.content[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'foo', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'docs/reference.md' }),
    })] }),
    expect.objectContaining({ text: 'foo', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: '' }),
    })] }),
    expect.objectContaining({ text: 'inner', marks: [expect.objectContaining({
      type: 'link', attrs: expect.objectContaining({ href: 'docs/inner.md' }),
    })] }),
  ]));
  expect(result.precedence.losses).toEqual([]);
  expect(result.unicodeReferences.document).toEqual(result.unicodeReferences.roundTrip);
  expect(result.unicodeReferences.document.content[0].content
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => node.marks.find((mark: any) => mark.type === 'link').attrs.href))
    .toEqual(['docs/sharp-s.md', 'docs/micro.md', 'docs/sigma.md', 'docs/ligature.md']);
  expect(result.unicodeReferences.losses).toEqual([]);
  expect(result.opaquePrecedence.document).toEqual(result.opaquePrecedence.roundTrip);
  expect(result.opaquePrecedence.document.content
    .flatMap((block: any) => block.content ?? [])
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => ({
      text: node.text,
      href: node.marks.find((mark: any) => mark.type === 'link').attrs.href,
    })))
    .toEqual([{
      text: 'https://example.com/?search=][ref]',
      href: 'https://example.com/?search=][ref]',
    }]);
  expect(result.opaquePrecedence.losses).toEqual([]);
  expect(result.sourceLabels.document).toEqual(result.sourceLabels.roundTrip);
  expect(result.sourceLabels.document.content[0].content
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => ({
      text: node.text,
      href: node.marks.find((mark: any) => mark.type === 'link').attrs.href,
    })))
    .toEqual([{ text: 'yes', href: 'docs/escaped.md' }]);
  expect(result.sourceLabels.losses).toEqual([]);
  expect(result.adjacentReferences.map((entry: any) => entry.document.content[0].content
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => ({
      text: node.text,
      href: node.marks.find((mark: any) => mark.type === 'link').attrs.href,
    }))))
    .toEqual([
      [{ text: 'bar', href: '/url' }],
      [{ text: 'foo', href: '/url2' }, { text: 'baz', href: '/url1' }],
      [{ text: 'bar', href: '/url1' }],
    ]);
  expect(result.adjacentReferences.every((entry: any) => entry.losses.length === 0)).toBe(true);
  expect(result.imageDescription.document).toEqual(result.imageDescription.roundTrip);
  expect(result.imageDescription.document.content[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'inline_image',
      attrs: expect.objectContaining({
        src: 'hero.png',
        alt: 'photo with emphasis, a link, and an icon',
        title: 'Hero',
      }),
    }),
  ]));
  expect(result.imageDescription.losses).toEqual([]);
  expect(result.linkedImages.document).toEqual(result.linkedImages.roundTrip);
  expect(result.linkedImages.document.content[0].content
    .filter((node: any) => node.type === 'inline_image')
    .map((node: any) => ({
      alt: node.attrs.alt,
      marks: node.marks?.map((mark: any) => mark.type) ?? [],
    })))
    .toEqual([
      { alt: 'moon', marks: ['link'] },
      { alt: 'star', marks: ['em'] },
    ]);
  expect(result.linkedImages.markdown).toBe([
    '[![moon][ref-1]][ref-2] and *![star][ref-3]*',
    '',
    '[ref-1]: moon.jpg "Moon"',
    '[ref-2]: /uri "Outer"',
    '[ref-3]: star.png',
  ].join('\n'));
  expect(result.linkedImages.losses).toEqual([]);
  expect(result.emphasis.document).toEqual(result.emphasis.roundTrip);
  expect(result.emphasis.document.content[0].content.map((node: any) => ({
    text: node.text,
    marks: node.marks?.map((mark: any) => mark.type) ?? [],
  }))).toEqual([
    { text: 'snake_case / ', marks: [] },
    { text: 'important', marks: ['em', 'strong'] },
    { text: ' / ', marks: [] },
    { text: 'strong', marks: ['strong'] },
    { text: ' / a', marks: [] },
    { text: 'b', marks: ['em'] },
    { text: 'c', marks: [] },
  ]);
  expect(result.emphasis.losses).toEqual([]);
  expect(result.whitespaceDelimiters.every((entry: any) => (
    entry.document.content.length === 1
      && entry.document.content[0].type === 'paragraph'
      && entry.document.content[0].content.every((node: any) => !(node.marks?.length))
      && JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.thematicBreaks.document).toEqual(result.thematicBreaks.roundTrip);
  expect(result.thematicBreaks.document.content.map((node: any) => node.type)).toEqual([
    'bullet_list',
    'horizontal_rule',
    'bullet_list',
    'horizontal_rule',
  ]);
  expect(result.thematicBreaks.losses).toEqual([]);
  expect(result.atxWhitespace.document).toEqual(result.atxWhitespace.roundTrip);
  expect(result.atxWhitespace.document.content.map((node: any) => ({
    type: node.type,
    level: node.attrs.level,
    text: node.content.map((child: any) => child.text ?? '').join(''),
  }))).toEqual([
    { type: 'heading', level: 1, text: 'foo' },
    { type: 'heading', level: 2, text: '' },
    { type: 'heading', level: 1, text: '' },
    { type: 'heading', level: 3, text: '' },
  ]);
  expect(result.atxWhitespace.losses).toEqual([]);
  expect(result.listDelimiters.document).toEqual(result.listDelimiters.roundTrip);
  expect(result.listDelimiters.document.content.map((node: any) => ({
    type: node.type,
    start: node.attrs?.start,
    items: node.content.length,
  }))).toEqual([
    { type: 'bullet_list', start: undefined, items: 2 },
    { type: 'bullet_list', start: undefined, items: 1 },
    { type: 'ordered_list', start: 1, items: 2 },
    { type: 'ordered_list', start: 3, items: 1 },
  ]);
  expect(result.listDelimiters.losses).toEqual([]);
  expect(result.orderedInterruption.document).toEqual(result.orderedInterruption.roundTrip);
  expect(result.orderedInterruption.document.content.map((node: any) => node.type)).toEqual([
    'paragraph',
    'paragraph',
    'ordered_list',
  ]);
  expect(result.orderedInterruption.document.content[0].content[0].text)
    .toBe('Existing paragraph 14. stays in it');
  expect(result.orderedInterruption.losses).toEqual([]);
  expect(result.orderedMarkerLimits.document).toEqual(result.orderedMarkerLimits.roundTrip);
  expect(result.orderedMarkerLimits.document.content.map((node: any) => ({
    type: node.type,
    start: node.attrs?.start,
    text: node.content?.[0]?.text,
  }))).toEqual([
    { type: 'ordered_list', start: 0, text: undefined },
    { type: 'ordered_list', start: 123456789, text: undefined },
    { type: 'paragraph', start: undefined, text: '1234567890. Literal' },
  ]);
  expect(result.orderedMarkerLimits.markdown).toContain('0. Zero');
  expect(result.orderedMarkerLimits.losses).toEqual([]);
  expect(result.emptyListItems.document).toEqual(result.emptyListItems.roundTrip);
  expect(result.emptyListItems.document.content.map((node: any) => (
    node.content.map((item: any) => item.content[0].content?.[0]?.text ?? '')
  ))).toEqual([['', 'Filled'], ['', 'Filled']]);
  expect(result.emptyListItems.losses).toEqual([]);
  expect(result.lazyBlockquotes.document).toEqual(result.lazyBlockquotes.roundTrip);
  expect(result.lazyBlockquotes.document.content.map((node: any) => node.type)).toEqual([
    'blockquote',
    'blockquote',
  ]);
  expect(result.lazyBlockquotes.document.content[0].content[1].content[0].text).toBe('bar baz');
  expect(result.lazyBlockquotes.document.content[1].content[0].content[0].content[0].content[0].text)
    .toBe('nested continuation');
  expect(result.lazyBlockquotes.losses).toEqual([]);
  expect(result.opaqueCodeLanguage.document).toEqual(result.opaqueCodeLanguage.roundTrip);
  expect(result.opaqueCodeLanguage.document.content[0].attrs.language).toBe(';');
  expect(result.opaqueCodeLanguage.losses).toEqual([]);
  expect(result.indentedListMarkers.document).toEqual(result.indentedListMarkers.roundTrip);
  expect(result.indentedListMarkers.document.content.map((node: any) => node.type)).toEqual(['bullet_list']);
  expect(result.indentedListMarkers.losses).toEqual([]);
  expect(result.tabIndentedCode.document).toEqual(result.tabIndentedCode.roundTrip);
  expect(result.tabIndentedCode.document.content[0]).toMatchObject({
    type: 'code_block',
    content: [{ type: 'text', text: 'foo\tbar' }],
  });
  expect(result.tabIndentedCode.losses).toEqual([]);
  expect(result.tabbedListContainer.document).toEqual(result.tabbedListContainer.roundTrip);
  expect(result.tabbedListContainer.document.content[0].content[0].content.map((node: any) => node.type))
    .toEqual(['paragraph', 'paragraph']);
  expect(result.tabbedListContainer.losses).toEqual([]);
  expect(result.multilineSetext.document).toEqual(result.multilineSetext.roundTrip);
  expect(result.multilineSetext.document.content.map((node: any) => ({
    type: node.type,
    level: node.attrs.level,
    text: node.content.map((child: any) => child.text ?? '').join(''),
  }))).toEqual([
    { type: 'heading', level: 1, text: 'Foo bar baz' },
    { type: 'heading', level: 2, text: 'Foo Bar' },
  ]);
  expect(result.multilineSetext.losses).toEqual([]);
  expect(result.nestedEmphasis.document).toEqual(result.nestedEmphasis.roundTrip);
  expect(result.nestedEmphasis.document.content[0].content
    .filter((node: any) => node.marks?.length)
    .map((node: any) => ({
      text: node.text,
      marks: node.marks.map((mark: any) => mark.type),
    }))).toEqual([
      { text: 'outer ', marks: ['em'] },
      { text: 'inner', marks: ['em', 'strong'] },
      { text: ' outer', marks: ['em'] },
      { text: 'strong ', marks: ['strong'] },
      { text: 'inside', marks: ['strong', 'em'] },
      { text: ' strong', marks: ['strong'] },
      { text: 'linked', marks: ['em', 'link'] },
      { text: 'literal *', marks: ['link'] },
    ]);
  expect(result.nestedEmphasis.losses).toEqual([]);
  expect(result.delimiterArithmetic.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.delimiterArithmetic.map((entry: any) => entry.document.content[0].content
    .map((node: any) => ({
      text: node.text,
      marks: node.marks?.map((mark: any) => mark.type) ?? [],
    })))).toEqual([
      [
        { text: 'foo', marks: ['em'] },
        { text: 'bar', marks: ['em', 'strong'] },
        { text: 'baz', marks: ['em'] },
      ],
      [{ text: 'foo**bar', marks: ['em'] }],
      [
        { text: 'foo', marks: ['em', 'strong'] },
        { text: ' bar', marks: ['em'] },
      ],
      [
        { text: 'foo ', marks: ['em'] },
        { text: 'bar', marks: ['em', 'strong'] },
      ],
      [
        { text: 'foo', marks: ['em'] },
        { text: 'bar', marks: ['em', 'strong'] },
      ],
    ]);
  expect(result.surplusDelimiters.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.surplusDelimiters.map((entry: any) => entry.document.content[0].content
    .map((node: any) => ({
      text: node.text,
      marks: node.marks?.map((mark: any) => mark.type) ?? [],
    })))).toEqual([
      [{ text: '*', marks: [] }, { text: 'foo', marks: ['em'] }],
      [{ text: 'foo', marks: ['em'] }, { text: '*', marks: [] }],
      [{ text: '*', marks: [] }, { text: 'foo', marks: ['strong'] }],
      [{ text: '***', marks: [] }, { text: 'foo', marks: ['em'] }],
      [{ text: 'foo', marks: ['strong'] }, { text: '*', marks: [] }],
      [{ text: 'foo', marks: ['em'] }, { text: '***', marks: [] }],
    ]);
  expect(result.sharedDelimiterRuns.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.sharedDelimiterRuns.map((entry: any) => entry.document.content[0].content
    .map((node: any) => ({
      text: node.text,
      marks: node.marks?.map((mark: any) => mark.type) ?? [],
    })))).toEqual([
      [{ text: 'foo', marks: ['em', 'em'] }, { text: ' bar', marks: ['em'] }],
      [{ text: 'foo ', marks: ['em'] }, { text: 'bar', marks: ['em', 'em'] }],
      [{ text: 'foo', marks: ['strong', 'em'] }, { text: ' bar', marks: ['strong'] }],
      [{ text: 'foo ', marks: ['strong'] }, { text: 'bar', marks: ['strong', 'em'] }],
      [{ text: 'foo', marks: [] }, { text: 'bar', marks: ['strong', 'strong', 'strong'] }, { text: '***baz', marks: [] }],
      [
        { text: 'foo ', marks: ['em'] },
        { text: 'bar ', marks: ['em', 'strong'] },
        { text: 'baz', marks: ['em', 'strong', 'em'] },
        { text: ' bim', marks: ['em', 'strong'] },
        { text: ' bop', marks: ['em'] },
      ],
      [{ text: 'foo ', marks: ['em'] }, { text: 'bar', marks: ['em', 'link', 'em'] }],
      [
        { text: 'foo ', marks: ['strong'] },
        { text: 'bar ', marks: ['strong', 'em'] },
        { text: 'baz', marks: ['strong', 'em', 'strong'] },
        { text: ' bim', marks: ['strong', 'em'] },
        { text: ' bop', marks: ['strong'] },
      ],
      [{ text: 'foo ', marks: ['strong'] }, { text: 'bar', marks: ['strong', 'link', 'em'] }],
      [
        { text: 'foo ', marks: ['em'] },
        { text: 'bar *baz bim', marks: ['em', 'strong'] },
        { text: ' bam', marks: ['em'] },
      ],
    ]);
  expect(result.strikethroughRuns.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.strikethroughRuns.map((entry: any) => entry.document.content
    .map((block: any) => block.content.map((node: any) => ({
      text: node.text,
      marks: node.marks?.map((mark: any) => mark.type) ?? [],
    }))))).toEqual([
      [[
        { text: 'Removed', marks: ['strike'] },
        { text: ' and ', marks: [] },
        { text: 'also removed', marks: ['strike'] },
        { text: '.', marks: [] },
      ]],
      [[{ text: 'Three ~~~stays literal~~~ here.', marks: [] }]],
      [
        [{ text: 'This ~~does not', marks: [] }],
        [{ text: 'cross paragraphs~~.', marks: [] }],
      ],
      [[
        { text: 'before ', marks: ['strike'] },
        { text: '~~', marks: ['strike', 'code'] },
        { text: ' and ', marks: ['strike'] },
        { text: 'label~~', marks: ['strike', 'link'] },
        { text: ' after', marks: ['strike'] },
      ]],
    ]);
  expect(result.extendedWebAutolinks.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.extendedWebAutolinks.map((entry: any) => entry.document.content
    .flatMap((block: any) => block.content)
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => ({
      text: node.text,
      href: node.marks.find((mark: any) => mark.type === 'link').attrs.href,
    })))).toEqual([
      [{ text: 'www.docs.example/help', href: 'http://www.docs.example/help' }],
      [{ text: 'https://docs.example/find?q=(work)', href: 'https://docs.example/find?q=(work)' }],
    ]);
  expect(result.extendedEmailAutolinks.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.extendedEmailAutolinks.map((entry: any) => entry.document.content
    .flatMap((block: any) => block.content)
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => ({
      text: node.text,
      href: node.marks.find((mark: any) => mark.type === 'link').attrs.href,
    })))).toEqual([
      [{ text: 'author+docs@mail.example', href: 'mailto:author+docs@mail.example' }],
      [{ text: 'hello+team@mail.example', href: 'mailto:hello+team@mail.example' }],
      [],
    ]);
  expect(result.protocolAutolinks.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.protocolAutolinks.map((entry: any) => entry.document.content
    .flatMap((block: any) => block.content)
    .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
    .map((node: any) => ({
      text: node.text,
      href: node.marks.find((mark: any) => mark.type === 'link').attrs.href,
    })))).toEqual([
      [{ text: 'MAILTO:FOO@BAR.BAZ', href: 'MAILTO:FOO@BAR.BAZ' }],
      [{ text: 'xmpp:writer@chat.example/mobile', href: 'xmpp:writer@chat.example/mobile' }],
      [],
    ]);
  expect(result.linkWhitespace.every((entry: any) => (
    JSON.stringify(entry.document) === JSON.stringify(entry.roundTrip)
      && entry.losses.length === 0
  ))).toBe(true);
  expect(result.linkWhitespace.map((entry: any) => ({
    text: entry.document.content.flatMap((block: any) => block.content)
      .map((node: any) => node.text ?? '').join(''),
    links: entry.document.content.flatMap((block: any) => block.content)
      .filter((node: any) => node.marks?.some((mark: any) => mark.type === 'link'))
      .map((node: any) => node.marks.find((mark: any) => mark.type === 'link').attrs.href),
  }))).toEqual([
    { text: '[link](foo bar)', links: [] },
    { text: '[link](<foo bar>)', links: [] },
    { text: 'link', links: ['/url\u00a0"title"'] },
  ]);
});

test('preserves raw Markdown and inert frontmatter through the browser package', async ({ page }) => {
  const source = '\uFEFF---\r\ntitle: Browser source\r\n---\r\n# Original ###\r\n\r\nKeep  this spacing.\r\n';
  const result = await page.evaluate((value) => (
    (globalThis as any).fountainBrowserTest.inspectMarkdownSource(value)
  ), source);

  expect(result.exact).toEqual({ markdown: source, losses: [], preservation: 'exact' });
  expect(result.edited).toEqual({
    markdown: '\uFEFF---\r\ntitle: Browser source\r\n---\r\n# Original ###\r\n\r\nChanged visually\r\n',
    losses: [],
    preservation: 'blocks',
  });
  expect(result.structural).toEqual({
    markdown: '\uFEFF---\r\ntitle: Browser source\r\n---\r\nInserted first\r\n\r\n# Original ###\r\n\r\nKeep  this spacing.',
    losses: [],
    preservation: 'mapped-blocks',
  });
  expect(result.body).toBe('# Original ###\r\n\r\nKeep  this spacing.\r\n');
  expect(result.lineEnding).toBe('\r\n');
  expect(result.frontmatter.content).toBe('title: Browser source\r\n');
  expect(result.sourceBlocks).toEqual([
    { source: '# Original ###', separatorAfter: '\r\n\r\n' },
    { source: 'Keep  this spacing.', separatorAfter: '\r\n' },
  ]);
});

test('edits through real beforeinput events and undoes a Markdown input rule', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor).toContainText('Second paragraph');
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# ');
  await expect(editor.locator('[data-fountain-node="heading"]')).toHaveCount(1);

  await page.keyboard.press('Backspace');
  await expect(editor.locator('[data-fountain-node="heading"]')).toHaveCount(0);
  await expect(editor.locator('[data-fountain-path="2"]')).toHaveText('# ');
});

test('groups adjacent browser typing and respects explicit undo boundaries', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const first = editor.locator('[data-fountain-path="0"]');
  await first.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('abc');
  const firstText = () => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent);
  await expect.poll(firstText).toBe('abcAlpha Beta');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('Alpha Beta');

  await page.keyboard.type('x');
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.closeHistory());
  await page.keyboard.type('y');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('xAlpha Beta');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('Alpha Beta');
});

test('commits cross-browser composition sequences once and supports replacement input', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([0, 0], 0, 5));
  await page.waitForTimeout(0);
  const result = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: '東', isComposing: true,
    }));
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    const commit = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: '東京',
    });
    editor.dispatchEvent(commit);
    return { commitPrevented: commit.defaultPrevented };
  });
  expect(result).toEqual({ commitPrevented: true });
  const firstText = () => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent);
  await expect.poll(firstText).toBe('東京 Beta');

  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([0, 0], 0, 2));
  await page.waitForTimeout(0);
  const replacementPrevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const replacement = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: '京都',
    });
    editor.dispatchEvent(replacement);
    return replacement.defaultPrevented;
  });
  expect(replacementPrevented).toBe(true);
  await expect.poll(firstText).toBe('京都 Beta');
});

test('maps decorations through typing without persisting widget content', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  expect(await editor.locator('.tested-range').allTextContents()).toEqual(['Alp', 'ha']);
  expect(await editor.locator('.tested-overlap').allTextContents()).toEqual(['ha', ' Bet']);
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveText('Remote');

  await editor.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('!');
  expect(await editor.locator('.tested-range').allTextContents()).toEqual(['Alp', 'ha']);
  expect(await editor.locator('.tested-overlap').allTextContents()).toEqual(['ha', ' Bet']);
  await expect(editor).toContainText('!AlphaRemote Beta');
  await expect(page.getByLabel('Document JSON')).not.toContainText('Remote');
});

test('highlights editable code and updates language metadata through public commands', async ({ page }) => {
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { editor, commands } = contract;
    const source = 'const answer = 42;\n// editable';
    const block = editor.state.schema.node('code_block', { language: 'ts', lineNumbers: true }, [editor.state.schema.text(source)]);
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [block]));
    commands.commands.selectText([0, 0], source.length);
    contract.view.focus();
  });

  const block = page.locator('pre.fjs-code-block');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-language', 'typescript');
  await expect(block.locator('.fjs-token--keyword')).toHaveText('const');
  await expect(block.locator('.fjs-token--number')).toHaveText('42');
  await expect(block.locator('.fjs-token--comment')).toHaveText('// editable');
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(2);

  await page.keyboard.press('Enter');
  await page.keyboard.type('return answer;');
  await expect(block.locator('.fjs-token--keyword')).toHaveText(['const', 'return']);
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(3);

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.setCodeBlockLanguage('PY'))).toBe(true);
  await expect(block).toHaveAttribute('data-language', 'python');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.toggleCodeBlockLineNumbers(false))).toBe(true);
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(0);
});

test('runs a view-focused chain and checks it without preview side effects', async ({ page }) => {
  const output = page.getByLabel('Document JSON');
  const before = await output.textContent();
  const canRun = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.can().chain().focus('end').insertText(' chained').run();
  });
  expect(canRun).toBe(true);
  await expect(output).toHaveText(before ?? '');

  const ran = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.chain().focus('end').insertText(' chained').run();
  });
  expect(ran).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' })).toBeFocused();
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Second paragraph');
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).locator(':scope > p').last())
    .toHaveText(' chained');
});

test('applies every configured paste-rule match through a browser paste event', async ({ page }) => {
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  const prevented = await page.locator('[data-fountain-path="1"]').evaluate((target) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/plain' ? ' one -- two --' : '',
      },
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('Second paragraph one — two —');
});

test('autolinks, safely activates, edits, and removes links in a real browser', async ({ page }) => {
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Visit https://example.com. ');
  const link = page.getByRole('textbox', { name: 'Browser contract editor' }).getByRole('link', { name: 'https://example.com' });
  await expect(link).toHaveAttribute('href', 'https://example.com');
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('https://example.com.');

  const activation = await link.evaluate((anchor) => {
    let detail: unknown;
    anchor.closest('[role="textbox"]')?.addEventListener('fountain-link-activate', (event) => {
      detail = (event as CustomEvent).detail;
    }, { once: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    return { prevented: click.defaultPrevented, detail };
  });
  expect(activation).toEqual({ prevented: true, detail: expect.objectContaining({ href: 'https://example.com' }) });

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 1], 3);
    contract.commands.commands.editLink('/docs', { title: 'Documentation', target: '_self' });
  });
  await expect(link).toHaveAttribute('href', '/docs');
  await expect(link).toHaveAttribute('title', 'Documentation');
  await expect(link).toHaveAttribute('target', '_self');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.removeLink())).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).getByRole('link')).toHaveCount(0);
});

test('preserves structured rich HTML from a real browser clipboard event', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([1, 0], 16));
  await page.waitForTimeout(0);
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<h2>Imported heading</h2><p>A <strong>rich</strong> fragment</p>'
          : 'Imported heading\nA rich fragment',
      },
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).locator('h2')).toHaveText('Imported heading');
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' }).locator('strong')).toHaveText('rich');
});

test('imports an extension-defined HTML node through the schema contract', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectNode([2]));
  await page.waitForTimeout(0);
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<section data-browser-counter-html data-count="7"></section>'
          : 'Counter 7',
      },
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole('button', { name: 'Count 7' })).toBeVisible();
  expect(await page.evaluate(() => {
    const document = (globalThis as any).fountainBrowserTest.editor.state.doc;
    const counter = document.content.find((node: any) => node.type.name === 'browser_counter');
    return counter?.attrs.count;
  })).toBe(7);
});

test('pastes mixed nested HTML lists without flattening their hierarchy', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([1, 0], 16));
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<ul><li>Parent <strong>bold</strong><ol start="3"><li>Nested</li></ol></li><li>Sibling</li></ul>'
          : 'Parent bold\nNested\nSibling',
      },
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await expect(editor.locator('ul > li').first().locator('strong')).toHaveText('bold');
  await expect(editor.locator('ul > li').first().locator('ol')).toHaveAttribute('start', '3');
  await expect(editor.locator('ul > li').first().locator('ol > li')).toHaveText('Nested');
});

test('wraps, indents, lifts, and exits lists through browser-visible commands and keys', async ({ page }) => {
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectTextRange([0, 0], 0, [1, 0], 6);
    return contract.commands.commands.toggleList('ordered');
  })).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('ol').first().locator(':scope > li')).toHaveCount(2);

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 1, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Tab');
  await expect(editor.locator('ol ol')).toHaveCount(1);
  await expect(editor.locator('ol ol > li')).toContainText('Second paragraph');
  await page.keyboard.press('Shift+Tab');
  await expect(editor.locator('ol ol')).toHaveCount(0);

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Backspace');
  await expect(editor.locator(':scope > p').first()).toHaveText('Alpha Beta');
  await expect(editor.locator(':scope > ol > li')).toHaveCount(1);
});

test('edits bidirectional and deeply nested text by logical document positions', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (globalThis as any).fountainBrowserTest;
    const { schema } = editor.state;
    const bidi = schema.node('paragraph', {}, [schema.text('שלום world مرحبا')]);
    const quote = schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('Nested text')])]);
    const insertionIndex = editor.state.doc.childCount - 1;
    editor.dispatch(editor.state.createTransaction().replace(insertionIndex, insertionIndex, [bidi, quote]));
  });

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([3, 0], 0, 4);
    contract.view.focus();
  });
  await page.keyboard.type('Hello');
  await expect(page.locator('[data-fountain-path="3"]')).toHaveText('Hello world مرحبا');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([4, 0, 0], 11);
    contract.view.focus();
  });
  await page.keyboard.type('!');
  await expect(page.locator('[data-fountain-path="4.0"]')).toHaveText('Nested text!');
});

test('moves a selected top-level block through native drag data', async ({ page }) => {
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectNode([0]));
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const first = editor.locator('[data-fountain-path="0"]');
  const second = editor.locator('[data-fountain-path="1"]');
  await expect(first).toHaveAttribute('draggable', 'true');
  const targetBox = await second.boundingBox();
  await first.dragTo(second, { targetPosition: { x: 8, y: Math.max(1, (targetBox?.height ?? 2) - 1) } });

  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent)
  ))).toEqual(['Second paragraph', 'Alpha Beta', '', '']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent)
  ))).toEqual(['Alpha Beta', 'Second paragraph', '', '']);
});

test('reorders nested blocks with accessible controls, drop indicators, drag, and undo', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (globalThis as any).fountainBrowserTest;
    const { schema } = editor.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const quote = schema.node('blockquote', {}, [paragraph('Nested one'), paragraph('Nested two')]);
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [
      paragraph('Outside'), quote, paragraph('Tail'),
    ]));
  });

  const nestedTwo = page.locator('[data-fountain-path="1.1"]');
  await nestedTwo.hover();
  const controls = page.getByRole('toolbar', { name: 'Paragraph block controls' });
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute('data-fountain-block-path', '1.1');
  await expect(controls.getByRole('button', { name: 'Move Paragraph block before' })).toBeEnabled();
  await controls.getByRole('button', { name: 'Move Paragraph block before' }).click();
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(1).content.map((node: any) => node.textContent)
  ))).toEqual(['Nested two', 'Nested one']);
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.undo());

  await page.locator('[data-fountain-path="1.1"]').hover();
  const dragResult = await page.evaluate(() => {
    const drag = document.querySelector<HTMLElement>('[data-fountain-block-action="drag"]');
    const target = document.querySelector<HTMLElement>('[data-fountain-path="2"]');
    if (!drag || !target) throw new Error('Missing block drag fixture.');
    const transfer = new DataTransfer();
    drag.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const bounds = target.getBoundingClientRect();
    const over = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 4,
      clientY: bounds.top + 1,
      dataTransfer: transfer,
    });
    target.dispatchEvent(over);
    const indicator = target.dataset.fountainDropPosition;
    const drop = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 4,
      clientY: bounds.top + 1,
      dataTransfer: transfer,
    });
    target.dispatchEvent(drop);
    return { indicator, overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented };
  });
  expect(dragResult).toEqual({ indicator: 'before', overPrevented: true, dropPrevented: true });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent)
  ))).toEqual(['Outside', 'Nested one', 'Nested two', 'Tail']);
  await expect(page.locator('[data-fountain-drop-position]')).toHaveCount(0);
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.undo());
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(1).content.map((node: any) => node.textContent)
  ))).toEqual(['Nested one', 'Nested two']);

  const external = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('[data-fountain-path="0"]');
    if (!target) throw new Error('Missing untrusted-drop target.');
    const transfer = new DataTransfer();
    transfer.setData('application/x-fountain-node-path', JSON.stringify([2]));
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
    target.dispatchEvent(drop);
    return {
      prevented: drop.defaultPrevented,
      content: (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.textContent),
    };
  });
  expect(external).toEqual({ prevented: true, content: ['Outside', 'Nested oneNested two', 'Tail'] });
});

test('shows one structural block target across paragraphs, headings, lists, tables, media, and custom nodes', async ({ page }) => {
  test.slow();
  await page.goto('/browser-tests.html');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const instance = (globalThis as any).fountainBrowserTest.editor;
    const { schema } = instance.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const cell = (text: string) => schema.node('table_cell', {}, [paragraph(text)]);
    instance.dispatch(instance.state.createTransaction().replace(0, instance.state.doc.childCount, [
      paragraph('A deliberately long multi-line paragraph identifies the entire structural block even when browser layout wraps its words across several visible lines in the editing surface.'),
      schema.node('heading', { level: 2 }, [schema.text('Structural heading')]),
      schema.node('bullet_list', {}, [
        schema.node('list_item', {}, [paragraph('First list item')]),
        schema.node('list_item', {}, [paragraph('Second list item')]),
      ]),
      schema.node('table', {}, [
        schema.node('table_row', {}, [cell('A'), cell('B')]),
        schema.node('table_row', {}, [cell('C'), cell('D')]),
      ]),
      schema.node('image_super', {
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        alt: 'Reorder image', caption: 'Media block', width: '160px', height: '72px',
      }),
      schema.node('audio', { src: '/reorder-audio.mp3', title: 'Reorder audio', caption: 'Audio media block' }),
      schema.node('browser_counter', { count: 4 }),
      paragraph('Trailing target'),
    ]));
  });
  await editor.evaluate((element) => { element.style.width = '460px'; });

  const types = ['paragraph', 'heading', 'bullet_list', 'table', 'image_super', 'audio', 'browser_counter'];
  for (let index = 0; index < types.length; index += 1) {
    const block = editor.locator(`:scope > [data-fountain-path="${index}"]`);
    await block.hover();
    await expect(block).toHaveAttribute('data-fountain-node', types[index] as string);
    await expect(block).toHaveAttribute('data-fountain-block-active', 'true');
    await expect(block).not.toHaveCSS('box-shadow', 'none');
    const label = `${types[index]?.replace(/_/g, ' ')} block controls`;
    await expect(page.getByRole('toolbar', { name: new RegExp(label, 'i') })).toBeVisible();
  }
  expect((await editor.locator(':scope > [data-fountain-path="0"]').boundingBox())?.height ?? 0).toBeGreaterThan(45);

  const custom = editor.locator(':scope > [data-fountain-path="6"]');
  await custom.hover();
  const controls = page.getByRole('toolbar', { name: 'Browser Counter block controls' });
  const drag = controls.getByRole('button', { name: 'Drag Browser Counter block' });
  await drag.focus();
  await expect(custom).toHaveAttribute('data-fountain-block-handle-active', 'true');
  await drag.press('Space');
  await expect(drag).toHaveAttribute('aria-pressed', 'true');
  await expect(custom).toHaveAttribute('data-fountain-block-grabbed', 'true');
  await expect(controls).toHaveAttribute('data-fountain-block-grabbed', 'keyboard');
  await drag.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.type.name)
  ))).toEqual(['paragraph', 'heading', 'bullet_list', 'table', 'image_super', 'browser_counter', 'audio', 'paragraph']);
  await expect(editor.locator(':scope > [data-fountain-path="5"]')).toHaveAttribute('data-fountain-block-grabbed', 'true');
  await drag.press('Escape');
  await expect(editor.locator('[data-fountain-block-grabbed]')).toHaveCount(0);

  const pointerState = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-fountain-path="5"]');
    source?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    const dragControl = document.querySelector<HTMLElement>('[data-fountain-block-action="drag"]');
    const target = document.querySelector<HTMLElement>('[data-fountain-path="1"]');
    if (!source || !dragControl || !target) throw new Error('Missing visual reorder fixture.');
    const transfer = new DataTransfer();
    dragControl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const bounds = target.getBoundingClientRect();
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: transfer,
      clientX: bounds.left + 20, clientY: bounds.top + 1,
    }));
    const indicator = document.querySelector<HTMLElement>('[data-fountain-block-drop-indicator]');
    return {
      sourceGrabbed: source.dataset.fountainBlockGrabbed,
      sourceDragging: source.dataset.fountainDragging,
      targetPosition: target.dataset.fountainDropPosition,
      indicatorHidden: indicator?.hidden,
      indicatorPath: indicator?.dataset.fountainDropPath,
      indicatorPosition: indicator?.dataset.fountainDropPosition,
      indicatorOutsideEditor: indicator ? !document.querySelector('[role="textbox"]')?.contains(indicator) : false,
    };
  });
  expect(pointerState).toEqual({
    sourceGrabbed: 'true',
    sourceDragging: 'true',
    targetPosition: 'before',
    indicatorHidden: false,
    indicatorPath: '1',
    indicatorPosition: 'before',
    indicatorOutsideEditor: true,
  });
});

test('replaces a DOM selection that crosses block boundaries', async ({ page }) => {
  await page.evaluate(() => {
    const wrappers = document.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const textNode = (wrapper: HTMLElement, offset: number): { node: Node; offset: number } => {
      const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
      });
      let remaining = offset;
      let node = walker.nextNode();
      while (node) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) return { node, offset: remaining };
        remaining -= length;
        node = walker.nextNode();
      }
      throw new Error('Unable to locate text offset.');
    };
    const start = textNode(wrappers[0] as HTMLElement, 6);
    const end = textNode(wrappers[1] as HTMLElement, 7);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  await page.keyboard.type('joined ');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('[data-fountain-node="paragraph"]')).toHaveCount(2);
  const documentJSON = JSON.parse(await page.getByLabel('Document JSON').textContent() ?? '{}');
  expect(documentJSON.content[0].content.map((node: { text?: string }) => node.text ?? '').join('')).toBe('Alpha joined paragraph');
  expect(documentJSON.content.at(-1)).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: '' }] });
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveCount(1);
});

test('keeps a visible editable paragraph after a terminal non-text block', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const instance = contract.editor;
    const paragraph = instance.state.schema.node('paragraph', {}, [instance.state.schema.text('Before divider')]);
    const divider = instance.state.schema.node('horizontal_rule');
    instance.dispatch(instance.state.createTransaction().replace(0, instance.state.doc.childCount, [paragraph, divider]));
  });

  expect(await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => node.type.name)
  ))).toEqual(['paragraph', 'horizontal_rule', 'paragraph']);
  const tail = editor.locator(':scope > p').last();
  await expect(tail.locator('[data-fountain-caret-placeholder]')).toHaveCount(1);
  expect((await tail.boundingBox())?.height ?? 0).toBeGreaterThan(0);

  await tail.click();
  await page.keyboard.type('Continue after divider');
  await expect(tail).toHaveText('Continue after divider');
});

test('uses Ctrl+A as an explicit all-document selection and replaces the document', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('all');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toContain('Alpha');

  await page.keyboard.type('Replacement');
  await expect(editor).toHaveText('Replacement');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('text');
});

test('selects and deletes an atomic image through real pointer and keyboard input', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.insertImage({ src: 'https://example.com/selected.png', alt: 'Selected image' });
  });
  expect(inserted).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const image = editor.locator('[data-fountain-node="image_super"]');
  await editor.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await editor.locator('[data-fountain-path="0"]').click();
  await image.locator('img').click();
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await page.keyboard.press('Backspace');
  await expect(image).toHaveCount(0);
});

test('edits, aligns, resizes, and undoes a production image through accessible controls', async ({ page }) => {
  const dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  expect(await page.evaluate((src) => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.insertImage({
      src,
      alt: 'Resizable image',
      caption: 'Initial caption',
      width: '360px',
      align: 'center',
    });
  }, dataURL)).toBe(true);

  const figure = page.locator('.fountain-image');
  await expect(figure).toHaveAttribute('role', 'figure');
  await figure.click();
  await expect(figure).toHaveAttribute('data-fountain-image-selected', 'true');
  const caption = figure.getByRole('textbox', { name: 'Image caption' });
  await caption.fill('A caption edited in the node view');
  await caption.press('ControlOrMeta+Enter');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.caption))
    .toBe('A caption edited in the node view');

  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.setImageAlignment('right'))).toBe(true);
  await expect(figure).toHaveAttribute('data-align', 'right');

  const keyboardHandle = figure.getByRole('slider', { name: 'Resize image from right' });
  await keyboardHandle.focus();
  await keyboardHandle.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.width)).toBe('370px');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.width)).toBe('360px');

  await figure.hover();
  const dragHandle = figure.getByRole('slider', { name: 'Resize image from left' });
  const box = await dragHandle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2 - 55, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await page.mouse.up();
  const resized = await page.evaluate(() => String((globalThis as any).fountainBrowserTest.editor.state.doc.content.find((node: any) => node.type.name === 'image_super')?.attrs.width));
  expect(Number.parseInt(resized, 10)).toBeGreaterThanOrEqual(410);
});

test('inserts and removes a true inline image without breaking surrounding text', async ({ page }) => {
  const dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  expect(await page.evaluate((src) => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0], 5);
    return contract.commands.commands.insertInlineImage({ src, alt: 'Inline status', width: '1em', height: '1em' });
  }, dataURL)).toBe(true);
  const inline = page.locator('[data-fountain-node="inline_image"]');
  await expect(inline).toHaveAttribute('data-fountain-inline-image', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).content.map((node: any) => node.type.name)))
    .toEqual(['text', 'inline_image', 'text']);
  await inline.click();
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');
  await page.keyboard.press('Delete');
  await expect(inline).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent)).toBe('Alpha Beta');
});

test('tracks and cancels browser-native image upload tasks', async ({ page }) => {
  const started = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const task = contract.startImageUpload(
      contract.editor,
      new File(['image'], 'browser.png', { type: 'image/png' }),
      {
        upload: async (_file: File, context: any) => {
          context.reportProgress(.4);
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { src: 'https://cdn.example.com/browser.png', alt: 'Browser upload' };
        },
      },
    );
    (globalThis as any).browserImageUpload = task;
    return { status: task.snapshot.status, progress: task.snapshot.progress };
  });
  expect(started).toEqual({ status: 'uploading', progress: .4 });
  await expect.poll(() => page.evaluate(() => (globalThis as any).browserImageUpload.snapshot.status)).toBe('succeeded');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.doc.content.some((node: any) => node.attrs.src === 'https://cdn.example.com/browser.png'))).toBe(true);

  const cancelled = await page.evaluate(async () => {
    const contract = (globalThis as any).fountainBrowserTest;
    const task = contract.startImageUpload(
      contract.editor,
      new File(['image'], 'cancel.png', { type: 'image/png' }),
      {
        upload: (_file: File, context: any) => new Promise((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
        }),
      },
    );
    task.completion.catch(() => undefined);
    task.cancel();
    await Promise.resolve();
    return task.snapshot.status;
  });
  expect(cancelled).toBe('cancelled');
});

test('extends and replaces a rectangular cell selection through real pointer input', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const didInsert = contract.commands.commands.insertTable({ rows: 2, columns: 2, headerRow: true });
    contract.commands.commands.selectText([1, 0, 0, 0, 0], 0);
    return didInsert;
  });
  expect(inserted).toBe(true);
  await page.locator('[data-fountain-path="1.1.1"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(4);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('cell');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 0, 0, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(4);

  await page.keyboard.type('First cell only');
  await expect(page.locator('[data-fountain-path="1.0.0"]')).toHaveText('First cell only');
  await expect(page.locator('[data-fountain-path="1.0.1"]')).toHaveText('');
  await expect(page.locator('[data-fountain-path="1.1.0"]')).toHaveText('');
  await expect(page.locator('[data-fountain-path="1.1.1"]')).toHaveText('');
});

test('edits merged tables, resizes columns, toggles headers, and exchanges spreadsheet grids', async ({ page }) => {
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { editor, commands } = contract;
    const { schema } = editor.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const cell = (text: string) => schema.node('table_cell', {}, [paragraph(text)]);
    const table = schema.node('table', {}, [
      schema.node('table_row', {}, [cell('A'), cell('B')]),
      schema.node('table_row', {}, [cell('C'), cell('D')]),
    ]);
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [table]));
    commands.commands.selectCells([0, 0, 0], [0, 1, 1]);
    return commands.commands.mergeTableCells();
  })).toBe(true);
  const merged = page.locator('[data-fountain-path="0.0.0"]');
  await expect(merged).toHaveAttribute('colspan', '2');
  await expect(merged).toHaveAttribute('rowspan', '2');
  await expect(merged).toContainText('ABCD');

  const resize = merged.locator('.fountain-table-cell__resize-handle');
  await expect(resize).toHaveAttribute('role', 'separator');
  await resize.press('ArrowRight');
  const width = await page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).child(0).child(0).attrs.colwidth
  ));
  expect(width).toHaveLength(2);
  expect(width[1]).toBeGreaterThanOrEqual(40);

  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.splitTableCell();
  })).toBe(true);
  await expect(page.locator('[data-fountain-node="table_cell"]')).toHaveCount(4);
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0, 0, 0, 0], 0);
    return contract.commands.commands.toggleTableHeaderRow();
  })).toBe(true);
  await expect(page.locator('th')).toHaveCount(2);

  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.selectCells([0, 0, 0], [0, 1, 1]);
  })).toBe(true);
  const copied = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const values: Record<string, string> = {};
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => values[type] ?? '',
      setData: (type: string, value: string) => { values[type] = value; },
    } });
    editor.dispatchEvent(event);
    return { prevented: event.defaultPrevented, values };
  });
  expect(copied.prevented).toBe(true);
  expect(copied.values['text/plain']).toContain('\t');
  expect(copied.values['text/html']).toContain('<table>');

  const pasted = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/plain' ? '1\t2\n3\t4' : '',
    } });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pasted).toBe(true);
  await expect(page.locator('[data-fountain-node="table_cell"], [data-fountain-node="table_header"]')).toHaveText(['1', '2', '3', '4']);
});

test('keeps normal paste while offering bounded editor-local clipboard slots', async ({ page }) => {
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0], 0, 5);
  });
  await page.waitForTimeout(0);
  const prevented = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('copy', { bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.clipboardHistory()?.entries[0]?.text
  ))).toBe('Alpha');

  await page.getByRole('textbox', { name: 'Browser contract editor' }).press('Control+Alt+v');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.clipboardHistory()?.open)).toBe(true);
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 0], 16);
    const id = contract.clipboardHistory().entries[0].id;
    return contract.commands.commands.pasteClipboardHistoryEntry(id);
  })).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Second paragraphAlpha');

  const normalPaste = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/plain' ? '!' : '',
    } });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(normalPaste).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Second paragraphAlpha!');
});

test('renders and types into a structural gap as a new block', async ({ page }) => {
  const selected = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.selectGap(12);
  });
  expect(selected).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveAttribute('data-fountain-gap', 'before');
  await page.keyboard.type('Between');
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Between');
  await expect(page.locator('[data-fountain-path="2"]')).toContainText('Second paragraph');
});

test('edits Lean without a mandatory server and renders transient provider diagnostics', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const result = contract.commands.commands.insertLeanBlock('example : \\forall');
    contract.view.focus();
    return result;
  });
  expect(inserted).toBe(true);
  const lean = page.locator('pre[data-language="lean"]');
  await expect(lean).toContainText('example : \\forall');
  await page.keyboard.press('Tab');
  await expect(lean).toContainText('example : ∀');
  await page.evaluate(async () => {
    await (globalThis as any).fountainBrowserTest.leanController.check();
  });
  await expect(page.locator('[data-fountain-lean-diagnostic="error"]')).toHaveText('example');
  await expect(page.locator('#document-json')).not.toContainText('Browser fixture diagnostic');
  await page.keyboard.type(' ');
  await expect(page.locator('[data-fountain-lean-diagnostic]')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.editor.state.doc.content.some((node: any) => (
      node.attrs.language === 'lean' && node.textContent === 'example : ∀ '
    ));
  })).toBe(true);
});

test('keeps custom NodeViews live across updates and mapped moves while containing their DOM', async ({ page }) => {
  const counter = page.locator('[data-browser-counter]');
  await expect(counter).toHaveText('Count 0');
  await counter.click();
  await expect(counter).toHaveText('Count 1');
  expect(await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return { ...contract.nodeViewMetrics, selection: contract.editor.state.selection.kind };
  })).toEqual({ created: 1, destroyed: 0, updates: 1, selection: 'text' });

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectNode([2]);
  });
  await expect(counter).toHaveAttribute('data-selection-hook', 'selected');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const paragraph = contract.editor.state.schema.node('paragraph', {}, [contract.editor.state.schema.text('Leading')]);
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, 0, [paragraph]));
  });
  expect(await page.evaluate(() => {
    const selection = (globalThis as any).fountainBrowserTest.editor.state.selection;
    return { kind: selection.kind, path: selection.nodePath };
  })).toEqual({ kind: 'node', path: [3] });
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.nodeViewMetrics.created)).toBe(1);
  await counter.click();
  await expect(counter).toHaveText('Count 2');

  await counter.evaluate((element) => { (element as HTMLElement).dataset.localState = 'kept'; });
  await expect(counter).toHaveAttribute('data-local-state', 'kept');
  await counter.evaluate((element) => { element.textContent = 'Tampered'; });
  await expect(counter).toHaveText('Count 2');
  expect(await page.evaluate(() => ({ ...(globalThis as any).fountainBrowserTest.nodeViewMetrics })))
    .toEqual({ created: 2, destroyed: 1, updates: 2 });
});

test('loads the public React playground without console or page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Build a rich-text editor. Use any framework. Extend every layer.' });
  await expect(heading).toBeVisible();
  const heroLines = await heading.locator(':scope > *').evaluateAll((lines) =>
    lines.map((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      return {
        top: line.getBoundingClientRect().top,
        visualLines: range.getClientRects().length,
      };
    }),
  );
  expect(heroLines).toHaveLength(3);
  expect(heroLines.every(({ visualLines }) => visualLines === 1)).toBe(true);
  expect(heroLines[1].top).toBeGreaterThan(heroLines[0].top);
  expect(heroLines[2].top).toBeGreaterThan(heroLines[1].top);
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toContainText('Try FountainJS in this document');
  expect(errors).toEqual([]);
});

test('publishes actionable extension authoring, conformance, and doctor guidance', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/developers.html#extensions');

  await expect(page.getByRole('heading', { name: 'Generate it, test it, diagnose the complete installation' })).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: 'fountainjs-editor create-extension' })).toContainText('fountainjs-editor doctor');
  await expect(page.locator('pre').filter({ hasText: 'assertExtensionConformance' })).toContainText('expectDocumentChange: true');
  await expect(page.getByRole('link', { name: /complete authoring, compatibility, migration, and publishing contract/ }))
    .toHaveAttribute('href', 'https://github.com/eddolo/fountainjs/blob/master/docs/EXTENSIONS.md');
  await expect(page.getByRole('link', { name: /docs\/ROADMAP\.md/ })).toHaveAttribute(
    'href',
    'https://github.com/eddolo/fountainjs/blob/master/docs/ROADMAP.md',
  );
  expect(errors).toEqual([]);
});

test('runs the public two-editor collaboration demo with presence and author-local undo', async ({ page }) => {
  await page.goto('/');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  await expect(left).toBeVisible();
  await expect(right).toContainText('Edit either side');

  const leftParagraph = left.locator('[data-fountain-node="paragraph"]').first();
  await left.focus();
  await leftParagraph.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret, .fountain-comment-thread--point')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let text = walker.nextNode();
    for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next;
    if (!text) throw new Error('Expected collaboration text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.type(' LIVE');
  await expect(right).toContainText('author-aware. LIVE');

  await leftParagraph.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret, .fountain-comment-thread--point')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    const text = nodes[0];
    if (!text) throw new Error('Expected collaboration text.');
    let remaining = 4;
    let end = text;
    let endOffset = 0;
    for (const node of nodes) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        end = node;
        endOffset = remaining;
        break;
      }
      remaining -= length;
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(end, endOffset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(right.locator('.fountain-collaboration-caret')).toHaveAttribute('aria-label', "Ada's cursor");
  await expect(right.locator('.fountain-collaboration-selection')).toContainText('Edit');

  await page.getByRole('button', { name: 'Undo Ada' }).click();
  await expect(right).not.toContainText(' LIVE');
  await expect(left).not.toContainText(' LIVE');
});

test('replaces both live collaboration documents without remounting the public editors', async ({ page }) => {
  await page.goto('/');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  const documentText = (target: typeof left) => target.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let value = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) value += node.textContent ?? '';
    return value;
  });
  const switchToPlanning = page.getByRole('button', { name: 'Switch both editors to Planning room' });
  await expect(switchToPlanning).toBeVisible();
  await left.evaluate((element) => { (globalThis as any).__fountainLeftRoot = element.closest('[data-fountain-root]'); });

  await switchToPlanning.click();
  await expect(page.getByText('Room: Planning', { exact: true })).toBeVisible();
  await expect(left).toContainText('Shared planning agenda');
  await expect(right).toContainText('Shared planning agenda');
  await expect(left).not.toContainText('Shared launch note');
  await left.focus();
  await left.locator('[data-fountain-node="paragraph"]').last().locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let text = walker.nextNode();
    for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next;
    if (!text) throw new Error('Expected collaboration text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.type(' PLANNING');
  await expect.poll(() => documentText(right)).toContain('PLANNING');

  await page.getByRole('button', { name: 'Switch both editors to Launch room' }).click();
  await expect(page.getByText('Room: Launch', { exact: true })).toBeVisible();
  await expect(left).toContainText('Shared launch note');
  await expect(right).toContainText('Shared launch note');
  await expect(left).not.toContainText('Shared planning agenda');
  await expect.poll(() => documentText(left)).not.toContain('PLANNING');
  await expect.poll(() => documentText(right)).not.toContain('PLANNING');
  expect(await left.evaluate((element) => element.closest('[data-fountain-root]') === (globalThis as any).__fountainLeftRoot)).toBe(true);

  await page.getByRole('button', { name: 'Switch both editors to Planning room' }).click();
  await expect.poll(() => documentText(left)).toContain('PLANNING');
  await expect.poll(() => documentText(right)).toContain('PLANNING');
  expect(await left.evaluate((element) => element.closest('[data-fountain-root]') === (globalThis as any).__fountainLeftRoot)).toBe(true);
});

test('merges nested collaborative settings through the public two-editor demo', async ({ page }) => {
  await page.goto('/');
  const controls = page.getByRole('region', { name: 'Granular collaborative settings' });
  const left = page.locator('[data-collaboration-editor="ada"]');
  const right = page.locator('[data-collaboration-editor="grace"]');

  await expect(left.locator('[data-collaboration-settings]')).toContainText('2 columns · comfortable');
  await expect(right.locator('[data-collaboration-settings]')).toContainText('2 columns · comfortable');
  await controls.getByRole('button', { name: 'Add a column' }).click();
  await controls.getByRole('button', { name: 'Toggle density' }).click();
  await expect(left.locator('[data-collaboration-settings]')).toContainText('3 columns · compact');
  await expect(right.locator('[data-collaboration-settings]')).toContainText('3 columns · compact');

  await controls.getByRole('button', { name: 'Add owner filter' }).click();
  await controls.getByRole('button', { name: 'Add priority filter' }).click();
  await expect(controls.getByText('3 columns · 3 filters', { exact: true })).toBeVisible();
  await expect(controls.getByText('Compact · 3 filters', { exact: true })).toBeVisible();
});

test('keeps headline phrases together and makes full-page navigation explicit', async ({ page }) => {
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(primary.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(primary.getByRole('link', { name: '10 demos', exact: true }).locator('.site-page-link__arrow')).toBeVisible();
  await expect(primary.getByRole('link', { name: 'Developers', exact: true }).locator('.site-page-link__arrow')).toBeVisible();

  const collaborationPhrase = page.getByRole('heading', { name: 'Two editors. One convergent document.' }).locator('.keep-together');
  const modularityPhrase = page.getByRole('heading', { name: 'Start with a working editor. Change only what you need.' }).locator('.keep-together');
  expect(await collaborationPhrase.evaluate((element) => element.getClientRects().length)).toBe(1);
  expect(await modularityPhrase.evaluate((element) => element.getClientRects().length)).toBe(1);

  await page.goto('/demos.html');
  const demosNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(demosNavigation.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(demosNavigation.getByRole('link', { name: '10 demos', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(demosNavigation.getByRole('link', { name: 'Developers', exact: true })).toBeVisible();

  await page.goto('/developers.html');
  const developerNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(developerNavigation.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(developerNavigation.getByRole('link', { name: '10 demos', exact: true })).toBeVisible();
  await expect(developerNavigation.getByRole('link', { name: 'Developers', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('runs shared threaded comments through the public provider-neutral review panel', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Shared review');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  await expect(panel).toContainText('1 thread · connected');
  await expect(panel).toContainText('Could we make the provider boundary even clearer?');
  await expect(left.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();
  await expect(right.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();

  await panel.locator('[data-thread-id="demo-thread-review"] .fountain-comment-thread-card__anchor').click();
  await panel.getByLabel('Reply to thread by Grace').fill('Yes — the host owns authentication and storage.');
  await panel.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(panel).toContainText('Yes — the host owns authentication and storage.');
  await panel.getByRole('button', { name: 'React 👍 to comment by Grace' }).click();
  await expect(panel.getByRole('button', { name: 'React 👍 to comment by Grace' })).toHaveText('👍 1');
  await panel.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();

  const leftParagraph = left.locator('[data-fountain-node="paragraph"]').first();
  await leftParagraph.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret, .fountain-comment-thread--point')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    const text = nodes[0];
    if (!text) throw new Error('Expected collaboration text.');
    let remaining = 4;
    let end = text;
    let endOffset = 0;
    for (const node of nodes) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        end = node;
        endOffset = remaining;
        break;
      }
      remaining -= length;
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(end, endOffset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await panel.getByRole('button', { name: 'New comment' }).click();
  await panel.getByLabel('New comment').fill('A second overlapping review thread.');
  await panel.getByRole('button', { name: 'Create thread' }).click();
  await expect(panel).toContainText('2 threads · connected');
  expect(await right.locator('[data-fountain-comment-thread]').count()).toBeGreaterThanOrEqual(2);
});

test('uses package-backed mentions, emoji, typography, and live counting in the public React playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const count = page.locator('.fountain-character-count');
  await expect(count).toBeVisible();
  await expect(count).toHaveAttribute('aria-live', 'polite');
  const before = Number((await count.textContent())?.match(/\d+/)?.[0] ?? 0);

  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await firstParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('@a');

  const mentionMenu = page.locator('.fountain-suggestion-menu[aria-label="Mention a person or topic"]');
  await expect(mentionMenu).toBeVisible();
  await expect(editor.locator('[data-fountain-suggestion-query="@"]')).toHaveText('@a');
  await expect(mentionMenu.getByRole('option')).toHaveCount(3);
  const mentionListboxId = await mentionMenu.getByRole('listbox').getAttribute('id') ?? '';
  await expect(editor).toHaveAttribute('aria-expanded', 'true');
  await expect(editor).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(editor).toHaveAttribute('aria-controls', mentionListboxId);
  await expect(mentionMenu.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveAttribute('aria-activedescendant', await mentionMenu.getByRole('option').first().getAttribute('id') ?? '');
  await page.keyboard.press('ArrowDown');
  await expect(mentionMenu.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveAttribute('aria-activedescendant', await mentionMenu.getByRole('option').nth(1).getAttribute('id') ?? '');
  await page.keyboard.press('Enter');
  await expect(mentionMenu).toHaveCount(0);
  await expect(editor).not.toHaveAttribute('aria-expanded');
  await expect(editor).not.toHaveAttribute('aria-controls');
  const mention = editor.locator('[data-fountain-mention="true"]').last();
  await expect(mention).toHaveText('@Grace Hopper');
  await expect(mention).toHaveAttribute('data-id', 'grace');
  await expect(mention).toHaveAttribute('data-kind', 'person');

  await page.keyboard.type(':rock');
  const emojiMenu = page.locator('.fountain-suggestion-menu[aria-label="Choose an emoji"]');
  await expect(emojiMenu).toBeVisible();
  await expect(editor.locator('[data-fountain-suggestion-query=":"]')).toHaveText(':rock');
  await expect(emojiMenu.getByRole('option')).toHaveCount(1);
  await expect(emojiMenu.getByRole('option')).toContainText('rocket');
  const menuBounds = await emojiMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((menuBounds?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((menuBounds?.x ?? 0) + (menuBounds?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect((menuBounds?.y ?? -1)).toBeGreaterThanOrEqual(0);
  expect((menuBounds?.y ?? 0) + (menuBounds?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  await page.keyboard.press('Enter');
  const emoji = editor.locator('[data-fountain-emoji="true"]').last();
  await expect(emoji).toContainText('🚀');
  await expect(emoji).toHaveAttribute('data-name', 'rocket');

  await page.keyboard.type('--');
  const createdParagraph = editor.locator('[data-fountain-node="paragraph"]').nth(1);
  await expect(createdParagraph).toContainText('@Grace Hopper 🚀 —');
  await expect.poll(async () => Number((await count.textContent())?.match(/\d+/)?.[0] ?? 0)).toBeGreaterThan(before);
});

test('runs grouped default and product slash commands in the public React playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await firstParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/heading 2');

  const menu = page.locator('.fountain-slash-command-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expect(menu.getByRole('option')).toContainText('Heading 2');
  await expect(editor).toHaveAttribute('aria-controls', await menu.getByRole('listbox').getAttribute('id') ?? 'missing');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(editor.locator('h2').last()).toBeAttached();

  await page.reload();
  const freshEditor = page.getByRole('textbox', { name: 'Rich text editor' });
  const freshParagraph = freshEditor.locator('[data-fountain-node="paragraph"]').first();
  await freshParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/callout');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expect(menu.getByText('Product', { exact: true })).toBeVisible();
  await menu.getByRole('option').click();
  await expect(freshEditor.locator('.demo-callout').last()).toContainText('A custom node supplied by the demo extension.');
});

test('runs accessible bubble and floating menus in the public React playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstText = editor.locator('[data-fountain-text-path]').first();
  await firstText.click();
  await firstText.evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text) throw new Error('Expected editor text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(10, text.textContent?.length ?? 0));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  const bubble = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(bubble).toBeVisible();
  await expect(bubble.getByRole('button')).toHaveCount(4);
  await bubble.getByRole('button', { name: 'Bold selection' }).click();
  await expect(editor.locator('strong').first()).toContainText('Try Founta');

  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await paragraph.click();
  await paragraph.locator('[data-fountain-text-path]').last().evaluate((wrapper) => {
    const range = document.createRange();
    range.selectNodeContents(wrapper);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Enter');
  const floating = page.getByRole('toolbar', { name: 'Empty block actions' });
  await expect(floating).toBeVisible();
  await expect(floating.getByRole('button')).toHaveCount(3);
  await floating.getByRole('button', { name: 'Use heading 2' }).click();
  await expect(editor.locator('h2').last()).toBeAttached();
});

test('composes and keyboard-navigates the public toolbar by stable group and action IDs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use compact toolbar' }).click();

  const toolbar = page.getByRole('toolbar', { name: 'Compact writing toolbar' });
  await expect(toolbar).toBeVisible();
  expect(await toolbar.locator('[data-fountain-toolbar-group]').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-fountain-toolbar-group')))).toEqual([
    'marks', 'block-types', 'history',
  ]);
  await expect(toolbar.locator('[data-fountain-toolbar-group="marks"]')).toHaveAttribute('aria-label', 'Essential formatting');
  expect((await toolbar.locator('[data-fountain-toolbar-group="marks"] [data-fountain-toolbar-action]').evaluateAll((actions) => actions.map((action) => action.getAttribute('data-fountain-toolbar-action')))).slice(0, 4)).toEqual([
    'highlight', 'bold', 'italic', 'underline',
  ]);
  await expect(toolbar.locator('[data-fountain-toolbar-action="strike"]')).toHaveCount(0);

  const highlight = toolbar.getByRole('button', { name: 'Highlight' });
  const strong = toolbar.getByRole('button', { name: 'Strong emphasis' });
  await highlight.focus();
  await page.keyboard.press('ArrowRight');
  await expect(strong).toBeFocused();

  const firstText = page.getByRole('textbox', { name: 'Rich text editor' }).locator('[data-fountain-text-path]').first();
  await firstText.evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text) throw new Error('Expected editor text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(5, text.textContent?.length ?? 0));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await strong.click();
  await expect(page.getByRole('textbox', { name: 'Rich text editor' }).locator('strong').first()).toContainText('Try F');
});

test('applies the complete text-style suite through the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstText = editor.locator('[data-fountain-text-path]').first();
  await firstText.evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (!first) throw new Error('Expected editor text.');
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(first, Math.min(6, first.textContent?.length ?? 0));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  await page.getByRole('button', { name: 'Text styles' }).click();
  await page.getByLabel('Font family').fill('Atkinson Hyperlegible, sans-serif');
  await page.getByRole('button', { name: 'Apply font' }).click();
  await page.getByLabel('Font size').fill('20px');
  await page.getByRole('button', { name: 'Apply size' }).click();
  await page.getByLabel('Line height').fill('1.8');
  await page.getByRole('button', { name: 'Apply line height' }).click();
  await page.getByLabel('Text colour').fill('#123456');
  await page.getByRole('button', { name: 'Apply colour' }).click();
  await page.getByLabel('Background colour').fill('#fedcba');
  await page.getByRole('button', { name: 'Apply background' }).click();

  await expect(editor.locator('[style*="font-family"]').first()).toBeVisible();
  await expect(editor.locator('[style*="font-size: 20px"], [style*="font-size:20px"]').first()).toBeVisible();
  await expect(editor.locator('[style*="line-height: 1.8"], [style*="line-height:1.8"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Apply font' })).toBeHidden();
  const jsonTab = page.locator('.format-tabs').getByRole('button', { name: 'json' });
  const exportCode = page.locator('.studio__export pre code');
  await jsonTab.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await jsonTab.click();
  await expect(jsonTab).toHaveClass(/active/);
  await expect(exportCode).toContainText('"type": "doc"');
  const json = JSON.parse(await exportCode.textContent() ?? '{}');
  const leaves: Array<{ text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }> = [];
  const visit = (node: { content?: unknown[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }) => {
    if (node.text !== undefined) leaves.push(node);
    (node.content ?? []).forEach((child) => visit(child as typeof node));
  };
  visit(json);
  const styled = leaves.find((leaf) => leaf.marks?.some((mark) => mark.type === 'font_family'));
  expect(styled?.text).toBe('Try Fo');
  expect(Object.fromEntries((styled?.marks ?? []).map((mark) => [mark.type, mark.attrs]))).toMatchObject({
    text_color: { color: '#123456' },
    highlight: { color: '#fedcba' },
    font_family: { family: 'Atkinson Hyperlegible, sans-serif' },
    font_size: { size: '20px' },
    line_height: { lineHeight: '1.8' },
  });
});

test('uses the public React image workflow for metadata, alignment, and replacement', async ({ page }) => {
  await page.goto('/');
  const dataURL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const insertButton = page.getByRole('button', { name: 'Insert image from URL' });
  await insertButton.focus();
  await insertButton.press('Enter');
  await page.getByLabel('Image URL').fill(dataURL);
  await page.getByLabel('Alternative text').fill('Public workflow image');
  await page.getByLabel('Image title').fill('Portable image metadata');
  await page.getByLabel('Image caption').fill('Caption from the toolbar');
  await page.getByLabel('Image width').fill('420px');
  await page.getByText('Responsive sources', { exact: true }).click();
  await page.getByLabel('Image source set').fill('https://cdn.example.com/small.png 480w, https://cdn.example.com/large.png 1200w');
  await page.getByLabel('Image sizes').fill('(max-width: 600px) 100vw, 420px');
  await page.getByRole('button', { name: 'Insert URL' }).click();

  const figure = page.locator('.fountain-image').last();
  await expect(figure).toHaveAttribute('aria-label', '[Image: Public workflow image]');
  await expect(figure).toHaveCSS('width', '420px');
  await figure.locator('img').click();
  await page.getByRole('button', { name: 'Edit selected image' }).click();
  const imageForm = page.locator('form.is-image');
  await imageForm.getByLabel('Image caption').fill('Edited from the public React controls');
  await imageForm.getByLabel('Image alignment').selectOption('right');
  await imageForm.getByRole('button', { name: 'Save image' }).click();
  await expect(figure).toHaveAttribute('data-align', 'right');
  await expect(figure.getByRole('textbox', { name: 'Image caption' })).toHaveValue('Edited from the public React controls');

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'replacement.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  });
  await expect(page.locator('form.is-image').getByRole('status')).toContainText('replacement.gif inserted');
  await expect(figure.locator('img')).toHaveAttribute('src', /^data:image\/gif;base64,/);
});

test('creates and edits a link through the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  const linkButton = page.getByRole('button', { name: 'Add or edit link' });
  await firstParagraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await linkButton.click();
  await page.getByLabel('Link URL').fill('www.example.com');
  await page.getByLabel('Link title').fill('Example website');
  await page.getByLabel('Link destination').selectOption('_self');
  await page.getByRole('button', { name: 'Apply link' }).click();

  const link = editor.getByRole('link').first();
  await expect(link).toHaveAttribute('href', 'https://www.example.com');
  await expect(link).toHaveAttribute('title', 'Example website');
  await expect(link).toHaveAttribute('target', '_self');

  await link.click();
  await linkButton.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await linkButton.click();
  await expect(page.getByLabel('Link URL')).toHaveValue('https://www.example.com');
  await expect(page.getByRole('link', { name: 'Open current link' })).toHaveAttribute('href', 'https://www.example.com');
  await page.getByLabel('Link URL').fill('/internal');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(link).toHaveAttribute('href', '/internal');
  await page.getByRole('button', { name: 'Remove link' }).click();
  await expect(editor.getByRole('link')).toHaveCount(0);
});

test('toggles a selected block through the public React list controls', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  const text = await paragraph.textContent();
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: 'Bullet list' }).click();
  await expect(editor.locator('ul > li').first()).toHaveText(text ?? '');
  await page.getByRole('button', { name: 'Bullet list' }).click();
  await expect(editor.locator('ul > li').filter({ hasText: text ?? '' })).toHaveCount(0);
  await expect(editor.locator('[data-fountain-node="paragraph"]').filter({ hasText: text ?? '' })).toHaveCount(1);
});

test('edits code language and line numbers through the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const block = page.locator('pre.fjs-code-block');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-language', 'typescript');
  await expect(block.locator('.fjs-token--keyword').first()).toHaveText('const');
  await block.click();
  await page.getByRole('button', { name: 'Code block and language' }).click();

  const language = page.getByLabel('Code language');
  await expect(language).toHaveValue('typescript');
  await language.fill('js');
  await page.getByLabel('Show code line numbers').uncheck();
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(block).toHaveAttribute('data-language', 'javascript');
  await expect(block.locator('.fjs-code-line-number')).toHaveCount(0);
});

test('opens the searchable clipboard-history picker in the public React toolbar', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await paragraph.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const leaves: Text[] = [];
    for (let current = walker.nextNode(); current; current = walker.nextNode()) leaves.push(current as Text);
    const range = document.createRange();
    range.setStart(leaves[0], 0);
    range.setEnd(leaves.at(-1)!, leaves.at(-1)!.data.length);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(async () => page.getByRole('button', { name: /Clipboard history/ }).isEnabled()).toBe(true);
  await page.keyboard.press('End');
  await page.getByRole('button', { name: /Clipboard history/ }).click();

  const picker = page.getByRole('dialog', { name: 'Clipboard history' });
  await expect(picker).toBeVisible();
  await expect(picker.getByText('Copied in this editor · stored in memory')).toBeVisible();
  await expect(picker.locator('summary')).toContainText('the real npm package, not a picture');
  await expect(picker.locator('summary')).toHaveAttribute('title', /the real npm package, not a picture/);
  await picker.getByLabel('Search clipboard history').fill('real npm package');
  await expect(picker.locator('[role="listitem"]')).toHaveCount(1);
  await picker.getByRole('button', { name: 'Paste' }).click();
  await expect(picker).toHaveCount(0);
  await expect(paragraph).toContainText('the real npm package, not a picture');
});

test('keeps the public outline stable, hierarchical, active, and navigable', async ({ page }) => {
  await page.goto('/');
  const outline = page.getByRole('navigation', { name: 'Document outline' });
  const first = outline.getByRole('button', { name: 'Try FountainJS in this document.' });
  const second = outline.getByRole('button', { name: 'What you can test here' });
  await expect(first).toHaveAttribute('data-depth', '0');
  await expect(second).toHaveAttribute('data-depth', '1');
  await expect(first).toHaveAttribute('aria-current', 'location');

  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstHeading = editor.locator(':scope > h1');
  const originalAnchor = await firstHeading.getAttribute('id');
  expect(originalAnchor).toMatch(/^fountain-heading-fjs-/);
  await expect(firstHeading).toHaveAttribute('data-fountain-toc-id', /fjs-/);

  await second.click();
  await expect(second).toHaveAttribute('aria-current', 'location');
  await expect(editor.locator(':scope > h2').first()).toHaveAttribute('id', /^fountain-heading-fjs-/);

  await selectBlockEnd(firstHeading);
  await page.keyboard.type(' Updated');
  await expect(outline.getByRole('button', { name: 'Try FountainJS in this document. Updated' })).toBeVisible();
  await expect(firstHeading).toHaveAttribute('id', originalAnchor ?? '');
});

test('exposes and explicitly cleans invisible text in the public playground', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const sample = editor.locator('p', { hasText: 'Integrity sample:' });
  await sample.scrollIntoViewIfNeeded();
  await sample.locator('[data-fountain-text-path]').evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE || !text.textContent) throw new Error('Expected integrity sample text.');
    const start = text.textContent.indexOf('ABC123');
    const end = text.textContent.indexOf('xyz') + 3;
    const selection = document.getSelection();
    wrapper.closest<HTMLElement>('[contenteditable="true"]')?.focus();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  const inspector = page.getByRole('region', { name: 'Text integrity' });
  await expect(inspector).toContainText('ZERO WIDTH SPACE');
  await expect(inspector).toContainText('U+200B');
  await inspector.getByRole('button', { name: 'Show invisibles' }).click();
  await expect(sample.locator('[data-fountain-invisible="zero-width-space"]')).toHaveCount(1);

  await inspector.getByLabel('Remove zero-width characters and BOM').check();
  await inspector.getByRole('button', { name: 'Preview cleanup' }).click();
  await expect(inspector.getByRole('region', { name: 'Cleanup preview' })).toContainText('ABC123xyz');
  await inspector.getByRole('button', { name: 'Apply reviewed cleanup' }).click();
  await expect(sample).toContainText('ABC123xyz');
  await expect(sample.locator('[data-fountain-invisible="zero-width-space"]')).toHaveCount(0);

  await inspector.getByRole('button', { name: 'Verbatim input: off' }).click();
  const code = editor.locator(':scope > pre').first();
  await selectBlockEnd(code);
  await page.keyboard.type('--');
  await expect(code).toContainText(');--');
  await expect(inspector).toContainText('Literal input is active');
});

test('runs the public plain-DOM first-class widget demo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/plain-dom-notes.html');
  await expect(page.getByRole('heading', { name: 'Knowledge-base notes' })).toBeVisible();
  await expect(page.getByText('First-class portable widget', { exact: true })).toBeVisible();

  const status = page.getByRole('button', { name: /Incident status · Investigating/ });
  await expect(status).toBeVisible();
  await status.click();
  await expect(page.getByRole('button', { name: /Incident status · Resolved/ })).toBeVisible();
  await expect(page.locator('.demo-output pre')).toContainText('"status": "Resolved"');
  await page.locator('.demo-controls').getByRole('button', { name: 'Undo' }).click();
  const restored = page.getByRole('button', { name: /Incident status · Investigating/ });
  await expect(restored).toBeVisible();
  await restored.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.fountain-editor')).toBeFocused();
  expect(errors).toEqual([]);
});

test('runs the public React first-class widget demo without losing control focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/react-article.html');
  await expect(page.getByText('React portable widget', { exact: true })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Formatting and rich content' })).toHaveCount(1);
  await expect(page.locator('.demo-controls')).toHaveCount(0);

  const priority = page.getByRole('combobox', { name: 'Review priority' });
  await expect(priority).toHaveValue('Normal');
  await priority.focus();
  await priority.selectOption('High');
  await expect(priority).toBeFocused();
  await expect(page.locator('.demo-output pre')).toContainText('"priority": "High"');
  await page.getByRole('toolbar', { name: 'Formatting and rich content' }).getByRole('button', { name: 'Undo' }).click();
  await expect(priority).toHaveValue('Normal');

  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstHeading = editor.locator(':scope > h1 [data-fountain-text-path]').first();
  const firstParagraph = editor.locator(':scope > p [data-fountain-text-path]').first();
  await firstHeading.evaluate((start, end) => {
    const startText = start.firstChild;
    const endText = (end as HTMLElement).firstChild;
    if (!startText || !endText) throw new Error('Expected two text leaves.');
    const range = document.createRange();
    range.setStart(startText, 0);
    range.setEnd(endText, endText.textContent?.length ?? 0);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, await firstParagraph.elementHandle());
  await page.getByRole('toolbar', { name: 'Formatting and rich content' }).getByRole('button', { name: 'Heading 2' }).click();
  await expect(editor.locator(':scope > h2')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('makes the quote control discoverable and toggles an existing quote in the Java workflow demo', async ({ page }) => {
  await page.goto('/demos/java-approval-workflow.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const quote = editor.locator(':scope > blockquote');
  await expect(quote).toContainText('Portable content can travel');
  await quote.locator('p').click();
  await page.getByRole('button', { name: 'Remove quote', exact: true }).click();
  await expect(editor.locator(':scope > blockquote')).toHaveCount(0);
  const unwrapped = editor.locator(':scope > p').filter({ hasText: 'Portable content can travel' });
  await unwrapped.click();
  await page.getByRole('button', { name: 'Quote', exact: true }).click();
  await expect(editor.locator(':scope > blockquote')).toContainText('Portable content can travel');
});

test('runs the public headless Markdown, LaTeX, and server HTML pipeline', async ({ page }) => {
  await page.goto('/demos/node-markdown.html');
  const source = page.getByLabel('Markdown input');
  await expect(source).toContainText('$E=mc^2$');
  await expect(source).toContainText('[reference links][formats]');
  await expect(page.getByText('Valid document · 7 top-level blocks · no reported Markdown losses')).toBeVisible();
  const output = page.locator('.demo-output pre');
  await expect(output).toContainText('inline_math');
  await expect(output).toContainText('math_block');
  await expect(output).toContainText('"language": "lean"');
  await expect(output).toContainText('table');
  await expect(output).toContainText('Format boundary guide');
  await source.fill('# Formula\n\n$\\alpha+\\beta$');
  await expect(page.getByText('Valid document · 2 top-level blocks')).toBeVisible();
  await page.getByRole('button', { name: 'markdown', exact: true }).click();
  await expect(output).toContainText('$\\alpha+\\beta$');

  await page.getByRole('button', { name: 'Server HTML' }).click();
  await expect(page.getByLabel('Server HTML input')).toContainText('<h1>Server-native document</h1>');
  await expect(page.getByText('Valid document · 5 top-level blocks · no recovered HTML issues')).toBeVisible();
  await page.getByRole('button', { name: 'json' }).click();
  await expect(output).toContainText('inline_math');
  await expect(output).toContainText('ordered_list');
  await expect(output).toContainText('table');
  await expect(output).toContainText('no jsdom');
});

test('renders and inserts native math in the public DOM integration', async ({ page }) => {
  await page.goto('/demos/go-docs-service.html');
  const math = page.locator('[data-fountain-math]');
  await expect(math).toHaveCount(2);
  await expect(math.first()).toHaveAttribute('data-fountain-math-appearance', 'plain');
  await expect(math.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(math.filter({ hasText: 'T(n)=O(n \\log n)' })).toHaveAttribute('role', 'math');
  await expect(math.filter({ hasText: '\\sum_{i=1}^{n} i' })).toHaveAttribute('aria-label', 'Sum of the first n integers');
  await expect(page.locator('pre[data-language="lean"]')).toContainText('example : 1 = 1 := rfl');
  await expect(page.getByText('Source-only mode. No checker is configured and no source leaves this editor.')).toBeVisible();
  const output = page.locator('.demo-output pre');
  const identitySnapshot = async () => output.evaluate((element) => {
    const root = JSON.parse(element.textContent ?? '{}') as {
      type: string;
      content?: Array<{ type: string; attrs?: { nodeId?: unknown }; content?: any[] }>;
    };
    const entries: Array<{ type: string; id: unknown }> = [];
    const visit = (node: { type: string; attrs?: { nodeId?: unknown }; content?: any[] }, rootNode = false) => {
      if (!rootNode && node.type !== 'text' && node.type !== 'inline_math') {
        entries.push({ type: node.type, id: node.attrs?.nodeId });
      }
      node.content?.forEach((child) => visit(child));
    };
    visit(root, true);
    return entries;
  });
  const before = await identitySnapshot();
  expect(before.length).toBeGreaterThan(10);
  expect(before.every((entry) => typeof entry.id === 'string' && entry.id.startsWith('fjs-'))).toBe(true);
  expect(new Set(before.map((entry) => entry.id)).size).toBe(before.length);
  const existingBlock = math.filter({ hasText: '\\sum_{i=1}^{n} i' });
  await existingBlock.click();
  await expect(page.getByLabel('Math source', { exact: true })).toHaveValue('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
  const directSource = page.locator('[aria-label="Edit math source"]:visible');
  await expect(directSource).toHaveValue('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
  await directSource.fill('\\int_0^1 x^2 dx');
  await directSource.press('Enter');
  await expect(math.filter({ hasText: '\\int_0^1 x^2 dx' })).toHaveCount(1);
  await expect(output).toContainText('\\int_0^1 x^2 dx');

  await page.getByLabel('Math source', { exact: true }).fill('a^2 + b^2 = c^2');
  await page.getByRole('button', { name: '+ New Math' }).click();
  await expect(math).toHaveCount(3);
  await expect(output).toContainText('a^2 + b^2 = c^2');
  await page.getByLabel('Math source', { exact: true }).fill('x^3 + y^3 = z^3');
  await page.getByRole('button', { name: 'Update selected' }).click();
  await expect(math.filter({ hasText: 'x^3 + y^3 = z^3' })).toHaveCount(1);
  await expect(output).toContainText('x^3 + y^3 = z^3');
  const after = await identitySnapshot();
  const afterIds = new Set(after.map((entry) => entry.id));
  expect(before.every((entry) => afterIds.has(entry.id))).toBe(true);
  expect(after.length).toBeGreaterThan(before.length);
  expect(new Set(after.map((entry) => entry.id)).size).toBe(after.length);
});

test('makes table sizing, complete deletion, insertion gaps, and highlight colours explicit in the public demo', async ({ page }) => {
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const tables = editor.locator('table');
  await expect(tables).toHaveCount(1);

  await page.getByLabel('Table rows').fill('3');
  await page.getByLabel('Table columns').fill('4');
  await page.getByRole('button', { name: '+ Table', exact: true }).click();
  await expect(tables).toHaveCount(2);
  const inserted = tables.first();
  await expect(inserted.locator('tr')).toHaveCount(3);
  expect(await inserted.locator('tr').first().locator('th, td').count()).toBe(4);

  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('button', { name: 'Add row below', exact: true }).click();
  await expect(inserted.locator('tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Delete column', exact: true }).click();
  expect(await inserted.locator('tr').first().locator('th, td').count()).toBe(3);
  await page.getByRole('button', { name: 'Delete entire table', exact: true }).click();
  await expect(tables).toHaveCount(1);

  const gap = page.getByRole('button', { name: 'Place cursor after title' });
  await gap.click();
  await expect(gap).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Insertion point ready')).toContainText('not a page break');
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  await expect(editor.locator(':scope > [data-fountain-node="task_list"]')).toHaveAttribute('data-fountain-path', '1');

  const titleText = editor.locator(':scope > h1 [data-fountain-text-path]').first();
  await titleText.evaluate((element) => {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected title text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.getByLabel('Highlight colour').fill('#ff00aa');
  await page.getByRole('button', { name: 'Apply highlight', exact: true }).click();
  await expect(editor.locator('h1 mark')).toHaveCSS('background-color', 'rgb(255, 0, 170)');
  await page.getByRole('button', { name: 'Remove highlight', exact: true }).click();
  await expect(editor.locator('h1 mark')).toHaveCount(0);
});

test('keeps rich and multiline paste structurally predictable in the public editor', async ({ page }) => {
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const technical = editor.locator('p').filter({ hasText: 'Technical prose' }).first();
  await technical.locator('[data-fountain-text-path]').last().evaluate((element) => {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected editable text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const richPrevented = await editor.evaluate((target) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html'
        ? '<p><strong> Rich $x$</strong> <a href="/guide" title="Guide">linked</a></p>'
        : type === 'text/plain' ? ' Rich $x$ linked' : '',
    } });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(richPrevented).toBe(true);
  await expect(technical.locator('strong')).toContainText('Rich $x$');
  await expect(technical.locator('a[href="/guide"]')).toHaveAttribute('title', 'Guide');
  await expect(editor.locator('[data-fountain-math]')).toHaveCount(2);

  const cell = editor.locator('table').first().locator('th, td').first();
  await cell.locator('[data-fountain-text-path]').first().evaluate((element) => {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected cell text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await editor.evaluate((target) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html'
        ? '<p>Nested <em>one</em></p><p>Nested two</p>'
        : type === 'text/plain' ? 'Nested one\nNested two' : '',
    } });
    target.dispatchEvent(event);
  });
  await expect(cell).toContainText('Nested one');
  await expect(cell).toContainText('Nested two');
  await expect(cell.locator('em')).toHaveText('one');
  await expect(editor.locator(':scope > p', { hasText: 'Nested one' })).toHaveCount(0);

  const displayMath = editor.locator('[data-fountain-math="block"]').first();
  await displayMath.click();
  await editor.evaluate((target) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/plain' ? 'First pasted line\n\nThird pasted line' : '',
    } });
    target.dispatchEvent(event);
  });
  await expect(editor.locator('[data-fountain-math="block"]')).toHaveCount(0);
  await expect(editor.locator(':scope > p', { hasText: 'First pasted line' })).toBeVisible();
  await expect(editor.locator(':scope > p', { hasText: 'Third pasted line' })).toBeVisible();
});

test('round-trips a Fountain multi-block selection through Chromium clipboard HTML', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium\'s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/browser-tests.html');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const instance = (globalThis as any).fountainBrowserTest.editor;
    const { schema } = instance.state;
    instance.dispatch(instance.state.createTransaction().replace(0, instance.state.doc.childCount, [
      schema.node('heading', { level: 1 }, [schema.text('Alpha title', [schema.mark('strong')])]),
      schema.node('paragraph', {}, [schema.text('Middle paragraph')]),
      schema.node('browser_counter', { count: 5, pageHeight: 0 }),
      schema.node('heading', { level: 2 }, [schema.text('Omega title')]),
      schema.node('paragraph', {}, [schema.text('Destination')]),
    ]));
  });
  await page.evaluate(() => {
    const textNode = (selector: string) => {
      const container = document.querySelector<HTMLElement>(selector);
      return container ? document.createTreeWalker(container, NodeFilter.SHOW_TEXT).nextNode() : null;
    };
    const start = textNode('[data-fountain-path="0"] [data-fountain-text-path]');
    const end = textNode('[data-fountain-path="3"] [data-fountain-text-path]');
    if (!start || !end) throw new Error('Missing internal clipboard fixture text.');
    const range = document.createRange();
    range.setStart(start, 6);
    range.setEnd(end, 5);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Control+c');
  await editor.locator('[data-fountain-path="4"] [data-fountain-text-path]').evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error('Missing clipboard destination text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Control+v');

  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => ({
      type: node.type.name,
      text: node.textContent,
    }))
  ))).toEqual([
    { type: 'heading', text: 'Alpha title' },
    { type: 'paragraph', text: 'Middle paragraph' },
    { type: 'browser_counter', text: '' },
    { type: 'heading', text: 'Omega title' },
    { type: 'paragraph', text: 'Destination' },
    { type: 'heading', text: 'title' },
    { type: 'paragraph', text: 'Middle paragraph' },
    { type: 'browser_counter', text: '' },
    { type: 'heading', text: 'Omega' },
    { type: 'paragraph', text: '' },
  ]);
  await expect(editor.locator('[data-fountain-path="5"] strong')).toHaveText('title');
  await expect(editor.locator('[data-fountain-path="7"]')).toContainText('Count 5');
});

test('round-trips an extension-owned Fountain atom through the Chromium clipboard', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium\'s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/browser-tests.html');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { schema } = contract.editor.state;
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, contract.editor.state.doc.childCount, [
      schema.node('browser_counter', { count: 17, pageHeight: 0 }),
      schema.node('paragraph', {}, [schema.text('Destination')]),
    ]));
    contract.view.focus();
    contract.commands.commands.selectNode([0]);
  });
  await expect(editor.locator('[data-fountain-path="0"]')).toHaveAttribute('data-fountain-selected-node', 'true');
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Count 17');
  await editor.locator('[data-fountain-path="1"] [data-fountain-text-path]').evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error('Missing atom clipboard destination text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => {
    const selection = (globalThis as any).fountainBrowserTest.editor.state.selection;
    return { kind: selection.kind, path: selection.path, from: selection.from };
  })).toEqual({ kind: 'text', path: [1, 0], from: 'Destination'.length });
  await page.keyboard.press('Control+v');

  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.content.map((node: any) => ({
      type: node.type.name,
      attrs: node.attrs,
      text: node.textContent,
    }))
  ))).toEqual([
    { type: 'browser_counter', attrs: { count: 17, pageHeight: 0 }, text: '' },
    { type: 'paragraph', attrs: { align: 'left' }, text: 'Destination' },
    { type: 'browser_counter', attrs: { count: 17, pageHeight: 0 }, text: '' },
    { type: 'paragraph', attrs: { align: 'left' }, text: '' },
  ]);
});

test('round-trips a complex whole Fountain document through the Chromium clipboard exactly', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium\'s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/browser-tests.html');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const source = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { schema } = contract.editor.state;
    const paragraph = (content: any[]) => schema.node('paragraph', { align: 'left' }, content);
    const textParagraph = (text: string) => paragraph([schema.text(text)]);
    const cell = (type: 'table_header' | 'table_cell', text: string, attrs: Record<string, unknown> = {}) => (
      schema.node(type, attrs, [textParagraph(text)])
    );
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, contract.editor.state.doc.childCount, [
      schema.node('heading', { level: 1, align: 'center' }, [
        schema.text('Portable ', [schema.mark('strong')]),
        schema.text('release', [schema.mark('em'), schema.mark('link', {
          href: '/release', title: 'Release details', target: '_self',
        })]),
      ]),
      schema.node('ordered_list', { start: 3 }, [
        schema.node('list_item', {}, [textParagraph('First ordered item')]),
        schema.node('list_item', {}, [
          textParagraph('Parent item'),
          schema.node('bullet_list', {}, [
            schema.node('list_item', {}, [textParagraph('Nested child')]),
          ]),
        ]),
      ]),
      schema.node('table', {}, [
        schema.node('table_row', {}, [
          cell('table_header', 'Quarter', { colspan: 2, rowspan: 1, colwidth: [120, 180], scope: 'colgroup' }),
        ]),
        schema.node('table_row', {}, [
          cell('table_cell', 'North', { colspan: 1, rowspan: 2, colwidth: [120] }),
          cell('table_cell', '10', { colspan: 1, rowspan: 1, colwidth: [180] }),
        ]),
        schema.node('table_row', {}, [
          cell('table_cell', '20', { colspan: 1, rowspan: 1, colwidth: [180] }),
        ]),
      ]),
      schema.node('image_super', {
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        alt: 'Portable diagram', title: 'Architecture', caption: 'The whole image node survives.',
        width: '320px', height: '180px', align: 'right', srcset: '', sizes: '', loading: 'eager', decoding: 'sync',
      }),
      schema.node('audio', {
        src: '/briefing.mp3', title: 'Release briefing', caption: 'Timestamped briefing',
        controls: true, autoplay: false, loop: true, muted: false, preload: 'none',
        controlsList: 'nodownload', crossOrigin: 'anonymous', disableRemotePlayback: true,
        tracks: [{ src: '/briefing-en.vtt', kind: 'captions', srclang: 'en', label: 'English', default: true }],
      }),
      schema.node('browser_counter', { count: 29, pageHeight: 0 }),
      paragraph([
        schema.text('Inline image: '),
        schema.node('inline_image', {
          src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
          alt: 'badge', title: 'Inline badge', width: '1em', height: '1em', align: 'center',
          srcset: '', sizes: '', loading: 'lazy', decoding: 'async',
        }),
        schema.text(' complete.'),
      ]),
    ]));
    contract.view.focus();
    contract.commands.commands.selectAll();
    return contract.editor.getJSON();
  });
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('all');
  await page.keyboard.press('Control+c');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { schema } = contract.editor.state;
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, contract.editor.state.doc.childCount, [
      schema.node('paragraph', {}, [schema.text('Replace this destination')]),
    ]));
    contract.view.focus();
    contract.commands.commands.selectAll();
  });
  await page.keyboard.press('Control+v');

  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(source);
  await expect(editor.locator('[data-fountain-node="browser_counter"]')).toContainText('Count 29');
  await expect(editor.locator('audio track[kind="captions"][srclang="en"]')).toHaveCount(1);
  await expect(editor.locator('td[rowspan="2"]')).toContainText('North');
});

test('copies clean semantic Fountain HTML into an external browser editor', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium\'s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/browser-tests.html');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { schema } = contract.editor.state;
    const paragraph = (content: any[]) => schema.node('paragraph', {}, content);
    const cell = (text: string) => schema.node('table_cell', {}, [paragraph([schema.text(text)])]);
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, contract.editor.state.doc.childCount, [
      schema.node('heading', { level: 2 }, [schema.text('Release notes')]),
      paragraph([
        schema.text('Portable ', [schema.mark('strong')]),
        schema.text('documentation', [schema.mark('link', { href: '/docs', title: 'Docs', target: '_self' })]),
      ]),
      schema.node('ordered_list', { start: 4 }, [
        schema.node('list_item', {}, [paragraph([schema.text('Preserve structure')])]),
        schema.node('list_item', {}, [paragraph([schema.text('Use standard HTML')])]),
      ]),
      schema.node('table', {}, [schema.node('table_row', {}, [cell('Feature'), cell('Ready')])]),
      schema.node('image_super', {
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        alt: 'Portable diagram', caption: 'Architecture preview', width: '120px', height: '80px',
      }),
      paragraph([schema.text('')]),
    ]));
    contract.view.focus();
  });
  await editor.press('Control+a');
  await expect.poll(() => page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('all');
  await page.keyboard.press('Control+c');

  const external = await page.evaluateHandle(() => {
    const target = document.createElement('div');
    target.contentEditable = 'true';
    target.setAttribute('role', 'textbox');
    target.setAttribute('aria-label', 'External browser editor');
    document.body.appendChild(target);
    target.focus();
    return target;
  });
  await page.keyboard.press('Control+v');
  const target = page.getByRole('textbox', { name: 'External browser editor' });
  await expect(target.getByRole('heading', { name: 'Release notes', level: 2 })).toBeVisible();
  await expect(target.locator('strong')).toHaveText('Portable ');
  await expect(target.locator('a[href="/docs"]')).toHaveText('documentation');
  await expect(target.locator('ol[start="4"] li')).toHaveText(['Preserve structure', 'Use standard HTML']);
  await expect(target.locator('td')).toHaveText(['Feature', 'Ready']);
  await expect(target.locator('figure img[alt="Portable diagram"]')).toHaveCount(1);
  await expect(target.locator('figcaption')).toHaveText('Architecture preview');
  await expect(target.locator('[data-fountain-path], [data-fountain-widget], [data-fountain-selected-node], [data-fountain-clipboard]')).toHaveCount(0);
  await external.dispose();
});

test('copies readable Fountain text into a plain-text external editor', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium\'s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/browser-tests.html');
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { schema } = contract.editor.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const item = (text: string) => schema.node('list_item', {}, [paragraph(text)]);
    const cell = (text: string) => schema.node('table_cell', {}, [paragraph(text)]);
    contract.editor.dispatch(contract.editor.state.createTransaction().replace(0, contract.editor.state.doc.childCount, [
      schema.node('heading', { level: 2 }, [schema.text('Clipboard checklist')]),
      schema.node('bullet_list', {}, [item('Copy structure'), item('Keep it readable')]),
      schema.node('table', {}, [
        schema.node('table_row', {}, [cell('Format'), cell('Result')]),
        schema.node('table_row', {}, [cell('Text'), cell('Ready')]),
      ]),
      schema.node('image_super', {
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        alt: 'Clipboard diagram', caption: '',
      }),
    ]));
    contract.view.focus();
    contract.commands.commands.selectAll();
  });
  await page.keyboard.press('Control+c');
  await page.evaluate(() => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-label', 'External plain-text editor');
    document.body.appendChild(textarea);
    textarea.focus();
  });
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('textbox', { name: 'External plain-text editor' })).toHaveValue([
    'Clipboard checklist',
    '- Copy structure',
    '- Keep it readable',
    'Format\tResult',
    'Text\tReady',
    '[Image: Clipboard diagram]',
    '',
  ].join('\n'));
});

test('copies math to external rich and plain-text editors without renderer controls', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium\'s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const source = editor.locator('[data-fountain-math="block"]').filter({ hasText: '\\sum_{i=1}^{n} i' });
  await source.click();
  await expect(page.locator('[aria-label="Edit math source"]:visible')).toBeVisible();
  await page.keyboard.press('Control+c');

  await page.evaluate(() => {
    const target = document.createElement('div');
    target.contentEditable = 'true';
    target.setAttribute('role', 'textbox');
    target.setAttribute('aria-label', 'External math rich editor');
    document.body.appendChild(target);
    target.focus();
  });
  await page.keyboard.press('Control+v');
  const richTarget = page.getByRole('textbox', { name: 'External math rich editor' });
  await expect(richTarget.locator('[data-fountain-math="block"]')).toHaveAttribute(
    'data-latex',
    '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  );
  await expect(richTarget.locator('code')).toHaveText('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
  await expect(richTarget.locator('input, button, [data-fountain-path], [data-fountain-selected-node]')).toHaveCount(0);

  await source.click();
  await page.keyboard.press('Control+c');
  await page.evaluate(() => {
    const target = document.createElement('textarea');
    target.setAttribute('aria-label', 'External math plain-text editor');
    document.body.appendChild(target);
    target.focus();
  });
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('textbox', { name: 'External math plain-text editor' }))
    .toHaveValue('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
});

test('renders repeated empty paragraphs and removes each visible line', async ({ page }) => {
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const blocks = editor.locator(':scope > [data-fountain-path]');
  const before = await blocks.count();
  const initialPlaceholders = await editor.locator('[data-fountain-caret-placeholder]').count();
  const target = editor.locator(':scope > [data-fountain-node="paragraph"]', { hasText: /\S/ }).last();
  const initialHeight = await target.evaluate((element) => element.getBoundingClientRect().height);
  await selectBlockEnd(target);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(blocks).toHaveCount(before + 3);
  const emptyLines = blocks.filter({ has: page.locator('[data-fountain-caret-placeholder]') });
  await expect(emptyLines).toHaveCount(initialPlaceholders + 3);
  const geometry = await emptyLines.evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { top: box.top, height: box.height };
  }));
  expect(geometry.every(({ height }) => height > 0)).toBe(true);
  expect(new Set(geometry.map(({ top }) => Math.round(top))).size).toBe(initialPlaceholders + 3);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(blocks).toHaveCount(before);
  await expect(editor.locator('[data-fountain-caret-placeholder]')).toHaveCount(initialPlaceholders);
  const restoredHeight = await target.evaluate((element) => element.getBoundingClientRect().height);
  expect(Math.abs(restoredHeight - initialHeight)).toBeLessThan(1);
});

test('undoes and redoes real typing with both common browser keyboard chords', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await selectBlockEnd(editor.locator(':scope > p').first());
  const firstText = () => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent
  ));
  await page.keyboard.type('!');
  await expect.poll(firstText).toBe('Alpha Beta!');
  await page.keyboard.press('Control+z');
  await expect.poll(firstText).toBe('Alpha Beta');
  await page.keyboard.press('Control+y');
  await expect.poll(firstText).toBe('Alpha Beta!');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(firstText).toBe('Alpha Beta!');
});

test('keeps a backward DOM selection backward after model synchronization', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const expected = await editor.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
    const leaves: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) leaves.push(node as Text);
    const start = leaves[0];
    const end = leaves.at(-1);
    if (!start || !end) throw new Error('Expected browser-test text.');
    const selection = document.getSelection();
    selection?.setBaseAndExtent(end, end.data.length, start, 1);
    document.dispatchEvent(new Event('selectionchange'));
    return { anchorText: end.data, anchorOffset: end.data.length, to: wrapper.textContent?.length ?? 0 };
  });
  await expect.poll(() => page.evaluate(() => {
    const selection = document.getSelection();
    return selection ? [selection.anchorNode?.textContent, selection.anchorOffset, selection.focusOffset] : [];
  })).toEqual([expected.anchorText, expected.anchorOffset, 1]);
  await expect.poll(() => page.evaluate(() => {
    const selection = (globalThis as any).fountainBrowserTest.editor.state.selection;
    return [selection.from, selection.to];
  })).toEqual([1, 10]);
});

test('preserves a backward selection made with real keyboard input', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const paragraph = editor.locator('[data-fountain-path="1"]');
  await paragraph.click();
  await page.keyboard.press('End');
  for (let index = 0; index < 6; index += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => page.evaluate(() => {
    const selection = document.getSelection();
    return {
      text: selection?.toString(),
      backward: Boolean(selection && selection.anchorOffset > selection.focusOffset),
    };
  })).toEqual({ text: 'agraph', backward: true });
});

test('replaces a backward selection made by a real reverse pointer drag', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const wrapper = editor.locator('[data-fountain-text-path="1.0"]');
  const box = await wrapper.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  await page.mouse.up();

  const selected = await page.evaluate(() => {
    const dom = document.getSelection();
    const model = (globalThis as any).fountainBrowserTest.editor.state.selection;
    return {
      text: dom?.toString() ?? '',
      backward: Boolean(dom && dom.anchorNode === dom.focusNode && dom.anchorOffset > dom.focusOffset),
      path: model.path,
      from: model.from,
      to: model.to,
    };
  });
  expect(selected.text.length).toBeGreaterThan(3);
  expect(selected.backward).toBe(true);
  expect(selected.path).toEqual([1, 0]);
  expect(selected.to).toBeGreaterThan(selected.from);

  const original = 'Second paragraph';
  const expected = `${original.slice(0, selected.from)}X${original.slice(selected.to)}`;
  await page.keyboard.type('X');
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(1).textContent
  ))).toBe(expected);
});

test('turns multi-format and multi-block selections into visible paragraph boundaries', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([0, 0], 0, 5);
    contract.commands.commands.toggleMark('strong');
    contract.commands.commands.closeHistory();
    contract.commands.commands.selectTextRange([0, 0], 2, [0, 1], 3);
    contract.view.focus();
  });
  await page.keyboard.press('Enter');
  await expect(editor.locator(':scope > p')).toHaveCount(4);
  await expect(editor.locator(':scope > p').nth(0)).toHaveText('Al');
  await expect(editor.locator(':scope > p').nth(1)).toHaveText('ta');
  const firstGeometry = await editor.locator(':scope > p').nth(0).evaluate((element) => element.getBoundingClientRect());
  const secondGeometry = await editor.locator(':scope > p').nth(1).evaluate((element) => element.getBoundingClientRect());
  expect(secondGeometry.top).toBeGreaterThan(firstGeometry.top);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator(':scope > p')).toHaveCount(3);
  await expect(editor.locator(':scope > p').first()).toHaveText('Alpha Beta');
  await expect(editor.locator(':scope > p').first().locator('strong')).toHaveText('Alpha');

  await page.reload();
  const freshEditor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await page.evaluate(() => {
    const textPoint = (path: string, offset: number) => {
      const wrapper = document.querySelector<HTMLElement>(`[data-fountain-text-path="${path}"]`);
      const walker = wrapper && document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
      });
      let remaining = offset;
      for (let text = walker?.nextNode(); text; text = walker?.nextNode()) {
        const length = text.textContent?.length ?? 0;
        if (remaining <= length) return { wrapper, text, offset: remaining };
        remaining -= length;
      }
      return { wrapper, text: null, offset: 0 };
    };
    const start = textPoint('0.0', 5);
    const end = textPoint('1.0', 6);
    if (!start.wrapper || !start.text || !end.text) throw new Error('Expected both paragraph text nodes.');
    start.wrapper.closest<HTMLElement>('[contenteditable="true"]')?.focus();
    const selection = document.getSelection();
    selection?.setBaseAndExtent(end.text, end.offset, start.text, start.offset);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect.poll(() => page.evaluate(() => document.getSelection()?.anchorOffset)).toBe(6);
  await page.keyboard.press('Enter');
  await expect(freshEditor.locator(':scope > p')).toHaveCount(3);
  await expect(freshEditor.locator(':scope > p').nth(0)).toHaveText('Alpha');
  await expect(freshEditor.locator(':scope > p').nth(1)).toHaveText(' paragraph');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(freshEditor.locator(':scope > p').nth(0)).toHaveText('Alpha Beta');
  await expect(freshEditor.locator(':scope > p').nth(1)).toHaveText('Second paragraph');
});

test('visibly splits and joins ordinary paragraphs with both deletion directions', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const blocks = editor.locator(':scope > p[data-fountain-path]');
  await blocks.first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(blocks).toHaveCount(4);
  await expect(blocks.nth(1).locator('[data-fountain-caret-placeholder]')).toHaveCount(1);
  const emptyGeometry = await blocks.nth(1).evaluate((element) => element.getBoundingClientRect());
  expect(emptyGeometry.height).toBeGreaterThan(0);

  await page.keyboard.type('Bridge');
  await expect(blocks.nth(1)).toHaveText('Bridge');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.first()).toHaveText('Alpha BetaBridge');

  await blocks.first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.first()).toHaveText('Alpha BetaBridgeSecond paragraph');
});

test('deletes an adjacent inline atom without eating surrounding text', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  const setFixture = async (direction: 'backward' | 'forward') => page.evaluate((value) => {
    const contract = (globalThis as any).fountainBrowserTest;
    const { editor: instance } = contract;
    const paragraph = instance.state.schema.node('paragraph', {}, [
      instance.state.schema.text('Before'),
      instance.state.schema.node('hard_break'),
      instance.state.schema.text('After'),
    ]);
    const offset = value === 'backward' ? 0 : 6;
    const path = value === 'backward' ? [0, 2] : [0, 0];
    instance.dispatch(instance.state.createTransaction().replace(0, instance.state.doc.childCount, [paragraph]));
    contract.commands.commands.selectText(path, offset);
    contract.view.focus();
  }, direction);

  await setFixture('backward');
  const hardBreak = editor.locator('br[data-fountain-node="hard_break"]');
  await expect(hardBreak).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(hardBreak).toHaveCount(0);
  await expect(editor).toHaveText('BeforeAfter');

  await setFixture('forward');
  await page.keyboard.press('Delete');
  await expect(hardBreak).toHaveCount(0);
  await expect(editor).toHaveText('BeforeAfter');
});

test('unwraps and exits an inserted quote with ordinary browser keys', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const quotes = editor.locator(':scope > blockquote[data-fountain-path]');
  const before = await quotes.count();
  await page.getByRole('button', { name: '❝ Quote' }).click();
  await expect(quotes).toHaveCount(before + 1);
  const inserted = quotes.filter({ hasText: 'A thought worth keeping…' });
  await expect(inserted).toHaveCount(1);
  await inserted.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected quote text.');
    document.getSelection()?.setBaseAndExtent(text, 0, text, 0);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Backspace');
  await expect(quotes).toHaveCount(before);
  await expect(editor.locator(':scope > p[data-fountain-path]').filter({ hasText: 'A thought worth keeping…' })).toHaveCount(1);

  await page.getByRole('button', { name: '❝ Quote' }).click();
  const second = quotes.filter({ hasText: 'A thought worth keeping…' });
  await selectBlockEnd(second);
  await page.keyboard.press('Enter');
  await expect(second.locator('[data-fountain-caret-placeholder]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(quotes).toHaveCount(before + 1);
  await expect(editor.locator(':scope > p[data-fountain-path] [data-fountain-caret-placeholder]')).toHaveCount(1);
});

test('publishes semantic selection controls and table interaction in the demo gallery', async ({ page }) => {
  await page.goto('/demos/svelte-report.html');
  await expect(page.getByRole('heading', { name: 'Structured data report' })).toBeVisible();
  await expect(page.getByText('Rectangular cell selection', { exact: true })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor).toContainText('Quarterly service report');

  await page.locator('[data-fountain-path="2.0.0"]').click();
  await page.locator('[data-fountain-path="2.1.2"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(6);

  await page.getByRole('button', { name: 'Place cursor after title' }).click();
  await expect(page.locator('[data-fountain-path="1"]')).toHaveAttribute('data-fountain-gap', 'before');
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString() ?? '')).toContain('Quarterly service report');
});

test('runs production images, native media, safe embeds, and host-owned uploads through the public Custom Element', async ({ page }) => {
  await page.goto('/demos/angular-media.html');
  await expect(page.getByRole('heading', { name: 'Media-rich campaign story' })).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor.locator('[data-fountain-node="inline_image"]')).toHaveCount(1);
  const figure = editor.locator('.fountain-image');
  await expect(figure).toHaveCount(1);
  await expect(figure.getByRole('textbox', { name: 'Image caption' })).toHaveValue(/Select me to edit/);
  await expect(figure.getByRole('slider', { name: 'Resize image from right' })).toBeVisible();

  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['framework-neutral upload'], 'portable.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: 20,
      clientY: 20,
    }));
  });

  const status = page.getByRole('status');
  await expect(status).toContainText('Uploading portable.png');
  await expect(status).toContainText('portable.png: succeeded');
  await expect(editor.locator('.fountain-image')).toHaveCount(2);
  await expect(editor.locator('.fountain-image img[alt="portable"]')).toBeVisible();
  await expect(page.locator('.demo-output pre')).toContainText('Uploaded through the demo host adapter.');

  await expect(editor.locator('.fountain-media--audio audio[controls]')).toHaveCount(1);
  await expect(editor.locator('.fountain-media--video video[controls][playsinline]')).toHaveCount(1);
  await expect(editor.locator('.fountain-media--file .fountain-file')).toContainText('campaign-artwork.svg');
  await expect(editor.locator('.fountain-media--file .fountain-file__preview')).toHaveAttribute('alt', 'Preview of campaign-artwork.svg');
  await expect(editor.locator('.fountain-media--file .fountain-file__download')).toHaveText('Download file');
  await editor.locator('.fountain-media--file').getByRole('button', { name: 'Select attachment' }).click();
  const selectedMedia = page.getByRole('group', { name: 'Selected media details' });
  await expect(selectedMedia).toContainText('Selected attachment');
  await selectedMedia.getByLabel('File name').fill('campaign-preview.svg');
  await selectedMedia.getByLabel('Description').fill('Editable attachment metadata with an image preview.');
  await selectedMedia.getByRole('button', { name: 'Save details' }).click();
  await expect(editor.locator('.fountain-media--file .fountain-file')).toContainText('campaign-preview.svg');
  await expect(editor.locator('.fountain-media--file .fountain-file__preview')).toHaveAttribute('alt', 'Preview of campaign-preview.svg');
  await expect(page.locator('.demo-output pre')).toContainText('Editable attachment metadata with an image preview.');
  const embed = editor.locator('.fountain-media--embed iframe');
  await expect(embed).toHaveAttribute('src', /youtube-nocookie\.com\/embed/);
  await expect(embed).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  await expect(embed).toHaveAttribute('title', 'Approved campaign embed');

  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['framework-neutral audio'], 'voice.mp3', { type: 'audio/mpeg' }));
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: 20,
      clientY: 20,
    }));
  });
  await expect(status).toContainText(/Uploading voice\.mp3|voice\.mp3: succeeded/);
  await expect(status).toContainText('voice.mp3: succeeded');
  await expect(editor.locator('.fountain-media--audio')).toHaveCount(2);
  await expect(page.locator('.demo-output pre')).toContainText('Audio uploaded through the Angular-owned adapter.');
});

test('uses the public React media workflow for native playback, provider-gated embeds, and asset uploads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Insert audio, video, file, or embed' }).click();
  await page.getByLabel('Media URL').fill('https://cdn.example.com/podcast.mp3');
  await page.getByLabel('Media title').fill('Product podcast');
  await page.getByLabel('Media caption').fill('A framework-neutral audio node.');
  await page.getByRole('button', { name: 'Insert URL' }).click();
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor.locator('.fountain-media--audio audio[controls]')).toHaveCount(1);
  await expect(editor.locator('.fountain-media--audio')).toContainText('A framework-neutral audio node.');

  await editor.locator('.fountain-media--audio figcaption').click();
  await page.getByRole('button', { name: 'Edit selected media' }).click();
  await expect(page.getByLabel('Media type')).toBeDisabled();
  await page.getByLabel('Media title').fill('Edited podcast');
  await page.getByRole('button', { name: 'Save media' }).click();
  await expect(editor.locator('.fountain-media--audio')).toHaveAttribute('aria-label', '[Audio: Edited podcast]');

  await editor.locator('.fountain-media--audio figcaption').click();
  await page.keyboard.press('Delete');
  await expect(editor.locator('.fountain-media--audio')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('.fountain-media--audio')).toHaveAttribute('aria-label', '[Audio: Edited podcast]');

  await editor.locator(':scope > [data-fountain-node="paragraph"]').last().click();
  await page.getByRole('button', { name: 'Insert audio, video, file, or embed' }).click();
  await page.getByLabel('Media type').selectOption('embed');
  await page.getByLabel('Media URL').fill('https://untrusted.example/embed/42');
  await page.getByLabel('Media title').fill('Rejected iframe');
  await page.getByRole('button', { name: 'Insert URL' }).click();
  await expect(page.getByLabel('Media URL')).toBeVisible();
  await expect(editor.locator('iframe')).toHaveCount(0);
  await page.getByLabel('Media URL').fill('https://vimeo.com/12345678');
  await page.getByLabel('Media title').fill('Approved Vimeo demo');
  await page.getByRole('button', { name: 'Insert URL' }).click();
  await expect(editor.locator('.fountain-media--embed iframe')).toHaveAttribute('src', 'https://player.vimeo.com/video/12345678');
  await expect(editor.locator('.fountain-media--embed iframe')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');

  const upload = page.locator('input[type="file"][accept^="audio/"]');
  await upload.setInputFiles({ name: 'voice.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('demo audio') });
  await expect(page.getByRole('status').filter({ hasText: 'Uploading voice.mp3' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'voice.mp3 inserted' })).toBeVisible();
  await expect(editor.locator('.fountain-media--audio')).toHaveCount(2);
});

test('keeps a 1,000-block input update local and paints within budget', async ({ page }) => {
  await page.goto('/browser-tests.html');
  const metrics = await page.evaluate(() => (globalThis as typeof globalThis & {
    fountainBrowserTest: { performanceBudget(): Promise<{
      inputToPaint: number;
      added: number;
      removed: number;
      retainedBlocks: number;
      text: string;
      remainingDOM: number;
    }> };
  }).fountainBrowserTest.performanceBudget());

  expect(metrics.text).toBe('Line 500!');
  expect(metrics.retainedBlocks).toBe(999);
  expect(metrics.added).toBeLessThanOrEqual(3);
  expect(metrics.removed).toBeLessThanOrEqual(3);
  expect(metrics.inputToPaint).toBeLessThan(250);
  expect(metrics.remainingDOM).toBe(0);
});

test('virtualizes 100,000 blocks while preserving scrolling, distant selection, IME, and copy', async ({ page }) => {
  test.setTimeout(60_000);
  const metrics = await page.evaluate(() => (globalThis as typeof globalThis & {
    fountainBrowserTest: { virtualizationBudget(blockCount: number): Promise<{
      blockCount: number;
      createDurationMs: number;
      initialMounted: number;
      scrolledMounted: number;
      scrolledPathMinimum: number;
      scrolledPathMaximum: number;
      anchorInsertDelta: number;
      anchorRestoreDelta: number;
      selectedMounted: boolean;
      composedText: string;
      copyMiddleBefore: boolean;
      copyMiddleDuring: boolean;
      copyRichMiddleDuring: boolean;
      copyHandled: boolean;
      copySelectionComplete: boolean;
      copyRichSelectionComplete: boolean;
      copyMiddleAfter: boolean;
      finalMounted: number;
      totalHeight: number;
      remainingDOM: number;
      printMounted: number;
      printRestored: boolean;
    }> };
  }).fountainBrowserTest.virtualizationBudget(100_000));

  expect(metrics).toMatchObject({
    blockCount: 100_000,
    selectedMounted: true,
    copyMiddleBefore: false,
    copyMiddleDuring: false,
    copyRichMiddleDuring: false,
    copyHandled: true,
    copySelectionComplete: true,
    copyRichSelectionComplete: true,
    copyMiddleAfter: false,
    remainingDOM: 0,
    printMounted: 300,
    printRestored: true,
  });
  expect(metrics.initialMounted).toBeLessThan(100);
  expect(metrics.scrolledMounted).toBeLessThan(100);
  expect(metrics.finalMounted).toBeLessThan(100);
  // The initial caret remains mounted as a pinned island while the viewport
  // itself advances tens of thousands of blocks.
  expect(metrics.scrolledPathMinimum).toBe(0);
  expect(metrics.scrolledPathMaximum).toBeGreaterThan(1_000);
  expect(metrics.scrolledPathMaximum).toBeLessThan(99_000);
  expect(metrics.anchorInsertDelta).toBeGreaterThan(20);
  expect(Math.abs(metrics.anchorRestoreDelta)).toBeLessThan(1);
  expect(metrics.composedText).toBe('東京Virtual browser block 75000');
  expect(metrics.totalHeight).toBeGreaterThan(1_000_000);
  expect(metrics.createDurationMs).toBeLessThan(5_000);
});
