import {
  Decoration,
  DecorationSet,
  Plugin,
  PluginKey,
  insertText,
  nodeRangeAtPath,
  type Editor,
  type EditorState,
  type Node,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import {
  FOUNTAIN_EXTENSION_API_VERSION,
  defineExtension,
  type FountainExtension,
} from '../extensions/extension';
import {
  scanInvisibleCharacters,
  type InvisibleCharacter,
  type InvisibleScanOptions,
} from './index';

const INTEGRITY_STATE_META = 'fountain$integrityState';
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;

export interface IntegrityDisplayState {
  readonly showInvisibles: boolean;
  readonly verbatimRequested: boolean;
  readonly verbatimActive: boolean;
}

export interface InvisibleCharacterExtensionOptions {
  readonly initialShowInvisibles?: boolean;
  readonly initialVerbatimMode?: boolean;
  readonly scan?: InvisibleScanOptions;
  /** Block nodes that receive an end-of-paragraph marker. Defaults to `paragraph`. */
  readonly paragraphTypes?: readonly string[];
  /** Leaf nodes displayed as explicit hard breaks. Defaults to `hard_break`. */
  readonly hardBreakTypes?: readonly string[];
  /** Bounds generated decorations. Defaults to 20,000. */
  readonly maximumDecorations?: number;
  /** Defaults to code blocks or blocks carrying `verbatim: true`. */
  readonly isVerbatimEligible?: (state: EditorState) => boolean;
}

interface ResolvedOptions {
  readonly initialShowInvisibles: boolean;
  readonly initialVerbatimMode: boolean;
  readonly scan: InvisibleScanOptions;
  readonly paragraphTypes: ReadonlySet<string>;
  readonly hardBreakTypes: ReadonlySet<string>;
  readonly maximumDecorations: number;
  readonly isVerbatimEligible: (state: EditorState) => boolean;
}

export const integrityDisplayKey = new PluginKey<IntegrityDisplayState>('integrity-display');

function nodeNames(values: readonly string[] | undefined, fallback: readonly string[], label: string): ReadonlySet<string> {
  const selected = values ?? fallback;
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length
    || selected.some((value) => typeof value !== 'string' || !SAFE_NAME.test(value))) {
    throw new TypeError(`${label} must be a list of unique safe node names.`);
  }
  return new Set(selected);
}

function defaultVerbatimEligibility(state: EditorState): boolean {
  if (!state.selection.isSingleText) return false;
  try {
    const block = getNodeAtPath(state.doc, state.selection.path.slice(0, -1));
    return Boolean(block.type.spec.code || block.attrs.verbatim === true);
  } catch {
    return false;
  }
}

function resolveOptions(options: InvisibleCharacterExtensionOptions): ResolvedOptions {
  const maximumDecorations = options.maximumDecorations ?? 20_000;
  if (!Number.isInteger(maximumDecorations) || maximumDecorations < 1 || maximumDecorations > 200_000) {
    throw new RangeError('maximumDecorations must be an integer from 1 to 200000.');
  }
  if (options.isVerbatimEligible !== undefined && typeof options.isVerbatimEligible !== 'function') {
    throw new TypeError('isVerbatimEligible must be a function.');
  }
  return Object.freeze({
    initialShowInvisibles: options.initialShowInvisibles === true,
    initialVerbatimMode: options.initialVerbatimMode === true,
    scan: Object.freeze({ ...options.scan }),
    paragraphTypes: nodeNames(options.paragraphTypes, ['paragraph'], 'paragraphTypes'),
    hardBreakTypes: nodeNames(options.hardBreakTypes, ['hard_break'], 'hardBreakTypes'),
    maximumDecorations,
    isVerbatimEligible: options.isVerbatimEligible ?? defaultVerbatimEligibility,
  });
}

function stateSnapshot(showInvisibles: boolean, verbatimRequested: boolean, active: boolean): IntegrityDisplayState {
  return Object.freeze({ showInvisibles, verbatimRequested, verbatimActive: verbatimRequested && active });
}

function className(finding: InvisibleCharacter): string {
  return `fountain-invisible fountain-invisible--${finding.kind}`;
}

function findingAttributes(finding: InvisibleCharacter): Readonly<Record<string, string>> {
  const label = `${finding.codePoints.join(' + ')} ${finding.name}`;
  return Object.freeze({
    class: className(finding),
    'data-fountain-invisible': finding.kind,
    'data-fountain-invisible-marker': finding.marker,
    'aria-label': label,
    title: label,
  });
}

