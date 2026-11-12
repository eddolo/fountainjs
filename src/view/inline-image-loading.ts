const ownedMutations = new WeakMap<HTMLImageElement, (string | null)[]>();

/** Reserve only missing minimums; successful decoding restores the author's geometry. */
export function reserveInlineImageGeometry(image: HTMLImageElement): void {
  if (image.complete && image.naturalWidth > 0) return;
  const minimums = [
    ['min-width', image.style.minWidth, '1px'],
    ['min-height', image.style.minHeight, '1em'],
  ] as const;
  for (const [property, original, fallback] of minimums) if (!original) image.style.setProperty(property, fallback);
  image.addEventListener('load', () => {
    for (const [property, original, fallback] of minimums) {
      if (original || image.style.getPropertyValue(property) !== fallback) continue;
      if (image.isConnected) {
        const records = ownedMutations.get(image) ?? [];
        records.push(image.getAttribute('style')); ownedMutations.set(image, records);
      }
      image.style.removeProperty(property);
    }
  }, { once: true });
}

/** Nested custom views must not interpret placeholder cleanup as a document edit. */
export function isInlineImageLoadingMutation(mutation: MutationRecord): boolean {
  if (mutation.type !== 'attributes' || mutation.attributeName !== 'style' || !(mutation.target instanceof HTMLImageElement)) return false;
  const records = ownedMutations.get(mutation.target), index = records?.indexOf(mutation.oldValue) ?? -1;
  if (!records || index < 0) return false;
  records.splice(index, 1); if (!records.length) ownedMutations.delete(mutation.target);
  return true;
}
