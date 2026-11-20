// Browser events recorded on the authenticated test page. Keep headers, bodies and URL queries out of the trace.
export async function observeMergeRequestNavigation(page, result, origin) {
  const start = performance.now();
  const events = [];
  const requests = new WeakMap();
  let nextRequest = 0;
  const record = (kind, fields) => events.push({ms:Math.round(performance.now() - start), stage:result.stage, kind, ...fields});
  const path = value => {
    const url = new URL(value);
    return url.origin === origin ? url.pathname : undefined;
  };
  page.on('request', request => {
    const pathname = path(request.url());
    const type = request.resourceType();
    if (!pathname || !['document','xhr','fetch','ping'].includes(type)) return;
    const id = ++nextRequest;
    requests.set(request, id);
    record('request', {id, type, method:request.method(), path:pathname, page:path(page.url())});
  });
  page.on('response', response => {
    const id = requests.get(response.request());
    if (id) record('response', {id, status:response.status()});
  });
  page.on('requestfailed', request => {
    const id = requests.get(request);
    if (id) record('failed', {id, reason:request.failure()?.errorText});
  });
  page.on('requestfinished', request => {
    const id = requests.get(request);
    if (id) record('finished', {id});
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) record('navigated', {path:path(frame.url())});
  });
  page.on('pageerror', () => record('pageerror', {errorIndex:result.pageErrors.length - 1, page:path(page.url())}));
  const prefix = 'fountain-audit-navigation ';
  page.on('console', message => {
    if (message.type() !== 'debug' || !message.text().startsWith(prefix)) return;
    const [kind, pathname, documentEpoch] = JSON.parse(message.text().slice(prefix.length));
    record(kind, {path:pathname, documentEpoch});
  });
  await page.addInitScript(marker => {
    if (self !== top) return;
    // Native diagnostics and application-level failures can both reach Playwright's pageerror event.
    // Observe script errors and unhandled rejections without changing their default handling.
    for (const name of ['pageshow','beforeunload','pagehide','error','unhandledrejection']) {
      addEventListener(name, () => console.debug(marker + JSON.stringify([name, location.pathname, performance.timeOrigin])));
    }
  }, prefix);
  return events;
}