function integrityDecorations(document: Node, options: ResolvedOptions): DecorationSet {
  const decorations: Decoration[] = [];
  const add = (decoration: Decoration): void => {
    if (decorations.length < options.maximumDecorations) decorations.push(decoration);
  };
  document.descendants((node, path) => {
    if (!path.length) return;
    if (decorations.length >= options.maximumDecorations) return false;
    const range = nodeRangeAtPath(document, path);
    if (node.isText) {
      scanInvisibleCharacters(node.text ?? '', options.scan).forEach((finding) => {
        if (decorations.length >= options.maximumDecorations) return;
        add(Decoration.inline(
          range.from + finding.index,
          range.from + finding.index + finding.length,
          findingAttributes(finding),
          { key: `integrity-${path.join('-')}-${finding.index}-${finding.kind}` },
        ));
      });
      return;
    }
    if (options.hardBreakTypes.has(node.type.name)) {
      add(Decoration.node(range.from, range.to, {
        class: 'fountain-invisible fountain-invisible--hard-break',
        'data-fountain-invisible': 'hard-break',
        'data-fountain-invisible-marker': '↵',
        'aria-label': 'HARD BREAK',
        title: 'HARD BREAK',
      }, { key: `integrity-hard-break-${path.join('-')}` }));
    } else if (options.paragraphTypes.has(node.type.name)) {
      add(Decoration.node(range.from, range.to, {
        class: 'fountain-invisible-paragraph',
        'data-fountain-invisible-marker': '¶',
      }, { key: `integrity-paragraph-${path.join('-')}` }));
    }
  });
  return DecorationSet.create(document, decorations);
}

/** Reads display/verbatim state, or undefined when the extension is absent. */
export function getIntegrityDisplayState(editor: Editor): IntegrityDisplayState | undefined {
  return integrityDisplayKey.get(editor.state);
}

function updateState(editor: Editor, values: Partial<Pick<IntegrityDisplayState, 'showInvisibles' | 'verbatimRequested'>>): boolean {
  if (!getIntegrityDisplayState(editor)) return false;
  return editor.dispatch(editor.state.createTransaction()
    .setMeta(INTEGRITY_STATE_META, Object.freeze({ ...values }))
    .setMeta('force', true));
}

export function setShowInvisibles(editor: Editor, visible: boolean): boolean {
  return updateState(editor, { showInvisibles: Boolean(visible) });
}

export function toggleShowInvisibles(editor: Editor): boolean {
  const current = getIntegrityDisplayState(editor);
  return current ? setShowInvisibles(editor, !current.showInvisibles) : false;
}

export function setVerbatimMode(editor: Editor, enabled: boolean): boolean {
  return updateState(editor, { verbatimRequested: Boolean(enabled) });
}

export interface IntegrityDisplayService {
  readonly key: typeof integrityDisplayKey;
  getState(editor: Editor): IntegrityDisplayState | undefined;
  setShowInvisibles(editor: Editor, visible: boolean): boolean;
  toggleShowInvisibles(editor: Editor): boolean;
  setVerbatimMode(editor: Editor, enabled: boolean): boolean;
}

/**
 * Adds opt-in DOM visualization and literal code-block input. Compose directly
 * after CoreExtension so literal input is offered before rewriting plugins.
 */
export function createInvisibleCharacterExtension(options: InvisibleCharacterExtensionOptions = {}): FountainExtension {
  const configured = resolveOptions(options);
  const plugin = new Plugin<IntegrityDisplayState>({
    key: integrityDisplayKey,
    state: {
      init: (_config, state) => stateSnapshot(
        configured.initialShowInvisibles,
        configured.initialVerbatimMode,
        configured.isVerbatimEligible(state),
      ),
      apply: (transaction, value, _oldState, newState) => {
        const changes = transaction.getMeta<Partial<Pick<IntegrityDisplayState, 'showInvisibles' | 'verbatimRequested'>>>(INTEGRITY_STATE_META);
        return stateSnapshot(
          changes?.showInvisibles ?? value.showInvisibles,
          changes?.verbatimRequested ?? value.verbatimRequested,
          configured.isVerbatimEligible(newState),
        );
      },
    },
    props: {
      decorations: (state) => integrityDisplayKey.get(state)?.showInvisibles
        ? integrityDecorations(state.doc, configured)
        : DecorationSet.empty,
      handleTextInput: (editor, _from, _to, text) => {
        const current = getIntegrityDisplayState(editor);
        return current?.verbatimActive ? insertText(editor, text) : false;
      },
      handlePaste: (editor, event) => {
        const current = getIntegrityDisplayState(editor);
        if (!current?.verbatimActive) return false;
        const clipboard = event.clipboardData;
        if (!clipboard || !Array.from(clipboard.types ?? []).includes('text/plain')) return false;
        return insertText(editor, clipboard.getData('text/plain'));
      },
    },
  });
  const service: IntegrityDisplayService = Object.freeze({
    key: integrityDisplayKey,
    getState: getIntegrityDisplayState,
    setShowInvisibles,
    toggleShowInvisibles,
    setVerbatimMode,
  });
  return defineExtension({
    name: 'integrity',
    manifest: {
      version: '0.3.0',
      apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
      displayName: 'Invisible characters and verbatim input',
      description: 'Explicit invisible-character display and literal technical-text input without a hosted service.',
      license: 'MIT',
      requires: ['fountain-core'],
    },
    plugins: [plugin],
    commands: { setShowInvisibles, toggleShowInvisibles, setVerbatimMode },
    services: { integrity: service },
  });
}

export const InvisibleCharacterExtension = createInvisibleCharacterExtension();
