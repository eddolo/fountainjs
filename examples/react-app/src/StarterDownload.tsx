/// <reference types="vite/client" />

import { useState } from 'react';
import templateIgnore from '../../starters/templates/.gitignore?raw';

const templates = import.meta.glob<string>(
  [
    '../../starters/{plain-dom,react,node}/{package.json,index.html,main.js,main.jsx,convert.mjs,sample.md,README.md}',
    '../../starters/vue/{package.json,index.html,main.js,ReviewForm.vue,vite.vue.config.js,README.md}',
    '../../starters/templates/{package.json,index.html,main.js,inline-fields.mjs,model.mjs,server.mjs,workflow.test.mjs,style.css,README.md}',
  ],
  { query: '?raw', import: 'default' },
);

export function StarterDownload({ kind, label }: { kind: 'plain-dom' | 'react' | 'vue' | 'node' | 'templates'; label: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    setDownloading(true);
    setError(false);
    try {
      const { strToU8, zipSync } = await import('fflate');
      const prefix = `../../starters/${kind}/`;
      const folder = `fountainjs-${kind}`;
      const files = Object.fromEntries(await Promise.all(Object.entries(templates)
        .filter(([path]) => path.startsWith(prefix))
        .map(async ([path, read]) => [`${folder}/${path.slice(prefix.length)}`, strToU8(await read())])));
      // Inline the dotfile. Pages excludes a lazily emitted .gitignore_raw-*.js asset.
      if (kind === 'templates') files[`${folder}/.gitignore`] = strToU8(templateIgnore);
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
