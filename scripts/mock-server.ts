import { WebSocketServer, WebSocket } from 'ws';
import { createGenerator } from '../src/core/simulator';
import { TOPICS } from '../src/core/stream';
const server = new WebSocketServer({ host: '127.0.0.1', port: 8787 });
const subscriptions = new Map<WebSocket, Set<string>>();
const next = createGenerator(); let index = 0;
server.on('connection', socket => {
  subscriptions.set(socket, new Set());
  socket.on('message', data => {
    try {
      const m = JSON.parse(data.toString());
      if (m.type === 'subscribe' && Array.isArray(m.topics)) subscriptions.set(socket, new Set(m.topics.filter((t: string) => TOPICS.includes(t as typeof TOPICS[number]))));
    } catch { socket.close(1007, 'Invalid JSON'); }
  });
  socket.on('close', () => subscriptions.delete(socket));
});
// A single sequence per topic continues across reconnects. Every subscribed client sees the same frame.
const timer = setInterval(() => {
  const tick = next(TOPICS[index++ % TOPICS.length]);
  const message = JSON.stringify(tick);
  for (const [socket, topics] of subscriptions) if (socket.readyState === WebSocket.OPEN && topics.has(tick.topic)) socket.send(message);
}, 50);
console.log('Local synthetic WebSocket: ws://127.0.0.1:8787 (20 messages/s across three topics)');
process.on('SIGINT', () => { clearInterval(timer); server.clients.forEach(s => s.close()); server.close(); });
