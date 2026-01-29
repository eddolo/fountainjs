import React, { useRef } from 'react';

export default function App() {
  const editorRef = useRef<HTMLDivElement>(null);

  const insertContent = (type: string) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const p = document.createElement('p');
    
    switch(type) {
      case 'heading':
        p.innerHTML = '<h2>New Heading</h2>';
        break;
      case 'image':
        p.innerHTML = '<img src="https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400" alt="Design" style="max-width: 100%; border-radius: 8px; margin: 10px 0;" />';
        break;
      case 'table':
        p.innerHTML = '<table style="width:100%; border-collapse: collapse; margin: 10px 0;"><tr style="background: #f0f0f0;"><th style="border: 1px solid #ddd; padding: 8px;">Feature</th><th style="border: 1px solid #ddd; padding: 8px;">Included</th></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">Rich Text</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">Tables</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">Images</td><td style="border: 1px solid #ddd; padding: 8px;">✓</td></tr></table>';
        break;
      case 'list':
        p.innerHTML = '<ul style="margin: 10px 0;"><li>FountainJS is powerful</li><li>Easy to integrate</li><li>Production-ready</li></ul>';
        break;
      case 'quote':
        p.innerHTML = '<blockquote style="border-left: 4px solid #667eea; padding: 10px 15px; margin: 10px 0; background: #f5f5f5; font-style: italic;">Great design is invisible. It\'s when a product works so well, you don\'t think about it.</blockquote>';
        break;
      default:
        p.textContent = 'New content block';
    }
    
    editor.appendChild(p);
  };

  return (
    <div className="container">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Paolo Cappuccini</h1>
          <p className="subtitle">UX Designer & Full-Stack Developer</p>
          <p className="tagline">Crafting beautiful, functional digital experiences</p>
          <div className="hero-buttons">
            <button className="btn btn-primary">View My Work</button>
            <button className="btn btn-secondary">Get In Touch</button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="about">
        <div className="content-wrapper">
          <h2>About Me</h2>
          <p>
            With 8+ years of experience in UX/UI design and full-stack development, I craft digital products that users love. 
            My passion lies in creating seamless experiences where design and technology work together perfectly.
          </p>
          <p>
            I specialize in designing interfaces, building scalable systems, and mentoring teams to create products that matter.
          </p>
        </div>
      </section>

      {/* Skills Section */}
      <section className="skills">
        <div className="content-wrapper">
          <h2>Core Competencies</h2>
          <div className="skills-grid">
            <div className="skill-card">
              <h3>Design</h3>
              <ul>
                <li>UI/UX Design</li>
                <li>Figma & Design Systems</li>
                <li>User Research</li>
                <li>Wireframing & Prototyping</li>
              </ul>
            </div>
            <div className="skill-card">
              <h3>Frontend</h3>
              <ul>
                <li>React & TypeScript</li>
                <li>Modern CSS & Animations</li>
                <li>Responsive Design</li>
                <li>Web Performance</li>
              </ul>
            </div>
            <div className="skill-card">
              <h3>Backend</h3>
              <ul>
                <li>Node.js & Express</li>
                <li>Databases (SQL/NoSQL)</li>
                <li>REST & GraphQL APIs</li>
                <li>System Design</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Editor Demo Section */}
      <section className="editor-demo">
        <div className="content-wrapper">
          <h2>FountainJS Editor Demo</h2>
          <p className="demo-description">
            Below is a live demonstration of FountainJS - the rich-text editor library I've been building. 
            Click the buttons to insert different content types and see how it handles complex content.
          </p>
          
          <div className="editor-toolbar">
            <button onClick={() => insertContent('heading')} className="toolbar-btn" title="Add Heading">
              <span>H2</span>
            </button>
            <button onClick={() => insertContent('image')} className="toolbar-btn" title="Add Image">
              <span>🖼️</span>
            </button>
            <button onClick={() => insertContent('table')} className="toolbar-btn" title="Add Table">
              <span>📊</span>
            </button>
            <button onClick={() => insertContent('list')} className="toolbar-btn" title="Add List">
              <span>📝</span>
            </button>
            <button onClick={() => insertContent('quote')} className="toolbar-btn" title="Add Quote">
              <span>💬</span>
            </button>
          </div>

          <div className="editor-container">
            <div ref={editorRef} className="editor" contentEditable>
              <p><strong>Welcome to FountainJS!</strong> This is a powerful rich-text editor. Click the buttons above to insert different content types.</p>
              <p style={{marginTop: '20px', fontSize: '14px', color: '#666', fontStyle: 'italic'}}>
                💡 <strong>Pro Tips:</strong> You can edit any content directly. FountainJS supports headings, images, tables, lists, formatting, and more!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section className="projects">
        <div className="content-wrapper">
          <h2>Featured Projects</h2>
          <div className="projects-grid">
            <div className="project-card">
              <div className="project-image" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}></div>
              <h3>E-Commerce Platform</h3>
              <p>Full-stack marketplace with 50K+ monthly users</p>
              <div className="project-tags">
                <span>React</span>
                <span>Node.js</span>
                <span>PostgreSQL</span>
              </div>
            </div>

            <div className="project-card">
              <div className="project-image" style={{background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'}}></div>
              <h3>Mobile App Design</h3>
              <p>Award-winning fitness tracking app with 100K downloads</p>
              <div className="project-tags">
                <span>Figma</span>
                <span>User Research</span>
                <span>iOS/Android</span>
              </div>
            </div>

            <div className="project-card">
              <div className="project-image" style={{background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'}}></div>
              <h3>Design System</h3>
              <p>Component library serving 3+ enterprise products</p>
              <div className="project-tags">
                <span>Design Tokens</span>
                <span>Storybook</span>
                <span>Documentation</span>
              </div>
            </div>

            <div className="project-card">
              <div className="project-image" style={{background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'}}></div>
              <h3>Analytics Dashboard</h3>
              <p>Real-time data visualization for 200+ businesses</p>
              <div className="project-tags">
                <span>D3.js</span>
                <span>WebSockets</span>
                <span>Performance</span>
              </div>
            </div>

            <div className="project-card">
              <div className="project-image" style={{background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'}}></div>
              <h3>Authentication System</h3>
              <p>Secure OAuth2 implementation for SaaS products</p>
              <div className="project-tags">
                <span>Security</span>
                <span>JWT</span>
                <span>Microservices</span>
              </div>
            </div>

            <div className="project-card">
              <div className="project-image" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}></div>
              <h3>FountainJS Editor</h3>
              <p>Open-source rich-text editor library for React</p>
              <div className="project-tags">
                <span>TypeScript</span>
                <span>Open Source</span>
                <span>Production</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="contact">
        <div className="content-wrapper">
          <h2>Let's Work Together</h2>
          <p>I'm always interested in hearing about new projects and opportunities.</p>
          
          <div className="contact-grid">
            <a href="mailto:paolo@example.com" className="contact-card">
              <div className="contact-icon">✉️</div>
              <h3>Email</h3>
              <p>paolo@example.com</p>
            </a>
            
            <a href="https://linkedin.com" className="contact-card">
              <div className="contact-icon">💼</div>
              <h3>LinkedIn</h3>
              <p>linkedin.com/in/paolo</p>
            </a>
            
            <a href="https://github.com" className="contact-card">
              <div className="contact-icon">🐙</div>
              <h3>GitHub</h3>
              <p>github.com/paolo</p>
            </a>
            
            <a href="https://twitter.com" className="contact-card">
              <div className="contact-icon">𝕏</div>
              <h3>Twitter</h3>
              <p>@paolodesigns</p>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="content-wrapper">
          <p>&copy; 2024 Paolo Cappuccini. All rights reserved.</p>
          <p>Showcasing <strong>FountainJS</strong> - The Production-Ready Rich-Text Editor</p>
        </div>
      </footer>
    </div>
  );
}
