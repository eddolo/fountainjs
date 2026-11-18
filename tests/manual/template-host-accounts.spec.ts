import { test, expect, type BrowserContext } from '@playwright/test';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing local port');
  return 'http://127.0.0.1:' + address.port;
};
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test('a signed-in author assigns a template and reviews a response through host accounts', async ({
  browser,
}, info) => {
  const project =
    process.env.FOUNTAIN_TEMPLATE_PROJECT ??
    JSON.parse(await readFile('artifacts/installed-starters/projects.json', 'utf8')).projects.templates.path;
  const { createWorkspace } = await import(pathToFileURL(join(project, 'server.mjs')).href);
  const sessions = new Map<string, string>();
  const cookieName = 'fountain_test_session';
  const sessionId = (req: IncomingMessage) =>
    req.headers.cookie
      ?.split('; ')
      .find((c) => c.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) ?? '';
  const directory = new Map(
    ['author', 'researcher', 'colleague'].map((id) => [id, randomBytes(20).toString('hex')]),
  );
  let origin: string;
  // This independent host owns the login form and opaque HttpOnly session.
  // All accounts and credentials are generated for this local test.
  const host = createServer(async (req, res) => {
    if (req.url === '/login' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        '<form method="post"><label>Account <input name="account"></label><label>Password <input type="password" name="password"></label><button>Sign in</button></form>',
      );
      return;
    }
    if (req.url === '/login' && req.method === 'POST') {
      let form = '';
      for await (const chunk of req) form += chunk;
      const fields = new URLSearchParams(form),
        id = fields.get('account') ?? '';
      if (!directory.has(id) || directory.get(id) !== fields.get('password')) {
        res.writeHead(401).end();
        return;
      }
      const token = randomBytes(32).toString('hex');
      sessions.set(token, id);
      res
        .writeHead(303, {
          'Set-Cookie': cookieName + '=' + token + '; Path=/; HttpOnly; SameSite=Strict',
          Location: origin,
        })
        .end();
      return;
    }
    if (req.url === '/logout' && req.method === 'POST') {
      sessions.delete(sessionId(req));
      res.writeHead(204).end();
      return;
    }
    res.writeHead(404).end();
  });
  const auth = await listen(host),
    contexts: BrowserContext[] = [];
  const app = createWorkspace(':memory:', join(project, 'dist'), {
    accounts: {
      signInUrl: auth + '/login',
      authenticate(req: IncomingMessage) {
        const id = sessions.get(sessionId(req));
        return id ? { id, canCreateTemplates: id === 'author' } : null;
      },
      resolveRecipient(id: string, handle: string) {
        return id === 'author' && directory.has(handle) ? handle : null;
      },
    },
  });
  origin = await listen(app);
  const signIn = async (id: string) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      recordVideo: { dir: info.outputPath('host-videos') },
    });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Account').fill(id);
    await page.getByLabel('Password').fill(directory.get(id)!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Document templates' })).toBeVisible();
    return page;
  };
  try {
    const author = await signIn('author');
    await author.getByRole('button', { name: 'Create template', exact: true }).click();
    await author.getByLabel('Template title').fill('Field survey');
    await author.getByRole('button', { name: 'Save template' }).click();
    await expect(author.getByRole('status')).toHaveText('Template saved.');
    const authorURL = author.url();
    await author.getByLabel('Recipient account').fill('researcher');
    await author.getByLabel('Invitation label (optional)').fill('River team');
    await author.getByRole('button', { name: 'Create respondent link' }).click();
    const assigned = await author.getByRole('link', { name: 'Open response' }).getAttribute('href');
    expect(assigned).toMatch(/#responses\/[0-9a-f-]{36}$/);
    const other = await signIn('colleague');
    await other.goto(assigned!);
    await expect(other.getByRole('status')).toHaveText('This link cannot open a document.');
    const user = await signIn('researcher');
    await expect(user.getByRole('button', { name: 'Create template' })).toHaveCount(0);
    await user.getByRole('link', { name: 'Field survey' }).click();
    await user.getByLabel('Study title (required)', { exact: true }).fill('River sample');
    await user.getByRole('textbox', { name: 'Findings (required)' }).fill('Water level stable.');
    await user.getByRole('button', { name: 'Save draft' }).click();
    await expect(user.getByRole('status')).toHaveText('Draft saved.');
    await user.context().request.post(auth + '/logout');
    await user.reload();
    await expect(user.getByRole('status')).toContainText('Sign in to the host application');
    const returning = await signIn('researcher');
    await returning.getByRole('link', { name: 'Field survey' }).click();
    await expect(returning.getByLabel('Study title (required)', { exact: true })).toHaveValue('River sample');
    await returning.getByRole('button', { name: 'Submit response' }).click();
    await expect(returning.getByRole('textbox', { name: 'Completed document' })).toContainText(
      'Water level stable.',
    );
    await returning.getByRole('link', { name: 'My documents' }).click();
    await expect(returning.getByRole('link', { name: 'Field survey · Submitted' })).toBeVisible();
    await expect(returning.getByText('River team · Template revision 2')).toBeVisible();
    await expect(returning.getByRole('heading', { name: 'Your templates' })).toHaveCount(0);
    await returning.screenshot({ path: info.outputPath('assigned-documents.png') });
    await author.goto(origin);
    await author.getByRole('link', { name: 'Field survey' }).click();
    await expect(author).toHaveURL(authorURL);
    await author.getByRole('button', { name: /Read submission/ }).click();
    await expect(author.getByRole('textbox', { name: 'Completed document' })).toContainText(
      'Water level stable.',
    );
  } finally {
    for (const c of contexts) await c.close();
    await close(host);
    await close(app);
  }
});
