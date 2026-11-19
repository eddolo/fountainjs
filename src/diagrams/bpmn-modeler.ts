import type { Editor } from '../core';
import type { GlobalConstructorInstance } from '../core/platform';
import { diagramFrame } from './frame';
import bootstrap from './bpmn-frame.js?raw';

/** Open a private graphical draft. Applying it commits one edit to the original BPMN block. */
export function openBpmnModeler(editor: Editor, path: readonly number[], options: {
  scriptURL: string;
  styleText?: string;
  owner?: GlobalConstructorInstance<'Document', never>;
}): () => void {
  const owner = options.owner ?? document;
  const blockPath = [...path];
  const currentBlock = () => blockPath.reduce((node, index) => node?.content[index], editor.state.doc as typeof editor.state.doc | undefined);
  const block = currentBlock();
  if (editor.isDestroyed || !editor.editable || block?.type.name !== 'code_block' || block.attrs.language !== 'bpmn') {
    throw new Error('Select an editable BPMN source block.');
  }
  const frame = diagramFrame(owner, options.scriptURL, bootstrap, 'BPMN modeling canvas', true);
  frame.setAttribute('sandbox', 'allow-scripts allow-popups');
  frame.style.cssText = 'display:block;width:100%;height:min(66vh,46rem);border:1px solid #ccc';
  const dialog = owner.createElement('dialog');
  dialog.setAttribute('aria-label', 'Edit BPMN diagram');
  dialog.style.cssText = 'box-sizing:border-box;width:min(72rem,96vw);max-width:96vw;padding:1rem;border:1px solid #aaa;border-radius:.5rem';
  const title = owner.createElement('h2');
  title.textContent = 'Edit BPMN diagram';
  const note = owner.createElement('p');
  note.textContent = 'Drag shapes or edit connections. Applying a change writes the modeler’s XML back to this document.';
  const status = owner.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading diagram…';
  const apply = owner.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply diagram changes';
  apply.disabled = true;
  const cancel = owner.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  dialog.className = 'fountain-bpmn-modeler';
  const actions = owner.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:.6rem;justify-content:flex-end';
  for (const button of [apply, cancel]) button.style.padding = '.45rem .8rem';
  actions.append(cancel, apply);
  dialog.append(title, note, frame, status, actions);
  const channel = new MessageChannel();
  const close = () => {
    channel.port1.close();
    dialog.close();
    dialog.remove();
  };
  cancel.onclick = close;
  dialog.oncancel = event => { event.preventDefault(); close(); };
  apply.onclick = () => {
    apply.disabled = true;
    channel.port1.postMessage('save');
  };
  channel.port1.onmessage = ({ data }) => {
    if (!dialog.open) return;
    if (data?.type === 'ready') {
      status.textContent = '';
      apply.disabled = false;
    } else if (data?.type === 'error') {
      status.textContent = String(data.message);
      apply.disabled = true;
    } else if (data?.type === 'save' && typeof data.xml === 'string') {
      if (editor.isDestroyed || !editor.editable || currentBlock() !== block) {
        status.textContent = 'The source block changed or became read-only. Cancel and reopen the current version.';
        return;
      }
      if (data.xml !== block.textContent && !editor.dispatch(editor.createTransaction().replaceNode(blockPath,
        [block.copy([editor.state.schema.text(data.xml)])]))) {
        status.textContent = 'The editor rejected this change. Check the document limit or reduce the diagram and try again.';
        apply.disabled = false;
        return;
      }
      close();
    }
  };
  frame.onload = () => frame.contentWindow?.postMessage({ xml: block.textContent, styleText: options.styleText }, '*', [channel.port2]);
  owner.body.append(dialog);
  dialog.showModal();
  return close;
}
