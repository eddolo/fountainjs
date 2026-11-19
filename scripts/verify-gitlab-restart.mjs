import { join } from 'node:path';
import { expect } from '@playwright/test';
import { buildIdentityError } from '../integrations/gitlab/testing/build-identity.mjs';

export async function verifyGitLabRestart({ report, project, docker, deployment, waitUntilReady, identify, page, request, output }) {
  // Use the inspected ID so that a concurrently replaced container cannot be restarted.
  const id = deployment.Id;
  const inspect = () => JSON.parse(docker('inspect', id))[0];
  const before = inspect();
  if (before.Name !== '/fountain-gitlab-integration-baseline-1' || before.State.Health?.Status !== 'healthy'
      || before.Config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration'
      || before.Image !== report.deployment.imageId || before.State.StartedAt !== deployment.State.StartedAt)
    throw new Error('The original healthy test container must still be running before restart.');
  const evidence = { containerId: id, before: before.State.StartedAt, startup: [], records: [] };
  report.restart = evidence;
  docker('restart', '--timeout', '90', id);
  await waitUntilReady(evidence.startup);
  const after = inspect();
  evidence.after = after.State.StartedAt;
  expect(Date.parse(evidence.after)).toBeGreaterThan(Date.parse(evidence.before));
  expect(after.Image).toBe(before.Image);
  // Docker may enumerate identical mounts in a different order after startup.
  const ordered = mounts => [...mounts].sort((a, b) => a.Destination.localeCompare(b.Destination));
  expect(ordered(after.Mounts)).toEqual(ordered(before.Mounts));
  evidence.mounts = after.Mounts.map(({ Type, Name, Source, Destination, RW }) => ({ Type, Name, Source, Destination, RW }));
  evidence.buildIdentity = await identify();
  const error = buildIdentityError({ ...report, buildIdentity: evidence.buildIdentity });
  if (error) throw new Error('Build identity after restart: ' + error);
  expect(evidence.buildIdentity.expected).toEqual(report.buildIdentity.expected);
  expect(evidence.buildIdentity.observed.manifestSHA256).toBe(report.buildIdentity.observed.manifestSHA256);
  const context = await page.context().browser().newContext({ storageState: await page.context().storageState() });
  try {
    const reader = await context.newPage();
    for (const observation of report.observations) {
      const { iid, input } = observation;
      const path = '/api/v4/projects/' + project.id + '/issues/' + iid;
      const issue = await request(path);
      expect(issue.iid).toBe(iid);
      expect(issue.title).toBe(input.title + ' ' + report.runId + '-a' + report.attempt);
      const notes = (await request(path + '/notes')).filter(note => !note.system);
      await reader.goto(issue.web_url);
      const body = reader.locator('.js-work-item-description');
      const activity = reader.getByTestId('detail-layout-activity');
      await expect(body).toBeVisible();
      await expect(activity.getByText(input.comment, { exact: true })).toBeVisible();
      const record = { id: input.id, iid, description: issue.description, notes: notes.map(note => note.body),
        readerDescription: await body.innerText(), readerBold: await activity.locator('strong,b').filter({ hasText: input.comment }).allTextContents() };
      evidence.records.push(record);
      await reader.screenshot({ path: join(output, input.id + '-after-restart.png'), animations: 'disabled' });
    }
  } finally {
    await context.close();
  }
}
