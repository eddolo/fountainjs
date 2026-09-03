import React from 'react';
import ReactDOM from 'react-dom/client';
import DemoGallery from './DemoGallery';
import './index.css';
import './demos.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoGallery />
  </React.StrictMode>,
);
