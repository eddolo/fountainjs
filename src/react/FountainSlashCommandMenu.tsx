import type { ReactNode } from 'react';
import type {
  SlashCommandItem,
  SlashCommandService,
} from '../extensions/slash-command';
import type { Editor } from '../core';
import { FountainSuggestionMenu } from './FountainSuggestionMenu';

export interface FountainSlashCommandMenuProps {
  editor: Editor;
  service: SlashCommandService;
  anchorElement?: HTMLElement | null;
  label?: string;
  className?: string;
  emptyMessage?: string;
  renderItem?: (item: SlashCommandItem) => ReactNode;
}

/** Accessible grouped React rendering for a framework-neutral slash registry. */
export function FountainSlashCommandMenu({
  editor,
  service,
  anchorElement,
  label = 'Insert a block or run a command',
  className,
  emptyMessage,
  renderItem,
}: FountainSlashCommandMenuProps) {
  return <FountainSuggestionMenu<SlashCommandItem>
    controller={service.getController(editor)}
    anchorElement={anchorElement}
    label={label}
    className={['fountain-slash-command-menu', className].filter(Boolean).join(' ')}
    emptyMessage={emptyMessage}
    groupBy={(item) => item.group}
    renderItem={(item) => renderItem?.(item) ?? <>
      <span className="fountain-slash-command-menu__icon" aria-hidden="true">{item.icon ?? '↳'}</span>
      <span className="fountain-slash-command-menu__copy">
        <strong>{item.label}</strong>
        {item.description && <small>{item.description}</small>}
      </span>
    </>}
  />;
}
