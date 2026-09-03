import React from 'react';
import ReactDOM from 'react-dom/client';
import DemoPage from './DemoPage';
import './index.css';
import './demos.css';
import '../../../src/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoPage />
  </React.StrictMode>,
);
