import { FormEvent, useState, useSyncExternalStore } from 'react';
import type { NodeJSON } from '../core';
import {
  type DocumentVersionSummary,
  type VersionChange,
  type VersionController,
  type VersionControllerSnapshot,
} from '../versions';

const EMPTY_SNAPSHOT: VersionControllerSnapshot = Object.freeze({
  status: 'idle',
  versions: Object.freeze([]),
  dirty: false,
  autoSaveEnabled: false,
});
const noopSubscribe = () => () => {};

export interface FountainVersionsProps {
  controller: VersionController | null;
  className?: string;
  title?: string;
  formatDate?: (date: Date, version: DocumentVersionSummary) => string;
  onError?: (error: unknown) => void;
}

function versionName(version: DocumentVersionSummary): string {
  return version.name ?? `Version ${version.revision}`;
}

function fullNodeText(node: NodeJSON | undefined): string {
  if (!node) return '';
  return [node.text ?? '', ...(node.content ?? []).map(fullNodeText)].join('');
}

function fullValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function changeValues(change: VersionChange): { before: string; after: string } {
  if (change.kind === 'node-inserted' || change.kind === 'node-deleted' || change.kind === 'node-replaced') {
    return {
      before: fullNodeText(change.beforeNode) || fullValue(change.beforeNode),
      after: fullNodeText(change.afterNode) || fullValue(change.afterNode),
    };
  }
  if (change.kind === 'marks-changed') {
    return { before: fullValue(change.beforeMarks), after: fullValue(change.afterMarks) };
  }
  if (change.kind === 'attributes-changed') {
    return { before: fullValue(change.beforeAttributes), after: fullValue(change.afterAttributes) };
  }
  return { before: change.beforeText ?? '', after: change.afterText ?? '' };
}

const changeLabels: Readonly<Record<VersionChange['kind'], string>> = Object.freeze({
  'node-inserted': 'Block inserted',
  'node-deleted': 'Block deleted',
  'node-replaced': 'Block replaced',
  'text-inserted': 'Text inserted',
  'text-deleted': 'Text deleted',
  'text-replaced': 'Text replaced',
  'marks-changed': 'Formatting changed',
  'attributes-changed': 'Attributes changed',
});

