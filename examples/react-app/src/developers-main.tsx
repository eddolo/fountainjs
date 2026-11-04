import React from 'react';
import ReactDOM from 'react-dom/client';
import Developers from './Developers';
import './index.css';
import { loadSiteFonts } from './site-fonts';
import './developers.css';

loadSiteFonts();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Developers />
  </React.StrictMode>,
);
