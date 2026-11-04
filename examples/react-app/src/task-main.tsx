import React from 'react';
import ReactDOM from 'react-dom/client';
import { TaskWorkflow } from './TaskWorkflow';
import './index.css';
import { loadSiteFonts } from './site-fonts';
import './workflows.css';
import 'fountainjs-editor/styles.css';
loadSiteFonts();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><TaskWorkflow /></React.StrictMode>);
