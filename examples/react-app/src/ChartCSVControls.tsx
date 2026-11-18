import { useEffect, useRef, useState } from 'react';
import type { Editor, Node } from 'fountainjs-editor/core';
import { insertChartFromCSV, refreshChartFromCSV, refreshChartSnapshotFromCSV, selectedChart } from 'fountainjs-editor/charts';

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
  const [schedule, setSchedule] = useState<{ chart: Node; seconds: number } | null>(null);
  const [seconds, setSeconds] = useState('30');
  const [pollStatus, setPollStatus] = useState('');
  const polling = useRef<AbortController | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [editor]);
  const selected = selectedChart(editor);
  const source = selected?.attrs.csvURL;
  useEffect(() => {
    if (!schedule) return;
    const controller = new AbortController();
    polling.current = controller;
    const intervalMs = schedule.seconds * 1000;
    let watched = schedule.chart;
    let timer: ReturnType<typeof setTimeout>;
    function queue() { timer = setTimeout(poll, intervalMs); }
    async function poll() {
      try {
        const next = await refreshChartSnapshotFromCSV(editor, watched, url => readFeed(url, controller.signal), controller.signal);
        if (controller.signal.aborted) return;
        if (!next) {
          setSchedule(null);
          setPollStatus('Automatic refresh stopped. The watched chart changed or is no longer editable.');
          return;
        }
        setPollStatus(next === watched ? 'Feed checked. Data is current.' : 'Chart updated from the feed.');
        watched = next;
      } catch (error) {
        if (controller.signal.aborted) return;
        setPollStatus((error instanceof Error ? error.message : 'Could not read CSV.') + ' Will retry at the next interval.');
      }
      if (!controller.signal.aborted) queue();
    }
    queue();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [editor, schedule]);


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
    {(schedule || typeof source === 'string') && <div className="quick-insert" role="group" aria-label="Automatic CSV refresh">
      {schedule ? <>
        <span>Watching {String(schedule.chart.attrs.csvURL)} every {schedule.seconds} s</span>
        <button type="button" onClick={() => { polling.current?.abort(); setSchedule(null); setPollStatus('Automatic refresh stopped.'); }}>Stop automatic refresh</button>
      </> : <form className="quick-insert" onSubmit={event => {
        event.preventDefault();
        if (selected && typeof source === 'string') {
          setSchedule({ chart: selected, seconds: Number(seconds) });
          setPollStatus('Waiting for the next feed check.');
        }
      }}>
        <label>Refresh every (seconds) <input type="number" min="1" max="86400" step="1" required value={seconds} onChange={event => setSeconds(event.target.value)} /></label>
        <button>Start automatic refresh</button>
      </form>}
    </div>}
    <output aria-label="Automatic refresh status">{pollStatus}</output>
    <output aria-label="CSV import status">{status}</output>
  </details>;
}
