import { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowBreadcrumbs } from './WorkflowBreadcrumbs';
import { SitePageLink } from './SitePageLink';
import { loadSiteFonts } from './site-fonts';
import quickActionPoster from '../../../artifacts/gitlab-native-quick-action-controls-20261114/quick-action-controls-desktop.png';
import quickActionVideo from '../../../artifacts/gitlab-native-quick-action-controls-20261114/recordings/page@e954f2c8df6518657a91296290ae2c01.webm?url';
import postedReview from '../../../artifacts/gitlab-compatibility/review-20261116/fountain-1/posted-range-review-posted.png';
import issue from '../../../artifacts/gitlab-compatibility/final-8991f40b-outline-new-firefox/fountain-2/reopened-outline.png';
import stockIssue from '../../../artifacts/gitlab-compatibility/final-8991f40b-outline-new-firefox/original-2/reopened-outline.png';
import merge from '../../../artifacts/gitlab-compatibility/mr-create-20261120/fountain-2/updated-reader.png';
import stockMerge from '../../../artifacts/gitlab-compatibility/mr-create-20261120/original-3/updated-reader.png';
import wiki from '../../../artifacts/gitlab-compatibility/wiki-aligned-table-tasks-firefox-20261121/fountain-1/shared-wiki.png';
import stockWiki from '../../../artifacts/gitlab-compatibility/wiki-aligned-table-tasks-firefox-20261121/original-1/shared-wiki.png';
import rollback from '../../../artifacts/gitlab-compatibility/wiki-two-nodes-rollback-20261121214151350/saved-on-surviving-node.png';
import './index.css';
import './workflows.css';
import './gitlab-showcase.css';

const LiveEditors = lazy(() => import('./GitLabLiveEditors'));
const repository = 'https://github.com/eddolo/fountainjs/blob/v0.5.0-beta.5/';
const runtime = repository + 'integrations/gitlab/runtime/README.md';
const journeys = [
  { name: 'Issues', title: 'Keep the outline through the first edit', build: '1f16e1b0', browser: 'Firefox 153', image: issue, stock: stockIssue,
    outcome: 'An author inserted a table of contents before adding any headings. After saving and reopening, Fountain kept the directive. Adding the first heading produced a working outline. The stock editor kept the prose and heading but dropped the directive on the earlier save.',
    alt: 'Reopened GitLab issue with a table of contents linking to Release handoff.', stockAlt: 'Reopened stock issue with the same heading and prose and no table of contents.',
    report: 'final-8991f40b-outline-new-firefox/final/report.md' },
  { name: 'Merge requests', title: 'Reopen the change you just saved', build: '44219116', browser: 'Chromium 151', image: merge, stock: stockMerge,
    outcome: 'Both editors created a merge request from the branch picker and displayed the added paragraph before Save. In this matched run, the GitLab API and reloaded reader retained that paragraph with Fountain. Both lost it with stock. Stock retained it in other runs.',
    alt: 'GitLab merge request after reload, showing the additional paragraph.', stockAlt: 'Stock GitLab merge request after reload without the added paragraph.',
    report: 'mr-create-20261120/verified/report.md' },
  { name: 'Collaborative wikis', title: 'Edit the same checklist from two accounts', build: 'f333a939', browser: 'Firefox 153', image: wiki, stock: stockWiki,
    outcome: 'Two authors toggled a checklist inside a right-aligned table, then undid and redid the change. Both readers reopened all three task states. Fountain also displayed the checkboxes on the right while editing and preserved the original line endings.',
    alt: 'Fountain editing a GitLab wiki with checkboxes on the right side of the table cells.', stockAlt: 'Stock GitLab editing the same wiki with checkboxes near the left side of the cells.',
    report: 'wiki-aligned-table-tasks-firefox-20261121/verified/report.md' },
  { name: 'Deployment & rollback', title: 'Keep both authors’ work through rollback', build: '1f16e1b0', browser: 'Two application nodes', image: rollback,
    outcome: 'Two authors kept editing one wiki while an application node went offline. Their pending changes survived reconnection. After returning to the stock editor, the saved reader still contained both contributions. The deployment receipt identifies the nodes and builds.',
    alt: 'Saved GitLab wiki on the surviving node after the rollback drill.', report: 'wiki-two-nodes-rollback-20261121214151350/report.json' },
];

