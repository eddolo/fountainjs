import type { MarkJSON, NodeJSON } from '../../../src';

export type DemoRuntime = 'react' | 'dom' | 'element' | 'headless';

export interface DemoDefinition {
  index: number;
  slug: string;
  title: string;
  host: string;
  surface: string;
  runtime: DemoRuntime;
  summary: string;
  boundary: string;
  capabilities: readonly string[];
  content: NodeJSON;
  code: string;
  markdown?: string;
  accent: string;
}

const text = (value: string, marks: readonly MarkJSON[] = []): NodeJSON => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks } : {}),
});
const paragraph = (...content: NodeJSON[]): NodeJSON => ({ type: 'paragraph', content });
const heading = (level: number, value: string): NodeJSON => ({ type: 'heading', attrs: { level, align: 'left' }, content: [text(value)] });
const doc = (...content: NodeJSON[]): NodeJSON => ({ type: 'doc', content });
const listItem = (value: string): NodeJSON => ({ type: 'list_item', content: [paragraph(text(value))] });
const taskItem = (value: string, checked = false): NodeJSON => ({ type: 'task_item', attrs: { checked }, content: [paragraph(text(value))] });
const cell = (value: string, header = false): NodeJSON => ({
  type: header ? 'table_header' : 'table_cell',
  attrs: header ? { colspan: 1, rowspan: 1, scope: 'col' } : { colspan: 1, rowspan: 1 },
  content: [paragraph(text(value))],
});
const row = (...content: NodeJSON[]): NodeJSON => ({ type: 'table_row', content });