export function FountainVersions({
  controller,
  className,
  title = 'Version history',
  formatDate = (date) => date.toLocaleString(),
  onError,
}: FountainVersionsProps) {
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
    controller?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );
  const [name, setName] = useState('');
  const [pending, setPending] = useState<string>();
  const [restoreCandidate, setRestoreCandidate] = useState<string>();
  const [removeCandidate, setRemoveCandidate] = useState<string>();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('current');
  if (!controller) return null;

  const effectiveFromId = snapshot.versions.some((version) => version.id === fromId)
    ? fromId
    : snapshot.versions[0]?.id ?? '';
  const effectiveToId = toId === 'current' || snapshot.versions.some((version) => version.id === toId)
    ? toId
    : 'current';
  const busy = snapshot.status !== 'idle' && snapshot.status !== 'error';
  const run = async (key: string, operation: () => Promise<unknown>) => {
    setPending(key);
    try { await operation(); }
    catch (error) { onError?.(error); }
    finally { setPending(undefined); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await run('save', async () => {
      await controller.save({ ...(name.trim() ? { name: name.trim() } : {}) });
      setName('');
    });
  };
  const compare = () => run('compare', () => controller.compare(
    effectiveFromId,
    effectiveToId === 'current' ? undefined : effectiveToId,
  ));

  return <section
    className={['fountain-versions', className].filter(Boolean).join(' ')}
    aria-label={title}
    aria-busy={busy}
  >
    <header className="fountain-versions__header">
      <div>
        <h2>{title}</h2>
        <p aria-live="polite">{snapshot.versions.length} loaded · {snapshot.dirty ? 'Unsaved changes' : 'Current version saved'} · {snapshot.status}</p>
      </div>
      {controller.autoSaveAvailable ? <label className="fountain-versions__autosave">
        <input
          type="checkbox"
          checked={snapshot.autoSaveEnabled}
          onChange={(event) => controller.setAutoSave(event.currentTarget.checked)}
        />
        Automatic versions
      </label> : null}
    </header>

    {snapshot.error ? <p className="fountain-versions__error" role="alert">{snapshot.error.message}</p> : null}

    <form className="fountain-versions__save" onSubmit={(event) => void save(event)}>
      <label>
        <span>Version name (optional)</span>
        <input value={name} maxLength={300} onChange={(event) => setName(event.currentTarget.value)} placeholder="For example, Client review draft" />
      </label>
      <button type="submit" disabled={Boolean(pending) || !controller.can('save')}>Save current version</button>
    </form>

    {snapshot.versions.length ? <fieldset className="fountain-versions__compare">
      <legend>Compare any two states</legend>
      <label>From
        <select value={effectiveFromId} onChange={(event) => setFromId(event.currentTarget.value)}>
          {snapshot.versions.map((version) => <option key={version.id} value={version.id}>{versionName(version)}</option>)}
        </select>
      </label>
      <label>To
        <select value={effectiveToId} onChange={(event) => setToId(event.currentTarget.value)}>
          <option value="current">Current document</option>
          {snapshot.versions.map((version) => <option key={version.id} value={version.id}>{versionName(version)}</option>)}
        </select>
      </label>
      <button type="button" disabled={Boolean(pending)} onClick={() => void compare()}>Compare</button>
    </fieldset> : null}

    <div className="fountain-versions__list" aria-live="polite">
      {!snapshot.versions.length && snapshot.status !== 'loading'
        ? <p className="fountain-versions__empty">No saved versions yet. Name the current document state and save it here.</p>
        : null}
      {snapshot.versions.map((version) => {
        const label = versionName(version);
        const confirmingRestore = restoreCandidate === version.id;
        const confirmingRemove = removeCandidate === version.id;
        return <article className="fountain-version-card" key={version.id} data-version-id={version.id}>
          <header>
            <div>
              <h3 title={label}>{label}</h3>
              <p>{version.kind} · Revision {version.revision}</p>
            </div>
            <time dateTime={version.createdAt}>{formatDate(new Date(version.createdAt), version)}</time>
          </header>
          {version.createdBy ? <p className="fountain-version-card__author">Saved by {version.createdBy.name}</p> : null}
          {version.restoredFromVersionId ? <p>Restored from {version.restoredFromVersionId}</p> : null}
          <footer>
            <button type="button" disabled={Boolean(pending)} onClick={() => void run(`preview-${version.id}`, () => controller.preview(version.id))}>Preview</button>
            <button type="button" disabled={Boolean(pending)} onClick={() => void run(`compare-${version.id}`, () => controller.compare(version.id))}>Compare to current</button>
            {controller.can('restore', version) ? <button
              type="button"
              className={confirmingRestore ? 'is-warning' : undefined}
              disabled={Boolean(pending)}
              onClick={() => {
                if (!confirmingRestore) { setRestoreCandidate(version.id); setRemoveCandidate(undefined); return; }
                setRestoreCandidate(undefined);
                void run(`restore-${version.id}`, () => controller.restore(version.id));
              }}
            >{confirmingRestore ? 'Confirm restore' : 'Restore'}</button> : null}
            {controller.can('remove', version) ? <button
              type="button"
              className={confirmingRemove ? 'is-danger' : undefined}
              disabled={Boolean(pending)}
              onClick={() => {
                if (!confirmingRemove) { setRemoveCandidate(version.id); setRestoreCandidate(undefined); return; }
                setRemoveCandidate(undefined);
                void run(`remove-${version.id}`, () => controller.remove(version.id));
              }}
            >{confirmingRemove ? 'Confirm delete' : 'Delete'}</button> : null}
          </footer>
        </article>;
      })}
    </div>

    {snapshot.nextCursor ? <button className="fountain-versions__more" type="button" disabled={Boolean(pending)} onClick={() => void run('more', () => controller.loadMore())}>Load older versions</button> : null}

    {snapshot.preview ? <section className="fountain-version-preview" aria-label={`Preview of ${versionName(snapshot.preview)}`}>
      <header>
        <h3>Preview: {versionName(snapshot.preview)}</h3>
        <button type="button" onClick={() => controller.closePreview()}>Close preview</button>
      </header>
      <pre>{JSON.stringify(snapshot.preview.content, null, 2)}</pre>
    </section> : null}

    {snapshot.comparison ? <section className="fountain-version-comparison" aria-label="Version comparison">
      <header>
        <div>
          <h3>{snapshot.comparison.from.label} → {snapshot.comparison.to.label}</h3>
          <p>{snapshot.comparison.identical ? 'These states are identical.' : `${snapshot.comparison.changes.length} exact changes`}</p>
        </div>
        <button type="button" onClick={() => controller.clearComparison()}>Close comparison</button>
      </header>
      <div className="fountain-version-comparison__counts">
        <span>{snapshot.comparison.counts.inserted} inserted</span>
        <span>{snapshot.comparison.counts.deleted} deleted</span>
        <span>{snapshot.comparison.counts.replaced} replaced</span>
        <span>{snapshot.comparison.counts.formatting} formatting</span>
        <span>{snapshot.comparison.counts.attributes} attributes</span>
      </div>
      <ol>
        {snapshot.comparison.changes.map((change) => {
          const values = changeValues(change);
          return <li key={change.id}>
            <strong>{changeLabels[change.kind]}</strong>
            <span>{change.nodeType}</span>
            {values.before ? <div><b>Before</b><pre>{values.before}</pre></div> : null}
            {values.after ? <div><b>After</b><pre>{values.after}</pre></div> : null}
          </li>;
        })}
      </ol>
    </section> : null}
  </section>;
}
