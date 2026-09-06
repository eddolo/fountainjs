import { useMemo, useState } from 'react';
import type { Editor } from '../core';
import {
  applySelectionSanitization,
  inspectSelectionIntegrity,
  previewSelectionSanitization,
  type SelectionSanitizationPreview,
  type TextSanitizationPolicy,
} from '../integrity';
import {
  getIntegrityDisplayState,
  setShowInvisibles,
  setVerbatimMode,
} from '../integrity/dom';
import { useFountainState } from './useFountain';

export interface FountainIntegrityInspectorProps {
  readonly editor: Editor | null;
  readonly className?: string;
  readonly title?: string;
  readonly maximumListedFindings?: number;
}

interface CleanupChoices {
  zeroWidth: boolean;
  bidi: boolean;
  noBreakSpace: boolean;
  softHyphen: boolean;
  controls: boolean;
  normalizeNfc: boolean;
}

const INITIAL_CHOICES: CleanupChoices = {
  zeroWidth: false,
  bidi: false,
  noBreakSpace: false,
  softHyphen: false,
  controls: false,
  normalizeNfc: false,
};

function cleanupPolicy(choices: CleanupChoices): TextSanitizationPolicy {
  return {
    ...(choices.zeroWidth ? {
      zeroWidthSpace: 'remove' as const,
      zeroWidthNonJoiner: 'remove' as const,
      zeroWidthJoiner: 'remove' as const,
      wordJoiner: 'remove' as const,
      byteOrderMark: 'remove' as const,
      combiningGraphemeJoiner: 'remove' as const,
    } : {}),
    ...(choices.bidi ? { bidiControls: 'remove' as const } : {}),
    ...(choices.noBreakSpace ? { noBreakSpace: 'space' as const } : {}),
    ...(choices.softHyphen ? { softHyphen: 'remove' as const } : {}),
    ...(choices.controls ? { controls: 'remove' as const, unpairedSurrogate: 'replacement-character' as const } : {}),
    ...(choices.normalizeNfc ? { normalization: 'NFC' as const } : {}),
  };
}

function visibleText(value: string): string {
  if (!value) return '∅';
  return value
    .replaceAll('\r', '␍')
    .replaceAll('\n', '↵\n')
    .replaceAll('\t', '→')
    .replaceAll(' ', '·');
}

/**
 * Optional reference UI for the integrity APIs. Hosts may copy, restyle, or
 * replace this component; the inspection and sanitization logic is headless.
 */
