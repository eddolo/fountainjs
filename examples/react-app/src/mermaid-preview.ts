/// <reference types="vite/client" />
import { createMermaidExtension } from 'fountainjs-editor/diagrams';
import mermaidURL from 'mermaid/dist/mermaid.min.js?url';

export const MermaidPreviewExtension = createMermaidExtension({ scriptURL: mermaidURL });
export const [diagramPlugin] = MermaidPreviewExtension.plugins;
