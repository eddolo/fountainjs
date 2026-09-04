import { createEditor, type NodeJSON } from '../core';
import {
  CoreExtension,
  composeExtensions,
  defineExtension,
  type FountainExtension,
} from '../extensions';

export interface ExtensionDocumentFixture {
  readonly name: string;
  readonly document: NodeJSON;
}

export interface ExtensionCommandFixture {
  readonly name: string;
  readonly args?: readonly unknown[];
  readonly document?: NodeJSON;
  readonly expectAccepted?: boolean;
  /** When set, the command is executed after its dry run and its result is checked. */
  readonly expectDocumentChange?: boolean;
}

export interface ExtensionConformanceOptions {
  /** Extensions composed before the extension under test. Defaults to `CoreExtension`. */
  readonly baseExtensions?: readonly FountainExtension[];
  readonly documents?: readonly ExtensionDocumentFixture[];
  readonly commands?: readonly ExtensionCommandFixture[];
  /** Independently published extensions should keep this enabled. Defaults to true. */
  readonly requireManifest?: boolean;
}

export type ExtensionConformanceStatus = 'passed' | 'failed' | 'warning';

export interface ExtensionConformanceCheck {
  readonly id: string;
  readonly status: ExtensionConformanceStatus;
  readonly message: string;
}

export interface ExtensionConformanceInventory {
  readonly nodes: readonly string[];
  readonly marks: readonly string[];
  readonly commands: readonly string[];
  readonly formats: readonly string[];
  readonly services: readonly string[];
  readonly plugins: number;
}

export interface ExtensionConformanceReport {
  readonly extension: string;
  readonly passed: boolean;
  readonly checks: readonly ExtensionConformanceCheck[];
  readonly inventory: ExtensionConformanceInventory;
}

export interface ExtensionCompatibilityOptions {
  /** Extensions supplied by the host before third-party modules. Defaults to `CoreExtension`. */
  readonly baseExtensions?: readonly FountainExtension[];
  /** Defaults to true for every extension passed as the first argument. */
  readonly requireManifests?: boolean;
}

export interface ExtensionCompatibilityIssue {
  readonly code: 'invalid-definition' | 'missing-manifest' | 'duplicate-extension' | 'missing-requirement' | 'contribution-conflict' | 'composition-failure';
  readonly severity: 'error' | 'warning';
  readonly extension?: string;
  readonly message: string;
}

export interface ExtensionCompatibilityReport {
  readonly passed: boolean;
  readonly extensionNames: readonly string[];
  readonly issues: readonly ExtensionCompatibilityIssue[];
}

