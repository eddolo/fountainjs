/** Read only the isolated task account; callers must verify the deployment first. */
export function readGitLabAuditCredential(execute) {
  try {
    const output = execute(['sh', '-c',
      'if test -f /etc/gitlab/fountain-audit-password; then test "$(stat -c %a /etc/gitlab/fountain-audit-password)" = 600 || exit 1; printf "FOUNTAIN_AUDIT_PASSWORD:"; cat /etc/gitlab/fountain-audit-password; elif test -f /etc/gitlab/initial_root_password; then cat /etc/gitlab/initial_root_password; fi']);
    const managed = output.match(/^FOUNTAIN_AUDIT_PASSWORD:([^\r\n]+)$/mu)?.[1];
    const initial = output.match(/^Password:\s*(.+)$/mu)?.[1];
    const password = (managed || initial)?.trim();
    return password ? { password, source: managed ? 'protected-task-config' : 'temporary-initial-file' } : null;
  } catch {
    throw new Error('Unable to read the isolated task credential; captured credential output was not recorded.');
  }
}
