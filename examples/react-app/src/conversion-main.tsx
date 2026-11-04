import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConversionLab } from './ConversionLab';
import './index.css';
import { loadSiteFonts } from './site-fonts';
import 'fountainjs-editor/styles.css';
import 'katex/dist/katex.min.css';
import './conversion-lab.css';

loadSiteFonts();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ConversionLab /></React.StrictMode>);
