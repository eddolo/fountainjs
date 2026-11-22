import React from 'react';
import ReactDOM from 'react-dom/client';
import { SitePageLink } from './SitePageLink';
import { WorkflowBreadcrumbs } from './WorkflowBreadcrumbs';
import './index.css';
import { loadSiteFonts } from './site-fonts';
import './workflows.css';
import stockOutline from '../../../artifacts/gitlab-compatibility/final-8991f40b-outline-new-firefox/original-2/reopened-outline.png';
import fountainOutline from '../../../artifacts/gitlab-compatibility/final-8991f40b-outline-new-firefox/fountain-2/reopened-outline.png';
import outlineComparison from '../../../artifacts/gitlab-compatibility/final-8991f40b-outline-new-firefox/final/report.md?url';

function Workflows() {
  return <main className="workflows-site">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a><nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">Demos</SitePageLink><SitePageLink href="./workflows.html" current>Workflows</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav></header>
    <section className="workflow-heading"><WorkflowBreadcrumbs /><p>REAL-WORLD WORKFLOWS</p><h1>Familiar work.<br />Powered by FountainJS.</h1><p>Try the GitLab integration and the task workspace, then inspect the saved results.</p></section>
    <section className="workflow-grid" aria-label="Product workflow demos">
      <article className="workflow-card"><span className="workflow-kind">GITLAB COMMUNITY EDITION · 19.5.3</span><h2>FountainJS inside GitLab</h2><p>Try the installed editor’s Vue 2 surface. Compare what GitLab saved in issues, merge requests and collaborative wikis, then follow a two-node rollback.</p><a className="workflow-open" href="./gitlab.html">Explore the GitLab integration ↗</a><div className="workflow-links"><a href="./issue-editor.html">Try the issue editor example ↗</a><a href="#gitlab-comparison">See the Firefox outline comparison ↓</a></div></article>
      <article className="workflow-card workflow-card--task"><span className="workflow-kind">TASKS &amp; PROJECTS</span><h2>Todoist-style task briefs</h2><p>Give each task a rich description. Switch tasks without losing drafts, complete work, and preview the description without author controls.</p><ul><li>Independent documents and undo histories</li><li>Task metadata beside editable content</li><li>Markdown draft download and reopen</li></ul><a className="workflow-open" href="./task-workflow.html">Try the task workspace ↗</a><p className="workflow-evidence">Doist publishes its Tiptap-based Typist editor. This local demo uses FountainJS, with no Todoist account, synchronization, or task API.</p><div className="workflow-links"><a href="https://github.com/eddolo/fountainjs/blob/master/docs/WORKFLOW_DEMOS.md">Implementation guide ↗</a><a href="https://github.com/Doist/typist">Original editor ↗</a></div></article>
    </section>
    <section id="gitlab-comparison" className="workflow-more" aria-labelledby="gitlab-comparison-title">
      <h2 id="gitlab-comparison-title">What survives an issue edit in GitLab?</h2>
      <p>All six local qualification gates passed on editor build <code>1f16e1b0</code>, including saving through an application-node outage and returning both nodes to the stock editor. Hosted staging and physical mobile testing remain open. <a href="https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.3/integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md">Read the GitLab acceptance ledger ↗</a></p>
      <p>In GitLab CE 19.5.3, an author inserted a table of contents before writing any headings, saved the issue, reopened it and added a paragraph. They then added a heading and reopened the issue again. These Firefox 153 captures show the result.</p>
      <div className="workflow-comparison-images">
        <figure><figcaption>Original GitLab editor</figcaption><img src={stockOutline} loading="lazy" alt="Reopened issue shows the release handoff heading and prose. The outline is missing." /></figure>
        <figure><figcaption>FountainJS inside GitLab</figcaption><img src={fountainOutline} loading="lazy" alt="The reopened issue includes a table of contents linking to Release handoff above the same prose." /></figure>
      </div>
      <p>Fountain retained the outline directive when the author saved the first paragraph. Both editors retained the heading and prose. <a href={outlineComparison} download="gitlab-firefox-outline-comparison.md">Download the 13 checks and exact build IDs</a></p>
    </section>
    <section className="workflow-more"><h2>In development: Directus Data Studio</h2><p>Authors can edit an HTML field, place an image inside a sentence, or choose a project image preset. In local tests the stock Directus editor reopened and edited the same saved items. Account permissions and broader item workflows still need verification.</p><a href="https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.3/integrations/directus/README.md">Directus installation and comparison results ↗</a></section>
    <section className="workflow-more"><h2>Choose the kind of proof you need.</h2><p>Product workflows show complete editing journeys. The integration gallery shows framework and backend boundaries. Capability labs explore specialist work in more depth.</p><div><a href="./demos.html#gallery">10 integration demos →</a><a href="./math-renderer.html">Math and paper-table lab →</a><a href="./math-references.html">Equation references and print lab →</a><a href="./developers.html#starter-templates">Download the template workspace →</a><a href="./developers.html">Developer guide →</a></div><p>No speed or feature-superiority claims are implied by a familiar layout. The demos label what is active, and the guides explain the boundaries.</p></section>
  </main>;
}
loadSiteFonts();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Workflows /></React.StrictMode>);
