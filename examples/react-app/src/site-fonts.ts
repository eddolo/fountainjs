// Optional site typography must not hold up the editor or developer examples.
// Load the stylesheet outside the initial render path, then apply it when ready.
export function loadSiteFonts(): void {
  if (document.querySelector('link[data-fountain-site-fonts]')) return;
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.media = 'print';
  fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap';
  fonts.dataset.fountainSiteFonts = '';
  fonts.addEventListener('load', () => { fonts.media = 'all'; }, { once: true });
  document.head.append(fonts);
}
