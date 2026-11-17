export interface GitLabTaskBodyExtractor {
  readonly indent: number;
  indentation(value: string, start?: number): number;
  strip(line: string, columns?: number): string;
  isNestedTask(line: string, containsTask: (value: string) => boolean): boolean;
}
export function createGitLabTaskBodyExtractor(firstLine: string): GitLabTaskBodyExtractor;
