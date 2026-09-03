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

/** A framework-neutral bundle of editor capabilities. */
export interface FountainExtension {
  name: string;
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

export function defineExtension<T extends FountainExtension>(extension: T): T {
  if (!extension.name.trim()) throw new Error('Extensions require a non-empty name.');
  return Object.freeze({ ...extension });
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
    if (names.has(extension.name)) throw new Error(`Duplicate extension name: ${extension.name}`);
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
