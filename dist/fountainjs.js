var b = Object.defineProperty;
var y = (o, t, e) => t in o ? b(o, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : o[t] = e;
var c = (o, t, e) => (y(o, typeof t != "symbol" ? t + "" : t, e), e);
import { S as x, N as k } from "./index-1c508d95.js";
import { A as rt, h as st, E as at, j as it, F as lt, M as ct, l as pt, a as mt, d as ht, R as dt, c as ut, b as gt, g as ft, e as wt, f as bt, T as yt, i as xt, u as kt, k as jt } from "./index-1c508d95.js";
import "react";
class u {
  constructor(t, e) {
    c(this, "type");
    c(this, "attrs");
    this.type = t, this.attrs = e;
  }
  static fromJSON(t, e) {
    const n = t.marks[e.type];
    if (!n)
      throw new Error(`Unknown mark type: ${e.type}`);
    return new u(n, { ...e.attrs });
  }
}
class W extends x {
  constructor(t, e, n) {
    super(), this.path = t, this.offset = e, this.text = n;
  }
  apply(t) {
    let e = t, n = [];
    for (const l of this.path)
      n.push(e), e = e.content[l];
    if (!e || !e.isText)
      throw new Error("Target for InsertTextStep is not a text node.");
    let a = e.withText((e.text || "").slice(0, this.offset) + this.text + (e.text || "").slice(this.offset));
    for (let l = n.length - 1; l >= 0; l--) {
      const p = n[l], m = [...p.content];
      m[this.path[l]] = a, a = new k(p.type, p.attrs, m, p.text, p.marks);
    }
    return a;
  }
}
class g {
  constructor(t) {
    c(this, "spec");
    this.spec = t;
  }
}
class B {
  highlightCode(t, e) {
    const n = this.escapeHtml(t);
    return `<pre><code class="language-${e}">${n}</code></pre>`;
  }
  escapeHtml(t) {
    const e = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return t.replace(/[&<>"']/g, (n) => e[n]);
  }
  nodeToHtml(t) {
    switch (t.type.name) {
      case "doc":
        return t.content.map((s) => this.nodeToHtml(s)).join(`
`);
      case "heading":
        const e = t.attrs.level || 1, n = t.content.map((s) => this.nodeToHtml(s)).join("");
        return `<h${e}>${n}</h${e}>`;
      case "paragraph":
        return `<p>${t.content.map((s) => this.nodeToHtml(s)).join("")}</p>`;
      case "text":
        let a = t.text || "";
        return t.marks && (t.marks.some((s) => s.type === "strong") && (a = `<strong>${a}</strong>`), t.marks.some((s) => s.type === "em") && (a = `<em>${a}</em>`)), a;
      case "code-block":
        const l = t.content.map((s) => s.text || "").join(`
`), p = t.attrs.language || "javascript";
        return this.highlightCode(l, p);
      case "bullet-list":
        return `<ul>${t.content.map((s) => this.nodeToHtml(s)).join("")}</ul>`;
      case "list-item":
        return `<li>${t.content.map((s) => this.nodeToHtml(s)).join("")}</li>`;
      case "table":
        return `<table><tbody>${t.content.map((s) => this.nodeToHtml(s)).join("")}</tbody></table>`;
      case "table-row":
        return `<tr>${t.content.map((s) => this.nodeToHtml(s)).join("")}</tr>`;
      case "table-cell":
        return `<td>${t.content.map((s) => this.nodeToHtml(s)).join("")}</td>`;
      case "image":
        return `<img src="${t.attrs.src}" alt="${t.attrs.alt || ""}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;" />`;
      default:
        return "";
    }
  }
  export(t) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { margin-top: 24px; margin-bottom: 16px; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    table td, table th { border: 1px solid #ddd; padding: 8px; }
    img { max-width: 100%; height: auto; }
    ul, ol { margin: 16px 0; }
  </style>
</head>
<body>
  ${this.nodeToHtml(t.doc)}
</body>
</html>`;
  }
}
class X {
  nodeToMarkdown(t, e = 0) {
    const n = "  ".repeat(e);
    switch (t.type.name) {
      case "doc":
        return t.content.map((i) => this.nodeToMarkdown(i, e)).join(`

`);
      case "heading":
        const r = t.attrs.level || 1, a = t.content.map((i) => this.nodeToMarkdown(i, e)).join("");
        return `${"#".repeat(r)} ${a}`;
      case "paragraph":
        return t.content.map((i) => this.nodeToMarkdown(i, e)).join("");
      case "text":
        let l = t.text || "";
        return t.marks && (t.marks.some((i) => i.type === "strong") && (l = `**${l}**`), t.marks.some((i) => i.type === "em") && (l = `*${l}*`)), l;
      case "code-block":
        const p = t.content.map((i) => i.text || "").join(`
`);
        return `\`\`\`${t.attrs.language || ""}
${p}
\`\`\``;
      case "bullet-list":
        return t.content.map((i) => {
          const d = this.nodeToMarkdown(i, e + 1);
          return `${n}- ${d}`;
        }).join(`
`);
      case "list-item":
        return t.content.map((i) => this.nodeToMarkdown(i, e)).join("");
      case "table":
        let h = "";
        return t.content.forEach((i, d) => {
          const s = i.content.map((w) => this.nodeToMarkdown(w, e)).join(" | ");
          h += `| ${s} |
`, d === 0 && (h += `| ${s.split(" | ").map(() => "---").join(" | ")} |
`);
        }), h;
      case "table-cell":
        return t.content.map((i) => this.nodeToMarkdown(i, e)).join("");
      case "image":
        return `![${t.attrs.alt || "image"}](${t.attrs.src})`;
      default:
        return "";
    }
  }
  export(t) {
    return this.nodeToMarkdown(t.doc);
  }
}
class V {
  nodeToJSON(t) {
    const e = {
      type: t.type.name
    };
    return t.attrs && Object.keys(t.attrs).length > 0 && (e.attrs = t.attrs), t.text && (e.text = t.text), t.marks && t.marks.length > 0 && (e.marks = t.marks.map((n) => ({
      type: n.type,
      attrs: n.attrs
    }))), t.content && t.content.length > 0 && (e.content = t.content.map((n) => this.nodeToJSON(n))), e;
  }
  export(t) {
    const e = this.nodeToJSON(t.doc);
    return JSON.stringify(e, null, 2);
  }
  /**
   * Import from JSON (for round-trip serialization)
   */
  static import(t) {
    return JSON.parse(t);
  }
}
const j = { content: "block+", toDOM() {
  return ["div", 0];
} }, S = { content: "inline*", group: "block", toDOM() {
  return ["p", 0];
} }, T = { group: "inline" }, v = {
  attrs: { level: { default: 1 } },
  content: "inline*",
  group: "block",
  toDOM(o) {
    return [`h${o.attrs.level}`, 0];
  }
};
class $ {
  // The function to get the node's position
  constructor(t, e, n) {
    c(this, "dom");
    c(this, "contentDOM");
    c(this, "img");
    c(this, "getPos");
    // --- Resize Logic ---
    c(this, "onResizeStart", (t) => {
      t.preventDefault();
      const e = t.clientX, n = this.dom.offsetWidth, r = (l) => {
        const p = n + (l.clientX - e);
        this.dom.style.width = `${p}px`;
      }, a = () => {
        window.removeEventListener("mousemove", r), window.removeEventListener("mouseup", a);
        const l = this.getPos();
        if (l === void 0)
          return;
        const p = { ...this.node.attrs, width: this.dom.style.width }, m = [l], h = this.view.editor.createTransaction().setNodeAttrs(m, p);
        this.view.editor.dispatch(h);
      };
      window.addEventListener("mousemove", r), window.addEventListener("mouseup", a);
    });
    this.node = t, this.view = e, this.getPos = n, this.dom = document.createElement("figure"), this.dom.style.position = "relative", this.dom.style.margin = "1rem 0", this.dom.style.display = "inline-block", this.img = document.createElement("img"), this.updateImageAttributes(t.attrs), this.contentDOM = document.createElement("div");
    const r = document.createElement("div");
    r.style.position = "absolute", r.style.bottom = "5px", r.style.right = "5px", r.style.width = "10px", r.style.height = "10px", r.style.backgroundColor = "#007bff", r.style.cursor = "nwse-resize", r.style.border = "1px solid white", this.dom.appendChild(this.img), this.dom.appendChild(this.contentDOM), this.dom.appendChild(r), r.addEventListener("mousedown", this.onResizeStart);
  }
  // Called by the main EditorView when the node changes
  update(t) {
    return t.type !== this.node.type ? !1 : (this.updateImageAttributes(t.attrs), this.node = t, !0);
  }
  // Helper to sync node attributes to the DOM
  updateImageAttributes(t) {
    this.img.src = t.src, this.img.alt = t.alt, this.img.title = t.title, this.dom.style.width = t.width, this.img.style.width = "100%";
  }
}
const C = {
  group: "block",
  content: "figcaption?",
  attrs: { src: { default: "" }, alt: { default: "" }, title: { default: "" }, width: { default: "100%" } },
  toDOM: (o) => {
    const { src: t, alt: e, title: n, width: r } = o.attrs;
    return ["figure", { style: `width: ${r};` }, ["img", { src: t, alt: e, title: n }], 0];
  },
  nodeView: $
}, M = {
  content: "inline*",
  toDOM: () => ["figcaption", { style: "text-align: center; color: #666; font-style: italic;" }, 0]
}, O = {
  group: "block",
  content: "table_row+",
  toDOM() {
    return ["table", { style: "border-collapse: collapse; width: 100%;" }, ["tbody", 0]];
  }
}, P = { content: "table_cell+", toDOM() {
  return ["tr", 0];
} }, E = {
  content: "paragraph+",
  attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
  toDOM(o) {
    return ["td", { style: "border: 1px solid #ddd; padding: 8px;", ...o.attrs }, 0];
  }
}, N = {
  group: "block",
  content: "list_item+",
  // Must contain one or more list_item nodes
  toDOM() {
    return ["ul", 0];
  }
}, D = {
  // A list item can contain paragraphs, and even nested lists.
  content: "paragraph+ (bullet_list)?",
  toDOM() {
    return ["li", 0];
  }
}, H = {
  name: "code-block",
  group: "block",
  atom: !1,
  code: !0,
  attrs: {
    language: { default: "javascript" },
    lineNumbers: { default: !1 }
  },
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs(o) {
        return {
          language: o.getAttribute("data-language") || "javascript",
          lineNumbers: o.getAttribute("data-line-numbers") === "true"
        };
      }
    }
  ],
  toDOM() {
    return [
      "pre",
      {
        "data-language": this.attrs.language,
        "data-line-numbers": this.attrs.lineNumbers ? "true" : "false",
        class: `language-${this.attrs.language}`
      },
      ["code", 0]
    ];
  }
}, A = {
  ...H,
  isInline: !1
}, I = { toDOM() {
  return ["strong", 0];
} }, L = { toDOM() {
  return ["em", 0];
} }, _ = 100;
function R() {
  return { done: [], undone: [] };
}
const Y = new g({
  state: {
    init: R,
    apply: (o, t) => {
      if (o.steps.length > 0) {
        const e = [...t.done, o];
        return e.length > _ && e.shift(), { done: e, undone: [] };
      }
      return t;
    }
  }
});
function G(o) {
  return console.log("Undo command called (not implemented)"), !1;
}
function K(o) {
  return console.log("Redo command called (not implemented)"), !1;
}
const Q = new g({});
class U {
  constructor(t = {}) {
    c(this, "config");
    c(this, "languageMap", {
      js: "javascript",
      ts: "typescript",
      py: "python",
      rb: "ruby",
      go: "go",
      rs: "rust",
      java: "java",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
      swift: "swift",
      kotlin: "kotlin",
      sql: "sql",
      html: "html",
      css: "css",
      json: "json",
      xml: "xml",
      yaml: "yaml",
      yml: "yaml",
      bash: "bash",
      sh: "bash",
      r: "r",
      matlab: "matlab",
      scala: "scala"
    });
    this.config = {
      theme: "default",
      lineNumbers: !0,
      ...t
    };
  }
  /**
   * Highlight code in a given language
   */
  highlight(t, e) {
    const n = this.normalizeLanguage(e), r = `hljs-${this.config.theme}`;
    let a = t;
    return this.config.lineNumbers && (a = this.addLineNumbers(t)), a = this.escapeHtml(a), `<pre class="${r}"><code class="language-${n} hljs">${a}</code></pre>`;
  }
  /**
   * Generate CSS for syntax highlighting
   */
  generateCSS() {
    return `
.hljs {
  display: block;
  overflow-x: auto;
  padding: 0.5em;
  color: #333;
  background: #f5f5f5;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-literal {
  color: #0077aa;
}

.hljs-string {
  color: #669900;
}

.hljs-number {
  color: #924900;
}

.hljs-attr,
.hljs-attribute {
  color: #d19a66;
}

.hljs-comment {
  color: #aaa;
}

.hljs-function .hljs-title {
  color: #dd4814;
}

.hljs-class .hljs-title {
  color: #dd4814;
}

.hljs-dark {
  background: #1e1e1e;
  color: #d4d4d4;
}

.hljs-dark .hljs-keyword,
.hljs-dark .hljs-selector-tag {
  color: #569cd6;
}

.hljs-dark .hljs-string {
  color: #ce9178;
}

.hljs-dark .hljs-number {
  color: #b5cea8;
}

.hljs-dark .hljs-comment {
  color: #6a9955;
}

.line-number {
  display: inline-block;
  width: 50px;
  text-align: right;
  padding-right: 10px;
  margin-right: 10px;
  border-right: 1px solid #ddd;
  color: #999;
  user-select: none;
}
    `;
  }
  normalizeLanguage(t) {
    const e = t.toLowerCase();
    return this.languageMap[e] || e;
  }
  addLineNumbers(t) {
    return t.split(`
`).map((n, r) => `<span class="line-number">${r + 1}</span>${n}`).join(`
`);
  }
  escapeHtml(t) {
    const e = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return t.replace(/[&<>"']/g, (n) => e[n]);
  }
}
class Z {
  constructor(t) {
    c(this, "highlighter");
    this.highlighter = new U(t);
  }
  /**
   * Get the highlighter instance
   */
  getHighlighter() {
    return this.highlighter;
  }
  /**
   * Get CSS for syntax highlighting
   */
  getCSS() {
    return this.highlighter.generateCSS();
  }
}
class q {
  constructor(t) {
    c(this, "mcpServerUrl");
    c(this, "tools", []);
    this.mcpServerUrl = t, this.registerDefaultTools();
  }
  registerDefaultTools() {
    this.tools = [
      {
        name: "generate_content",
        description: "Generate new content in specified format",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "What to generate"
            },
            format: {
              type: "string",
              enum: ["markdown", "html", "json", "fountain"],
              description: "Output format"
            },
            language: {
              type: "string",
              description: "Programming language (if code)"
            }
          },
          required: ["prompt", "format"]
        }
      },
      {
        name: "improve_content",
        description: "Improve existing content",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Content to improve"
            },
            aspect: {
              type: "string",
              enum: ["clarity", "grammar", "tone", "structure"],
              description: "What to improve"
            }
          },
          required: ["content", "aspect"]
        }
      },
      {
        name: "transform_format",
        description: "Transform content between formats",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Content to transform"
            },
            fromFormat: {
              type: "string",
              enum: ["markdown", "html", "json", "fountain", "text"]
            },
            toFormat: {
              type: "string",
              enum: ["markdown", "html", "json", "fountain"]
            }
          },
          required: ["content", "fromFormat", "toFormat"]
        }
      }
    ];
  }
  /**
   * Connect to an MCP server
   * Server can be hosted anywhere - local, cloud, enterprise
   */
  async connectToMCPServer(t) {
    this.mcpServerUrl = t, console.log(`Connected to MCP server: ${t}`);
  }
  /**
   * Register custom tools for specific AI use cases
   */
  registerTool(t) {
    this.tools.push(t);
  }
  /**
   * Get available tools for this AI
   */
  getAvailableTools() {
    return this.tools;
  }
  /**
   * Transform content using AI through MCP
   * Works with ANY MCP-compatible AI service
   */
  async transformContent(t) {
    if (!this.mcpServerUrl)
      throw new Error("MCP server not configured. Call connectToMCPServer() first.");
    const e = this.buildSystemPrompt(t), r = {
      content: this.buildUserPrompt(t),
      systemPrompt: e,
      tools: this.tools
    }, a = await this.sendToMCP(r);
    return this.extractContent(a);
  }
  buildSystemPrompt(t) {
    return `You are a helpful content transformation AI.
The user has content in ${t.contentType} format.
Help them ${t.operation} their content.
${t.language ? `Programming language: ${t.language}` : ""}
${t.context ? `Context: ${t.context}` : ""}`;
  }
  buildUserPrompt(t) {
    switch (t.operation) {
      case "generate":
        return `Generate new content: ${t.content}`;
      case "improve":
        return `Improve this content:
${t.content}`;
      case "transform":
        return `Transform this content to a better format:
${t.content}`;
      case "summarize":
        return `Summarize this content:
${t.content}`;
      case "expand":
        return `Expand on this content:
${t.content}`;
      default:
        return t.content;
    }
  }
  async sendToMCP(t) {
    if (!this.mcpServerUrl)
      throw new Error("MCP server URL not set");
    try {
      const e = await fetch(`${this.mcpServerUrl}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t)
      });
      if (!e.ok)
        throw new Error(`MCP server error: ${e.statusText}`);
      return await e.json();
    } catch (e) {
      throw console.error("MCP request failed:", e), e;
    }
  }
  extractContent(t) {
    return t.content.filter((n) => n.type === "text").map((n) => n.text || "").join(`
`);
  }
}
async function tt(o, t, e = "markdown") {
  const n = {
    content: o,
    contentType: e,
    operation: "generate"
  };
  return t.transformContent(n);
}
const et = {
  nodes: {
    doc: j,
    paragraph: S,
    text: T,
    heading: v,
    image_super: C,
    figcaption: M,
    table: O,
    table_row: P,
    table_cell: E,
    bullet_list: N,
    list_item: D,
    code_block: A
  },
  marks: {
    strong: I,
    em: L
  }
};
export {
  rt as AddMarkStep,
  et as CoreSchemaSpec,
  st as Editor,
  at as EditorState,
  it as EditorView,
  lt as FountainEditor,
  B as HTMLExporter,
  W as InsertTextStep,
  V as JSONExporter,
  q as MCPIntegration,
  u as Mark,
  ct as MarkType,
  X as MarkdownExporter,
  pt as Navigator,
  k as Node,
  mt as NodeType,
  g as Plugin,
  ht as RemoveMarkStep,
  dt as ReplaceStep,
  ut as ReplaceTextStep,
  gt as Schema,
  ft as Selection,
  wt as SetNodeAttrsStep,
  x as Step,
  Z as SyntaxHighlightPlugin,
  bt as Transaction,
  yt as Transform,
  N as bulletList,
  A as codeBlock,
  xt as createEditor,
  j as doc,
  L as em,
  M as figcaption,
  tt as generateContentWithAI,
  v as heading,
  Y as historyPlugin,
  C as imageSuper,
  D as listItem,
  Q as markdownShortcutsPlugin,
  S as paragraph,
  K as redo,
  I as strong,
  O as table,
  E as tableCell,
  P as tableRow,
  T as text,
  G as undo,
  kt as useFountain,
  jt as useNavigatorState
};
