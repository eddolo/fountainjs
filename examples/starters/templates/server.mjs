import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { InputError, shape, validateTemplate, validateAnswers, renderResponse } from './model.mjs';

const digest = (key) => createHash('sha256').update(key).digest('hex');
class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const absent = () => new RequestError(404, 'This link cannot open a document.');
const conflict = () =>
  new RequestError(
    409,
    'The saved version changed. Open the link in another tab to review it before retrying.',
  );
async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new RequestError(415, 'Send a JSON document.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 524288) throw new RequestError(413, 'The document exceeds 512 KiB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InputError('Invalid JSON.');
  }
}

function accountKey(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 512)
    throw new TypeError('Expected a stable host account ID.');
  // Keep assigned accounts distinct from the hashes of legacy private links.
  return 'account:' + digest(id);
}

export function createWorkspace(database, publicDir, { accounts, publicOrigin } = {}) {
  if (
    accounts !== undefined &&
    (!accounts ||
      typeof accounts.authenticate !== 'function' ||
      typeof accounts.resolveRecipient !== 'function')
  )
    throw new TypeError('Provide both host account callbacks.');
  if (
    publicOrigin !== undefined &&
    (!accounts || new URL(publicOrigin).origin !== publicOrigin || !publicOrigin.startsWith('https://'))
  )
    throw new TypeError('A public origin requires HTTPS and a host account adapter.');

  let signInUrl;
  if (accounts?.signInUrl !== undefined) {
    const address = new URL(accounts.signInUrl);
    const loopback =
      address.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
    if ((!loopback && address.protocol !== 'https:') || address.username || address.password)
      throw new TypeError('Use an HTTPS sign-in URL or a local loopback address.');
    signInUrl = address.href;
  }
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES templates(id),
      respondent TEXT NOT NULL, template_revision INTEGER NOT NULL, template TEXT NOT NULL, revision INTEGER NOT NULL,
      answers TEXT NOT NULL, submitted INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS responses_by_template ON responses(template_id,submitted);`);
  // Upgrade invitations already issued by earlier versions of this starter.
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = db
      .prepare('PRAGMA table_info(responses)')
      .all()
      .map((column) => column.name);
    if (!columns.includes('label'))
      db.exec("ALTER TABLE responses ADD COLUMN label TEXT NOT NULL DEFAULT ''");
    if (!columns.includes('revoked'))
      db.exec('ALTER TABLE responses ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  if (accounts)
    db.exec(
      'CREATE INDEX IF NOT EXISTS templates_by_owner ON templates(owner); CREATE INDEX IF NOT EXISTS responses_by_account ON responses(respondent,revoked)',
    );
  const snapshot = (row) => ({
    revision: row.revision,
    templateRevision: row.template_revision,
    template: JSON.parse(row.template),
    answers: JSON.parse(row.answers),
    submitted: !!row.submitted,
  });
  async function api(req, path) {
    const identity = accounts ? await accounts.authenticate(req) : undefined;
    if (accounts && !identity)
      throw new RequestError(401, 'Sign in to the host application and reopen this page.');
    const actor = accounts ? accountKey(identity.id) : undefined;
    if (accounts && req.method !== 'GET' && req.headers['x-fountain-workspace'] !== '1')
      throw new RequestError(403, 'Send the workspace request header.');
    if (path === '/api/workspace' && req.method === 'GET') {
      if (!accounts) return { mode: 'links' };
      return { mode: 'accounts', canCreate: identity.canCreateTemplates === true };
    }
    if (accounts && path === '/api/documents' && req.method === 'GET') {
      return {
        templates: db
          .prepare(
            "SELECT id,json_extract(document,'$.title') AS title FROM templates WHERE owner=? ORDER BY rowid DESC",
          )
          .all(actor),
        responses: db
          .prepare(
            "SELECT id,json_extract(template,'$.title') AS title,label,template_revision AS templateRevision,submitted FROM responses WHERE respondent=? AND revoked=0 ORDER BY rowid DESC",
          )
          .all(actor),
      };
    }
    const match = /^\/api\/(templates|responses)(?:\/([0-9a-f-]{36})(?:\/(invite|submit|revoke))?)?$/.exec(
      path,
    );
    if (!match) throw absent();
    const [, type, id, action] = match;
    const method = req.method;
    if (!id && type === 'templates' && method === 'POST') {
      if (accounts && identity.canCreateTemplates !== true)
        throw new RequestError(403, 'This account cannot create templates.');
      const template = validateTemplate(await body(req)),
        id = randomUUID();
      const key = accounts ? undefined : randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO templates(id,owner,revision,document) VALUES(?,?,1,?)').run(
        id,
        actor ?? digest(key),
        JSON.stringify(template),
      );
      return { id, key };
    }
    const key = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
    if ((!actor && !key) || !id) throw absent();
    const credential = actor ?? digest(key);
    if (type === 'templates') {
      const row = db
        .prepare('SELECT revision,document FROM templates WHERE id=? AND owner=?')
        .get(id, credential);
      if (!row) throw absent();
      if (method === 'GET' && !action) {
        const responses = db
          .prepare(
            'SELECT id,template_revision AS templateRevision FROM responses WHERE template_id=? AND submitted=1 ORDER BY rowid DESC',
          )
          .all(id);
        const invitations = db
          .prepare(
            'SELECT id,label,template_revision AS templateRevision,revoked FROM responses WHERE template_id=? ORDER BY rowid DESC',
          )
          .all(id);
        return { revision: row.revision, template: JSON.parse(row.document), responses, invitations };
      }
      if ((method === 'PUT' && !action) || (method === 'POST' && action === 'invite')) {
        const data = await body(req);
        shape(
          data,
          action
            ? accounts
              ? ['revision', 'label', 'recipient']
              : ['revision', 'label']
            : ['revision', 'template'],
        );
        if (data.revision !== row.revision) throw conflict();
        if (action) {
          const label = data.label ?? '';
          if (typeof label !== 'string' || label.length > 120)
            throw new InputError('Use an invitation label of up to 120 characters.');
          let key, respondent;
          if (accounts) {
            if (typeof data.recipient !== 'string' || !data.recipient.trim() || data.recipient.length > 256)
              throw new InputError('Enter a recipient account.');
            const recipient = await accounts.resolveRecipient(identity.id, data.recipient.trim());
            if (!recipient) throw new InputError('Choose a recipient available to this account.');
            respondent = accountKey(recipient);
          } else {
            key = randomBytes(32).toString('base64url');
            respondent = digest(key);
          }
          const responseId = randomUUID();
          const result = db
            .prepare(
              "INSERT INTO responses(id,template_id,respondent,template_revision,template,revision,answers,label) SELECT ?,id,?,revision,document,1,'{}',? FROM templates WHERE id=? AND revision=?",
            )
            .run(
              responseId,
              respondent,
              label.trim() || (accounts ? data.recipient.trim() : ''),
              id,
              data.revision,
            );
          if (!result.changes) throw conflict();
          return { id: responseId, key, templateRevision: data.revision };
        }
        const template = validateTemplate(data.template);
        if (
          !db
            .prepare('UPDATE templates SET document=?,revision=revision+1 WHERE id=? AND revision=?')
            .run(JSON.stringify(template), id, data.revision).changes
        )
          throw conflict();
        return { revision: data.revision + 1 };
      }
    } else {
      if (method === 'POST' && action === 'revoke') {
        const updated = db
          .prepare(
            'UPDATE responses SET revoked=1 WHERE id=? AND template_id IN (SELECT id FROM templates WHERE owner=?)',
          )
          .run(id, credential);
        if (!updated.changes) throw absent();
        return { revoked: true };
      }
      const row = db
        .prepare(
          `SELECT r.*,t.owner FROM responses r JOIN templates t ON t.id=r.template_id
        WHERE r.id=? AND ((r.respondent=? AND r.revoked=0) OR (t.owner=? AND r.submitted=1))`,
        )
        .get(id, credential, credential);
      if (!row) throw absent();
      if (method === 'GET' && !action) {
        const data = snapshot(row);
        if (data.submitted) data.document = renderResponse(data.template, data.answers);
        return data;
      }
      if ((method === 'PUT' && !action) || (method === 'POST' && action === 'submit')) {
        if (row.respondent !== credential) throw absent();
        if (row.submitted) throw new RequestError(409, 'This response has already been submitted.');
        const data = await body(req);
        shape(data, ['revision', 'answers']);
        if (data.revision !== row.revision) throw conflict();
        const template = JSON.parse(row.template);
        if (action) renderResponse(template, data.answers);
        else validateAnswers(template, data.answers, false);
        if (
          !db
            .prepare(
              'UPDATE responses SET answers=?,submitted=?,revision=revision+1 WHERE id=? AND revision=? AND submitted=0 AND revoked=0',
            )
            .run(JSON.stringify(data.answers), action ? 1 : 0, id, data.revision).changes
        )
          throw conflict();
        return { revision: data.revision + 1 };
      }
    }
    throw new RequestError(405, 'This action is unavailable.');
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = new URL(publicOrigin ?? 'http://127.0.0.1:' + server.address().port);
    try {
      if (req.headers.host !== origin.host || (req.headers.origin && req.headers.origin !== origin.origin))
        throw new RequestError(403, 'Open the workspace on its configured origin.');
      const path = new URL(req.url, origin).pathname;
      if (path.startsWith('/api/')) {
        const data = await api(req, path);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method !== 'GET' || !(path === '/' || /^\/assets\/[\w.-]+\.(js|css)$/.test(path)))
        throw absent();
      const file = path === '/' ? 'index.html' : path.slice(1);
      const bytes = await readFile(resolve(publicDir, file)).catch(() => {
        throw absent();
      });
      res.setHeader(
        'Content-Type',
        { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)],
      );
      res.end(bytes);
    } catch (error) {
      const status = error instanceof InputError ? 422 : error instanceof RequestError ? error.status : 500;
      if (status === 500) console.error(error);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: status === 500 ? 'Could not save or load the document.' : error.message,
          ...(status === 401 && signInUrl ? { signInUrl } : {}),
        }),
      );
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const adapterFile = process.env.FOUNTAIN_TEMPLATE_ACCOUNTS;
  const accounts = adapterFile ? (await import(pathToFileURL(resolve(adapterFile)).href)).default : undefined;
  if (adapterFile && !accounts)
    throw new TypeError('The configured host account module must export an adapter.');
  const server = createWorkspace(
    process.env.FOUNTAIN_TEMPLATE_DB ?? resolve(root, 'workspace.sqlite'),
    resolve(root, 'dist'),
    { accounts, publicOrigin: process.env.FOUNTAIN_TEMPLATE_ORIGIN },
  );
  server.listen(Number(process.env.PORT ?? 4310), '127.0.0.1', () =>
    console.log(
      'Template workspace at ' +
        (process.env.FOUNTAIN_TEMPLATE_ORIGIN ?? 'http://127.0.0.1:' + server.address().port),
    ),
  );
}