function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJSON(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function inventory(extension: FountainExtension): ExtensionConformanceInventory {
  const names = (values: Readonly<Record<string, unknown>> | undefined) => Object.freeze(Object.keys(values ?? {}).sort());
  return Object.freeze({
    nodes: names(extension.nodes),
    marks: names(extension.marks),
    commands: names(extension.commands),
    formats: names(extension.formats),
    services: names(extension.services),
    plugins: extension.plugins?.length ?? 0,
  });
}

/**
 * Runs the framework-neutral contract expected of a distributable FountainJS
 * extension. It never mounts a DOM view and returns every discovered failure.
 */
export function checkExtensionConformance(
  extension: FountainExtension,
  options: ExtensionConformanceOptions = {},
): ExtensionConformanceReport {
  const checks: ExtensionConformanceCheck[] = [];
  const add = (id: string, status: ExtensionConformanceStatus, message: string) => {
    checks.push(Object.freeze({ id, status, message }));
  };
  const capture = (id: string, success: string, operation: () => void): boolean => {
    try {
      operation();
      add(id, 'passed', success);
      return true;
    } catch (error) {
      add(id, 'failed', error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  if (options.requireManifest !== false && !extension.manifest) {
    add('manifest', 'failed', 'Published extensions must declare a versioned manifest.');
  } else if (extension.manifest) {
    capture('manifest', 'Manifest metadata and extension API version are valid.', () => {
      // Re-definition validates metadata without conflating it with dependency
      // ordering, which is reported independently by the composition check.
      defineExtension({ ...extension, manifest: extension.manifest });
    });
  } else {
    add('manifest', 'warning', 'Manifest checking was disabled by the host.');
  }

  if (!Object.isFrozen(extension)) {
    add('definition', 'failed', 'Use defineExtension(...) so the published extension definition is immutable.');
  } else {
    add('definition', 'passed', 'The extension definition is immutable.');
  }

  let kit: ReturnType<typeof composeExtensions> | undefined;
  capture('composition', 'The extension composes without missing requirements or collisions.', () => {
    kit = composeExtensions([...(options.baseExtensions ?? [CoreExtension]), extension]);
  });

  const documents = options.documents ?? [];
  if (!documents.length) {
    add('documents', 'warning', 'No document fixtures were supplied; add one for every custom node shape.');
  } else if (kit) {
    documents.forEach((fixture) => {
      capture(`document:${fixture.name}`, `Document fixture "${fixture.name}" validates and round-trips.`, () => {
        const editor = createEditor({ schema: kit!.schema, plugins: kit!.plugins, content: fixture.document });
        try {
          const encoded = editor.getJSON();
          const decoded = editor.state.schema.nodeFromJSON(encoded);
          if (!decoded.eq(editor.state.doc)) throw new Error(`Document fixture "${fixture.name}" changed during JSON round-trip.`);
        } finally {
          editor.destroy();
        }
      });
    });
  }

  const commandFixtures = options.commands ?? [];
  const coveredCommands = new Set(commandFixtures.map((fixture) => fixture.name));
  Object.keys(extension.commands ?? {}).filter((name) => !coveredCommands.has(name)).forEach((name) => {
    add(`command:${name}:coverage`, 'warning', `Command "${name}" has no conformance fixture.`);
  });
  if (kit) {
    commandFixtures.forEach((fixture) => {
      capture(`command:${fixture.name}`, `Command "${fixture.name}" preserves state during dry runs.`, () => {
        const command = extension.commands?.[fixture.name];
        if (!command) throw new Error(`Unknown extension command: ${fixture.name}`);
        const content = fixture.document ?? documents[0]?.document;
        const updates: string[] = [];
        const editor = createEditor({
          schema: kit!.schema,
          plugins: kit!.plugins,
          ...(content ? { content } : {}),
          onUpdate: (state) => updates.push(stableJSON(state.doc.toJSON())),
        });
        try {
          const before = stableJSON(editor.getJSON());
          const accepted = editor.runCommandBatch(
            () => command(editor, ...(fixture.args ?? [])),
            { dryRun: true },
          );
          if (fixture.expectAccepted !== undefined && accepted !== fixture.expectAccepted) {
            throw new Error(`Command "${fixture.name}" returned ${accepted}; expected ${fixture.expectAccepted}.`);
          }
          if (stableJSON(editor.getJSON()) !== before || updates.length) {
            throw new Error(`Command "${fixture.name}" mutated observable state during a dry run.`);
          }
          if (fixture.expectDocumentChange !== undefined) {
            const executed = editor.runCommandBatch(() => command(editor, ...(fixture.args ?? [])));
            const changed = stableJSON(editor.getJSON()) !== before;
            if (!executed && fixture.expectDocumentChange) {
              throw new Error(`Command "${fixture.name}" refused its executable fixture.`);
            }
            if (changed !== fixture.expectDocumentChange) {
              throw new Error(`Command "${fixture.name}" document-change result was ${changed}; expected ${fixture.expectDocumentChange}.`);
            }
          }
        } finally {
          editor.destroy();
        }
      });
    });
  }

  return Object.freeze({
    extension: extension.name,
    passed: checks.every((check) => check.status !== 'failed'),
    checks: Object.freeze(checks),
    inventory: inventory(extension),
  });
}

/** Throws one actionable error containing every failed conformance check. */
export function assertExtensionConformance(
  extension: FountainExtension,
  options: ExtensionConformanceOptions = {},
): ExtensionConformanceReport {
  const report = checkExtensionConformance(extension, options);
  const failures = report.checks.filter((check) => check.status === 'failed');
  if (failures.length) {
    throw new Error(`Extension ${report.extension} failed FountainJS conformance:\n${failures.map((check) => `- [${check.id}] ${check.message}`).join('\n')}`);
  }
  return report;
}

/** Inspects a complete ordered extension installation and reports all conflicts. */
export function checkExtensionCompatibility(
  extensions: readonly FountainExtension[],
  options: ExtensionCompatibilityOptions = {},
): ExtensionCompatibilityReport {
  const baseExtensions: readonly FountainExtension[] = options.baseExtensions ?? [CoreExtension];
  const complete: FountainExtension[] = [...baseExtensions, ...extensions];
  const issues: ExtensionCompatibilityIssue[] = [];
  const add = (issue: ExtensionCompatibilityIssue) => issues.push(Object.freeze(issue));

  extensions.forEach((extension) => {
    if (options.requireManifests !== false && !extension.manifest) {
      add({
        code: 'missing-manifest',
        severity: 'error',
        extension: extension.name,
        message: `Extension ${extension.name} has no compatibility manifest.`,
      });
    }
    if (!Object.isFrozen(extension)) {
      add({
        code: 'invalid-definition',
        severity: 'error',
        extension: extension.name,
        message: `Extension ${extension.name} is mutable; publish it through defineExtension(...).`,
      });
    }
    try { defineExtension({ ...extension }); }
    catch (error) {
      add({
        code: 'invalid-definition',
        severity: 'error',
        extension: extension.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const seen = new Set<string>();
  const owners = new Map<string, string>();
  complete.forEach((extension) => {
    if (seen.has(extension.name)) {
      add({
        code: 'duplicate-extension',
        severity: 'error',
        extension: extension.name,
        message: `Duplicate extension name: ${extension.name}`,
      });
    }
    const requirements = Array.isArray(extension.manifest?.requires) ? extension.manifest.requires : [];
    requirements.filter((name) => !seen.has(name)).forEach((name) => add({
      code: 'missing-requirement',
      severity: 'error',
      extension: extension.name,
      message: `Extension ${extension.name} requires earlier extension: ${name}`,
    }));
    seen.add(extension.name);
    for (const [kind, values] of [
      ['node', extension.nodes],
      ['mark', extension.marks],
      ['command', extension.commands],
      ['format', extension.formats],
      ['service', extension.services],
    ] as const) {
      Object.keys(values ?? {}).forEach((name) => {
        const key = `${kind}:${name}`;
        const owner = owners.get(key);
        if (owner) add({
          code: 'contribution-conflict',
          severity: 'error',
          extension: extension.name,
          message: `Extension ${extension.name} conflicts with ${owner} on ${kind}: ${name}`,
        });
        else owners.set(key, extension.name);
      });
    }
  });

  if (!issues.some((issue) => issue.severity === 'error')) {
    try { composeExtensions(complete); }
    catch (error) {
      add({
        code: 'composition-failure',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Object.freeze({
    passed: issues.every((issue) => issue.severity !== 'error'),
    extensionNames: Object.freeze(complete.map((extension) => extension.name)),
    issues: Object.freeze(issues),
  });
}

/** Throws one error containing every problem found across an extension set. */
export function assertExtensionCompatibility(
  extensions: readonly FountainExtension[],
  options: ExtensionCompatibilityOptions = {},
): ExtensionCompatibilityReport {
  const report = checkExtensionCompatibility(extensions, options);
  if (!report.passed) {
    throw new Error(`FountainJS extension compatibility check failed:\n${report.issues.map((issue) => `- [${issue.code}] ${issue.message}`).join('\n')}`);
  }
  return report;
}
