export interface MarkdownSubmission {
  readonly form: HTMLFormElement;
}
export interface MarkdownSubmissionOptions {
  element: HTMLElement;
  read(): string;
  write(value: string): void;
  onReady(): void;
  onError(error: unknown): void;
  clearDraft(): void;
  restoreDraft(): void;
}
export function bindMarkdownSubmission(options: MarkdownSubmissionOptions): {
  getValue(): string;
  dispose(): void;
};
export function prepareMarkdownSubmission(form: HTMLFormElement): MarkdownSubmission | null;
export function validateMarkdownSubmission(snapshot: MarkdownSubmission): boolean;
export function restoreMarkdownSubmissionDrafts(snapshot: MarkdownSubmission): void;
export function completeMarkdownSubmission(snapshot: MarkdownSubmission): boolean;
