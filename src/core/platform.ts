/**
 * Resolves a platform constructor's instance when that platform library is
 * present, without naming its ambient type in the emitted declaration graph.
 */
export type GlobalConstructorInstance<
  Name extends PropertyKey,
  Fallback = unknown,
> = typeof globalThis extends {
  [Key in Name]: abstract new (...arguments_: any[]) => infer Instance;
} ? Instance : Fallback;
