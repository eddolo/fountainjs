import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Actual authenticated GitLab providers and renderer, with one declared GET fault. */
export async function auditNativeAutocomplete({ page, editor, output, report }) {
  const fixture = JSON.parse(await readFile(new URL('../integrations/gitlab/fixtures/autocomplete-live.json', import.meta.url)));
  const issue = fixture.projections.find(item => item.kind === 'issue').source;
  const mergeRequest = fixture.projections.find(item => item.kind === 'merge_request').source;
  const milestone = 'Fountain native completion milestone';
  const list = page.getByRole('listbox', { name: 'Available references', exact: true });
  const requests = [];
  // Preserve diagnostics even when a later assertion fails.
  // The actual Markdown renderer includes the milestone reference prefix;
  // the endpoint's suggestion title intentionally does not include it.
  const milestoneLabel = '%' + milestone;
  report.nativeAutocomplete = { issue, mergeRequest, milestone, milestoneLabel, user: '@root', requests, presentations: [],
    deliberateFault: 'One issues GET fulfilled as HTTP 503; retry then uses the real endpoint',
    scope: 'Actual issue, user, merge-request and milestone insertion; keyboard, retry, mobile docking and ARIA cleanup. Not all reference contexts or roles.' };
  const observe = response => {
    const url = new URL(response.url());
    if (response.request().method() === 'GET' && url.pathname.includes('/autocomplete_sources/'))
      requests.push({ path: url.pathname, search: url.searchParams.get('search'), status: response.status() });
  };
  page.on('response', observe);
  const inspectControls = async () => {
    const panel = page.getByTestId('native-reference-suggestions');
    const bounds = await panel.boundingBox();
    const result = await panel.evaluate(element => window.axe.run(element));
    report.nativeAutocomplete.presentations.push({ width: page.viewportSize().width, bounds, violations: result.violations });
    expect(result.violations).toEqual([]);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  };
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await editor.pressSequentially('Related issue ');
  await page.route('**/autocomplete_sources/issues*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"deliberate test outage"}' }), { times: 1 });
  await editor.pressSequentially(issue);
  const retry = page.getByRole('button', { name: 'Retry references', exact: true });
  await expect(retry).toBeVisible(); expect(await editor.innerText()).toContain('Related issue ' + issue);
  await page.screenshot({ path: fileURLToPath(new URL('reference-provider-retry.png', output)) });
  await retry.click();
  await expect(list.getByRole('option').filter({ hasText: issue })).toBeVisible();
  await expect(editor).toBeFocused();
  await inspectControls();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(editor.locator('[data-fountain-gitlab-reference="issue"]').filter({ hasText: issue })).toBeVisible();
  await expect(list).toHaveCount(0);
  const mentions = editor.locator('[data-fountain-gitlab-reference="user"]');
  const originalMentions = await mentions.count();
  await editor.pressSequentially('Owner @ro');
  await expect(list.getByRole('option').filter({ hasText: '@root' })).toBeVisible();
  await expect(editor).toHaveAttribute('aria-controls', await list.getAttribute('id'));
  await page.keyboard.press('Enter');
  await expect(mentions).toHaveCount(originalMentions + 1);
  await expect(mentions.last()).toHaveText('@root');
  await editor.pressSequentially('Merge ' + mergeRequest);
  await expect(list.getByRole('option').filter({ hasText: mergeRequest })).toBeVisible();
  await list.getByRole('option').filter({ hasText: mergeRequest }).click();
  await expect(editor.locator('[data-fountain-gitlab-reference="merge_request"]')).toHaveText(mergeRequest);
  await editor.pressSequentially('Release %Fountain');
  const release = list.getByRole('option', { name: milestone, exact: true });
  await expect(release).toBeVisible();
  const viewport = page.viewportSize(); await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByTestId('native-reference-suggestions')).toBeVisible();
  await page.keyboard.press('Alt+F10'); await expect(list).toBeFocused();
  await inspectControls();
  await page.screenshot({ path: fileURLToPath(new URL('reference-suggestions-mobile.png', output)) });
  await page.keyboard.press('Enter');
  await expect(editor.locator('[data-fountain-gitlab-reference="milestone"]')).toHaveText(milestoneLabel);
  report.nativeAutocomplete.focusAfterAcceptance = await page.evaluate(() => ({
    tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role'),
    label: document.activeElement?.getAttribute('aria-label'), href: document.activeElement?.getAttribute('href'),
    editor: document.activeElement?.matches('[contenteditable="true"]'),
  }));
  await expect(editor).toBeFocused();
  await page.setViewportSize(viewport);
  // Wait for the host's debounced responsive sidebar state and its Vue focus
  // watcher; an immediate focus assertion can pass before the focus theft.
  await expect(page.locator('.page-with-super-sidebar')).not.toHaveClass(/page-with-super-sidebar-collapsed/u);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  report.nativeAutocomplete.focusAfterResize = await page.evaluate(() => ({
    tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role'),
    label: document.activeElement?.getAttribute('aria-label'), href: document.activeElement?.getAttribute('href'),
    editor: document.activeElement?.matches('[contenteditable="true"]'),
  }));
  await expect(editor).toBeFocused();
  await expect(editor).not.toHaveAttribute('aria-activedescendant');
  await expect(editor).not.toHaveAttribute('aria-controls');
  report.nativeAutocomplete.referenceCounts = {};
  for (const [kind, label] of [['issue', issue], ['user', '@root'], ['merge_request', mergeRequest], ['milestone', milestoneLabel]])
    report.nativeAutocomplete.referenceCounts[kind] = await editor.locator(`[data-fountain-gitlab-reference="${kind}"]`).filter({ hasText: label }).count();
  await page.screenshot({ path: fileURLToPath(new URL('references-inserted.png', output)) });
  page.off('response', observe);
  expect(requests.some(item => item.status === 503)).toBe(true);
  for (const path of ['issues', 'members', 'merge_requests', 'milestones'])
    expect(requests.some(item => item.path.endsWith('/' + path) && item.status === 200)).toBe(true);
  report.checks.push('Actual reference provider failure retains the query; retry, native keyboard/pointer acceptance, a 360px dock and ARIA cleanup work with real issue/user/MR/milestone renderings');
}

export async function assertSavedAutocomplete({ page, saved, report, phase }) {
  const expected = report.nativeAutocomplete;
  if (!expected) return;
  for (const source of ['Related issue ' + expected.issue, 'Owner ' + expected.user,
    'Merge ' + expected.mergeRequest, 'Release %"' + expected.milestone + '"']) expect(saved.description).toContain(source);
  const reader = page.getByTestId('work-item-description');
  for (const [kind, label] of [['issue', expected.issue], ['user', expected.user], ['merge_request', expected.mergeRequest], ['milestone', expected.milestoneLabel]]) {
    const references = reader.locator(`[data-reference-type="${kind}"]`).filter({ hasText: label });
    await expect(references).toHaveCount(expected.referenceCounts[kind]);
    for (const reference of await references.all()) await expect(reference).toBeVisible();
  }
  report.checks.push(`Saved source and the actual GitLab reader retain all four inserted reference types (${phase})`);
}
