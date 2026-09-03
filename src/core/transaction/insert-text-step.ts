import { ReplaceTextStep } from './replace-text-step';

export class InsertTextStep extends ReplaceTextStep {
  constructor(path: readonly number[], offset: number, text: string) {
    super(path, offset, offset, text);
  }
}
