import { once } from 'node:events';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { webkit } from '@playwright/test';

// A notes refresh can run while the next document is loading. A 204 or a
// dismissed confirmation keeps the current document and its live review.
const html = `<!doctype html><title>Review</title>
<button>Stay</button> <a href="/destination">Leave</a>
<script>
  const log = value => console.info(value);
  for (const type of ['beforeunload', 'pagehide']) addEventListener(type, () => log(type));
  function queueRefresh() {
    setTimeout(() => {
      log('read started');
      const read = new XMLHttpRequest();
      read.open('GET', '/notes');
      read.onload = () => log('read loaded');
      read.onerror = () => log('read failed');
      read.send();
    }, 250);
  }
  document.querySelector('a').addEventListener('click', queueRefresh);
  document.querySelector('button').addEventListener('click', queueRefresh);
</script>`;

async function observe(browser, action) {
  const serverRequests = [];
  let destination;
  const server = createServer((request, response) => {
    serverRequests.push(request.url);
    switch (request.url) {
      case '/destination':
        destination = response;
        if (action === 'no-content') response.writeHead(204).end();
        break;
      case '/notes':
        response.writeHead(200, {'Content-Type':'application/json'}).end('[]');
        break;
      default:
        response.writeHead(200, {'Content-Type':'text/html'}).end(html);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const events = [];
  const pageErrors = [];
  page.on('console', entry => {
    if (entry.type() === 'info') events.push(entry.text());
  });
  page.on('pageerror', error => pageErrors.push(error.toString().replaceAll(origin, '<origin>')));
  try {
    await page.goto(origin);
    if (action === 'cancel') {
      await page.evaluate(() => addEventListener('beforeunload', event => event.preventDefault(), {once:true}));
      page.once('dialog', dialog => dialog.dismiss());
    }

    // Keep the destination pending until the old page attempts the scheduled read.
    const outcome = page.waitForEvent('console', {
      predicate: entry => ['read loaded', 'read failed'].includes(entry.text()), timeout:10000,
    });
    const click = action === 'stay'
      ? page.getByRole('button').click()
      : page.getByRole('link').click({noWaitAfter:true});
    await Promise.all([outcome, click]);
    if (action === 'leave') {
      assert.ok(destination, 'The navigation must have reached the local server.');
      destination.writeHead(200, {'Content-Type':'text/html'}).end('<title>Reader</title>');
      await page.waitForURL(origin + '/destination');
    } else {
      assert.equal(page.url(), origin + '/');
      assert.ok(events.includes('read loaded'));
      assert.ok(serverRequests.includes('/notes'));
    }
    return {action, events, pageErrors, serverRequests};
  } finally {
    await page.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

const browser = await webkit.launch();
try {
  const cases = [];
  for (const action of ['stay','leave','cancel','no-content']) cases.push(await observe(browser,action));
  console.log(JSON.stringify({browser:'webkit',version:browser.version(),platform:process.platform,cases},null,2));
} finally {
  await browser.close();
}
