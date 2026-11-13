export function readGitLabAuditCredential(execute: (args: string[]) => string): {
  password: string;
  source: 'protected-task-config' | 'temporary-initial-file';
} | null;
