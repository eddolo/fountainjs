export function isCompositionKey(event: { readonly isComposing: boolean; readonly keyCode: number }): boolean {
  // A keyboard event at a composition boundary can carry the IME key code alone.
  return event.isComposing || event.keyCode === 229;
}
