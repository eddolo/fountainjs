/** Add source-retaining reader errors at the exact pinned GitLab render boundary. */
export function prepareGitLabMermaidReader(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Inspect the pinned GitLab Mermaid reader boundary.');
    source = source.replace(before, after);
  };
  replace("    width: '100%',\n  });", "    width: '100%',\n    title: __('Mermaid diagram'),\n  });");
  replace('    hasRendered = true;\n  };', `    hasRendered = true;
  };
  let readerAlert;
  let readerErrorContainer;
  const clearReaderError = () => {
    readerAlert?.dismiss();
    readerAlert = null;
    readerErrorContainer?.remove();
    readerErrorContainer = null;
  };
  const showReaderError = () => {
    pre.classList.remove('gl-sr-only', '!gl-p-0', '!gl-border-none');
    iframeContainer.hidden = true;
    if (readerAlert) return;
    readerErrorContainer = document.createElement('div');
    readerErrorContainer.classList.add('fountain-mermaid-reader-error', 'gl-mb-3');
    readerErrorContainer.dataset.fountainDiagramError = 'mermaid';
    pre.before(readerErrorContainer);
    readerAlert = createAlert({
      message: __('The diagram could not be rendered. Its original source is shown below.'),
      variant: VARIANT_WARNING,
      dismissible: false,
      parent: wrapper,
      containerSelector: '.fountain-mermaid-reader-error',
      primaryButton: { text: __('Retry diagram'), clickHandler: () => renderSandbox() },
    });
  };`);
  replace(`  window.addEventListener(
    'message',
    (event) => {
      if (event.origin !== 'null' || event.source !== iframeEl.contentWindow) {
        return;
      }
      if (openLinkFromMessage(event.data)) {
        return;
      }
      const height = getIframeHeightFromMessage(event.data);
      if (height === null) {
        return;
      }
      iframeEl.height = \`${'${height}'}px\`;
    },
    false,
  );`, `  const onSandboxMessage = (event) => {
    if (event.origin !== 'null' || event.source !== iframeEl.contentWindow) return;
    if (openLinkFromMessage(event.data)) return;
    if (event.data?.fountainDiagramError === true && event.data.fountainRequestId === undefined) {
      showReaderError();
      return;
    }
    const height = getIframeHeightFromMessage(event.data);
    if (height === null) return;
    clearReaderError();
    pre.classList.add('gl-sr-only', '!gl-p-0', '!gl-border-none');
    iframeContainer.hidden = false;
    iframeEl.height = \`${'${height}'}px\`;
  };
  window.addEventListener('message', onSandboxMessage, false);`);
  replace('      PanelBreakpointInstance.removeResizeListener(debouncedResize);',
    "      PanelBreakpointInstance.removeResizeListener(debouncedResize);\n      window.removeEventListener('message', onSandboxMessage, false);\n      clearReaderError();");
  return source;
}
