import scriptURL from 'bpmn-js/dist/bpmn-modeler.production.min.js?url';
import diagramCSS from 'bpmn-js/dist/assets/diagram-js.css?inline';
import bpmnCSS from 'bpmn-js/dist/assets/bpmn-js.css?inline';
import iconCSS from 'bpmn-js/dist/assets/bpmn-font/css/bpmn-codes.css?inline';
import iconFont from 'bpmn-js/dist/assets/bpmn-font/font/bpmn.woff2?inline';

export const modelerOptions = {
  scriptURL,
  styleText: [diagramCSS, bpmnCSS, iconCSS,
    `@font-face { font-family:bpmn; src:url("${iconFont}") format("woff2"); }
     [class^="bpmn-icon-"]::before, [class*=" bpmn-icon-"]::before { font:normal 1em/1 bpmn; }`].join('\n'),
};