export function FountainIntegrityInspector({
  editor,
  className,
  title = 'Text integrity',
  maximumListedFindings = 50,
}: FountainIntegrityInspectorProps) {
  const state = useFountainState(editor);
  const [choices, setChoices] = useState<CleanupChoices>(INITIAL_CHOICES);
  const [preview, setPreview] = useState<SelectionSanitizationPreview | null>(null);
  const [message, setMessage] = useState('');
  const report = useMemo(() => editor && state ? inspectSelectionIntegrity(editor) : null, [editor, state]);
  const display = editor ? getIntegrityDisplayState(editor) : undefined;

  if (!editor || !state || !display) return null;
  const selected = state.selection.isSingleText && !state.selection.isCollapsed;
  const updateChoice = (key: keyof CleanupChoices, checked: boolean) => {
    setChoices((current) => ({ ...current, [key]: checked }));
    setPreview(null);
    setMessage('');
  };
  const buildPreview = () => {
    const next = previewSelectionSanitization(editor, cleanupPolicy(choices));
    setPreview(next);
    setMessage(next ? (next.changed ? `${next.edits.length} explicit change${next.edits.length === 1 ? '' : 's'} ready to review.` : 'Those choices do not change this selection.') : 'Select text inside one text block first.');
  };
  const applyPreview = () => {
    if (!preview) return;
    const applied = applySelectionSanitization(editor, preview);
    setMessage(applied ? 'Reviewed cleanup applied.' : 'Nothing was changed because the selection or text changed after the preview. Preview it again.');
    setPreview(null);
  };

  const findings = report?.invisibleCharacters.slice(0, maximumListedFindings) ?? [];
  return <section className={['fountain-integrity', className].filter(Boolean).join(' ')} aria-label={title}>
    <header className="fountain-integrity__header">
      <div><span>VERBATIM &amp; UNICODE</span><h2>{title}</h2></div>
      <div className="fountain-integrity__display">
        <button type="button" aria-pressed={display.showInvisibles} onClick={() => setShowInvisibles(editor, !display.showInvisibles)}>
          {display.showInvisibles ? 'Hide invisibles' : 'Show invisibles'}
        </button>
        <button type="button" aria-pressed={display.verbatimRequested} onClick={() => setVerbatimMode(editor, !display.verbatimRequested)}>
          Verbatim input: {display.verbatimRequested ? 'on' : 'off'}
        </button>
      </div>
    </header>

    <p className="fountain-integrity__verbatim" data-active={display.verbatimActive || undefined}>
      {display.verbatimRequested
        ? display.verbatimActive ? 'Literal input is active in this code/verbatim block.' : 'Move the caret into a code or verbatim block to activate literal input.'
        : 'Verbatim input is off. Fountain’s normal input extensions may transform typed text.'}
    </p>

    {!selected || !report
      ? <p className="fountain-integrity__empty">Select text inside one paragraph or text block to inspect its exact Unicode and UTF-8 content.</p>
      : <>
        <div className="fountain-integrity__summary" aria-live="polite">
          <strong>{report.accessibleSummary}</strong>
          <span>UTF-8: <code>{report.utf8Hex || 'empty'}</code></span>
          <span>Normalization: <code>{report.normalization.currentForms.join(', ') || 'none'}</code></span>
          <span>Line endings: LF {report.lineEndings.lf} · CRLF {report.lineEndings.crlf} · CR {report.lineEndings.cr}</span>
        </div>

        <div className="fountain-integrity__findings">
          <h3>Invisible and integrity-sensitive characters</h3>
          {findings.length
            ? <ol>{findings.map((finding, index) => <li key={`${finding.index}-${finding.kind}-${index}`}>
              <code>{finding.marker}</code><span><b>{finding.name}</b><small>{finding.codePoints.join(' + ')} · UTF-16 offset {finding.index}</small></span>
            </li>)}</ol>
            : <p>No invisible characters were found in this selection.</p>}
          {report.invisibleCharacters.length > findings.length && <p>Showing the first {findings.length} of {report.invisibleCharacters.length} findings.</p>}
        </div>

        <fieldset className="fountain-integrity__cleanup">
          <legend>Choose cleanup operations</legend>
          <p>Nothing is removed automatically. Preview the exact result before applying it.</p>
          <label><input type="checkbox" checked={choices.zeroWidth} onChange={(event) => updateChoice('zeroWidth', event.currentTarget.checked)} /> Remove zero-width characters and BOM</label>
          <label><input type="checkbox" checked={choices.bidi} onChange={(event) => updateChoice('bidi', event.currentTarget.checked)} /> Remove bidi controls</label>
          <label><input type="checkbox" checked={choices.noBreakSpace} onChange={(event) => updateChoice('noBreakSpace', event.currentTarget.checked)} /> Replace NBSP with space</label>
          <label><input type="checkbox" checked={choices.softHyphen} onChange={(event) => updateChoice('softHyphen', event.currentTarget.checked)} /> Remove soft hyphens</label>
          <label><input type="checkbox" checked={choices.controls} onChange={(event) => updateChoice('controls', event.currentTarget.checked)} /> Remove controls and replace invalid surrogates</label>
          <label><input type="checkbox" checked={choices.normalizeNfc} onChange={(event) => updateChoice('normalizeNfc', event.currentTarget.checked)} /> Normalize to NFC</label>
          <button type="button" onClick={buildPreview}>Preview cleanup</button>
        </fieldset>

        {preview && <section className="fountain-integrity__preview" aria-label="Cleanup preview">
          <div><span>Before</span><pre>{visibleText(preview.source)}</pre></div>
          <div><span>After</span><pre>{visibleText(preview.result)}</pre></div>
          <button type="button" disabled={!preview.changed} onClick={applyPreview}>Apply reviewed cleanup</button>
        </section>}
      </>}
    {message && <p className="fountain-integrity__message" aria-live="polite">{message}</p>}
  </section>;
}
