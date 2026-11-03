import './workflow-breadcrumbs.css';

export function WorkflowBreadcrumbs({ current }: { current?: string }) {
  return <nav className="workflow-breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li><a href="./">Home</a></li>
      <li><span aria-hidden="true">/</span>{current ? <a href="./workflows.html">Workflow lab</a> : <span aria-current="page">Workflow lab</span>}</li>
      {current && <li><span aria-hidden="true">/</span><span aria-current="page">{current}</span></li>}
    </ol>
    <a className="workflow-back" href={current ? './workflows.html' : './'}><span aria-hidden="true">←</span> {current ? 'Back to workflow lab' : 'Back to Home'}</a>
  </nav>;
}
