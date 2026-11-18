import { useEffect, useRef, useState } from 'react';
import type { Editor } from 'fountainjs-editor/core';
import { insertChartFromCSV, refreshChartFromCSV, selectedChart } from 'fountainjs-editor/charts';

const maxBytes = 1_048_576;

async function readFeed(address: string, signal: AbortSignal) {
  const url = new URL(address);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Enter an HTTP or HTTPS address without credentials or a fragment.');
  }
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('The CSV server returned HTTP ' + response.status + '.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, csv = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return csv + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Choose a CSV of 1 MiB or less.');
      csv += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export function ChartCSVControls({ editor }: { editor: Editor }) {
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [editor]);
  const source = selectedChart(editor)?.attrs.csvURL;

  async function run(file?: File, refresh = false) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const { doc, selection } = editor.state;
    setStatus('Reading CSV…');
    try {
      if (refresh) {
        const applied = await refreshChartFromCSV(editor, url => readFeed(url, controller.signal));
        if (!controller.signal.aborted) setStatus(applied ? 'Chart data refreshed.' : 'The selected chart changed. Select it again to refresh.');
        return;
      }
      if (file && file.size > maxBytes) throw new Error('Choose a CSV of 1 MiB or less.');
      const url = file ? undefined : new URL(address.trim()).href;
      const csv = file ? new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) : await readFeed(url!, controller.signal);
      if (controller.signal.aborted || editor.isDestroyed) return;
      if (editor.state.doc !== doc || !editor.state.selection.eq(selection)) {
        setStatus('The insertion point changed. Select where the chart should go and try again.');
        return;
      }
      const name = file?.name ?? new URL(url!).pathname.split('/').pop() ?? '';
      const inserted = insertChartFromCSV(editor, csv, { title: name.replace(/\.csv$/i, '') || 'Chart', sourceURL: url });
      setStatus(inserted ? 'CSV chart inserted.' : 'Select an editable insertion point.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Could not read CSV.');
    }
  }

  return <details className="chart-csv">
    <summary>Chart from CSV</summary>
    <div className="quick-insert">
      <label>CSV file <input type="file" accept=".csv,text/csv" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void run(file);
      }} /></label>
      <label>CSV source URL <input type="url" value={address} onChange={event => setAddress(event.target.value)} /></label>
      <button type="button" disabled={!address.trim()} onClick={() => void run()}>Insert linked chart</button>
      {typeof source === 'string' && <><span>{source}</span><button type="button" onClick={() => void run(undefined, true)}>Refresh data</button></>}
    </div>
    <output>{status}</output>
  </details>;
}
