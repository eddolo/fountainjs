import { downloadDocumentFile } from './math-document-files';
import { createBpmnExtension } from 'fountainjs-editor/diagrams';
import viewerURL from 'bpmn-js/dist/bpmn-viewer.production.min.js?url';
import diagramCSS from 'bpmn-js/dist/assets/diagram-js.css?inline';
import bpmnCSS from 'bpmn-js/dist/assets/bpmn-js.css?inline';

export const BpmnPreviewExtension = createBpmnExtension({
  scriptURL: viewerURL, styleText: diagramCSS + '\n' + bpmnCSS,
  renderControls(source, owner) {
    const actions = owner.createElement('div');
    actions.className = 'quick-insert diagram-download';
    actions.contentEditable = 'false';
    actions.onkeydown = event => event.stopPropagation();
    const button = owner.createElement('button');
    button.type = 'button';
    button.textContent = 'Download BPMN source';
    button.onclick = () => downloadDocumentFile(owner, 'process.bpmn', source, 'application/xml');
    actions.append(button);
    return actions;
  },
});
export const [bpmnPlugin] = BpmnPreviewExtension.plugins;
