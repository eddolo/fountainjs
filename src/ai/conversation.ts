export const MAX_AI_CONVERSATION_MESSAGES = 500;
export const MAX_AI_CONVERSATION_MESSAGE_LENGTH = 1_000_000;
export const MAX_AI_CONVERSATION_METADATA_LENGTH = 100_000;
export const MAX_AI_PROMPT_TEMPLATE_LENGTH = 100_000;

export type AIConversationRole = 'user' | 'assistant';

export interface AIConversationMessage {
  readonly id: string;
  readonly role: AIConversationRole;
  readonly content: string;
  readonly createdAt: string;
  readonly model?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIConversationThread {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly title?: string;
  readonly messages: readonly AIConversationMessage[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIConversationLoadRequest {
  readonly threadId: string;
  readonly signal?: AbortSignal;
}

export interface AIConversationSaveRequest {
  readonly thread: AIConversationThread;
  /** `null` means the thread must not exist. */
  readonly expectedRevision: number | null;
  readonly operationId: string;
  readonly signal?: AbortSignal;
}

/** Host persistence boundary. Authentication, authorization, retention, and encryption stay host-owned. */
export interface AIConversationStore {
  load(request: AIConversationLoadRequest): AIConversationThread | undefined | Promise<AIConversationThread | undefined>;
  save(request: AIConversationSaveRequest): AIConversationThread | Promise<AIConversationThread>;
}

export interface AIConversationRequest {
  readonly id: string;
  readonly threadId: string;
  readonly messages: readonly AIConversationMessage[];
  readonly privacy: {
    readonly includedMessages: number;
    readonly totalThreadMessages: number;
  };
}

export interface AIConversationResult {
  readonly content: string;
  readonly model?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIConversationChunk {
  readonly contentDelta?: string;
  readonly model?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIConversationAdapterContext {
  readonly signal: AbortSignal;
}

export interface AIConversationAdapter {
  reply(
    request: AIConversationRequest,
    context: AIConversationAdapterContext,
  ): Promise<AIConversationResult | string>;
  stream?(
    request: AIConversationRequest,
    context: AIConversationAdapterContext,
  ): AsyncIterable<AIConversationChunk>;
}

export interface AIConversationSnapshot {
  readonly status: 'idle' | 'loading' | 'requesting' | 'streaming' | 'error';
  readonly thread?: AIConversationThread;
  readonly activeRequest?: AIConversationRequest;
  /** Transient adapter output. It is not persisted until the response completes. */
  readonly streamingContent?: string;
  readonly error?: string;
}

export interface AIConversationControllerOptions {
  readonly threadId: string;
  readonly store: AIConversationStore;
  readonly adapter: AIConversationAdapter;
  readonly title?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly maxContextMessages?: number;
  readonly autoLoad?: boolean;
  readonly now?: () => Date | string;
  readonly idFactory?: (kind: 'message' | 'request' | 'operation') => string;
}

export interface AIPromptTemplate {
  readonly id: string;
  readonly title: string;
  readonly template: string;
  readonly variables: readonly string[];
  readonly description?: string;
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIPromptStore {
  list(options?: { readonly signal?: AbortSignal }): readonly AIPromptTemplate[] | Promise<readonly AIPromptTemplate[]>;
  load(id: string, options?: { readonly signal?: AbortSignal }): AIPromptTemplate | undefined | Promise<AIPromptTemplate | undefined>;
  save(prompt: AIPromptTemplate, options?: { readonly signal?: AbortSignal }): AIPromptTemplate | Promise<AIPromptTemplate>;
  remove?(id: string, options?: { readonly signal?: AbortSignal }): void | Promise<void>;
}

export class AIConversationConflictError extends Error {
  readonly name = 'AIConversationConflictError';

  constructor(message = 'The conversation changed in its host store. Reload and try again.') {
    super(message);
  }
}

let generatedId = 0;

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 && /^[\w.:@/-]+$/.test(value);
}

function id(options: AIConversationControllerOptions, kind: 'message' | 'request' | 'operation'): string {
  const supplied = options.idFactory?.(kind);
  if (supplied !== undefined) {
    if (!validId(supplied)) throw new TypeError(`Invalid ${kind} id.`);
    return supplied;
  }
  generatedId += 1;
  return `${kind}-${Date.now().toString(36)}-${generatedId.toString(36)}`;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('AI conversation timestamps must be valid.');
  return date.toISOString();
}

function now(options: AIConversationControllerOptions): string {
  return timestamp(options.now?.() ?? new Date());
}

function abortError(): Error {
  const error = new Error('The AI conversation request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? abortError();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function cloneJSON<T>(value: T, label: string, maximum = MAX_AI_CONVERSATION_METADATA_LENGTH): T {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
  if (encoded === undefined || encoded.length > maximum || encoded.includes('\0')) {
    throw new RangeError(`${label} exceeds the safety limit.`);
  }
  return deepFreeze(JSON.parse(encoded) as T);
}

function boundedText(value: unknown, label: string, maximum = MAX_AI_CONVERSATION_MESSAGE_LENGTH): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) {
    throw new TypeError(`${label} must be bounded, non-empty text.`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) {
    throw new TypeError(`${label} must be bounded, non-empty text.`);
  }
  return value.trim();
}

function normalizeMetadata(value: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('AI metadata must be an object.');
  return cloneJSON(value, 'AI metadata');
}

export function normalizeAIConversationMessage(value: AIConversationMessage): AIConversationMessage {
  if (!value || !validId(value.id) || !['user', 'assistant'].includes(value.role)) {
    throw new TypeError('Invalid AI conversation message.');
  }
  const model = optionalText(value.model, 'AI model', 500);
  const metadata = normalizeMetadata(value.metadata);
  return Object.freeze({
    id: value.id,
    role: value.role,
    content: boundedText(value.content, 'AI conversation message'),
    createdAt: timestamp(value.createdAt),
    ...(model ? { model } : {}),
    ...(metadata ? { metadata } : {}),
  });
}

export function normalizeAIConversationThread(value: AIConversationThread, expectedId?: string): AIConversationThread {
  if (!value || !validId(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.messages)
    || value.messages.length > MAX_AI_CONVERSATION_MESSAGES) {
    throw new TypeError('Invalid AI conversation thread.');
  }
  const title = optionalText(value.title, 'AI conversation title', 300);
  const metadata = normalizeMetadata(value.metadata);
  const messages = Object.freeze(value.messages.map(normalizeAIConversationMessage));
  const ids = new Set(messages.map((message) => message.id));
  if (ids.size !== messages.length) throw new TypeError('AI conversation message ids must be unique.');
  return Object.freeze({
    id: value.id,
    revision: value.revision,
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
    ...(title ? { title } : {}),
    messages,
    ...(metadata ? { metadata } : {}),
  });
}

function normalizeResult(value: AIConversationResult | string): AIConversationResult {
  const candidate = typeof value === 'string' ? { content: value } : value;
  if (!candidate || typeof candidate !== 'object') throw new TypeError('The AI conversation adapter returned an invalid result.');
  const model = optionalText(candidate.model, 'AI model', 500);
  const metadata = normalizeMetadata(candidate.metadata);
  return Object.freeze({
    content: boundedText(candidate.content, 'AI conversation response'),
    ...(model ? { model } : {}),
    ...(metadata ? { metadata } : {}),
  });
}

interface StreamAccumulator {
  content: string;
  model?: string;
  metadata?: Readonly<Record<string, unknown>>;
  chunks: number;
}

function appendChunk(state: StreamAccumulator, chunk: AIConversationChunk): void {
  if (!chunk || typeof chunk !== 'object'
    || (chunk.contentDelta === undefined && chunk.model === undefined && chunk.metadata === undefined)) {
    throw new TypeError('The AI conversation stream returned an empty or invalid chunk.');
  }
  state.chunks += 1;
  if (state.chunks > 10_000) throw new RangeError('The AI conversation stream exceeded the chunk limit.');
  if (chunk.contentDelta !== undefined) {
    if (typeof chunk.contentDelta !== 'string' || chunk.contentDelta.includes('\0')) {
      throw new TypeError('AI conversation stream content must be text.');
    }
    state.content += chunk.contentDelta;
    if (state.content.length > MAX_AI_CONVERSATION_MESSAGE_LENGTH) {
      throw new RangeError('The AI conversation response exceeds the safety limit.');
    }
  }
  if (chunk.model !== undefined) state.model = optionalText(chunk.model, 'AI model', 500);
  if (chunk.metadata !== undefined) state.metadata = normalizeMetadata(chunk.metadata);
}

export function createAIConversationAdapter(
  reply: AIConversationAdapter['reply'],
): AIConversationAdapter {
  if (typeof reply !== 'function') throw new TypeError('AI conversation reply must be a function.');
  return { reply };
}

export function createStreamingAIConversationAdapter(
  stream: NonNullable<AIConversationAdapter['stream']>,
): AIConversationAdapter {
  if (typeof stream !== 'function') throw new TypeError('AI conversation stream must be a function.');
  return {
    stream,
    async reply(request, context) {
      const state: StreamAccumulator = { content: '', chunks: 0 };
      for await (const chunk of stream(request, context)) {
        abortIfNeeded(context.signal);
        appendChunk(state, chunk);
      }
      abortIfNeeded(context.signal);
      return normalizeResult({ content: state.content, model: state.model, metadata: state.metadata });
    },
  };
}

export class InMemoryAIConversationStore implements AIConversationStore {
  private readonly threads = new Map<string, AIConversationThread>();
  private readonly operations = new Map<string, AIConversationThread>();

  load(request: AIConversationLoadRequest): AIConversationThread | undefined {
    abortIfNeeded(request.signal);
    if (!validId(request.threadId)) throw new TypeError('A valid AI conversation thread id is required.');
    return this.threads.get(request.threadId);
  }

  save(request: AIConversationSaveRequest): AIConversationThread {
    abortIfNeeded(request.signal);
    if (!validId(request.operationId)) throw new TypeError('A valid AI conversation operation id is required.');
    const thread = normalizeAIConversationThread(request.thread);
    const repeated = this.operations.get(request.operationId);
    if (repeated) {
      if (JSON.stringify(repeated) === JSON.stringify(thread)) return repeated;
      throw new AIConversationConflictError('The operation id was already used for a different conversation save.');
    }
    const current = this.threads.get(thread.id);
    if ((current?.revision ?? null) !== request.expectedRevision) throw new AIConversationConflictError();
    if (thread.revision !== (current?.revision ?? 0) + 1) {
      throw new AIConversationConflictError('Conversation revisions must increase by one.');
    }
    this.threads.set(thread.id, thread);
    this.operations.set(request.operationId, thread);
    while (this.operations.size > 10_000) {
      const oldest = this.operations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.operations.delete(oldest);
    }
    return thread;
  }
}

export class AIConversationController {
  private readonly listeners = new Set<() => void>();
  private readonly options: AIConversationControllerOptions;
  private snapshot: AIConversationSnapshot = Object.freeze({ status: 'idle' });
  private thread?: AIConversationThread;
  private activeAbort?: AbortController;
  private loadPromise?: Promise<AIConversationThread>;
  private destroyed = false;

  constructor(options: AIConversationControllerOptions) {
    if (!options || !validId(options.threadId) || !options.store || !options.adapter
      || (typeof options.adapter.reply !== 'function' && typeof options.adapter.stream !== 'function')) {
      throw new TypeError('AIConversationController requires a valid thread id, host store, and adapter.');
    }
    const maxContextMessages = options.maxContextMessages ?? 50;
    if (!Number.isSafeInteger(maxContextMessages) || maxContextMessages < 1 || maxContextMessages > MAX_AI_CONVERSATION_MESSAGES) {
      throw new RangeError(`maxContextMessages must be between 1 and ${MAX_AI_CONVERSATION_MESSAGES}.`);
    }
    const metadata = normalizeMetadata(options.metadata);
    const title = optionalText(options.title, 'AI conversation title', 300);
    this.options = Object.freeze({ ...options, maxContextMessages, ...(metadata ? { metadata } : {}), ...(title ? { title } : {}) });
    if (options.autoLoad !== false) void this.load().catch(() => {});
  }

  getSnapshot = (): AIConversationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async load(): Promise<AIConversationThread> {
    this.assertAlive();
    if (this.loadPromise) return this.loadPromise;
    this.cancel();
    const abort = new AbortController();
    this.activeAbort = abort;
    this.publish({ status: 'loading', error: undefined, activeRequest: undefined, streamingContent: undefined });
    this.loadPromise = (async () => {
      try {
        const stored = await this.options.store.load({ threadId: this.options.threadId, signal: abort.signal });
        abortIfNeeded(abort.signal);
        this.thread = stored ? normalizeAIConversationThread(stored, this.options.threadId) : this.emptyThread();
        this.activeAbort = undefined;
        this.publish({ status: 'idle', thread: this.thread, error: undefined });
        return this.thread;
      } catch (error) {
        if (this.activeAbort === abort) {
          this.activeAbort = undefined;
          this.publish({ status: 'error', error: error instanceof Error ? error.message : 'The conversation store failed.' });
        }
        throw error;
      } finally {
        this.loadPromise = undefined;
      }
    })();
    return this.loadPromise;
  }

  async inspectRequest(input: string): Promise<AIConversationRequest> {
    this.assertAlive();
    const content = boundedText(input, 'AI conversation input');
    const thread = this.thread ?? await this.load();
    const createdAt = now(this.options);
    const userMessage = normalizeAIConversationMessage({
      id: id(this.options, 'message'), role: 'user', content, createdAt,
    });
    return this.requestFor(Object.freeze([...thread.messages, userMessage]));
  }

  async send(input: string): Promise<AIConversationMessage> {
    this.assertAlive();
    const content = boundedText(input, 'AI conversation input');
    if (this.snapshot.status === 'requesting' || this.snapshot.status === 'streaming') {
      throw new Error('Wait for or cancel the active AI conversation response.');
    }
    const thread = this.thread ?? await this.load();
    if (thread.messages.length >= MAX_AI_CONVERSATION_MESSAGES - 1) {
      throw new RangeError('The AI conversation has reached its message limit. Start a new thread.');
    }
    const abort = new AbortController();
    this.activeAbort = abort;
    const createdAt = now(this.options);
    const userMessage = normalizeAIConversationMessage({
      id: id(this.options, 'message'), role: 'user', content, createdAt,
    });
    try {
      const withUser = await this.persist([...thread.messages, userMessage], thread, abort.signal);
      this.thread = withUser;
      const request = this.requestFor(withUser.messages);
      this.publish({ status: 'requesting', thread: withUser, activeRequest: request, streamingContent: undefined, error: undefined });
      const result = await this.runAdapter(request, abort);
      abortIfNeeded(abort.signal);
      if (this.activeAbort !== abort) throw abortError();
      const assistantMessage = normalizeAIConversationMessage({
        id: id(this.options, 'message'),
        role: 'assistant',
        content: result.content,
        createdAt: now(this.options),
        model: result.model,
        metadata: result.metadata,
      });
      const completed = await this.persist([...withUser.messages, assistantMessage], withUser, abort.signal);
      this.thread = completed;
      this.activeAbort = undefined;
      this.publish({ status: 'idle', thread: completed, activeRequest: undefined, streamingContent: undefined, error: undefined });
      return assistantMessage;
    } catch (error) {
      if (this.activeAbort === abort) {
        this.activeAbort = undefined;
        this.publish({
          status: error instanceof Error && error.name === 'AbortError' ? 'idle' : 'error',
          ...(this.thread ? { thread: this.thread } : {}),
          activeRequest: undefined,
          streamingContent: undefined,
          ...(error instanceof Error && error.name !== 'AbortError' ? { error: error.message } : { error: undefined }),
        });
      }
      throw error;
    }
  }

  async clear(): Promise<AIConversationThread> {
    this.assertAlive();
    if (this.snapshot.status === 'requesting' || this.snapshot.status === 'streaming') {
      throw new Error('Cancel the active AI conversation response before clearing history.');
    }
    const thread = this.thread ?? await this.load();
    const abort = new AbortController();
    this.activeAbort = abort;
    try {
      const cleared = await this.persist([], thread, abort.signal);
      this.thread = cleared;
      this.activeAbort = undefined;
      this.publish({ status: 'idle', thread: cleared, error: undefined });
      return cleared;
    } catch (error) {
      if (this.activeAbort === abort) {
        this.activeAbort = undefined;
        this.publish({ status: 'error', thread, error: error instanceof Error ? error.message : 'The conversation store failed.' });
      }
      throw error;
    }
  }

  cancel(): void {
    this.activeAbort?.abort(abortError());
    this.activeAbort = undefined;
    if (this.snapshot.status === 'loading' || this.snapshot.status === 'requesting' || this.snapshot.status === 'streaming') {
      this.publish({ status: 'idle', ...(this.thread ? { thread: this.thread } : {}), error: undefined });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.cancel();
    this.destroyed = true;
    this.listeners.clear();
  }

  private emptyThread(): AIConversationThread {
    const createdAt = now(this.options);
    return normalizeAIConversationThread({
      id: this.options.threadId,
      revision: 0,
      createdAt,
      updatedAt: createdAt,
      messages: [],
      title: this.options.title,
      metadata: this.options.metadata,
    });
  }

  private requestFor(messages: readonly AIConversationMessage[]): AIConversationRequest {
    const maximum = this.options.maxContextMessages ?? 50;
    const included = messages.slice(-maximum);
    return Object.freeze({
      id: id(this.options, 'request'),
      threadId: this.options.threadId,
      messages: Object.freeze([...included]),
      privacy: Object.freeze({ includedMessages: included.length, totalThreadMessages: messages.length }),
    });
  }

  private async persist(
    messages: readonly AIConversationMessage[],
    previous: AIConversationThread,
    signal: AbortSignal,
  ): Promise<AIConversationThread> {
    const candidate = normalizeAIConversationThread({
      ...previous,
      revision: previous.revision + 1,
      updatedAt: now(this.options),
      messages,
    }, this.options.threadId);
    const saved = await this.options.store.save({
      thread: candidate,
      expectedRevision: previous.revision === 0 ? null : previous.revision,
      operationId: id(this.options, 'operation'),
      signal,
    });
    abortIfNeeded(signal);
    return normalizeAIConversationThread(saved, this.options.threadId);
  }

  private async runAdapter(request: AIConversationRequest, abort: AbortController): Promise<AIConversationResult> {
    if (!this.options.adapter.stream) return normalizeResult(await this.options.adapter.reply(request, { signal: abort.signal }));
    const state: StreamAccumulator = { content: '', chunks: 0 };
    this.publish({ status: 'streaming', thread: this.thread, activeRequest: request, streamingContent: '', error: undefined });
    for await (const chunk of this.options.adapter.stream(request, { signal: abort.signal })) {
      abortIfNeeded(abort.signal);
      if (this.activeAbort !== abort) throw abortError();
      appendChunk(state, chunk);
      this.publish({
        status: 'streaming', thread: this.thread, activeRequest: request,
        streamingContent: state.content, error: undefined,
      });
    }
    abortIfNeeded(abort.signal);
    return normalizeResult({ content: state.content, model: state.model, metadata: state.metadata });
  }

  private publish(value: AIConversationSnapshot): void {
    this.snapshot = Object.freeze({ ...value });
    this.listeners.forEach((listener) => listener());
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AIConversationController is destroyed.');
  }
}

function promptVariables(template: string): readonly string[] {
  return Object.freeze([...new Set([...template.matchAll(/\{\{([A-Za-z][\w.-]*)\}\}/g)].map((match) => match[1] as string))]);
}

export function defineAIPromptTemplate(value: Omit<AIPromptTemplate, 'variables'> & { readonly variables?: readonly string[] }): AIPromptTemplate {
  if (!value || !validId(value.id)) throw new TypeError('AI prompts require a valid id.');
  const title = boundedText(value.title, 'AI prompt title', 300).trim();
  const template = boundedText(value.template, 'AI prompt template', MAX_AI_PROMPT_TEMPLATE_LENGTH);
  const discovered = promptVariables(template);
  const variables = value.variables === undefined ? discovered : Object.freeze([...value.variables]);
  if (variables.some((variable) => !/^[A-Za-z][\w.-]*$/.test(variable))
    || new Set(variables).size !== variables.length
    || variables.length !== discovered.length
    || variables.some((variable) => !discovered.includes(variable))) {
    throw new TypeError('AI prompt variables must exactly match the template placeholders.');
  }
  const description = optionalText(value.description, 'AI prompt description', 1_000);
  const metadata = normalizeMetadata(value.metadata);
  return Object.freeze({
    id: value.id, title, template, variables, updatedAt: timestamp(value.updatedAt),
    ...(description ? { description } : {}), ...(metadata ? { metadata } : {}),
  });
}

export function renderAIPrompt(
  prompt: AIPromptTemplate,
  values: Readonly<Record<string, string>>,
): string {
  const normalized = defineAIPromptTemplate(prompt);
  const supplied = Object.keys(values);
  const missing = normalized.variables.filter((variable) => typeof values[variable] !== 'string');
  const unknown = supplied.filter((variable) => !normalized.variables.includes(variable));
  if (missing.length || unknown.length) {
    throw new TypeError(`AI prompt values do not match the template (${[
      ...(missing.length ? [`missing: ${missing.join(', ')}`] : []),
      ...(unknown.length ? [`unknown: ${unknown.join(', ')}`] : []),
    ].join('; ')}).`);
  }
  const rendered = normalized.template.replace(/\{\{([A-Za-z][\w.-]*)\}\}/g, (_match, variable: string) => values[variable] as string);
  if (rendered.length > MAX_AI_CONVERSATION_MESSAGE_LENGTH || rendered.includes('\0')) {
    throw new RangeError('The rendered AI prompt exceeds the conversation safety limit.');
  }
  return rendered;
}

export class InMemoryAIPromptStore implements AIPromptStore {
  private readonly prompts = new Map<string, AIPromptTemplate>();

  constructor(prompts: readonly AIPromptTemplate[] = []) {
    prompts.forEach((prompt) => {
      const normalized = defineAIPromptTemplate(prompt);
      if (this.prompts.has(normalized.id)) throw new TypeError(`Duplicate AI prompt id: ${normalized.id}`);
      this.prompts.set(normalized.id, normalized);
    });
  }

  list(options?: { readonly signal?: AbortSignal }): readonly AIPromptTemplate[] {
    abortIfNeeded(options?.signal);
    return Object.freeze([...this.prompts.values()].sort((left, right) => left.title.localeCompare(right.title)));
  }

  load(id: string, options?: { readonly signal?: AbortSignal }): AIPromptTemplate | undefined {
    abortIfNeeded(options?.signal);
    if (!validId(id)) throw new TypeError('A valid AI prompt id is required.');
    return this.prompts.get(id);
  }

  save(prompt: AIPromptTemplate, options?: { readonly signal?: AbortSignal }): AIPromptTemplate {
    abortIfNeeded(options?.signal);
    const normalized = defineAIPromptTemplate(prompt);
    this.prompts.set(normalized.id, normalized);
    return normalized;
  }

  remove(id: string, options?: { readonly signal?: AbortSignal }): void {
    abortIfNeeded(options?.signal);
    if (!validId(id)) throw new TypeError('A valid AI prompt id is required.');
    this.prompts.delete(id);
  }
}
