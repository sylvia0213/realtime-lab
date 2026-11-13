import { renderToString } from 'react-dom/server';
import { App, routes, metadata } from './App';
export { routes, metadata };
export const render = (path: string) => renderToString(<App path={path}/>);
