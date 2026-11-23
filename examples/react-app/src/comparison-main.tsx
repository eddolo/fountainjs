import { createRoot } from 'react-dom/client';
import { SiteHeader } from './SiteHeader';
import { loadSiteFonts } from './site-fonts';

loadSiteFonts();
createRoot(document.getElementById('comparison-header')!).render(<SiteHeader page="Developers" />);
