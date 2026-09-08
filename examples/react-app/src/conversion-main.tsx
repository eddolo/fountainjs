import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConversionLab } from './ConversionLab';
import './index.css';
import 'fountainjs-editor/styles.css';
import './conversion-lab.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ConversionLab /></React.StrictMode>);
