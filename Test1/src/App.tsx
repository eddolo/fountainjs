import React, { useRef, useState } from 'react';

export default function App() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);

  const insertContent = (type: string) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const p = document.createElement('p');
    
    switch(type) {
      case 'heading':
        p.innerHTML = '<h2>New Heading</h2>';
        break;
      case 'code':
        p.innerHTML = '<pre><code class="language-javascript">const fountain = require("fountainjs-editor");\nconst editor = fountain.useFountain({ /* config */ });</code></pre>';
        break;
      case 'image':
        p.innerHTML = '<img src="https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400" alt="Design" style="max-width: 100%; border-radius: 8px; margin: 10px 0;" />';
        break;
      case 'table':
        p.innerHTML = '<table style="width:100%; border-collapse: collapse; margin: 10px 0;"><tr style="background: #f0f0f0;"><th style="border: 1px solid #ddd; padding: 8px;">Feature</th><th style="border: 1px solid #ddd; padding: 8px;">v0.1</th><th style="border: 1px solid #ddd; padding: 8px;">v0.2</th></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">Rich Text</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">Code Blocks</td><td style="border: 1px solid #ddd; padding: 8px;">✗</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">Multi-Format Export</td><td style="border: 1px solid #ddd; padding: 8px;">✗</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">AI Integration (MCP)</td><td style="border: 1px solid #ddd; padding: 8px;">✗</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr></table>';
        break;
      case 'list':
        p.innerHTML = '<ul style="margin: 10px 0;"><li>✓ Code highlighting (150+ languages)</li><li>✓ Export to HTML, Markdown, JSON</li><li>✓ AI-agnostic MCP integration</li><li>✓ Syntax highlighting plugin</li><li>✓ Production-ready</li></ul>';
        break;
      case 'quote':
        p.innerHTML = '<blockquote style="border-left: 4px solid #667eea; padding: 10px 15px; margin: 10px 0; background: #f5f5f5; font-style: italic;">"FountainJS is the universal editor for every format, every AI, every language."</blockquote>';
        break;
      default:
        p.textContent = 'New content block';
    }
    
    editor.appendChild(p);
  };

  const exportContent = (format: 'html' | 'markdown' | 'json') => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    let output = '';
    
    switch(format) {
      case 'html':
        output = `<!DOCTYPE html>\n<html>\n<head>\n<title>Exported Content</title>\n</head>\n<body>\n${html}\n</body>\n</html>`;
        break;
      case 'markdown':
        output = `# Exported Markdown\n\n${html}\n\n*Exported from FountainJS Editor*`;
        break;
      case 'json':
        output = JSON.stringify({ content: html, timestamp: new Date().toISOString() }, null, 2);
        break;
    }
    
    const blob = new Blob([output], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content.${format === 'markdown' ? 'md' : format}`;
    a.click();
  };

  return (
    <div className="container">
      <header className="header">
        <nav className="navbar">
          <div className="logo">FountainJS v0.2.0</div>
          <ul className="nav-links">
            <li><a href="#about">About</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#editor">Editor</a></li>
            <li><a href="#ai">AI Integration</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </nav>

        <section className="hero">
          <h1>FountainJS Editor v0.2.0</h1>
          <p>The Universal Rich-Text Editor • Code Blocks • Multi-Format Export • AI-Agnostic</p>
          <button className="cta-button" onClick={() => document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' })}>Try Editor Now</button>
        </section>
      </header>

      <section className="about" id="about">
        <div className="content">
          <h2>What is FountainJS?</h2>
          <p>
            FountainJS is a universal, production-ready rich-text editor built with TypeScript. 
            Created by Paolo Cappuccini, it's designed to work with any format, any AI service, 
            and any programming language through the Model Context Protocol (MCP).
          </p>
          <p style={{ marginTop: '15px', color: '#666' }}>
            v0.2.0 introduces code blocks with 150+ language support, multi-format export (HTML, Markdown, JSON), 
            and AI-agnostic MCP integration.
          </p>
        </div>
      </section>

      <section className="features" id="features">
        <h2>v0.2.0 Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>💻 Code Blocks</h3>
            <p>150+ programming languages with syntax highlighting. JavaScript, Python, TypeScript, Java, Go, Rust, and more.</p>
          </div>
          <div className="feature-card">
            <h3>📤 Multi-Format Export</h3>
            <p>Export to HTML, Markdown, JSON, or Fountain format. Use with static sites, APIs, or databases.</p>
          </div>
          <div className="feature-card">
            <h3>🤖 AI-Agnostic MCP</h3>
            <p>Model Context Protocol integration works with OpenAI, Claude, Gemini, or any MCP-compatible AI.</p>
          </div>
          <div className="feature-card">
            <h3>✨ Rich Text</h3>
            <p>Full formatting support: bold, italic, headings, lists, tables, images, quotes, and more.</p>
          </div>
          <div className="feature-card">
            <h3>⌨️ Keyboard Shortcuts</h3>
            <p>Ctrl+B for bold, Ctrl+I for italic, Ctrl+Z for undo. Familiar to all users.</p>
          </div>
          <div className="feature-card">
            <h3>⚡ Production Ready</h3>
            <p>19.67 KB gzipped core. npm package with TypeScript definitions and React hooks.</p>
          </div>
        </div>
      </section>

      <section className="editor-demo" id="editor">
        <h2>Live Editor Demo</h2>
        <p style={{ marginBottom: '15px', color: '#666' }}>Click buttons to add content blocks. Try Ctrl+B for bold, Ctrl+I for italic!</p>
        <div className="editor-toolbar">
          <button onClick={() => insertContent('heading')} title="Add heading">+ Heading</button>
          <button onClick={() => insertContent('code')} title="Add code block">+ Code Block</button>
          <button onClick={() => insertContent('image')} title="Add image">+ Image</button>
          <button onClick={() => insertContent('table')} title="Add comparison table">+ Table</button>
          <button onClick={() => insertContent('list')} title="Add feature list">+ List</button>
          <button onClick={() => insertContent('quote')} title="Add quote">+ Quote</button>
          <button className="export-btn" onClick={() => setShowExportOptions(!showExportOptions)}>
            📥 Export
          </button>
        </div>

        {showExportOptions && (
          <div className="export-menu">
            <button onClick={() => { exportContent('html'); setShowExportOptions(false); }}>📄 Export as HTML</button>
            <button onClick={() => { exportContent('markdown'); setShowExportOptions(false); }}>📝 Export as Markdown</button>
            <button onClick={() => { exportContent('json'); setShowExportOptions(false); }}>🔧 Export as JSON</button>
          </div>
        )}

        <div className="editor" ref={editorRef} contentEditable suppressContentEditableWarning>
          <h1>Welcome to FountainJS Editor v0.2.0</h1>
          <p>This is a <strong>universal, AI-agnostic rich-text editor</strong>. Add content blocks using the buttons above.</p>
          <p>Features:</p>
          <ul style={{ margin: '10px 0' }}>
            <li>✓ Code blocks with syntax highlighting</li>
            <li>✓ Export to HTML, Markdown, JSON formats</li>
            <li>✓ Integration with any AI via MCP</li>
            <li>✓ Full text formatting support</li>
          </ul>
          <p style={{ marginTop: '15px' }}>Try adding code blocks, tables, or exporting your content in different formats!</p>
        </div>
      </section>

      <section className="ai-integration" id="ai">
        <h2>AI Integration via MCP</h2>
        <div className="content">
          <h3>Why MCP? Why AI-Agnostic?</h3>
          <p>
            The Model Context Protocol (MCP) is a universal standard for AI integrations. 
            Instead of building FountainJS for one specific AI, we built it to work with ANY AI service.
          </p>
          <h3>Supported AI Services:</h3>
          <div className="ai-list">
            <div className="ai-item">
              <strong>OpenAI (ChatGPT)</strong>
              <p>Integrate with GPT-4, GPT-3.5, and other models via MCP</p>
            </div>
            <div className="ai-item">
              <strong>Anthropic (Claude)</strong>
              <p>Full support for Claude 3, Claude 2, and native protocol</p>
            </div>
            <div className="ai-item">
              <strong>Google Gemini</strong>
              <p>Connect to Gemini Pro and other Google AI models</p>
            </div>
            <div className="ai-item">
              <strong>Open Source LLMs</strong>
              <p>Llama, Mistral, Phi, and any MCP-compatible model</p>
            </div>
          </div>
          <h3>Example Use Cases:</h3>
          <ul style={{ margin: '15px 0' }}>
            <li>📝 Write blog posts using your favorite AI editor</li>
            <li>💻 Generate code and insert directly into documents</li>
            <li>✏️ Get AI-powered editing suggestions</li>
            <li>🔄 Transform content between formats</li>
            <li>🤖 Build AI workflows with rich document editing</li>
          </ul>
        </div>
      </section>

      <section className="projects">
        <h2>How It Works</h2>
        <div className="projects-grid">
          <div className="project-card">
            <h3>1. Rich Editing</h3>
            <p>Start with FountainJS editor for beautiful, rich-text content with support for code, tables, images, and more.</p>
          </div>
          <div className="project-card">
            <h3>2. Multi-Format Export</h3>
            <p>Export your content to HTML (web), Markdown (docs), JSON (APIs), or Fountain (screenplay format).</p>
          </div>
          <div className="project-card">
            <h3>3. AI Integration</h3>
            <p>Connect to any AI via MCP. The editor can receive suggestions, generate content, or transform text.</p>
          </div>
          <div className="project-card">
            <h3>4. Deploy Anywhere</h3>
            <p>Use HTML exports on static sites, JSON in APIs, Markdown in docs, or Fountain for screenplays.</p>
          </div>
        </div>
      </section>

      <section className="getting-started">
        <h2>Getting Started</h2>
        <div className="code-block">
          <pre><code>{`npm install fountainjs-editor

import { Editor, useFountain } from 'fountainjs-editor';
import { HTMLExporter, MarkdownExporter, MCPIntegration } from 'fountainjs-editor';

// Use editor
const editor = useFountain({ plugins: ['syntax-highlight'] });

// Export content
const html = HTMLExporter.export(editor.state);
const markdown = MarkdownExporter.export(editor.state);

// Connect to AI via MCP
const mcp = new MCPIntegration('https://mcp-server.example.com');
await mcp.connectToMCPServer();
await mcp.transformContent(editor.state, 'enhance-writing');`}</code></pre>
        </div>
        <p style={{ textAlign: 'center', marginTop: '20px', color: '#666' }}>
          📚 See full documentation: <a href="https://github.com/paolino/fountainjs" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>GitHub</a> | 
          📦 npm: <a href="https://www.npmjs.com/package/fountainjs-editor" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>fountainjs-editor</a>
        </p>
      </section>

      <section className="contact" id="contact">
        <h2>Built by Paolo Cappuccini</h2>
        <p>FountainJS is open-source and built for developers by developers. Questions or contributions?</p>
        <div className="contact-links">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a href="mailto:contact@example.com">Email</a>
        </div>
      </section>
    </div>
  );
}
