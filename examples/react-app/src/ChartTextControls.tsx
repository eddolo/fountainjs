import { useRef, useState, type FormEvent } from 'react';
import { insertNode, type Editor, type Node } from 'fountainjs-editor/core';
import { chartInputStatus, drawChartInput, isChartInput, chartFromText, chartToText, exportChartSVG, previewChartText, updateChartFromText, type ChartType, type TextChartOptions } from 'fountainjs-editor/charts';

interface Preview { chart: Node; image?: string }

function makePreview(chart: Node): Preview {
  const table = chart.child(chart.childCount - 1);
  const image = table.childCount <= 9 && table.child(0).childCount <= 5 && chart.textContent.length < 8192 ?
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(exportChartSVG(chart)) : undefined;
  return { chart, image };
}

function ChartPreview({ chart, image }: Preview) {
  const table = chart.child(chart.childCount - 1);
  const hasHeader = table.child(0).content.every(cell => cell.type.name === 'table_header');
  const dataOffset = hasHeader ? 1 : 0;
  return <>
    <p>{table.childCount - dataOffset} {table.childCount - dataOffset === 1 ? 'category' : 'categories'} · {table.child(0).childCount - 1} series · {String(chart.attrs.kind)}</p>
    {image ? <img src={image} alt={(chart.childCount > 1 ? chart.child(0).textContent : 'Chart') + ' preview'} /> : <>
      <p>First {Math.min(table.childCount - dataOffset, 5)} rows</p>
      <div className="chart-text-scroll"><table>{hasHeader && <thead><tr>{table.child(0).content.map((cell, j) =>
        <th key={j} scope="col">{cell.textContent}</th>)}</tr></thead>}<tbody>{table.content.slice(dataOffset, dataOffset + 5).map((row, i) =>
        <tr key={i}>{row.content.map((cell, j) => <td key={j}>{cell.textContent}</td>)}</tr>)}</tbody></table></div>
    </>}
  </>;
}

export function ChartTextControls({ editor, focusEditor }: { editor: Editor; focusEditor: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');

  function previewRows(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    try {
      const header = fields.get('header');
      const separator = fields.get('delimiter');
      const delimiter = separator === 'auto' ? undefined : separator === 'lines' ? null : separator as TextChartOptions['delimiter'];
      const chart = chartFromText(editor.state.schema, draft, {
        title: String(fields.get('title') || 'Chart'), kind: fields.get('kind') as ChartType,
        delimiter, header: header === 'auto' ? undefined : header === 'yes', decimalSeparator: fields.get('decimal') === ',' ? ',' : '.',
      });
      setPreview(makePreview(chart));
      setMessage('');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : 'Could not read the pasted rows.');
    }
  }

  return <>
    {isChartInput(editor) && <div className="quick-insert">
      <button type="button" onClick={() => { drawChartInput(editor); focusEditor(); }}>Draw chart or diagram</button>
      <button type="button" onClick={() => { drawChartInput(editor, 'mermaid'); focusEditor(); }}>Use as Mermaid diagram</button>
    </div>}
    {chartInputStatus.get(editor.state) && <p role="alert">{chartInputStatus.get(editor.state)}</p>}
    <details className="chart-csv chart-text">
    <summary>Chart from text</summary>
    <p>Type <code>:::</code> in an empty paragraph. Enter chart rows or Mermaid source, then press Enter on an empty final line to draw it.</p>
    <form onSubmit={previewRows} onChange={() => { setPreview(null); setMessage(''); }}>
      <label>Chart rows
        <textarea rows={5} value={draft} onChange={event => setDraft(event.target.value)}
          placeholder={'Day\tOrders\nMonday\t12\nTuesday\t-4'} aria-describedby="chart-row-formats" />
      </label>
      <small id="chart-row-formats">Paste spreadsheet cells or separate columns with commas, semicolons or pipes.</small>
      <div className="quick-insert">
        <label>Chart title <input name="title" placeholder="Chart" /></label>
        <label>Default chart type <select name="kind"><option>bar</option><option>column</option><option>line</option><option>pie</option></select></label>
        <button disabled={!draft.trim()}>Preview chart</button>
      </div>
      <details><summary>Reading options</summary>
        <div className="quick-insert">
          <label>Column separator <select name="delimiter"><option value="auto">Detect separator</option><option value={'\t'}>Tab</option><option value=",">Comma</option><option value=";">Semicolon</option><option value="|">Pipe</option><option value="lines">One value per line</option></select></label>
          <label>First row <select name="header"><option value="auto">Detect headings</option><option value="yes">Column headings</option><option value="no">Data</option></select></label>
          <label>Decimal separator <select name="decimal"><option value=".">Point (1.5)</option><option value=",">Comma (1,5)</option></select></label>
        </div>
      </details>
    </form>
    {preview && <div className="chart-text-preview" aria-label="Chart preview" role="region">
      <ChartPreview {...preview} />
      <div className="quick-insert"><button type="button" onClick={() => {
        const previous = editor.state.doc;
        if (!editor.editable || !insertNode(editor, preview.chart) || editor.state.doc === previous) {
          setMessage('Select an editable insertion point.');
          return;
        }
        setPreview(null);
        setMessage('Chart inserted.');
        focusEditor();
      }}>Insert previewed chart</button></div>
    </div>}
    <output>{message}</output>
  </details></>;
}

export function EditChartSource({ editor, chart, focusEditor }: { editor: Editor; chart: Node | null; focusEditor: () => void }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [original, setOriginal] = useState<Node | null>(null);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const stale = original !== null && chart !== original;

  function openSelected() {
    if (!chart) return;
    try {
      const text = chartToText(chart);
      setDraft(text);
      setOriginal(chart);
      setPreview(null);
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open chart data.'); }
  }

  function finish() {
    if (disclosure.current) disclosure.current.open = false;
    setOriginal(null);
    setPreview(null);
    setDraft('');
    setMessage('');
    focusEditor();
  }

  if (!chart && !original) return null;
  return <details className="chart-csv chart-text" ref={disclosure} onToggle={event => {
    if (event.currentTarget.open && !original) openSelected();
  }}>
    <summary>Edit chart as text</summary>
    {original && <form onSubmit={event => {
      event.preventDefault();
      if (stale) return;
      try { setPreview(makePreview(previewChartText(original, draft))); setMessage(''); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not preview chart changes.'); }
    }}>
      <label>Chart source<textarea rows={6} value={draft} onChange={event => {
        setDraft(event.target.value);
        setPreview(null);
        setMessage('');
      }} /></label>
      <small>The first line sets the chart type. Edit the comma-separated cells below it.</small>
      <div className="quick-insert">
        <button type="submit" disabled={stale}>Preview changes</button>
        <button type="button" onClick={finish}>Cancel edit</button>
      </div>
    </form>}
    {stale && <div className="quick-insert">
      <output>The selection or chart changed. Reselect the original chart or reopen the selected data.</output>
      {chart && <button type="button" onClick={openSelected}>Reopen selected chart</button>}
    </div>}
    {preview && !stale && <div className="chart-text-preview" role="region" aria-label="Edited chart preview">
      <ChartPreview {...preview} />
      <div className="quick-insert"><button type="button" onClick={() => {
        if (original && updateChartFromText(editor, draft, original)) finish();
        else setMessage('The edit could not be applied to this chart.');
      }}>Apply chart changes</button></div>
    </div>}
    <output>{message}</output>
  </details>;
}
