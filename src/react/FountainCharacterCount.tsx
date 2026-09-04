import type { Editor } from '../core';
import type { CharacterCountService } from '../extensions/character-count';
import { useFountainState } from './useFountain';

export interface FountainCharacterCountProps {
  editor: Editor | null;
  service: CharacterCountService;
  className?: string;
  showWords?: boolean;
}

/** Live accessible output for an independently configured character-count service. */
export function FountainCharacterCount({
  editor,
  service,
  className,
  showWords = true,
}: FountainCharacterCountProps) {
  useFountainState(editor);
  if (!editor) return null;
  const snapshot = service.snapshot(editor);
  return <output
    className={['fountain-character-count', snapshot.overLimit ? 'is-over-limit' : '', className].filter(Boolean).join(' ')}
    aria-live="polite"
    data-over-limit={snapshot.overLimit || undefined}
  >
    <span>{snapshot.characters}{snapshot.limit === null ? '' : ` / ${snapshot.limit}`} characters</span>
    {showWords && <span>{snapshot.words} {snapshot.words === 1 ? 'word' : 'words'}</span>}
  </output>;
}
