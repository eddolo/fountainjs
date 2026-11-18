import { useState, type FormEvent } from 'react';
import { insertNode, type Editor, type Node } from 'fountainjs-editor/core';
import { chartFromText, exportChartSVG, type ChartType, type TextChartOptions } from 'fountainjs-editor/charts';

export function ChartTextControls({ editor, focusEditor }: { editor: Editor; focusEditor: () => void }) {
  const [preview, setPreview] = useState<{ chart: Node; image?: string } | null>(null);
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
      const table = chart.child(1);
      const image = table.childCount <= 9 && table.child(0).childCount <= 5 ?
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(exportChartSVG(chart)) : undefined;
      setPreview({ chart, image });
      setMessage('');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : 'Could not read the pasted rows.');
    }
  }

  const table = preview?.chart.child(1);
  return <details className="chart-csv chart-text">
    <summary>Chart from text</summary>
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
    {preview && table && <div className="chart-text-preview" aria-label="Chart preview" role="region">
      <p>{table.childCount - 1} {table.childCount === 2 ? 'category' : 'categories'} · {table.child(0).childCount - 1} series · {String(preview.chart.attrs.kind)}</p>
      {preview.image ? <img src={preview.image} alt={preview.chart.child(0).textContent + ' preview'} /> : <>
        <p>First {Math.min(table.childCount - 1, 5)} rows</p>
        <div className="chart-text-scroll"><table><thead><tr>{table.child(0).content.map((cell, j) =>
          <th key={j} scope="col">{cell.textContent}</th>)}</tr></thead><tbody>{table.content.slice(1, 6).map((row, i) =>
          <tr key={i}>{row.content.map((cell, j) => <td key={j}>{cell.textContent}</td>)}</tr>)}</tbody></table></div>
      </>}
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
  </details>;
}
