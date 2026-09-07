// Host-owned MathJax 4.1.3 TeX font: package code Apache-2.0; glyph data SIL OFL 1.1.
// See ../public/mathjax-notices.txt for the bundled notices and license texts.
// The original TeX font is synchronous and includes the common math families.
// A host needing broader Unicode coverage can pass another preloaded SVG font.
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';

export const localMathFont = () => new MathJaxTexFont();
