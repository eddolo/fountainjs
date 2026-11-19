/// <reference types="vite/client" />
import { downloadDocumentFile } from './math-document-files';
import { createMermaidExtension, exportMermaidImage, type DiagramImageFormat } from 'fountainjs-editor/diagrams';
import './mermaid-preview.css';
import mermaidURL from 'mermaid/dist/mermaid.min.js?url';

function renderControls(image: HTMLImageElement): HTMLElement {
  const owner = image.ownerDocument;
  const group = owner.createElement('div');
  group.className = 'quick-insert diagram-download';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Diagram export');
  group.contentEditable = 'false';
  const select = owner.createElement('select');
  select.setAttribute('aria-label', 'Diagram image format');
  for (const format of ['png', 'svg', 'jpeg', 'webp'] as const) {
    const option = owner.createElement('option');
    option.value = format;
    option.textContent = format.toUpperCase();
    select.append(option);
  }
  const button = owner.createElement('button');
  button.type = 'button';
  button.textContent = 'Download diagram';
  const status = owner.createElement('output');
  select.onchange = () => { status.textContent = ''; };
  button.onclick = async () => {
    const format = select.value as DiagramImageFormat;
    status.textContent = '';
    button.disabled = true;
    try {
      const blob = await exportMermaidImage(image, format);
      downloadDocumentFile(owner, 'diagram.' + format, blob, blob.type);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Diagram download failed.';
    } finally { button.disabled = false; }
  };
  group.onkeydown = event => event.stopPropagation();
  group.append(select, button, status);
  return group;
}

export const MermaidPreviewExtension = createMermaidExtension({ scriptURL: mermaidURL, renderControls });
export const [diagramPlugin] = MermaidPreviewExtension.plugins;
