# Realtime Lab · 前端手记

A small, reproducible React + TypeScript realtime data playground, accompanied by a Chinese engineering journal by Yingying Shao.

一个可以运行和解释的实时数据实验：观察消息接收、批量通知、连接恢复，以及有界历史窗口。包括中文技术博客和静态预渲染文章。

## Quick start

Node.js 22.12+ (Node 24 LTS recommended).

```sh
npm ci
npm run dev
# http://127.0.0.1:4178
npm test
npm run build
npm run preview
```

## What you can try

- Change the synthetic input rate: 10 / 100 / 1,000 messages per second.
- Compare per-message notifications with 100ms batching.
- Pause the stream, unsubscribe from individual topics, or trigger a disconnection.
- Observe re-subscription, retry counts, sequence gaps, and a 240-entry bounded history.
- Read the two articles and inspect their corresponding implementation.

All values are synthetic. The default transport runs in the browser and does **not** open a network WebSocket. Counters measure accepted messages and store notifications, **not** React commits, FPS, or CPU savings. Input rates depend on browser timer scheduling.

## Real WebSocket transport

In a second terminal:

```sh
npm run mock-server
# ws://127.0.0.1:8787
```

On the **local** lab page, expand the connection section, choose WebSocket and apply the address. This local server broadcasts 20 synthetic messages per second across three topics. Hosted HTTPS pages require a `wss://` server; the deployed site does not run the Node mock server.

Subscription request:

```json
{"type":"subscribe","topics":["aurora","nova","orbit"]}
```

Server frame:

```json
{"topic":"aurora","seq":1,"value":82.5,"timestamp":1794556800000}
```

`seq` must increase independently per topic across reconnections. Duplicate/outdated frames are ignored. Missing sequence numbers are **detected but not replayed**. This is an educational v0.1, not a production SDK; it does not implement heartbeat negotiation, connection timeout handling, authentication, snapshots, or durable replay.

## Repository map

- `src/core/stream.ts`: framework-independent client lifecycle and bounded state.
- `src/core/simulator.ts`: seeded data generator and browser transport adapters.
- `src/Lab.tsx`: React subscription and accessible controls.
- `src/content/*.md`: editable articles (JSON metadata inside frontmatter).
- `scripts/content.mjs`: validates metadata and builds article data.
- `scripts/prerender.mjs`: generates complete static HTML for six routes and a 404 page.
- `tests/stream.test.ts`: failure, reconnect, cancellation, ordering and batching tests.

## Writing an article

Add a Markdown file under `src/content/`, with this header:

```text
---
{"slug":"your-slug","title":"文章标题","description":"一句话介绍","date":"2026-11-13","category":"性能优化","minutes":5}
---
正文……
```

Run the dev command again, or build. Routes and static pages are generated from the content. If adding a new category, update the filter options in `src/App.tsx`.

## Deployment

`npm run build` produces the static `dist/` directory. It can be hosted by a static web host; nested article paths must serve their `index.html`. The local `.openai/hosting.json` holds the optional Sites deployment identity, not a credential. A custom domain has not yet been configured.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Reproduction cases, tests, documentation and focused fixes are welcome. No company source, production telemetry or credentials are included. Initial implementation and editing used AI assistance; maintainers remain responsible for reviewing changes and explaining the code.

## License

MIT — see [LICENSE](LICENSE).
