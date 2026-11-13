import { expect, it, vi } from 'vitest';
import { readGitLabAuditCredential } from '../scripts/gitlab-audit-credentials.mjs';

it.each([
  ['FOUNTAIN_AUDIT_PASSWORD:task-test-value\n', 'task-test-value', 'protected-task-config'],
  ['# Initial login\nPassword: initial-test-value\n', 'initial-test-value', 'temporary-initial-file'],
])('reads the existing isolated %s credential without logging it', (output, password, source) => {
  const execute = vi.fn((_args: string[]) => output);
  expect(readGitLabAuditCredential(execute)).toEqual({ password, source });
  expect(execute.mock.calls[0]![0][2]).toContain('stat -c %a');
  expect(execute.mock.calls[0]![0][2]).toContain('= 600');
});
it('returns no credential when neither protected task nor initial file exists', () => {
  expect(readGitLabAuditCredential(() => '')).toBeNull();
});
it('does not expose captured credential output when the container command fails', () => {
  const execute = () => { throw Object.assign(new Error('private-test-value'), { stdout: 'private-test-value' }); };
  expect(() => readGitLabAuditCredential(execute)).toThrow('Unable to read the isolated task credential');
  try { readGitLabAuditCredential(execute); } catch (error) {
    expect(JSON.stringify(error)).not.toContain('private-test-value');
    expect((error as Error).message).not.toContain('private-test-value');
  }
});
