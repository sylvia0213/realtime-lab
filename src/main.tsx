import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
const root = document.getElementById('root')!;
const path = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
const app = <App path={path}/>;
if (root.querySelector('main')) hydrateRoot(root, app); else createRoot(root).render(app);
