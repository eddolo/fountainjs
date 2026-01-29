var yt = Object.defineProperty;
var wt = (u, t, r) => t in u ? yt(u, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : u[t] = r;
var h = (u, t, r) => (wt(u, typeof t != "symbol" ? t + "" : t, r), r);
import je, { useState as Ne, useRef as bt, useEffect as Me } from "react";
class b {
  constructor(t, r, n = [], i, d = []) {
    h(this, "type");
    h(this, "attrs");
    h(this, "content");
    h(this, "text");
    h(this, "marks");
    this.type = t, this.attrs = r, this.content = n, this.text = i, this.marks = d;
  }
  get isText() {
    return this.type.name === "text";
  }
  withText(t) {
    if (!this.isText)
      throw new Error("Cannot call withText on a non-text node.");
    return new b(this.type, this.attrs, [], t, this.marks);
  }
}
class xt {
  constructor(t, r) {
    h(this, "name");
    h(this, "spec");
    h(this, "isBlock");
    h(this, "isInline");
    this.name = t, this.spec = r, this.isInline = !!r.inline, this.isBlock = !this.isInline;
  }
}
class Et {
  constructor(t, r) {
    h(this, "name");
    h(this, "spec");
    this.name = t, this.spec = r;
  }
}
class Rt {
  constructor(t) {
    h(this, "spec");
    h(this, "nodes");
    h(this, "marks");
    this.spec = t, this.nodes = this.compileNodes(t.nodes), this.marks = this.compileMarks(t.marks || {});
  }
  compileNodes(t) {
    const r = {};
    for (const n in t)
      r[n] = new xt(n, t[n]);
    return r;
  }
  compileMarks(t) {
    const r = {};
    for (const n in t)
      r[n] = new Et(n, t[n]);
    return r;
  }
}
class K {
}
class Tt extends K {
  constructor(t, r, n) {
    super(), this.from = t, this.to = r, this.content = n;
  }
  apply(t) {
    if (this.from > this.to || this.from > t.content.length || this.to > t.content.length)
      throw new Error("ReplaceStep apply error: Invalid range");
    const r = [...t.content.slice(0, this.from), ...this.content, ...t.content.slice(this.to)];
    return new b(t.type, t.attrs, r);
  }
}
class _t extends K {
  constructor(t, r, n, i) {
    super(), this.path = t, this.from = r, this.to = n, this.text = i;
  }
  apply(t) {
    let r = t, n = [];
    for (const f of this.path)
      n.push(r), r = r.content[f];
    if (!r || !r.isText)
      throw new Error("Target for ReplaceTextStep is not a text node.");
    const i = r.text || "", d = i.slice(0, this.from) + this.text + i.slice(this.to);
    let o = r.withText(d);
    for (let f = n.length - 1; f >= 0; f--) {
      const w = n[f], y = [...w.content];
      y[this.path[f]] = o, o = new b(w.type, w.attrs, y, w.text, w.marks);
    }
    return o;
  }
}
class St extends K {
  constructor(t, r) {
    super(), this.path = t, this.mark = r;
  }
  apply(t) {
    let r = t, n = [];
    for (const o of this.path)
      n.push(r), r = r.content[o];
    if (!r || !r.isText)
      return t;
    const i = [this.mark, ...r.marks.filter((o) => o.type !== this.mark.type)];
    let c = new b(r.type, r.attrs, [], r.text, i);
    for (let o = n.length - 1; o >= 0; o--) {
      const f = n[o], w = [...f.content];
      w[this.path[o]] = c, c = new b(f.type, f.attrs, w, f.text, f.marks);
    }
    return c;
  }
}
class Ct extends K {
  constructor(t, r, n) {
    super(), this.from = t, this.to = r, this.markType = n;
  }
  apply(t) {
    const r = t.content.map((n, i) => {
      if (i >= this.from && i < this.to && n.type.name === "paragraph") {
        const d = n.content.map((c) => {
          if (c.isText) {
            const o = c.marks.filter((f) => f.type !== this.markType);
            return new b(c.type, c.attrs, [], c.text, o);
          }
          return c;
        });
        return new b(n.type, n.attrs, d);
      }
      return n;
    });
    return new b(t.type, t.attrs, r);
  }
}
class kt extends K {
  constructor(t, r) {
    super(), this.path = t, this.attrs = r;
  }
  apply(t) {
    let r = t, n = [];
    for (const o of this.path)
      n.push(r), r = r.content[o];
    if (!r)
      throw new Error("No node found at path");
    const i = { ...r.attrs, ...this.attrs };
    let c = new b(r.type, i, r.content, r.text, r.marks);
    for (let o = n.length - 1; o >= 0; o--) {
      const f = n[o], w = [...f.content];
      w[this.path[o]] = c, c = new b(f.type, f.attrs, w, f.text, f.marks);
    }
    return c;
  }
}
class Ot {
  constructor(t) {
    h(this, "originalDoc");
    h(this, "doc");
    h(this, "steps");
    this.originalDoc = t, this.doc = t, this.steps = [];
  }
  step(t) {
    const r = t.apply(this.doc);
    return r && (this.doc = r, this.steps.push(t)), this;
  }
  replace(t, r, n = []) {
    return this.step(new Tt(t, r, n));
  }
  // --- REPLACE `insertText` WITH THIS NEW METHOD ---
  replaceText(t, r, n, i) {
    return this.step(new _t(t, r, n, i));
  }
  addMark(t, r) {
    return this.step(new St(t, r));
  }
  removeMark(t, r, n) {
    return this.step(new Ct(t, r, n));
  }
  setNodeAttrs(t, r) {
    return this.step(new kt(t, r));
  }
}
class F {
  // A selection is defined by a single path and a start/end offset within that path's node.
  constructor(t, r, n) {
    this.path = t, this.from = r, this.to = n;
  }
  // A collapsed selection (cursor)
  static createCursor(t, r) {
    return new F(t, r, r);
  }
  get isCollapsed() {
    return this.from === this.to;
  }
}
class Pt extends Ot {
  constructor(r) {
    super(r);
    h(this, "selection");
    h(this, "selectionSet", !1);
    this.selection = F.createCursor([], 0);
  }
  setSelection(r) {
    return this.selection = r, this.selectionSet = !0, this;
  }
}
class z {
  constructor(t) {
    h(this, "schema");
    h(this, "doc");
    h(this, "selection");
    h(this, "plugins");
    h(this, "pluginStates");
    this.schema = t.schema, this.doc = t.doc || this.createDefaultDoc(t.schema), this.selection = t.selection || F.createCursor([0, 0], 19), this.plugins = t.plugins || [], t.pluginStates ? this.pluginStates = t.pluginStates : this.pluginStates = this.plugins.map((r) => {
      var n;
      return (n = r.spec.state) == null ? void 0 : n.init({}, this);
    });
  }
  static create(t) {
    return new z(t);
  }
  apply(t) {
    const r = this.plugins.map((d, c) => {
      const o = d.spec.state;
      return o ? o.apply(t, this.pluginStates[c], this) : this.pluginStates[c];
    }), n = t.doc, i = t.selectionSet ? t.selection : this.selection;
    return new z({ schema: this.schema, doc: n, selection: i, plugins: this.plugins, pluginStates: r });
  }
  createTransaction() {
    return new Pt(this.doc);
  }
  createDefaultDoc(t) {
    const r = t.nodes.doc, n = t.nodes.paragraph, i = t.nodes.text;
    if (!r || !n || !i)
      throw new Error("Schema is missing core nodes.");
    const d = new b(i, {}, [], "Start typing here..."), c = new b(n, {}, [d]);
    return new b(r, {}, [c]);
  }
}
class Dt {
  constructor(t) {
    h(this, "_state");
    h(this, "subscribers", /* @__PURE__ */ new Set());
    this._state = t.state;
  }
  get state() {
    return this._state;
  }
  createTransaction() {
    return this.state.createTransaction();
  }
  dispatch(t) {
    const r = this._state.apply(t);
    r !== this._state && (this._state = r, this.subscribers.forEach((n) => n(r)));
  }
  subscribe(t) {
    return this.subscribers.add(t), () => this.subscribers.delete(t);
  }
}
function jt(u) {
  const t = new Rt(u.schema), r = u.plugins || [], n = u.state || z.create({ schema: t, plugins: r });
  return new Dt({ state: n });
}
class Nt {
  constructor(t, r) {
    h(this, "editor");
    h(this, "dom");
    h(this, "isDestroyed", !1);
    h(this, "isReconciling", !1);
    h(this, "unsubscribe");
    h(this, "nodeToDOM", /* @__PURE__ */ new WeakMap());
    h(this, "domToPath", /* @__PURE__ */ new WeakMap());
    h(this, "handleInput", () => {
      this.isReconciling || this.reconcile();
    });
    h(this, "handleKeyDown", (t) => {
      if ((t.ctrlKey || t.metaKey) && t.key === "b") {
        t.preventDefault(), this.toggleMark("strong");
        return;
      }
      if ((t.ctrlKey || t.metaKey) && t.key === "i") {
        t.preventDefault(), this.toggleMark("em");
        return;
      }
      if ((t.ctrlKey || t.metaKey) && t.key === "z" && !t.shiftKey) {
        t.preventDefault();
        return;
      }
    });
    h(this, "handlePaste", (t) => {
      var n;
      t.preventDefault();
      const r = (n = t.clipboardData) == null ? void 0 : n.getData("text/plain");
      r && document.execCommand("insertText", !1, r);
    });
    h(this, "reconcile", () => {
      if (!this.isReconciling) {
        this.isReconciling = !0;
        try {
          const { state: t } = this.editor, r = window.getSelection();
          if (!r || !r.anchorNode) {
            this.isReconciling = !1;
            return;
          }
          const n = this.extractContent(this.dom);
          if (n.length > 0) {
            const i = t.createTransaction().replace(0, t.doc.content.length, n);
            if (r.anchorNode) {
              const d = r.anchorOffset;
              i.setSelection(F.createCursor([0, 0], d));
            }
            this.editor.dispatch(i);
          }
        } finally {
          queueMicrotask(() => {
            this.isReconciling = !1;
          });
        }
      }
    });
    h(this, "onStateChange", (t) => {
      this.isDestroyed || this.isReconciling || this.render(t);
    });
    this.editor = r, this.dom = document.createElement("div"), this.dom.setAttribute("role", "textbox"), this.dom.setAttribute("aria-label", "Editor"), this.dom.contentEditable = "true", this.dom.style.cssText = `
      padding: 12px;
      min-height: 200px;
      outline: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
    `, t.appendChild(this.dom), this.dom.addEventListener("input", this.handleInput), this.dom.addEventListener("keydown", this.handleKeyDown), this.dom.addEventListener("paste", this.handlePaste), this.unsubscribe = this.editor.subscribe(this.onStateChange), this.render(this.editor.state);
  }
  toggleMark(t) {
    const { state: r } = this.editor, n = window.getSelection();
    if (!n || n.isCollapsed)
      return;
    const { anchorNode: i, focusNode: d, anchorOffset: c, focusOffset: o } = n;
    if (!i || !d)
      return;
    const f = n.toString();
    if (r.schema.marks[t]) {
      const y = document.createElement("span");
      t === "strong" && (y.style.fontWeight = "bold"), t === "em" && (y.style.fontStyle = "italic"), y.textContent = f;
      try {
        const R = n.getRangeAt(0);
        R.deleteContents(), R.insertNode(y);
      } catch {
        t === "strong" && document.execCommand("bold"), t === "em" && document.execCommand("italic");
      }
    }
    queueMicrotask(() => this.reconcile());
  }
  extractContent(t) {
    const r = [];
    for (let n = 0; n < t.childNodes.length; n++) {
      const i = t.childNodes[n];
      if (i.nodeType === 3) {
        const d = i.textContent || "";
        if (d.trim()) {
          const c = new b(this.editor.state.schema.nodes.text, {}, [], d), o = new b(this.editor.state.schema.nodes.paragraph, {}, [c]);
          r.push(o);
        }
      } else if (i.nodeType === 1) {
        const d = i, c = d.tagName.toLowerCase();
        if (c === "p" || c === "div") {
          const o = d.textContent || "", f = new b(this.editor.state.schema.nodes.text, {}, [], o), w = new b(this.editor.state.schema.nodes.paragraph, {}, [f]);
          r.push(w);
        } else if (c === "h1" || c === "h2" || c === "h3") {
          const o = parseInt(c[1]), f = d.textContent || "", w = new b(this.editor.state.schema.nodes.text, {}, [], f), y = new b(this.editor.state.schema.nodes.heading, { level: o }, [w]);
          r.push(y);
        }
      }
    }
    return r.length > 0 ? r : [
      new b(this.editor.state.schema.nodes.paragraph, {}, [
        new b(this.editor.state.schema.nodes.text, {}, [], "")
      ])
    ];
  }
  render(t) {
    this.nodeToDOM = /* @__PURE__ */ new WeakMap(), this.domToPath = /* @__PURE__ */ new WeakMap();
    const r = this.renderNode(t.doc, []);
    if (r.childNodes.length > 0) {
      this.dom.innerHTML = "";
      for (let n = 0; n < r.childNodes.length; n++)
        this.dom.appendChild(r.childNodes[n].cloneNode(!0));
    }
    queueMicrotask(() => this.restoreSelection(t.selection));
  }
  renderNode(t, r) {
    const n = document.createElement("div");
    if (t.type && t.type.name === "text")
      n.textContent = t.text || "";
    else {
      const d = this.getTagForNode(t), c = document.createElement(d);
      if (t.attrs && t.attrs.level && c.setAttribute("data-level", t.attrs.level), t.attrs && t.attrs.src) {
        const o = document.createElement("img");
        o.src = t.attrs.src, o.style.maxWidth = "100%", o.style.height = "auto", c.appendChild(o);
      }
      if (t.content)
        for (let o = 0; o < t.content.length; o++) {
          const f = t.content[o], w = [...r, o], y = this.renderNode(f, w);
          for (let R = 0; R < y.childNodes.length; R++)
            c.appendChild(y.childNodes[R].cloneNode(!0));
        }
      else
        t.text && (c.textContent = t.text);
      this.nodeToDOM.set(t, c), n.appendChild(c);
    }
    return n;
  }
  getTagForNode(t) {
    var i;
    const r = t.type.name;
    return {
      heading: `h${((i = t.attrs) == null ? void 0 : i.level) || 1}`,
      paragraph: "p",
      bullet_list: "ul",
      list_item: "li",
      table: "table",
      table_row: "tr",
      table_cell: "td",
      image_super: "figure",
      figcaption: "figcaption"
    }[r] || "div";
  }
  restoreSelection(t) {
    var n;
    const r = window.getSelection();
    if (r)
      try {
        const i = this.dom.querySelector("p, h1, h2, h3, h4, h5, h6");
        if (i != null && i.firstChild) {
          const d = document.createRange(), c = Math.min(t.to, (((n = i.firstChild.textContent) == null ? void 0 : n.length) ?? 0) - 1);
          d.setStart(i.firstChild, Math.max(0, c)), d.collapse(!0), r.removeAllRanges(), r.addRange(d);
        }
      } catch {
      }
  }
  execCommand(t, r) {
    return document.execCommand(t, !1, r);
  }
  destroy() {
    this.isDestroyed || (this.isDestroyed = !0, this.unsubscribe(), this.dom.removeEventListener("input", this.handleInput), this.dom.removeEventListener("keydown", this.handleKeyDown), this.dom.removeEventListener("paste", this.handlePaste), this.dom.remove());
  }
}
function Lt(u) {
  const [t] = Ne(() => u ? jt(u) : null);
  return t;
}
var se = { exports: {} }, L = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Pe;
function Mt() {
  if (Pe)
    return L;
  Pe = 1;
  var u = je, t = Symbol.for("react.element"), r = Symbol.for("react.fragment"), n = Object.prototype.hasOwnProperty, i = u.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, d = { key: !0, ref: !0, __self: !0, __source: !0 };
  function c(o, f, w) {
    var y, R = {}, O = null, U = null;
    w !== void 0 && (O = "" + w), f.key !== void 0 && (O = "" + f.key), f.ref !== void 0 && (U = f.ref);
    for (y in f)
      n.call(f, y) && !d.hasOwnProperty(y) && (R[y] = f[y]);
    if (o && o.defaultProps)
      for (y in f = o.defaultProps, f)
        R[y] === void 0 && (R[y] = f[y]);
    return { $$typeof: t, type: o, key: O, ref: U, props: R, _owner: i.current };
  }
  return L.Fragment = r, L.jsx = c, L.jsxs = c, L;
}
var Y = {};
/**
 * @license React
 * react-jsx-runtime.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var De;
function At() {
  return De || (De = 1, process.env.NODE_ENV !== "production" && function() {
    var u = je, t = Symbol.for("react.element"), r = Symbol.for("react.portal"), n = Symbol.for("react.fragment"), i = Symbol.for("react.strict_mode"), d = Symbol.for("react.profiler"), c = Symbol.for("react.provider"), o = Symbol.for("react.context"), f = Symbol.for("react.forward_ref"), w = Symbol.for("react.suspense"), y = Symbol.for("react.suspense_list"), R = Symbol.for("react.memo"), O = Symbol.for("react.lazy"), U = Symbol.for("react.offscreen"), ae = Symbol.iterator, Ae = "@@iterator";
    function Fe(e) {
      if (e === null || typeof e != "object")
        return null;
      var s = ae && e[ae] || e[Ae];
      return typeof s == "function" ? s : null;
    }
    var j = u.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    function T(e) {
      {
        for (var s = arguments.length, a = new Array(s > 1 ? s - 1 : 0), l = 1; l < s; l++)
          a[l - 1] = arguments[l];
        Ie("error", e, a);
      }
    }
    function Ie(e, s, a) {
      {
        var l = j.ReactDebugCurrentFrame, m = l.getStackAddendum();
        m !== "" && (s += "%s", a = a.concat([m]));
        var g = a.map(function(v) {
          return String(v);
        });
        g.unshift("Warning: " + s), Function.prototype.apply.call(console[e], console, g);
      }
    }
    var We = !1, $e = !1, Le = !1, Ye = !1, Ke = !1, ie;
    ie = Symbol.for("react.module.reference");
    function Ue(e) {
      return !!(typeof e == "string" || typeof e == "function" || e === n || e === d || Ke || e === i || e === w || e === y || Ye || e === U || We || $e || Le || typeof e == "object" && e !== null && (e.$$typeof === O || e.$$typeof === R || e.$$typeof === c || e.$$typeof === o || e.$$typeof === f || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      e.$$typeof === ie || e.getModuleId !== void 0));
    }
    function Ve(e, s, a) {
      var l = e.displayName;
      if (l)
        return l;
      var m = s.displayName || s.name || "";
      return m !== "" ? a + "(" + m + ")" : a;
    }
    function oe(e) {
      return e.displayName || "Context";
    }
    function k(e) {
      if (e == null)
        return null;
      if (typeof e.tag == "number" && T("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), typeof e == "function")
        return e.displayName || e.name || null;
      if (typeof e == "string")
        return e;
      switch (e) {
        case n:
          return "Fragment";
        case r:
          return "Portal";
        case d:
          return "Profiler";
        case i:
          return "StrictMode";
        case w:
          return "Suspense";
        case y:
          return "SuspenseList";
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case o:
            var s = e;
            return oe(s) + ".Consumer";
          case c:
            var a = e;
            return oe(a._context) + ".Provider";
          case f:
            return Ve(e, e.render, "ForwardRef");
          case R:
            var l = e.displayName || null;
            return l !== null ? l : k(e.type) || "Memo";
          case O: {
            var m = e, g = m._payload, v = m._init;
            try {
              return k(v(g));
            } catch {
              return null;
            }
          }
        }
      return null;
    }
    var P = Object.assign, I = 0, ce, le, ue, fe, de, he, pe;
    function ve() {
    }
    ve.__reactDisabledLog = !0;
    function Be() {
      {
        if (I === 0) {
          ce = console.log, le = console.info, ue = console.warn, fe = console.error, de = console.group, he = console.groupCollapsed, pe = console.groupEnd;
          var e = {
            configurable: !0,
            enumerable: !0,
            value: ve,
            writable: !0
          };
          Object.defineProperties(console, {
            info: e,
            log: e,
            warn: e,
            error: e,
            group: e,
            groupCollapsed: e,
            groupEnd: e
          });
        }
        I++;
      }
    }
    function qe() {
      {
        if (I--, I === 0) {
          var e = {
            configurable: !0,
            enumerable: !0,
            writable: !0
          };
          Object.defineProperties(console, {
            log: P({}, e, {
              value: ce
            }),
            info: P({}, e, {
              value: le
            }),
            warn: P({}, e, {
              value: ue
            }),
            error: P({}, e, {
              value: fe
            }),
            group: P({}, e, {
              value: de
            }),
            groupCollapsed: P({}, e, {
              value: he
            }),
            groupEnd: P({}, e, {
              value: pe
            })
          });
        }
        I < 0 && T("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
      }
    }
    var G = j.ReactCurrentDispatcher, H;
    function V(e, s, a) {
      {
        if (H === void 0)
          try {
            throw Error();
          } catch (m) {
            var l = m.stack.trim().match(/\n( *(at )?)/);
            H = l && l[1] || "";
          }
        return `
` + H + e;
      }
    }
    var X = !1, B;
    {
      var Je = typeof WeakMap == "function" ? WeakMap : Map;
      B = new Je();
    }
    function me(e, s) {
      if (!e || X)
        return "";
      {
        var a = B.get(e);
        if (a !== void 0)
          return a;
      }
      var l;
      X = !0;
      var m = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var g;
      g = G.current, G.current = null, Be();
      try {
        if (s) {
          var v = function() {
            throw Error();
          };
          if (Object.defineProperty(v.prototype, "props", {
            set: function() {
              throw Error();
            }
          }), typeof Reflect == "object" && Reflect.construct) {
            try {
              Reflect.construct(v, []);
            } catch (S) {
              l = S;
            }
            Reflect.construct(e, [], v);
          } else {
            try {
              v.call();
            } catch (S) {
              l = S;
            }
            e.call(v.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (S) {
            l = S;
          }
          e();
        }
      } catch (S) {
        if (S && l && typeof S.stack == "string") {
          for (var p = S.stack.split(`
`), _ = l.stack.split(`
`), x = p.length - 1, E = _.length - 1; x >= 1 && E >= 0 && p[x] !== _[E]; )
            E--;
          for (; x >= 1 && E >= 0; x--, E--)
            if (p[x] !== _[E]) {
              if (x !== 1 || E !== 1)
                do
                  if (x--, E--, E < 0 || p[x] !== _[E]) {
                    var C = `
` + p[x].replace(" at new ", " at ");
                    return e.displayName && C.includes("<anonymous>") && (C = C.replace("<anonymous>", e.displayName)), typeof e == "function" && B.set(e, C), C;
                  }
                while (x >= 1 && E >= 0);
              break;
            }
        }
      } finally {
        X = !1, G.current = g, qe(), Error.prepareStackTrace = m;
      }
      var M = e ? e.displayName || e.name : "", D = M ? V(M) : "";
      return typeof e == "function" && B.set(e, D), D;
    }
    function ze(e, s, a) {
      return me(e, !1);
    }
    function Ge(e) {
      var s = e.prototype;
      return !!(s && s.isReactComponent);
    }
    function q(e, s, a) {
      if (e == null)
        return "";
      if (typeof e == "function")
        return me(e, Ge(e));
      if (typeof e == "string")
        return V(e);
      switch (e) {
        case w:
          return V("Suspense");
        case y:
          return V("SuspenseList");
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case f:
            return ze(e.render);
          case R:
            return q(e.type, s, a);
          case O: {
            var l = e, m = l._payload, g = l._init;
            try {
              return q(g(m), s, a);
            } catch {
            }
          }
        }
      return "";
    }
    var W = Object.prototype.hasOwnProperty, ge = {}, ye = j.ReactDebugCurrentFrame;
    function J(e) {
      if (e) {
        var s = e._owner, a = q(e.type, e._source, s ? s.type : null);
        ye.setExtraStackFrame(a);
      } else
        ye.setExtraStackFrame(null);
    }
    function He(e, s, a, l, m) {
      {
        var g = Function.call.bind(W);
        for (var v in e)
          if (g(e, v)) {
            var p = void 0;
            try {
              if (typeof e[v] != "function") {
                var _ = Error((l || "React class") + ": " + a + " type `" + v + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof e[v] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                throw _.name = "Invariant Violation", _;
              }
              p = e[v](s, v, l, a, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
            } catch (x) {
              p = x;
            }
            p && !(p instanceof Error) && (J(m), T("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", l || "React class", a, v, typeof p), J(null)), p instanceof Error && !(p.message in ge) && (ge[p.message] = !0, J(m), T("Failed %s type: %s", a, p.message), J(null));
          }
      }
    }
    var Xe = Array.isArray;
    function Z(e) {
      return Xe(e);
    }
    function Ze(e) {
      {
        var s = typeof Symbol == "function" && Symbol.toStringTag, a = s && e[Symbol.toStringTag] || e.constructor.name || "Object";
        return a;
      }
    }
    function Qe(e) {
      try {
        return we(e), !1;
      } catch {
        return !0;
      }
    }
    function we(e) {
      return "" + e;
    }
    function be(e) {
      if (Qe(e))
        return T("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", Ze(e)), we(e);
    }
    var $ = j.ReactCurrentOwner, et = {
      key: !0,
      ref: !0,
      __self: !0,
      __source: !0
    }, xe, Ee, Q;
    Q = {};
    function tt(e) {
      if (W.call(e, "ref")) {
        var s = Object.getOwnPropertyDescriptor(e, "ref").get;
        if (s && s.isReactWarning)
          return !1;
      }
      return e.ref !== void 0;
    }
    function rt(e) {
      if (W.call(e, "key")) {
        var s = Object.getOwnPropertyDescriptor(e, "key").get;
        if (s && s.isReactWarning)
          return !1;
      }
      return e.key !== void 0;
    }
    function nt(e, s) {
      if (typeof e.ref == "string" && $.current && s && $.current.stateNode !== s) {
        var a = k($.current.type);
        Q[a] || (T('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', k($.current.type), e.ref), Q[a] = !0);
      }
    }
    function st(e, s) {
      {
        var a = function() {
          xe || (xe = !0, T("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", s));
        };
        a.isReactWarning = !0, Object.defineProperty(e, "key", {
          get: a,
          configurable: !0
        });
      }
    }
    function at(e, s) {
      {
        var a = function() {
          Ee || (Ee = !0, T("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", s));
        };
        a.isReactWarning = !0, Object.defineProperty(e, "ref", {
          get: a,
          configurable: !0
        });
      }
    }
    var it = function(e, s, a, l, m, g, v) {
      var p = {
        // This tag allows us to uniquely identify this as a React Element
        $$typeof: t,
        // Built-in properties that belong on the element
        type: e,
        key: s,
        ref: a,
        props: v,
        // Record the component responsible for creating this element.
        _owner: g
      };
      return p._store = {}, Object.defineProperty(p._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: !1
      }), Object.defineProperty(p, "_self", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: l
      }), Object.defineProperty(p, "_source", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: m
      }), Object.freeze && (Object.freeze(p.props), Object.freeze(p)), p;
    };
    function ot(e, s, a, l, m) {
      {
        var g, v = {}, p = null, _ = null;
        a !== void 0 && (be(a), p = "" + a), rt(s) && (be(s.key), p = "" + s.key), tt(s) && (_ = s.ref, nt(s, m));
        for (g in s)
          W.call(s, g) && !et.hasOwnProperty(g) && (v[g] = s[g]);
        if (e && e.defaultProps) {
          var x = e.defaultProps;
          for (g in x)
            v[g] === void 0 && (v[g] = x[g]);
        }
        if (p || _) {
          var E = typeof e == "function" ? e.displayName || e.name || "Unknown" : e;
          p && st(v, E), _ && at(v, E);
        }
        return it(e, p, _, m, l, $.current, v);
      }
    }
    var ee = j.ReactCurrentOwner, Re = j.ReactDebugCurrentFrame;
    function N(e) {
      if (e) {
        var s = e._owner, a = q(e.type, e._source, s ? s.type : null);
        Re.setExtraStackFrame(a);
      } else
        Re.setExtraStackFrame(null);
    }
    var te;
    te = !1;
    function re(e) {
      return typeof e == "object" && e !== null && e.$$typeof === t;
    }
    function Te() {
      {
        if (ee.current) {
          var e = k(ee.current.type);
          if (e)
            return `

Check the render method of \`` + e + "`.";
        }
        return "";
      }
    }
    function ct(e) {
      {
        if (e !== void 0) {
          var s = e.fileName.replace(/^.*[\\\/]/, ""), a = e.lineNumber;
          return `

Check your code at ` + s + ":" + a + ".";
        }
        return "";
      }
    }
    var _e = {};
    function lt(e) {
      {
        var s = Te();
        if (!s) {
          var a = typeof e == "string" ? e : e.displayName || e.name;
          a && (s = `

Check the top-level render call using <` + a + ">.");
        }
        return s;
      }
    }
    function Se(e, s) {
      {
        if (!e._store || e._store.validated || e.key != null)
          return;
        e._store.validated = !0;
        var a = lt(s);
        if (_e[a])
          return;
        _e[a] = !0;
        var l = "";
        e && e._owner && e._owner !== ee.current && (l = " It was passed a child from " + k(e._owner.type) + "."), N(e), T('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', a, l), N(null);
      }
    }
    function Ce(e, s) {
      {
        if (typeof e != "object")
          return;
        if (Z(e))
          for (var a = 0; a < e.length; a++) {
            var l = e[a];
            re(l) && Se(l, s);
          }
        else if (re(e))
          e._store && (e._store.validated = !0);
        else if (e) {
          var m = Fe(e);
          if (typeof m == "function" && m !== e.entries)
            for (var g = m.call(e), v; !(v = g.next()).done; )
              re(v.value) && Se(v.value, s);
        }
      }
    }
    function ut(e) {
      {
        var s = e.type;
        if (s == null || typeof s == "string")
          return;
        var a;
        if (typeof s == "function")
          a = s.propTypes;
        else if (typeof s == "object" && (s.$$typeof === f || // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.
        s.$$typeof === R))
          a = s.propTypes;
        else
          return;
        if (a) {
          var l = k(s);
          He(a, e.props, "prop", l, e);
        } else if (s.PropTypes !== void 0 && !te) {
          te = !0;
          var m = k(s);
          T("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", m || "Unknown");
        }
        typeof s.getDefaultProps == "function" && !s.getDefaultProps.isReactClassApproved && T("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
      }
    }
    function ft(e) {
      {
        for (var s = Object.keys(e.props), a = 0; a < s.length; a++) {
          var l = s[a];
          if (l !== "children" && l !== "key") {
            N(e), T("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", l), N(null);
            break;
          }
        }
        e.ref !== null && (N(e), T("Invalid attribute `ref` supplied to `React.Fragment`."), N(null));
      }
    }
    var ke = {};
    function Oe(e, s, a, l, m, g) {
      {
        var v = Ue(e);
        if (!v) {
          var p = "";
          (e === void 0 || typeof e == "object" && e !== null && Object.keys(e).length === 0) && (p += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.");
          var _ = ct(m);
          _ ? p += _ : p += Te();
          var x;
          e === null ? x = "null" : Z(e) ? x = "array" : e !== void 0 && e.$$typeof === t ? (x = "<" + (k(e.type) || "Unknown") + " />", p = " Did you accidentally export a JSX literal instead of a component?") : x = typeof e, T("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", x, p);
        }
        var E = ot(e, s, a, m, g);
        if (E == null)
          return E;
        if (v) {
          var C = s.children;
          if (C !== void 0)
            if (l)
              if (Z(C)) {
                for (var M = 0; M < C.length; M++)
                  Ce(C[M], e);
                Object.freeze && Object.freeze(C);
              } else
                T("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
            else
              Ce(C, e);
        }
        if (W.call(s, "key")) {
          var D = k(e), S = Object.keys(s).filter(function(gt) {
            return gt !== "key";
          }), ne = S.length > 0 ? "{key: someKey, " + S.join(": ..., ") + ": ...}" : "{key: someKey}";
          if (!ke[D + ne]) {
            var mt = S.length > 0 ? "{" + S.join(": ..., ") + ": ...}" : "{}";
            T(`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`, ne, D, mt, D), ke[D + ne] = !0;
          }
        }
        return e === n ? ft(E) : ut(E), E;
      }
    }
    function dt(e, s, a) {
      return Oe(e, s, a, !0);
    }
    function ht(e, s, a) {
      return Oe(e, s, a, !1);
    }
    var pt = ht, vt = dt;
    Y.Fragment = n, Y.jsx = pt, Y.jsxs = vt;
  }()), Y;
}
process.env.NODE_ENV === "production" ? se.exports = Mt() : se.exports = At();
var A = se.exports;
const Yt = ({ editor: u }) => {
  const t = bt(null);
  return Me(() => {
    if (!u || !t.current)
      return;
    const r = new Nt(t.current, u);
    return () => {
      r.destroy();
    };
  }, [u]), /* @__PURE__ */ A.jsx("div", { ref: t });
};
function Ft(u) {
  const t = [];
  function r(n, i) {
    n.type.name === "heading" && t.push({
      id: `${i.join("-")}-${n.attrs.level}`,
      level: n.attrs.level,
      text: n.content.map((d) => d.text).join("") || "Untitled Heading",
      path: i
    }), n.content.forEach((d, c) => {
      r(d, [...i, c]);
    });
  }
  return r(u, []), t;
}
function It(u) {
  const [t, r] = Ne([]);
  return Me(() => {
    if (!u)
      return;
    const n = () => {
      const d = Ft(u.state.doc);
      r(d);
    };
    n();
    const i = u.subscribe(n);
    return () => i();
  }, [u]), t;
}
const Kt = ({ editor: u }) => {
  const t = It(u);
  if (!u)
    return null;
  const r = (n) => {
    const i = F.createCursor(n, 0), d = u.createTransaction().setSelection(i);
    u.dispatch(d);
  };
  return /* @__PURE__ */ A.jsxs("div", { style: { padding: "1rem", border: "1px solid #eee", background: "#fcfcfc" }, children: [
    /* @__PURE__ */ A.jsx("h3", { style: { marginTop: 0 }, children: "Navigator" }),
    t.length === 0 && /* @__PURE__ */ A.jsx("p", { style: { color: "#999" }, children: "No headings yet." }),
    /* @__PURE__ */ A.jsx("ul", { children: t.map((n) => /* @__PURE__ */ A.jsx(
      "li",
      {
        onClick: () => r(n.path),
        style: { listStyle: "none", paddingLeft: `${(n.level - 1) * 20}px`, cursor: "pointer", marginBottom: "0.5rem" },
        children: n.text
      },
      n.id
    )) })
  ] });
};
export {
  St as A,
  z as E,
  Yt as F,
  Et as M,
  b as N,
  Tt as R,
  K as S,
  Ot as T,
  xt as a,
  Rt as b,
  _t as c,
  Ct as d,
  kt as e,
  Pt as f,
  F as g,
  Dt as h,
  jt as i,
  Nt as j,
  It as k,
  Kt as l,
  Lt as u
};
