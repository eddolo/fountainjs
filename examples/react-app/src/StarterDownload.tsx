/// <reference types="vite/client" />

import { useState } from 'react';

const templates = import.meta.glob<string>(
  '../../starters/{plain-dom,react}/{package.json,index.html,main.js,main.jsx,README.md}',
  { eager: true, query: '?raw', import: 'default' },
);

export function StarterDownload({ kind, label }: { kind: 'plain-dom' | 'react'; label: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    setDownloading(true);
    setError(false);
    try {
      const { strToU8, zipSync } = await import('fflate');
      const prefix = `../../starters/${kind}/`;
      const folder = `fountainjs-${kind}`;
      const files = Object.fromEntries(Object.entries(templates)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, source]) => [`${folder}/${path.slice(prefix.length)}`, strToU8(source)]));
      const zip = new Blob([Uint8Array.from(zipSync(files))], { type: 'application/zip' });
      const url = URL.createObjectURL(zip);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folder}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  }

  return <>
    <button type="button" disabled={downloading} onClick={download}>{label}</button>
    {error && <p role="alert">The download could not start. Try again.</p>}
  </>;
}
