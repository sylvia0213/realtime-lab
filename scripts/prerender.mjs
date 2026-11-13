import fs from 'node:fs';
import path from 'node:path';
import { render, routes, metadata } from '../.ssr/entry-server.js';
const template = fs.readFileSync('dist/index.html','utf8');
const escape = text => text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for (const route of [...routes, '/404/']) {
  const meta = metadata(route);
  const html = template.replace('<!--app-html-->',render(route)).replace(/<title>.*?<\/title>/,`<title>${escape(meta.title)}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/,`<meta name="description" content="${escape(meta.description)}"/>`);
  const dir = path.join('dist',route); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'index.html'),html);
  if(route==='/404/') fs.writeFileSync('dist/404.html',html);
}
console.log(`Prerendered ${routes.length} routes + 404 with complete article HTML.`);
