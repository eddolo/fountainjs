import type { Node } from './schema';

/** Use the first text block owned by the task, without naming it after subtasks. */
export function taskCheckboxLabel(item: Node): string {
  for (const block of item.content) {
    const label = block.content
      .filter(child => child.type.isInline)
      .map(child => child.type.name === 'hard_break' ? ' ' : child.textContent)
      .join('')
      .replace(/\s+/gu, ' ')
      .trim();
    if (label) return label;
  }
  return 'Task completion';
}
