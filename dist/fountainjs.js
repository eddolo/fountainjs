var h = Object.defineProperty;
var m = (s, t, e) => t in s ? h(s, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : s[t] = e;
var a = (s, t, e) => (m(s, typeof t != "symbol" ? t + "" : t, e), e);
import { S as g, N as w } from "./index-1c508d95.js";
import { A as U, h as J, E as Y, j as q, F as B, M as G, l as K, a as Q, d as Z, R as j, c as tt, b as et, g as st, e as ot, f as nt, T as it, i as rt, u as at, k as lt } from "./index-1c508d95.js";
import "react";
class d {
  constructor(t, e) {
    a(this, "type");
    a(this, "attrs");
    this.type = t, this.attrs = e;
  }
  static fromJSON(t, e) {
    const n = t.marks[e.type];
    if (!n)
      throw new Error(`Unknown mark type: ${e.type}`);
    return new d(n, { ...e.attrs });
  }
}
class z extends g {
  constructor(t, e, n) {
    super(), this.path = t, this.offset = e, this.text = n;
  }
  apply(t) {
    let e = t, n = [];
    for (const i of this.path)
      n.push(e), e = e.content[i];
    if (!e || !e.isText)
      throw new Error("Target for InsertTextStep is not a text node.");
    let l = e.withText((e.text || "").slice(0, this.offset) + this.text + (e.text || "").slice(this.offset));
    for (let i = n.length - 1; i >= 0; i--) {
      const r = n[i], c = [...r.content];
      c[this.path[i]] = l, l = new w(r.type, r.attrs, c, r.text, r.marks);
    }
    return l;
  }
}
class p {
  constructor(t) {
    a(this, "spec");
    this.spec = t;
  }
}
const f = { content: "block+", toDOM() {
  return ["div", 0];
} }, y = { content: "inline*", group: "block", toDOM() {
  return ["p", 0];
} }, b = { group: "inline" }, x = {
  attrs: { level: { default: 1 } },
  content: "inline*",
  group: "block",
  toDOM(s) {
    return [`h${s.attrs.level}`, 0];
  }
};
class S {
  // The function to get the node's position
  constructor(t, e, n) {
    a(this, "dom");
    a(this, "contentDOM");
    a(this, "img");
    a(this, "getPos");
    // --- Resize Logic ---
    a(this, "onResizeStart", (t) => {
      t.preventDefault();
      const e = t.clientX, n = this.dom.offsetWidth, o = (i) => {
        const r = n + (i.clientX - e);
        this.dom.style.width = `${r}px`;
      }, l = () => {
        window.removeEventListener("mousemove", o), window.removeEventListener("mouseup", l);
        const i = this.getPos();
        if (i === void 0)
          return;
        const r = { ...this.node.attrs, width: this.dom.style.width }, c = [i], u = this.view.editor.createTransaction().setNodeAttrs(c, r);
        this.view.editor.dispatch(u);
      };
      window.addEventListener("mousemove", o), window.addEventListener("mouseup", l);
    });
    this.node = t, this.view = e, this.getPos = n, this.dom = document.createElement("figure"), this.dom.style.position = "relative", this.dom.style.margin = "1rem 0", this.dom.style.display = "inline-block", this.img = document.createElement("img"), this.updateImageAttributes(t.attrs), this.contentDOM = document.createElement("div");
    const o = document.createElement("div");
    o.style.position = "absolute", o.style.bottom = "5px", o.style.right = "5px", o.style.width = "10px", o.style.height = "10px", o.style.backgroundColor = "#007bff", o.style.cursor = "nwse-resize", o.style.border = "1px solid white", this.dom.appendChild(this.img), this.dom.appendChild(this.contentDOM), this.dom.appendChild(o), o.addEventListener("mousedown", this.onResizeStart);
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
const v = {
  group: "block",
  content: "figcaption?",
  attrs: { src: { default: "" }, alt: { default: "" }, title: { default: "" }, width: { default: "100%" } },
  toDOM: (s) => {
    const { src: t, alt: e, title: n, width: o } = s.attrs;
    return ["figure", { style: `width: ${o};` }, ["img", { src: t, alt: e, title: n }], 0];
  },
  nodeView: S
}, M = {
  content: "inline*",
  toDOM: () => ["figcaption", { style: "text-align: center; color: #666; font-style: italic;" }, 0]
}, D = {
  group: "block",
  content: "table_row+",
  toDOM() {
    return ["table", { style: "border-collapse: collapse; width: 100%;" }, ["tbody", 0]];
  }
}, E = { content: "table_cell+", toDOM() {
  return ["tr", 0];
} }, k = {
  content: "paragraph+",
  attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
  toDOM(s) {
    return ["td", { style: "border: 1px solid #ddd; padding: 8px;", ...s.attrs }, 0];
  }
}, O = {
  group: "block",
  content: "list_item+",
  // Must contain one or more list_item nodes
  toDOM() {
    return ["ul", 0];
  }
}, T = {
  // A list item can contain paragraphs, and even nested lists.
  content: "paragraph+ (bullet_list)?",
  toDOM() {
    return ["li", 0];
  }
}, N = { toDOM() {
  return ["strong", 0];
} }, R = { toDOM() {
  return ["em", 0];
} }, _ = 100;
function A() {
  return { done: [], undone: [] };
}
const L = new p({
  state: {
    init: A,
    apply: (s, t) => {
      if (s.steps.length > 0) {
        const e = [...t.done, s];
        return e.length > _ && e.shift(), { done: e, undone: [] };
      }
      return t;
    }
  }
});
function H(s) {
  return console.log("Undo command called (not implemented)"), !1;
}
function X(s) {
  return console.log("Redo command called (not implemented)"), !1;
}
const $ = new p({}), F = {
  nodes: {
    doc: f,
    paragraph: y,
    text: b,
    heading: x,
    image_super: v,
    figcaption: M,
    table: D,
    table_row: E,
    table_cell: k,
    bullet_list: O,
    list_item: T
  },
  marks: {
    strong: N,
    em: R
  }
};
export {
  U as AddMarkStep,
  F as CoreSchemaSpec,
  J as Editor,
  Y as EditorState,
  q as EditorView,
  B as FountainEditor,
  z as InsertTextStep,
  d as Mark,
  G as MarkType,
  K as Navigator,
  w as Node,
  Q as NodeType,
  p as Plugin,
  Z as RemoveMarkStep,
  j as ReplaceStep,
  tt as ReplaceTextStep,
  et as Schema,
  st as Selection,
  ot as SetNodeAttrsStep,
  g as Step,
  nt as Transaction,
  it as Transform,
  O as bulletList,
  rt as createEditor,
  f as doc,
  R as em,
  M as figcaption,
  x as heading,
  L as historyPlugin,
  v as imageSuper,
  T as listItem,
  $ as markdownShortcutsPlugin,
  y as paragraph,
  X as redo,
  N as strong,
  D as table,
  k as tableCell,
  E as tableRow,
  b as text,
  H as undo,
  at as useFountain,
  lt as useNavigatorState
};
