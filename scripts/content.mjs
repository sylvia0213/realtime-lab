import fs from 'node:fs';
const files = fs.readdirSync('src/content').filter(f => f.endsWith('.md')).sort();
const articles = files.map(file => {
  const source = fs.readFileSync(`src/content/${file}`, 'utf8');
  const [, header, body] = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
  if (!header || !body) throw new Error(`Missing metadata: ${file}`);
  const data = JSON.parse(header);
  if (!/^[a-z0-9-]+$/.test(data.slug) || !data.title || !data.description || !data.date) throw new Error(`Invalid metadata: ${file}`);
  return { ...data, body: body.trim() };
});
if (new Set(articles.map(a => a.slug)).size !== articles.length) throw new Error('Duplicate article slug');
fs.writeFileSync('src/content/generated.json', JSON.stringify(articles, null, 2));
