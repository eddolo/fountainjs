import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SitePageLink } from './SitePageLink';
import './site-header.css';

const pages = { Home: '', Demos: 'demos.html', Workflows: 'workflows.html', Developers: 'developers.html' } as const;
const sections = [
  ['what', 'What it is'], ['open-source', 'Open source'], ['playground', 'Live demo'],
  ['collaboration', 'Collaboration'], ['review', 'Review'], ['versions', 'Versions'],
] as const;

export function SiteHeader({ page, base = './', children }: {
  page: keyof typeof pages;
  base?: string;
  children?: ReactNode;
}) {
  const home = page === 'Home';
  const header = useRef<HTMLElement>(null);
  const [active, setActive] = useState('top');
  const shell = document.getElementById('site-chrome');
  useLayoutEffect(() => {
    const bar = shell ?? header.current!;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const edge = bar.getBoundingClientRect().height + 12;
      root.style.setProperty('--site-scroll-offset', edge + 'px');
      if (!home) return;
      // Use the middle of the readable viewport. A section can occupy most
      // of the screen while the preceding section is still beneath the bar.
      const readingLine = edge + Math.max(0, window.innerHeight - edge) / 2;
      let section = 'top';
      for (const [id] of sections) {
        const target = document.getElementById(id);
        if (target && target.getBoundingClientRect().top <= readingLine) section = id;
      }
      setActive(section);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const size = new ResizeObserver(schedule);
    size.observe(bar);
    if (home) size.observe(document.body);
    update();
    if (home) window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      size.disconnect();
      window.removeEventListener('scroll', schedule);
      root.style.removeProperty('--site-scroll-offset');
    };
  }, [home, shell]);

  useLayoutEffect(() => {
    const link = header.current?.querySelector<HTMLElement>('[aria-current="location"]');
    const nav = link?.parentElement;
    if (!link || !nav || nav.scrollWidth <= nav.clientWidth) return;
    const rect = link.getBoundingClientRect();
    const bounds = nav.getBoundingClientRect();
    if (rect.left < bounds.left) nav.scrollLeft += rect.left - bounds.left;
    else if (rect.right > bounds.right) nav.scrollLeft += rect.right - bounds.right;
  }, [active]);

  const bar = <header className="site-header global-header" ref={header}>
    <div className="global-bar"><a className="brand" href={home ? '#top' : base} aria-label="FountainJS home"><span aria-hidden="true">F</span> FountainJS</a>
      <nav aria-label="Primary navigation">{(Object.keys(pages) as (keyof typeof pages)[]).map(name =>
        <SitePageLink key={name} href={home && name === 'Home' ? '#top' : base + pages[name]}
          current={name === page && (!home || active === 'top')}>{name}</SitePageLink>)}</nav>
      <a className="install-pill" href="https://www.npmjs.com/package/fountainjs-editor">npm i fountainjs-editor</a>
    </div>
    <nav className="home-sections" aria-label="Homepage sections"><span>On Home</span>{sections.map(([id, label]) =>
      <a key={id} href={(home ? '' : base) + '#' + id} aria-current={home && active === id ? 'location' : undefined}>{label}<i aria-hidden="true" /></a>)}</nav>
  </header>;
  return <>{shell ? createPortal(bar, shell) : bar}{children && <nav className="page-shortcuts" aria-label="Page shortcuts">{children}</nav>}</>;
}