export const demoDefinitions: readonly DemoDefinition[] = [
  {
    index: 1,
    slug: 'react-article',
    title: 'Newsroom article studio',
    host: 'React',
    surface: 'React hooks + composer',
    runtime: 'react',
    summary: 'A long-form publishing surface with rich marks, headings, quotes, lists, links, history, and live portable output.',
    boundary: 'React owns layout and controls; FountainJS owns document state and editing.',
    capabilities: ['Text, block, and document selection', 'Rich formatting', 'Lists and quotes', 'Live JSON/HTML/Markdown'],
    content: doc(
      heading(1, 'The city designed around shade'),
      paragraph(text('A newsroom can compose '), text('structured stories', [{ type: 'strong' }]), text(' without making React the document model. Select across these paragraphs and use the full toolbar.')),
      heading(2, 'Reporting notes become publishable structure'),
      paragraph(text('Links, highlights, colour, semantic headings, images, tables, and custom blocks all remain typed content.')),
      { type: 'blockquote', content: [paragraph(text('One source of truth can feed the website, app, newsletter, and archive.'))] },
      { type: 'bullet_list', content: [listItem('Edit with the supplied React composer'), listItem('Persist lossless JSON'), listItem('Publish through a format module')] },
    ),
    code: `import { StarterKit } from 'fountainjs-editor'
import { FountainComposer, useFountain } from 'fountainjs-editor/react'

function ArticleEditor({ value, save }) {
  const editor = useFountain({
    schema: StarterKit.schema,
    plugins: StarterKit.plugins,
    content: value,
    onUpdate: state => save(state.doc.toJSON()),
  })

  return <FountainComposer editor={editor} placeholder="Write the story…" />
}`,
    accent: '#6d4aff',
  },
  {
    index: 2,
    slug: 'plain-dom-notes',
    title: 'Knowledge-base notes',
    host: 'Plain DOM',
    surface: 'Editor + EditorView',
    runtime: 'dom',
    summary: 'A dependency-free browser integration for teams that do not want a UI framework around the editor.',
    boundary: 'An HTMLElement mount, commands, and one subscription are the complete integration.',
    capabilities: ['Custom interactive NodeView', 'Keyboard and IME input', 'Mapped lifecycle updates', 'Host-owned controls'],
    content: doc(
      heading(1, 'Incident response notes'),
      paragraph(text('Keep operational knowledge in a portable tree, not framework component state.')),
      { type: 'status_panel', attrs: { status: 'Investigating' } },
      heading(2, 'First checks'),
      { type: 'ordered_list', attrs: { start: 1 }, content: [listItem('Confirm the affected service and region'), listItem('Link the active incident channel'), listItem('Record decisions as they happen')] },
      paragraph(text('The plain DOM surface still supports the same schema, commands, formats, media, and plugins.')),
    ),
    code: `import {
  CoreExtension, EditorView, HistoryExtension,
  composeExtensions, createEditor, defineExtension, setNodeAttributes, toggleMark,
} from 'fountainjs-editor'

class StatusView {
  dom = document.createElement('button')
  constructor(node, view, getPath) {
    this.update(node)
    this.dom.onclick = () => setNodeAttributes(view.editor, getPath(), { status: 'Resolved' })
  }
  update(node) { this.dom.textContent = node.attrs.status; return true }
  stopEvent(event) { return this.dom.contains(event.target) }
}

const status = defineExtension({
  name: 'status',
  nodes: {
    status_panel: {
      group: 'block', atom: true,
      attrs: { status: { default: 'Investigating' } },
      nodeView: StatusView,
    },
  },
})
const kit = composeExtensions([CoreExtension, HistoryExtension, status])

const editor = createEditor({
  schema: kit.schema,
  plugins: kit.plugins,
  content: savedJSON,
  onUpdate: state => save(state.doc.toJSON()),
})

const view = new EditorView(document.querySelector('#notes'), editor)
document.querySelector('#bold').onclick = () => toggleMark(editor, 'strong')

window.addEventListener('pagehide', () => {
  view.destroy()
  editor.destroy()
}, { once: true })`,
    accent: '#196c55',
  },
  {
    index: 3,
    slug: 'web-component-cms',
    title: 'Portable CMS field',
    host: 'Web standards',
    surface: '<fountain-editor>',
    runtime: 'element',
    summary: 'A reusable custom field that can move between admin systems without changing its content contract.',
    boundary: 'The element accepts JSON through value and emits bubbling fountain-change events.',
    capabilities: ['Custom Element lifecycle', 'Portable value property', 'Composed change event', 'Any host framework'],
    content: doc(
      heading(1, 'Product launch brief'),
      paragraph(text('This field is a real registered Custom Element backed by the same FountainJS core.')),
      heading(2, 'Message'),
      paragraph(text('Make the technical capability concrete, show the workflow, and keep every claim verifiable.')),
      { type: 'horizontal_rule' },
      paragraph(text('Status: ready for editorial review.', [{ type: 'highlight' }]))
    ),
    code: `import { StarterKit, registerFountainElement } from 'fountainjs-editor'

registerFountainElement({
  schema: StarterKit.schema,
  plugins: StarterKit.plugins,
  placeholder: 'Write CMS content…',
})

const field = document.querySelector('fountain-editor')
field.value = savedJSON
field.addEventListener('fountain-change', event => {
  save(event.detail.value)
})`,
    accent: '#c34972',
  },
  {
    index: 4,
    slug: 'vue-runbook',
    title: 'Interactive task runbook',
    host: 'Vue',
    surface: 'Vue → Web Component',
    runtime: 'element',
    summary: 'A task-first runbook with real checkboxes, structured instructions, and a framework-standard event boundary.',
    boundary: 'The live editor is the same Custom Element a Vue template binds with DOM properties and events.',
    capabilities: ['Task toggles', 'Nested blocks', 'Vue-compatible events', 'No React dependency'],
    content: doc(
      heading(1, 'Release runbook'),
      paragraph(text('Tick each item in this live task document. Vue only needs the browser element contract.')),
      { type: 'task_list', content: [taskItem('Run the full verification suite', true), taskItem('Inspect the packed npm artifact'), taskItem('Publish and verify the registry'), taskItem('Confirm the deployed demo pages')] },
      heading(2, 'Rollback note'),
      paragraph(text('Every change is represented in portable JSON for the release service to store.')),
    ),
    code: `<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { StarterKit, registerFountainElement } from 'fountainjs-editor'

registerFountainElement({ schema: StarterKit.schema, plugins: StarterKit.plugins })
const field = ref<HTMLElement & { value: unknown }>()
onMounted(() => { field.value!.value = savedJSON })
const save = (event: CustomEvent) => api.save(event.detail.value)
</script>

<template>
  <fountain-editor ref="field" @fountain-change="save" />
</template>`,
    accent: '#42b883',
  },
  {
    index: 5,
    slug: 'svelte-report',
    title: 'Structured data report',
    host: 'Svelte',
    surface: 'Svelte → Web Component',
    runtime: 'element',
    summary: 'A report editor where tables, prose, and format exports coexist in one document instead of separate widgets.',
    boundary: 'Svelte mounts the standards-based element and stores its JSON change detail.',
    capabilities: ['Rectangular cell selection', 'Row/column commands', 'Svelte-compatible event', 'HTML and Markdown export'],
    content: doc(
      heading(1, 'Quarterly service report'),
      paragraph(text('Move through cells with Tab, edit values, or add rows and columns from the toolbar.')),
      { type: 'table', content: [row(cell('Service', true), cell('Availability', true), cell('Trend', true)), row(cell('API'), cell('99.98%'), cell('Improving')), row(cell('Dashboard'), cell('99.95%'), cell('Stable'))] },
      paragraph(text('Tables remain part of the same validated document tree as the narrative.')),
    ),
    code: `<script lang="ts">
  import { onMount } from 'svelte'
  import { StarterKit, registerFountainElement } from 'fountainjs-editor'
  registerFountainElement({ schema: StarterKit.schema, plugins: StarterKit.plugins })

  let field: HTMLElement & { value: unknown }
  const save = (event: CustomEvent) => report.set(event.detail.value)
  onMount(() => { field.value = $report })
</script>

<fountain-editor bind:this={field} on:fountain-change={save} />`,
    accent: '#ff3e00',
  },
  {
    index: 6,
    slug: 'angular-media',
    title: 'Media-rich campaign story',
    host: 'Angular',
    surface: 'Angular → Web Component',
    runtime: 'element',
    summary: 'A campaign editor mixing block and inline media, editable captions, responsive metadata, accessible resizing, and rich narrative blocks.',
    boundary: 'Angular enables custom elements; FountainJS receives an observable upload adapter owned by the application.',
    capabilities: ['Block and inline images', 'Progress/cancel/retry upload boundary', 'Caption, alignment, and responsive metadata', 'Pointer and keyboard resizing'],
    content: doc(
      heading(1, 'A launch story with real media'),
      paragraph(text('Images are typed nodes with source, alt text, title, caption, layout, and responsive metadata. This '), { type: 'inline_image', attrs: { src: '../demo-media.svg', alt: 'inline media example', width: '1.5em', height: '1.5em' } }, text(' image lives inside the sentence.')),
      { type: 'image_super', attrs: { src: '../demo-media.svg', alt: 'Abstract purple and mint shapes representing composable content', title: 'Composable content', caption: 'Select me to edit the caption or resize from either side.', width: '100%', align: 'center', srcset: '../demo-media.svg 800w', sizes: '100vw' } },
      paragraph(text('Paste or drop another image to exercise mapped progress, cancellation, retry, and replacement through the same host-owned media boundary.')),
    ),
    code: `import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { StarterKit, registerFountainElement } from 'fountainjs-editor'

@Component({
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`<fountain-editor
    (fountain-change)="save($event.detail.value)"
  ></fountain-editor>\`,
})
export class CampaignEditor {
  constructor(private assets: AssetService) {
    registerFountainElement({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      imageUpload: (file, { signal, reportProgress }) =>
        this.assets.upload(file, { signal, onProgress: reportProgress }),
    })
  }
}`,
    accent: '#dd0031',
  },
  {
    index: 7,
    slug: 'node-markdown',
    title: 'Markdown publishing pipeline',
    host: 'Node.js',
    surface: 'Headless core + formats',
    runtime: 'headless',
    summary: 'A DOM-free conversion route from Markdown, native LaTeX, and source-only Lean to validated FountainJS JSON, HTML, and text.',
    boundary: 'Only the document/schema/format modules run; no editor view or frontend framework is required.',
    capabilities: ['Headless schema', 'Inline/display LaTeX', 'Source-only Lean', 'JSON round trip'],
    markdown: '# Release notes\n\nFountainJS can keep inline math such as $E=mc^2$ and Lean source in its portable document without mounting a view.\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n```lean\nexample : 1 = 1 := rfl\n```\n\n- Parse content\n- Validate the schema\n- Emit several formats\n\n> The portable document stays in the middle.',
    content: doc(paragraph(text('Headless Markdown content'))),
    code: `import {
  MarkdownImporter, MarkdownExporter, HTMLExporter,
  LeanExtension, MathExtension, Schema, StarterKit, composeExtensions,
} from 'fountainjs-editor'

const kit = composeExtensions([
  ...StarterKit.extensions, MathExtension, LeanExtension,
])
const schema = new Schema(kit.schema)
const document = MarkdownImporter.parse(markdownSource, schema)

await database.save(document.toJSON())
const markdown = MarkdownExporter.export(document)
const html = HTMLExporter.export(document, { document: true })`,
    accent: '#4385be',
  },
  {
    index: 8,
    slug: 'python-content-api',
    title: 'Multilingual content API',
    host: 'Python',
    surface: 'React editor ↔ JSON API',
    runtime: 'react',
    summary: 'A browser editor backed by a Python service that stores and returns the portable document without HTML coupling.',
    boundary: 'Python handles ordinary JSON; the browser schema validates rich editor semantics on import and update.',
    capabilities: ['Language-neutral JSON', 'FastAPI-style contract', 'Rich browser editing', 'Backend-independent storage'],
    content: doc(
      heading(1, 'Localised product description'),
      paragraph(text('The same structured document can be stored by Python, indexed, translated, and returned to any FountainJS surface.')),
      heading(2, 'Content contract'),
      paragraph(text('No React elements, DOM references, or model-provider objects cross the API boundary.')),
    ),
    code: `from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Any

app = FastAPI()

class Document(BaseModel):
    type: str
    content: list[dict[str, Any]] = Field(default_factory=list)

@app.put('/documents/{document_id}')
def save_document(document_id: str, document: Document):
    database.upsert(document_id, document.model_dump())
    return {"saved": True, "document": document}

# The browser sends editor.state.doc.toJSON().`,
    accent: '#3776ab',
  },
  {
    index: 9,
    slug: 'go-docs-service',
    title: 'Developer documentation service',
    host: 'Go',
    surface: 'Plain DOM editor ↔ JSON service',
    runtime: 'dom',
    summary: 'Technical documentation with code, native LaTeX, tables, and headings stored behind a typed Go HTTP boundary.',
    boundary: 'Go treats extension attributes as JSON while preserving the stable node/content shape.',
    capabilities: ['Code, LaTeX, and Lean', 'Structured tables', 'Go JSON structs', 'Framework-free frontend'],
    content: doc(
      heading(1, 'Create an API client'),
      paragraph(text('Technical prose, equations such as '), { type: 'inline_math', attrs: { latex: 'T(n)=O(n \\log n)', ariaLabel: 'T of n is order n log n' } }, text(', and runnable-looking examples live in one structured document.')),
      { type: 'code_block', attrs: { language: 'typescript', lineNumbers: true }, content: [text("const client = createClient({ baseURL: '/api' });\nawait client.documents.list();")] },
      { type: 'math_block', attrs: { latex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}', ariaLabel: 'Sum of the first n integers' } },
      { type: 'code_block', attrs: { language: 'lean', lineNumbers: true }, content: [text('example : 1 = 1 := rfl')] },
      heading(2, 'Response fields'),
      { type: 'table', content: [row(cell('Field', true), cell('Type', true)), row(cell('items'), cell('Document[]')), row(cell('cursor'), cell('string | null'))] },
    ),
    code: `type Node struct {
    Type    string                 \`json:"type"\`
    Attrs   map[string]any         \`json:"attrs,omitempty"\`
    Content []Node                 \`json:"content,omitempty"\`
    Text    string                 \`json:"text,omitempty"\`
    Marks   []map[string]any       \`json:"marks,omitempty"\`
}

func saveDocument(w http.ResponseWriter, r *http.Request) {
    var document Node
    if err := json.NewDecoder(r.Body).Decode(&document); err != nil {
        http.Error(w, "invalid JSON", http.StatusBadRequest)
        return
    }
    store.Save(r.Context(), document)
}`,
    accent: '#00add8',
  },
  {
    index: 10,
    slug: 'java-approval-workflow',
    title: 'Enterprise approval workflow',
    host: 'Java',
    surface: 'Web Component ↔ Spring JSON',
    runtime: 'element',
    summary: 'A policy document with tasks and review status moving through a Java service without editor-specific server code.',
    boundary: 'The Custom Element emits JSON; Jackson maps the portable tree while product workflow stays in Spring.',
    capabilities: ['Policy documents', 'Approval tasks', 'Jackson JSON boundary', 'Web Component frontend'],
    content: doc(
      heading(1, 'Security exception request'),
      paragraph(text('Reviewers edit a structured request and complete approval steps without coupling the Java domain to a frontend framework.')),
      heading(2, 'Approval checklist'),
      { type: 'task_list', content: [taskItem('Business owner supplied', true), taskItem('Compensating controls documented'), taskItem('Security reviewer approved')] },
      { type: 'blockquote', content: [paragraph(text('Portable content can travel with the workflow record and render in any client.'))] },
    ),
    code: `public record FountainNode(
    String type,
    Map<String, Object> attrs,
    List<FountainNode> content,
    String text,
    List<Map<String, Object>> marks
) {}

@RestController
class ApprovalDocumentController {
  @PutMapping("/approvals/{id}/document")
  FountainNode save(@PathVariable UUID id, @RequestBody FountainNode document) {
    return approvalService.saveDocument(id, document);
  }
}

// Jackson reads the same JSON emitted by <fountain-editor>.`,
    accent: '#e76f00',
  },
];

export function getDemo(slug: string | undefined): DemoDefinition {
  return demoDefinitions.find((demo) => demo.slug === slug) ?? demoDefinitions[0]!;
}
