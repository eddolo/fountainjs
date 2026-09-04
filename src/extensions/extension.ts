import type {
  Editor,
  MarkSpec,
  Node,
  NodeSpec,
  Plugin,
  Schema,
  SchemaSpec,
} from '../core';

/** A host-callable command may expose any typed arguments after the editor. */
export type ExtensionCommand = (editor: Editor, ...args: any[]) => boolean;

export interface FountainFormat {
  parse?: (source: string, schema: Schema) => Node;
  serialize?: (document: Node) => string;
}

/** Runtime contract version for independently published Fountain extensions. */
export const FOUNTAIN_EXTENSION_API_VERSION = 1 as const;

export interface FountainExtensionManifest {
  /** Extension package version using semantic-version syntax. */
  readonly version: string;
  /** Must equal `FOUNTAIN_EXTENSION_API_VERSION`. */
  readonly apiVersion: typeof FOUNTAIN_EXTENSION_API_VERSION;
  readonly displayName?: string;
  readonly description?: string;
  readonly license?: string;
  readonly homepage?: string;
  /** Extension names that must appear earlier in `composeExtensions`. */
  readonly requires?: readonly string[];
}

/** A framework-neutral bundle of editor capabilities. */
export interface FountainExtension {
  name: string;
  /** Machine-checkable publication and compatibility metadata. */
  manifest?: FountainExtensionManifest;
  nodes?: Readonly<Record<string, NodeSpec>>;
  marks?: Readonly<Record<string, MarkSpec>>;
  plugins?: readonly Plugin<any>[];
  commands?: Readonly<Record<string, ExtensionCommand>>;
  formats?: Readonly<Record<string, FountainFormat>>;
  /** Open-ended integration points owned and interpreted by the host app. */
  services?: Readonly<Record<string, unknown>>;
}

export interface FountainKit {
  schema: SchemaSpec;
  plugins: readonly Plugin<any>[];
  commands: Readonly<Record<string, ExtensionCommand>>;
  formats: Readonly<Record<string, FountainFormat>>;
  services: Readonly<Record<string, unknown>>;
  extensions: readonly FountainExtension[];
  getExtension(name: string): FountainExtension | undefined;
}

export interface ComposeExtensionsOptions {
  topNode?: string;
  /** Defaults to `error`; use `replace` only when overriding is intentional. */
  onConflict?: 'error' | 'replace';
}

function validExtensionName(value: string): boolean {
  return /^[a-z][a-z0-9._:-]{0,127}$/.test(value);
}

const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function normalizeManifest(manifest: FountainExtensionManifest | undefined): FountainExtensionManifest | undefined {
  if (!manifest) return undefined;
  if (typeof manifest.version !== 'string' || !semanticVersion.test(manifest.version)) {
    throw new Error(`Extension manifest version must be semantic version syntax: ${manifest.version}`);
  }
  if (manifest.apiVersion !== FOUNTAIN_EXTENSION_API_VERSION) {
    throw new Error(`Extension API ${manifest.apiVersion} is incompatible with Fountain extension API ${FOUNTAIN_EXTENSION_API_VERSION}.`);
  }
  for (const [name, value, maximum] of [
    ['displayName', manifest.displayName, 120],
    ['description', manifest.description, 500],
    ['license', manifest.license, 100],
  ] as const) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > maximum)) {
      throw new Error(`Extension manifest ${name} must contain 1-${maximum} characters.`);
    }
  }
  if (manifest.homepage !== undefined) {
    if (typeof manifest.homepage !== 'string') throw new Error('Extension manifest homepage must be an absolute HTTPS URL.');
    let url: URL;
    try { url = new URL(manifest.homepage); }
    catch { throw new Error('Extension manifest homepage must be an absolute HTTPS URL.'); }
    if (url.protocol !== 'https:') throw new Error('Extension manifest homepage must be an absolute HTTPS URL.');
  }
  if (manifest.requires !== undefined && !Array.isArray(manifest.requires)) {
    throw new Error('Extension manifest requirements must be a list of unique valid extension names.');
  }
  const requires = [...new Set(manifest.requires ?? [])];
  if (requires.length !== (manifest.requires?.length ?? 0) || requires.some((name) => typeof name !== 'string' || !validExtensionName(name))) {
    throw new Error('Extension manifest requirements must be unique valid extension names.');
  }
  return Object.freeze({
    ...manifest,
    ...(requires.length ? { requires: Object.freeze(requires) } : { requires: undefined }),
  });
}

export function defineExtension<T extends FountainExtension>(extension: T): T {
  if (!validExtensionName(extension.name)) {
    throw new Error('Extension names must start with a lowercase letter and use lowercase letters, numbers, dot, colon, underscore, or hyphen.');
  }
  return Object.freeze({ ...extension, manifest: normalizeManifest(extension.manifest) }) as T;
}

function addContributions<T>(
  target: Record<string, T>,
  values: Readonly<Record<string, T>> | undefined,
  owner: string,
  kind: string,
  onConflict: 'error' | 'replace',
): void {
  Object.entries(values ?? {}).forEach(([name, value]) => {
    if (name in target && onConflict === 'error') {
      throw new Error(`Extension ${owner} conflicts with an existing ${kind}: ${name}`);
    }
    target[name] = value;
  });
}

export function composeExtensions(
  extensions: readonly FountainExtension[],
  options: ComposeExtensionsOptions = {},
): FountainKit {
  const onConflict = options.onConflict ?? 'error';
  const names = new Set<string>();
  const nodes: Record<string, NodeSpec> = {};
  const marks: Record<string, MarkSpec> = {};
  const commands: Record<string, ExtensionCommand> = {};
  const formats: Record<string, FountainFormat> = {};
  const services: Record<string, unknown> = {};
  const plugins: Plugin<any>[] = [];

  extensions.forEach((extension) => {
    if (!validExtensionName(extension.name)) {
      throw new Error(`Invalid extension name: ${extension.name}`);
    }
    // `defineExtension` is the convenient authoring path, but composition is
    // also a public trust boundary for objects loaded from third-party code.
    normalizeManifest(extension.manifest);
    if (names.has(extension.name)) throw new Error(`Duplicate extension name: ${extension.name}`);
    const missing = extension.manifest?.requires?.filter((name) => !names.has(name)) ?? [];
    if (missing.length) {
      throw new Error(`Extension ${extension.name} requires earlier extension${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
    }
    names.add(extension.name);
    addContributions(nodes, extension.nodes, extension.name, 'node', onConflict);
    addContributions(marks, extension.marks, extension.name, 'mark', onConflict);
    addContributions(commands, extension.commands, extension.name, 'command', onConflict);
    addContributions(formats, extension.formats, extension.name, 'format', onConflict);
    addContributions(services, extension.services, extension.name, 'service', onConflict);
    plugins.push(...(extension.plugins ?? []));
  });

  if (!nodes.doc || !nodes.text) throw new Error('A composed Fountain kit requires doc and text node types.');
  const frozenExtensions = Object.freeze([...extensions]);
  return Object.freeze({
    schema: Object.freeze({ nodes: Object.freeze(nodes), marks: Object.freeze(marks), topNode: options.topNode ?? 'doc' }),
    plugins: Object.freeze(plugins),
    commands: Object.freeze(commands),
    formats: Object.freeze(formats),
    services: Object.freeze(services),
    extensions: frozenExtensions,
    getExtension: (name: string) => frozenExtensions.find((extension) => extension.name === name),
  });
}