function Showcase() {
  const [current, select] = useState(0);
  const [stock, selectStock] = useState(false);
  const [opened, open] = useState(false);
  const item = journeys[current];
  const image = stock && item.stock ? item.stock : item.image;
  return <main className="workflows-site gl-showcase">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a>
      <nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./workflows.html">Workflows</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav></header>
    <div className="gl-wrap"><WorkflowBreadcrumbs current="GitLab integration" />
    <header className="gl-intro"><div><p className="gl-context">GitLab Community Edition 19.5.3</p><h1>FountainJS inside GitLab</h1>
      <p>We replaced GitLab’s rich-text editor and ran both versions against the same application and test data. Compare saved issues, follow a code review, and see what two authors kept when a wiki server went offline.</p>
      <div className="gl-actions"><a className="gl-primary" href="#journeys">Explore the GitLab workflows ↓</a><a href={runtime}>Run the full integration locally ↗</a></div>
    </div><figure className="gl-cover"><a href={postedReview} aria-label="Open the full GitLab merge request screenshot"><img src={postedReview} width="1280" height="900" alt="A posted suggested change and inline discussion in the Changes tab of GitLab merge request 60." /></a><figcaption>Merge request !60 · A review posted through FountainJS · <a href={repository + 'integrations/gitlab/COMPATIBILITY_REVIEW_RESULTS.md'}>Read the review workflow ↗</a></figcaption></figure></header>
    <section className="gl-evidence" aria-labelledby="journeys"><h2 id="journeys">Inside the running application</h2>
      <div className="gl-choices" role="group" aria-label="GitLab workflows">{journeys.map((journey, i) => <button key={journey.name} aria-pressed={current === i} onClick={() => { select(i); selectStock(false); }}>{journey.name}</button>)}</div>
      <div className="gl-result"><div className="gl-narrative"><p className="gl-context">{item.browser} · <code>{item.build}</code></p><h3>{item.title}</h3><p>{item.outcome}</p>
        <a href={repository + 'artifacts/gitlab-compatibility/' + item.report}>Read the build IDs and results ↗</a></div>
        <figure>{item.stock && <div className="gl-switch" role="group" aria-label="Editor capture"><button aria-pressed={!stock} onClick={() => selectStock(false)}>FountainJS</button><button aria-pressed={stock} onClick={() => selectStock(true)}>Stock GitLab</button></div>}
          <a href={image} aria-label="Open full-size GitLab capture"><img src={image} alt={(stock && item.stockAlt) || item.alt} /></a>
          <figcaption>GitLab CE 19.5.3 · {item.stock ? stock ? 'Stock editor' : 'FountainJS editor' : 'Saved reader after rollback'} · <a href={image}>Full size ↗</a></figcaption></figure>
      </div></section>
    <section className="gl-recording"><div><p className="gl-context">Recorded in GitLab · Linux Chromium · 3 min 26 s</p><h2>Watch a quick action reach the saved work item</h2><p>Watch the command menu inside GitLab, the switch to Markdown, and the saved result. The original run checked the work item again after restarting GitLab.</p>
      <a href={repository + 'artifacts/gitlab-quick-action-controls-integration-20261114.json'}>Recording provenance and all 17 checks ↗</a><p><a href={quickActionVideo} download="gitlab-quick-actions.webm">Download the recording</a></p></div>
      <video controls poster={quickActionPoster} preload="none" aria-label="GitLab quick-action recording"><source src={quickActionVideo} type="video/webm" /><a href={quickActionVideo}>Download the recording</a></video></section>
    <section className="gl-run"><h2>Reproduce a workflow</h2><p>Use the pinned Community Edition image and frontend from the repository. Each walkthrough identifies the accounts, starting state, actions and saved result.</p>
      <div className="gl-actions"><a href={runtime + '#reproduce-merge-request-creation'}>Create a merge request ↗</a><a href={runtime + '#reproduce-two-authors-editing-a-wiki-checklist'}>Edit a shared wiki ↗</a><a href={runtime + '#reproduce-the-frontend-deployment-and-rollback'}>Deploy and roll back ↗</a><a href={repository + 'integrations/gitlab/README.md'}>Browse the adapter source and results ↗</a></div></section>
    <section id="editors" className="gl-live"><p className="gl-context">Supplement · Browser-only example</p><h2>Try two independent editors</h2>
      <p>Tick a release task, edit the handoff notes, then undo in just one editor. Open its Markdown to see exactly what the GitLab adapter would submit.</p>
      <p>These editors run locally in your tab using the integration’s Vue 2 surface. The starting content comes from captured GitLab renderer responses. To save to a project or collaborate with another account, use the local installation.</p>
      {opened ? <Suspense fallback={<p role="status">Loading the GitLab editors…</p>}><LiveEditors /></Suspense> : <button className="gl-primary" onClick={() => open(true)}>Open both editors</button>}
    </section>
    <section className="gl-run"><h2>Qualification and deployment</h2><p>The six local gates passed on Fountain build <code>1f16e1b0</code> with GitLab CE 19.5.3. The runbook covers the pinned Docker installation, frontend switch and rollback. Physical mobile devices and hosted staging still need verification.</p>
      <div className="gl-actions"><a href={runtime}>Installation and rollback ↗</a><a href="http://127.0.0.1:5080/">Open your running local GitLab ↗</a><a href={repository + 'integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md'}>Six-gate acceptance ledger ↗</a><a href="./issue-editor.html">Standalone issue-writing example →</a></div>
    </section></div></main>;
}
loadSiteFonts();
createRoot(document.getElementById('root')!).render(<Showcase />);
