/** Preserve GitLab's sandbox/strict Mermaid renderer and add correlated native previews. */
export function prepareGitLabDiagramSandbox(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Inspect the pinned GitLab Mermaid sandbox boundary.');
    source = source.replace(before, after);
  };
  replace('const setIframeRenderedSize = (h, w) => {', 'let activeFountainRequestId;\n\nconst setIframeRenderedSize = (h, w, fountainRequestId) => {');
  replace('window.parent.postMessage({ h, w }, origin);',
    'window.parent.postMessage({ h, w, ...(fountainRequestId === undefined ? {} : { fountainRequestId }) }, origin);');
  replace('window.parent.postMessage({ href }, window.location.origin);',
    'window.parent.postMessage({ href, ...(activeFountainRequestId === undefined ? {} : { fountainRequestId: activeFountainRequestId }) }, window.location.origin);');
  replace('const drawDiagram = async (mermaid, source) => {',
    'const drawDiagram = async (mermaid, source, { fountainRequestId, isCurrent = () => true } = {}) => {');
  replace('setIframeRenderedSize(height, width);', 'setIframeRenderedSize(height, width, fountainRequestId);');
  replace("const { svg } = await mermaid.mermaidAPI.render('mermaid', source);\n  insertSvg(svg);",
    "const renderId = fountainRequestId === undefined ? 'mermaid' : `fountain-mermaid-${fountainRequestId}`;\n  const { svg } = await mermaid.mermaidAPI.render(renderId, source);\n  if (isCurrent()) insertSvg(svg);");
  replace("const addListener = (mermaid) => {\n  window.addEventListener(",
    "const addListener = (mermaid) => {\n  let generation = 0;\n  let nativeQueue = Promise.resolve();\n  window.addEventListener(");
  replace('      drawDiagram(mermaid, source);', `      const id = event.data.fountainRequestId;
      if (id !== undefined) {
        if (!Number.isSafeInteger(id) || id < 1) return;
        activeFountainRequestId = id;
        generation += 1;
        const current = generation;
        nativeQueue = nativeQueue.then(async () => {
          if (current !== generation) return;
          try {
            await drawDiagram(mermaid, source, { fountainRequestId: id, isCurrent: () => current === generation });
          } catch {
            document.getElementById(\`dfountain-mermaid-\${id}\`)?.remove();
            if (current !== generation) return;
            document.getElementById('app').textContent = '';
            window.parent.postMessage({ fountainRequestId: id, fountainDiagramError: true }, window.location.origin);
          }
        });
        return;
      }
      activeFountainRequestId = undefined;
      drawDiagram(mermaid, source);`);
  return source;
}
