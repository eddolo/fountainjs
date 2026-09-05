interface SitePageLinkProps {
  readonly children: string;
  readonly current?: boolean;
  readonly href: string;
}

/** A visibly distinct link between the website's full pages. */
export function SitePageLink({ children, current = false, href }: SitePageLinkProps) {
  return (
    <a className="site-page-link" href={href} aria-current={current ? 'page' : undefined}>
      <span>{children}</span>
      {current
        ? <i className="site-page-link__current" aria-hidden="true" />
        : <i className="site-page-link__arrow" aria-hidden="true">↗</i>}
    </a>
  );
}
