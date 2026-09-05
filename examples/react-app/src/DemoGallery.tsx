import { demoDefinitions } from './demo-definitions';
import { SitePageLink } from './SitePageLink';

const surfaces = [
  ['React', 'The optional React entry supplies hooks, composer, toolbar, navigator, and review UI.'],
  ['Plain DOM', 'Create an Editor and EditorView directly. No component framework is required.'],
  ['Web Component', 'Vue, Svelte, Angular, and plain HTML consume the same registered custom element.'],
  ['Portable JSON', 'Node.js, Python, Go, Java, and other services share data rather than frontend objects.'],
] as const;

function DemoGallery() {
  return (
    <main className="demos-site">
      <header className="site-header">
        <a className="brand" href="./" aria-label="FountainJS home"><span>F</span> FountainJS</a>
        <nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html" current>10 demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink><a className="site-section-link" href="#boundaries">Boundaries</a></nav>
        <a className="install-pill" href="https://www.npmjs.com/package/fountainjs-editor">npm i fountainjs-editor</a>
      </header>

      <section className="demos-hero">
        <p>TEN WORKING INTEGRATIONS</p>
        <h1>Different products.<br />Different stacks.<br /><em>One document core.</em></h1>
        <div className="demos-hero__foot"><span>Every card opens a dedicated interactive page built in this repository.</span><a href="#gallery">Explore all ten ↓</a></div>
      </section>

      <section className="demos-intro" id="gallery">
        <div><span>THE SHOWCASE</span><h2>Not ten reskins of one editor.</h2></div>
        <p>Each page starts from a different use case and integration boundary. React uses the React adapter. Plain DOM uses the framework-neutral view. Vue, Svelte, and Angular use the actual Custom Element. Backend examples exercise the portable document boundary and show the corresponding server contract.</p>
      </section>

      <section className="demo-grid" aria-label="FountainJS integration demos">
        {demoDefinitions.map((demo) => (
          <a className="demo-card" href={`./demos/${demo.slug}.html`} key={demo.slug} style={{ '--demo-accent': demo.accent } as React.CSSProperties}>
            <div className="demo-card__meta"><b>{String(demo.index).padStart(2, '0')}</b><span>{demo.host}</span></div>
            <h2>{demo.title}</h2>
            <p>{demo.summary}</p>
            <div className="demo-card__tags">{demo.capabilities.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
            <strong>Open working demo <i>↗</i></strong>
          </a>
        ))}
      </section>

      <section className="boundary-section" id="boundaries">
        <div className="boundary-section__heading"><span>WHAT IS ACTUALLY SHARED</span><h2>Framework-neutral does not mean framework-shaped examples.</h2><p>The browser editor has four honest integration boundaries. The gallery uses each one where it belongs.</p></div>
        <div className="boundary-list">{surfaces.map(([name, description], index) => <article key={name}><b>0{index + 1}</b><h3>{name}</h3><p>{description}</p></article>)}</div>
        <div className="boundary-note"><b>About backend demos</b><p>Python, Go, and Java do not execute a browser editor. Their demos pair a live FountainJS frontend with real server-side JSON shapes, while the Node.js demo runs the headless schema and format layer. The page labels this boundary instead of pretending every language runs the DOM view.</p></div>
      </section>

      <section className="demos-closing"><p>LOOK UNDER THE HOOD</p><h2>Every demo points back to the same extension and state contracts.</h2><div><a href="./developers.html">Read the developer guide →</a><a href="https://github.com/eddolo/fountainjs">Browse the source ↗</a></div></section>
      <footer><span>FountainJS · ten working integrations</span><span><a href="./">Home</a> · <a href="./developers.html">Developers</a> · MIT</span></footer>
    </main>
  );
}

export default DemoGallery;
