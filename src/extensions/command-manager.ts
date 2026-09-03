import type { Editor } from '../core';
import type { ExtensionCommand } from './extension';

export type CommandRegistry = Readonly<Record<string, ExtensionCommand>>;

type CommandArguments<T> = T extends (editor: Editor, ...args: infer Args) => boolean ? Args : never;

export type BoundCommands<Commands extends CommandRegistry> = {
  readonly [Name in keyof Commands]: (...args: CommandArguments<Commands[Name]>) => boolean;
};

type FluentCommands<Commands extends CommandRegistry> = {
  readonly [Name in keyof Commands]: (...args: CommandArguments<Commands[Name]>) => CommandChain<Commands>;
};

export type CommandChain<Commands extends CommandRegistry> = Omit<FluentCommands<Commands>, 'command' | 'run'> & {
  command<Name extends keyof Commands>(name: Name, ...args: CommandArguments<Commands[Name]>): CommandChain<Commands>;
  run(): boolean;
};

export type CommandCapabilities<Commands extends CommandRegistry> = Omit<BoundCommands<Commands>, 'chain' | 'command'> & {
  command<Name extends keyof Commands>(name: Name, ...args: CommandArguments<Commands[Name]>): boolean;
  chain(): CommandChain<Commands>;
};

export interface CommandManager<Commands extends CommandRegistry> {
  /** Commands bound to this editor and executed immediately. */
  readonly commands: BoundCommands<Commands>;
  /** Queue commands and commit all document changes in one transaction. */
  chain(): CommandChain<Commands>;
  /** Query commands against temporary state without changing the editor. */
  can(): CommandCapabilities<Commands>;
}

export type CommandChecks<Commands extends CommandRegistry> = Partial<{
  readonly [Name in keyof Commands]: Commands[Name];
}>;

export interface CommandManagerOptions<Commands extends CommandRegistry> {
  /** Side-effect-free command equivalents used by `can()`; omitted commands run temporarily. */
  checks?: CommandChecks<Commands>;
}

interface QueuedCommand {
  name: string;
  command: ExtensionCommand;
  args: unknown[];
}

const CHAIN_RESERVED_NAMES = new Set(['command', 'run']);

function bindCommands<Commands extends CommandRegistry>(
  editor: Editor,
  commands: Commands,
  checks: CommandChecks<Commands>,
  dryRun: boolean,
): BoundCommands<Commands> {
  const bound: Record<string, (...args: unknown[]) => boolean> = Object.create(null) as Record<string, (...args: unknown[]) => boolean>;
  Object.entries(commands).forEach(([name, command]) => {
    bound[name] = (...args) => dryRun
      ? editor.runCommandBatch(() => (checks[name] ?? command)(editor, ...args), { dryRun: true })
      : command(editor, ...args);
  });
  return Object.freeze(bound) as BoundCommands<Commands>;
}

function createChain<Commands extends CommandRegistry>(
  editor: Editor,
  commands: Commands,
  checks: CommandChecks<Commands>,
  dryRun: boolean,
): CommandChain<Commands> {
  const queue: QueuedCommand[] = [];
  const chain: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const enqueue = (name: keyof Commands, args: unknown[]): CommandChain<Commands> => {
    const command = commands[name as string];
    if (!command) throw new Error(`Unknown FountainJS command: ${String(name)}`);
    queue.push({ name: String(name), command, args });
    return chain as CommandChain<Commands>;
  };
  chain.command = (name: keyof Commands, ...args: unknown[]) => enqueue(name, args);
  chain.run = () => editor.runCommandBatch(
    () => queue.every(({ name, command, args }) => (
      dryRun ? checks[name] ?? command : command
    )(editor, ...args)),
    { dryRun },
  );
  Object.keys(commands).forEach((name) => {
    if (!CHAIN_RESERVED_NAMES.has(name)) chain[name] = (...args: unknown[]) => enqueue(name, args);
  });
  return chain as CommandChain<Commands>;
}

/** Binds a composed extension command registry to one editor instance. */
export function createCommandManager<Commands extends CommandRegistry>(
  editor: Editor,
  commands: Commands,
  options: CommandManagerOptions<Commands> = {},
): CommandManager<Commands> {
  const checks: CommandChecks<Commands> = options.checks ?? {};
  const capabilities = { ...bindCommands(editor, commands, checks, true) } as Record<string, unknown>;
  capabilities.command = (name: keyof Commands, ...args: unknown[]) => {
    const command = commands[name as string];
    if (!command) throw new Error(`Unknown FountainJS command: ${String(name)}`);
    return editor.runCommandBatch(() => (checks[name] ?? command)(editor, ...args), { dryRun: true });
  };
  capabilities.chain = () => createChain(editor, commands, checks, true);
  return Object.freeze({
    commands: bindCommands(editor, commands, checks, false),
    chain: () => createChain(editor, commands, checks, false),
    can: () => Object.freeze(capabilities) as unknown as CommandCapabilities<Commands>,
  });
}
