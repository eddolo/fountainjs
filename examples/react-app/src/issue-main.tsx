import React from 'react';
import ReactDOM from 'react-dom/client';
import { IssueEditor } from './IssueEditor';
import './index.css';
import './issue-editor.css';
import 'fountainjs-editor/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><IssueEditor /></React.StrictMode>);
