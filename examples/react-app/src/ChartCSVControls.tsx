import { useEffect, useRef, useState } from 'react';
import type { Editor, Node } from 'fountainjs-editor/core';
import { insertChartFromCSV, insertChartFromJSON, refreshChartFromSource, refreshChartSnapshotFromSource, selectedChart } from 'fountainjs-editor/charts';

const maxBytes = 1_048_576;

async function readFeed(address: string, signal: AbortSignal) {
  const url = new URL(address);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Enter an HTTP or HTTPS address without credentials or a fragment.');
  }
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('The feed returned HTTP ' + response.status + '.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, source = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return source + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Choose a chart file of 1 MiB or less.');
      source += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export function ChartCSVControls({ editor }: { editor: Editor }) {
  const [format, setFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('');
  const [schedule, setSchedule] = useState<{ chart: Node; seconds: number } | null>(null);
  const [seconds, setSeconds] = useState('30');
  const [pollStatus, setPollStatus] = useState('');
  const polling = useRef<AbortController | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [editor]);
  const selected = selectedChart(editor);
  const source = selected?.attrs.jsonURL ?? selected?.attrs.csvURL;
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
        const next = await refreshChartSnapshotFromSource(editor, watched, url => readFeed(url, controller.signal), controller.signal);
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
        setPollStatus((error instanceof Error ? error.message : 'Could not read chart data.') + ' Will retry at the next interval.');
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
    setStatus('Reading chart data…');
    try {
      if (refresh) {
        const applied = await refreshChartFromSource(editor, url => readFeed(url, controller.signal));
        if (!controller.signal.aborted) setStatus(applied ? 'Chart data refreshed.' : 'The selected chart changed. Select it again to refresh.');
        return;
      }
      if (file && file.size > maxBytes) throw new Error('Choose a chart file of 1 MiB or less.');
      const url = file ? undefined : new URL(address.trim()).href;
      const contents = file ? new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) : await readFeed(url!, controller.signal);
      if (controller.signal.aborted || editor.isDestroyed) return;
      if (editor.state.doc !== doc || !editor.state.selection.eq(selection)) {
        setStatus('The insertion point changed. Select where the chart should go and try again.');
        return;
      }
      const name = file?.name ?? new URL(url!).pathname.split('/').pop() ?? '';
      const insert = format === 'JSON' ? insertChartFromJSON : insertChartFromCSV;
      const inserted = insert(editor, contents, { title: name.replace(/\.(?:csv|json)$/i, '') || 'Chart', sourceURL: url });
      setStatus(inserted ? format + ' chart inserted.' : 'Select an editable insertion point.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Could not read chart data.');
    }
  }

  return <details className="chart-csv">
    <summary>Chart from CSV or JSON</summary>
    <div className="quick-insert">
      <label>Data format <select value={format} onChange={event => {
        pending.current?.abort();
        setStatus('');
        setFormat(event.target.value as 'CSV' | 'JSON');
      }}>
        <option>CSV</option><option>JSON</option>
      </select></label>
      <label>{format} file <input type="file" accept={format === 'CSV' ? '.csv,text/csv' : '.json,application/json'} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void run(file);
      }} /></label>
      <label>{format} source URL <input type="url" value={address} onChange={event => setAddress(event.target.value)} /></label>
      <button type="button" disabled={!address.trim()} onClick={() => void run()}>Insert linked chart</button>
      {typeof source === 'string' && <><span>{source}</span><button type="button" onClick={() => void run(undefined, true)}>Refresh data</button></>}
    </div>
    {format === 'JSON' && <p>Use one record per category, such as <code>{'[{"Day":"Monday","Orders":12}]'}</code>, or a table with a header row.</p>}
    {(schedule || typeof source === 'string') && <div className="quick-insert" role="group" aria-label="Automatic feed refresh">
      {schedule ? <>
        <span>Watching {String(schedule.chart.attrs.jsonURL ?? schedule.chart.attrs.csvURL)} every {schedule.seconds} s</span>
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
    <output aria-label="Chart import status">{status}</output>
  </details>;
}
