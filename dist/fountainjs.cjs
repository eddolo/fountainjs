"use strict";var H=Object.defineProperty;var D=(o,t,e)=>t in o?H(o,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):o[t]=e;var p=(o,t,e)=>(D(o,typeof t!="symbol"?t+"":t,e),e);Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const a=require("./index-cafd8e26.cjs");require("react");class g{constructor(t,e){p(this,"type");p(this,"attrs");this.type=t,this.attrs=e}static fromJSON(t,e){const n=t.marks[e.type];if(!n)throw new Error(`Unknown mark type: ${e.type}`);return new g(n,{...e.attrs})}}class I extends a.Step{constructor(t,e,n){super(),this.path=t,this.offset=e,this.text=n}apply(t){let e=t,n=[];for(const c of this.path)n.push(e),e=e.content[c];if(!e||!e.isText)throw new Error("Target for InsertTextStep is not a text node.");let i=e.withText((e.text||"").slice(0,this.offset)+this.text+(e.text||"").slice(this.offset));for(let c=n.length-1;c>=0;c--){const m=n[c],h=[...m.content];h[this.path[c]]=i,i=new a.Node(m.type,m.attrs,h,m.text,m.marks)}return i}}class f{constructor(t){p(this,"spec");this.spec=t}}class A{highlightCode(t,e){const n=this.escapeHtml(t);return`<pre><code class="language-${e}">${n}</code></pre>`}escapeHtml(t){const e={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};return t.replace(/[&<>"']/g,n=>e[n])}nodeToHtml(t){switch(t.type.name){case"doc":return t.content.map(s=>this.nodeToHtml(s)).join(`
`);case"heading":const e=t.attrs.level||1,n=t.content.map(s=>this.nodeToHtml(s)).join("");return`<h${e}>${n}</h${e}>`;case"paragraph":return`<p>${t.content.map(s=>this.nodeToHtml(s)).join("")}</p>`;case"text":let i=t.text||"";return t.marks&&(t.marks.some(s=>s.type==="strong")&&(i=`<strong>${i}</strong>`),t.marks.some(s=>s.type==="em")&&(i=`<em>${i}</em>`)),i;case"code-block":const c=t.content.map(s=>s.text||"").join(`
`),m=t.attrs.language||"javascript";return this.highlightCode(c,m);case"bullet-list":return`<ul>${t.content.map(s=>this.nodeToHtml(s)).join("")}</ul>`;case"list-item":return`<li>${t.content.map(s=>this.nodeToHtml(s)).join("")}</li>`;case"table":return`<table><tbody>${t.content.map(s=>this.nodeToHtml(s)).join("")}</tbody></table>`;case"table-row":return`<tr>${t.content.map(s=>this.nodeToHtml(s)).join("")}</tr>`;case"table-cell":return`<td>${t.content.map(s=>this.nodeToHtml(s)).join("")}</td>`;case"image":return`<img src="${t.attrs.src}" alt="${t.attrs.alt||""}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;" />`;default:return""}}export(t){return`<!DOCTYPE html>
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
</html>`}}class L{nodeToMarkdown(t,e=0){const n="  ".repeat(e);switch(t.type.name){case"doc":return t.content.map(l=>this.nodeToMarkdown(l,e)).join(`

`);case"heading":const r=t.attrs.level||1,i=t.content.map(l=>this.nodeToMarkdown(l,e)).join("");return`${"#".repeat(r)} ${i}`;case"paragraph":return t.content.map(l=>this.nodeToMarkdown(l,e)).join("");case"text":let c=t.text||"";return t.marks&&(t.marks.some(l=>l.type==="strong")&&(c=`**${c}**`),t.marks.some(l=>l.type==="em")&&(c=`*${c}*`)),c;case"code-block":const m=t.content.map(l=>l.text||"").join(`
`);return`\`\`\`${t.attrs.language||""}
${m}
\`\`\``;case"bullet-list":return t.content.map(l=>{const u=this.nodeToMarkdown(l,e+1);return`${n}- ${u}`}).join(`
`);case"list-item":return t.content.map(l=>this.nodeToMarkdown(l,e)).join("");case"table":let d="";return t.content.forEach((l,u)=>{const s=l.content.map(O=>this.nodeToMarkdown(O,e)).join(" | ");d+=`| ${s} |
`,u===0&&(d+=`| ${s.split(" | ").map(()=>"---").join(" | ")} |
`)}),d;case"table-cell":return t.content.map(l=>this.nodeToMarkdown(l,e)).join("");case"image":return`![${t.attrs.alt||"image"}](${t.attrs.src})`;default:return""}}export(t){return this.nodeToMarkdown(t.doc)}}class R{nodeToJSON(t){const e={type:t.type.name};return t.attrs&&Object.keys(t.attrs).length>0&&(e.attrs=t.attrs),t.text&&(e.text=t.text),t.marks&&t.marks.length>0&&(e.marks=t.marks.map(n=>({type:n.type,attrs:n.attrs}))),t.content&&t.content.length>0&&(e.content=t.content.map(n=>this.nodeToJSON(n))),e}export(t){const e=this.nodeToJSON(t.doc);return JSON.stringify(e,null,2)}static import(t){return JSON.parse(t)}}const b={content:"block+",toDOM(){return["div",0]}},w={content:"inline*",group:"block",toDOM(){return["p",0]}},y={group:"inline"},x={attrs:{level:{default:1}},content:"inline*",group:"block",toDOM(o){return[`h${o.attrs.level}`,0]}};class _{constructor(t,e,n){p(this,"dom");p(this,"contentDOM");p(this,"img");p(this,"getPos");p(this,"onResizeStart",t=>{t.preventDefault();const e=t.clientX,n=this.dom.offsetWidth,r=c=>{const m=n+(c.clientX-e);this.dom.style.width=`${m}px`},i=()=>{window.removeEventListener("mousemove",r),window.removeEventListener("mouseup",i);const c=this.getPos();if(c===void 0)return;const m={...this.node.attrs,width:this.dom.style.width},h=[c],d=this.view.editor.createTransaction().setNodeAttrs(h,m);this.view.editor.dispatch(d)};window.addEventListener("mousemove",r),window.addEventListener("mouseup",i)});this.node=t,this.view=e,this.getPos=n,this.dom=document.createElement("figure"),this.dom.style.position="relative",this.dom.style.margin="1rem 0",this.dom.style.display="inline-block",this.img=document.createElement("img"),this.updateImageAttributes(t.attrs),this.contentDOM=document.createElement("div");const r=document.createElement("div");r.style.position="absolute",r.style.bottom="5px",r.style.right="5px",r.style.width="10px",r.style.height="10px",r.style.backgroundColor="#007bff",r.style.cursor="nwse-resize",r.style.border="1px solid white",this.dom.appendChild(this.img),this.dom.appendChild(this.contentDOM),this.dom.appendChild(r),r.addEventListener("mousedown",this.onResizeStart)}update(t){return t.type!==this.node.type?!1:(this.updateImageAttributes(t.attrs),this.node=t,!0)}updateImageAttributes(t){this.img.src=t.src,this.img.alt=t.alt,this.img.title=t.title,this.dom.style.width=t.width,this.img.style.width="100%"}}const S={group:"block",content:"figcaption?",attrs:{src:{default:""},alt:{default:""},title:{default:""},width:{default:"100%"}},toDOM:o=>{const{src:t,alt:e,title:n,width:r}=o.attrs;return["figure",{style:`width: ${r};`},["img",{src:t,alt:e,title:n}],0]},nodeView:_},k={content:"inline*",toDOM:()=>["figcaption",{style:"text-align: center; color: #666; font-style: italic;"},0]},j={group:"block",content:"table_row+",toDOM(){return["table",{style:"border-collapse: collapse; width: 100%;"},["tbody",0]]}},T={content:"table_cell+",toDOM(){return["tr",0]}},v={content:"paragraph+",attrs:{colspan:{default:1},rowspan:{default:1}},toDOM(o){return["td",{style:"border: 1px solid #ddd; padding: 8px;",...o.attrs},0]}},M={group:"block",content:"list_item+",toDOM(){return["ul",0]}},$={content:"paragraph+ (bullet_list)?",toDOM(){return["li",0]}},U={name:"code-block",group:"block",atom:!1,code:!0,attrs:{language:{default:"javascript"},lineNumbers:{default:!1}},parseDOM:[{tag:"pre",preserveWhitespace:"full",getAttrs(o){return{language:o.getAttribute("data-language")||"javascript",lineNumbers:o.getAttribute("data-line-numbers")==="true"}}}],toDOM(){return["pre",{"data-language":this.attrs.language,"data-line-numbers":this.attrs.lineNumbers?"true":"false",class:`language-${this.attrs.language}`},["code",0]]}},C={...U,isInline:!1},E={toDOM(){return["strong",0]}},P={toDOM(){return["em",0]}},z=100;function F(){return{done:[],undone:[]}}const J=new f({state:{init:F,apply:(o,t)=>{if(o.steps.length>0){const e=[...t.done,o];return e.length>z&&e.shift(),{done:e,undone:[]}}return t}}});function W(o){return console.log("Undo command called (not implemented)"),!1}function B(o){return console.log("Redo command called (not implemented)"),!1}const V=new f({});class X{constructor(t={}){p(this,"config");p(this,"languageMap",{js:"javascript",ts:"typescript",py:"python",rb:"ruby",go:"go",rs:"rust",java:"java",cpp:"cpp",c:"c",cs:"csharp",php:"php",swift:"swift",kotlin:"kotlin",sql:"sql",html:"html",css:"css",json:"json",xml:"xml",yaml:"yaml",yml:"yaml",bash:"bash",sh:"bash",r:"r",matlab:"matlab",scala:"scala"});this.config={theme:"default",lineNumbers:!0,...t}}highlight(t,e){const n=this.normalizeLanguage(e),r=`hljs-${this.config.theme}`;let i=t;return this.config.lineNumbers&&(i=this.addLineNumbers(t)),i=this.escapeHtml(i),`<pre class="${r}"><code class="language-${n} hljs">${i}</code></pre>`}generateCSS(){return`
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
    `}normalizeLanguage(t){const e=t.toLowerCase();return this.languageMap[e]||e}addLineNumbers(t){return t.split(`
`).map((n,r)=>`<span class="line-number">${r+1}</span>${n}`).join(`
`)}escapeHtml(t){const e={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};return t.replace(/[&<>"']/g,n=>e[n])}}class Y{constructor(t){p(this,"highlighter");this.highlighter=new X(t)}getHighlighter(){return this.highlighter}getCSS(){return this.highlighter.generateCSS()}}class G{constructor(t){p(this,"mcpServerUrl");p(this,"tools",[]);this.mcpServerUrl=t,this.registerDefaultTools()}registerDefaultTools(){this.tools=[{name:"generate_content",description:"Generate new content in specified format",inputSchema:{type:"object",properties:{prompt:{type:"string",description:"What to generate"},format:{type:"string",enum:["markdown","html","json","fountain"],description:"Output format"},language:{type:"string",description:"Programming language (if code)"}},required:["prompt","format"]}},{name:"improve_content",description:"Improve existing content",inputSchema:{type:"object",properties:{content:{type:"string",description:"Content to improve"},aspect:{type:"string",enum:["clarity","grammar","tone","structure"],description:"What to improve"}},required:["content","aspect"]}},{name:"transform_format",description:"Transform content between formats",inputSchema:{type:"object",properties:{content:{type:"string",description:"Content to transform"},fromFormat:{type:"string",enum:["markdown","html","json","fountain","text"]},toFormat:{type:"string",enum:["markdown","html","json","fountain"]}},required:["content","fromFormat","toFormat"]}}]}async connectToMCPServer(t){this.mcpServerUrl=t,console.log(`Connected to MCP server: ${t}`)}registerTool(t){this.tools.push(t)}getAvailableTools(){return this.tools}async transformContent(t){if(!this.mcpServerUrl)throw new Error("MCP server not configured. Call connectToMCPServer() first.");const e=this.buildSystemPrompt(t),r={content:this.buildUserPrompt(t),systemPrompt:e,tools:this.tools},i=await this.sendToMCP(r);return this.extractContent(i)}buildSystemPrompt(t){return`You are a helpful content transformation AI.
The user has content in ${t.contentType} format.
Help them ${t.operation} their content.
${t.language?`Programming language: ${t.language}`:""}
${t.context?`Context: ${t.context}`:""}`}buildUserPrompt(t){switch(t.operation){case"generate":return`Generate new content: ${t.content}`;case"improve":return`Improve this content:
${t.content}`;case"transform":return`Transform this content to a better format:
${t.content}`;case"summarize":return`Summarize this content:
${t.content}`;case"expand":return`Expand on this content:
${t.content}`;default:return t.content}}async sendToMCP(t){if(!this.mcpServerUrl)throw new Error("MCP server URL not set");try{const e=await fetch(`${this.mcpServerUrl}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!e.ok)throw new Error(`MCP server error: ${e.statusText}`);return await e.json()}catch(e){throw console.error("MCP request failed:",e),e}}extractContent(t){return t.content.filter(n=>n.type==="text").map(n=>n.text||"").join(`
`)}}async function q(o,t,e="markdown"){const n={content:o,contentType:e,operation:"generate"};return t.transformContent(n)}const K={nodes:{doc:b,paragraph:w,text:y,heading:x,image_super:S,figcaption:k,table:j,table_row:T,table_cell:v,bullet_list:M,list_item:$,code_block:C},marks:{strong:E,em:P}};exports.AddMarkStep=a.AddMarkStep;exports.Editor=a.Editor;exports.EditorState=a.EditorState;exports.EditorView=a.EditorView;exports.FountainEditor=a.FountainEditor;exports.MarkType=a.MarkType;exports.Navigator=a.Navigator;exports.Node=a.Node;exports.NodeType=a.NodeType;exports.RemoveMarkStep=a.RemoveMarkStep;exports.ReplaceStep=a.ReplaceStep;exports.ReplaceTextStep=a.ReplaceTextStep;exports.Schema=a.Schema;exports.Selection=a.Selection;exports.SetNodeAttrsStep=a.SetNodeAttrsStep;exports.Step=a.Step;exports.Transaction=a.Transaction;exports.Transform=a.Transform;exports.createEditor=a.createEditor;exports.useFountain=a.useFountain;exports.useNavigatorState=a.useNavigatorState;exports.CoreSchemaSpec=K;exports.HTMLExporter=A;exports.InsertTextStep=I;exports.JSONExporter=R;exports.MCPIntegration=G;exports.Mark=g;exports.MarkdownExporter=L;exports.Plugin=f;exports.SyntaxHighlightPlugin=Y;exports.bulletList=M;exports.codeBlock=C;exports.doc=b;exports.em=P;exports.figcaption=k;exports.generateContentWithAI=q;exports.heading=x;exports.historyPlugin=J;exports.imageSuper=S;exports.listItem=$;exports.markdownShortcutsPlugin=V;exports.paragraph=w;exports.redo=B;exports.strong=E;exports.table=j;exports.tableCell=v;exports.tableRow=T;exports.text=y;exports.undo=W;
