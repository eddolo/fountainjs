import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { sha256 } from '../integrations/gitlab/testing/build-identity.mjs';

const filterPath = 'lib/banzai/filter/footnote_filter.rb';
const destination = '/opt/gitlab/embedded/service/gitlab-rails/' + filterPath;
const markdown = 'Read the protocol[^method], the control[^control], then the protocol again[^method].\n\n[^method]: Measurement protocol.\n[^control]: Control measurement.';

export async function prepareFootnoteDeployment({root, pin, side, compose, env}) {
  const directory = resolve(root, 'artifacts/gitlab-native-footnote-server');
  const receipt = JSON.parse(await readFile(resolve(directory, 'build.json')));
  assert.equal(receipt.revision, pin.commit);
  assert.equal(receipt.path, filterPath);
  const file = resolve(directory, 'footnote_filter.rb');
  assert.equal(sha256(await readFile(file)), receipt.sha256);
  if (side === 'fountain') {
    env.FOUNTAIN_GITLAB_FOOTNOTE_FILTER = file;
    compose.push('-f', resolve(root, 'integrations/gitlab/runtime/compose.footnotes.yaml'));
  }
  return {destination, file, original:receipt.originalSha256, patched:receipt.sha256};
}

export function verifyFootnoteMount(mounts, filter, patched) {
  const matches = mounts.filter(mount => mount.Destination === destination);
  assert.equal(matches.length, patched ? 1 : 0);
  if (patched) {
    assert.equal(matches[0].Source, filter.file);
    assert.equal(matches[0].Type, 'bind');
    assert.equal(matches[0].RW, false);
  }
}

async function inspectLinks(page, issue, output, name) {
  await page.goto(issue.web_url);
  const reader = page.getByTestId('work-item-description');
  await expect(reader.locator('sup a[data-footnote-ref]')).toHaveCount(3);
  const links = await reader.evaluate(el => {
    const ids = [...el.querySelectorAll('[id]')].map(node => node.id);
    const broken = anchors => [...anchors].filter(node => {
      const fragment = node.getAttribute('href');
      return !fragment?.startsWith('#') || ids.filter(id => id === fragment.slice(1)).length !== 1;
    }).length;
    const refs = el.querySelectorAll('sup a[data-footnote-ref]');
    const back = el.querySelectorAll('a[data-footnote-backref]');
    return {references: refs.length, backlinks: back.length, brokenReferences: broken(refs), brokenBacklinks: broken(back)};
  });
  await reader.screenshot({path:resolve(output, name + '.png')});
  return links;
}

function invalidateFixtureCache(container, project, issue) {
  // Lock and identify only the issue created by this run, then clear its derived HTML.
  const ruby = `require 'json'; require 'digest'
p = Project.find_by_full_path('root/fountain-product-integration')
raise unless p && p.private? && p.id == Integer(ENV.fetch('PROJECT_ID'))
issue = p.issues.find_by!(iid: Integer(ENV.fetch('ISSUE_IID')))
issue.with_lock do
  raise unless issue.id == Integer(ENV.fetch('ISSUE_ID')) && issue.title == ENV.fetch('ISSUE_TITLE')
  raise unless Digest::SHA256.hexdigest(issue.description) == ENV.fetch('SOURCE_SHA')
  raise unless issue.description_html.present?
  old = Digest::SHA256.hexdigest(issue.description_html)
  stamp = issue.updated_at
  issue.update_columns(description_html: nil)
  issue.reload
  raise unless issue.description_html.nil? && issue.updated_at == stamp
  puts 'FOUNTAIN_CACHE:' + JSON.generate({previousHTML: old, invalidated: true})
end`;
  const env = {PROJECT_ID: project.id, ISSUE_IID: issue.iid, ISSUE_ID: issue.id, ISSUE_TITLE: issue.title, SOURCE_SHA: sha256(markdown)};
  const args = Object.entries(env).flatMap(([key,value]) => ['-e', key + '=' + value]);
  let log;
  try {
    log = execFileSync('docker', ['exec','-i',...args,container,'gitlab-rails','runner','-'],
      {input:ruby,encoding:'utf8',timeout:120000,stdio:['pipe','pipe','pipe']});
  } catch { throw new Error('The fixture-specific Markdown cache refresh failed.'); }
  return JSON.parse(log.match(/^FOUNTAIN_CACHE:(.+)$/mu)?.[1] ?? 'null');
}

export async function probeFootnoteCache({report, candidate, page, project, request, output, container}) {
  const patched = report.side === 'fountain';
  const api = '/api/v4/projects/' + project.id + '/issues';
  const title = 'GitLab footnote rollback ' + report.runId + '-a' + report.attempt;
  const receipt = {title, sourceSHA256:sha256(markdown), completed:false};
  report.footnoteCache = receipt;
  assert.equal(project.path_with_namespace, 'root/fountain-product-integration');
  assert.equal(project.visibility, 'private');
  const issue = patched ? await request(api, {title, description:markdown}) : await request(api + '/' + candidate.footnoteCache.iid);
  assert.equal(issue.title, title);
  assert.equal(issue.description, markdown);
  Object.assign(receipt, {id:issue.id, iid:issue.iid, updatedAt:issue.updated_at});
  receipt.before = await inspectLinks(page,issue,output,'footnote-before');
  const working = {references:3,backlinks:3,brokenReferences:0,brokenBacklinks:0};
  if (patched) {
    assert.deepEqual(receipt.before, working);
  } else {
    const saved = candidate.footnoteCache;
    assert.equal(receipt.id,saved.id);
    assert.equal(receipt.updatedAt,saved.updatedAt);
    const control = await request(api,{title:title + ' stock control',description:markdown});
    receipt.stockControlIid = control.iid;
    receipt.stockControl = await inspectLinks(page,control,output,'footnote-stock-control');
    receipt.refresh = invalidateFixtureCache(container,project,issue);
    assert.equal(receipt.refresh?.invalidated,true);
    receipt.after = await inspectLinks(page,issue,output,'footnote-regenerated');
    assert.deepEqual(receipt.after,receipt.stockControl);
    const final = await request(api + '/' + issue.iid);
    assert.equal(final.description,markdown);
    assert.equal(final.updated_at,issue.updated_at);
    assert.equal(final.title,title);
  }
  receipt.completed = true;
}
