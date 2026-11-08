/** Native and host-supplied fields own their caret, value and option keys. */
export function isToolbarField(target: EventTarget | null): boolean {
  return Boolean((target as Element | null)?.closest?.(
    'input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],[role=combobox],[role=spinbutton],[role=slider]',
  ));
}
