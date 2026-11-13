import { TOPICS, type SocketLike, type Tick } from './stream';
/** Seeded source shared by reconnects. This is synthetic data, never production telemetry. */
export function createGenerator(seed = 42) {
  let state = seed >>> 0;
  const seq: Record<string, number> = {};
  const values: Record<string, number> = { aurora: 82, nova: 48, orbit: 120 };
  const bases: Record<string, number> = { ...values };
  return (topic: string, now = Date.now()): Tick => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const random = (state >>> 0) / 4294967296;
    values[topic] = Math.max(5, Math.min(190, (values[topic] ?? 80) + (random - 0.5) * 13 + ((bases[topic] ?? 80) - (values[topic] ?? 80)) * 0.07));
    return { topic, seq: seq[topic] = (seq[topic] ?? 0) + 1, value: Math.round(values[topic] * 10) / 10, timestamp: now };
  };
}
export function simulatorFactory(rate: () => number) {
  const next = createGenerator();
  return (): SocketLike => {
    let closed = false, topics: string[] = [], count = 0, budget = 0;
    const socket: SocketLike = {
      onopen: null, onmessage: null, onclose: null, onerror: null,
      send(data) { const request = JSON.parse(data); if (request.type === 'subscribe') topics = request.topics.filter((t: string) => TOPICS.includes(t as typeof TOPICS[number])); },
      close() { if (closed) return; closed = true; clearTimeout(open); clearInterval(timer); socket.onclose?.(); },
    };
    const open = setTimeout(() => { if (!closed) socket.onopen?.(); }, 80);
    const timer = setInterval(() => {
      if (closed || topics.length === 0) return;
      budget += rate() / 50;
      while (budget >= 1) {
        budget--; const tick = next(topics[count++ % topics.length]);
        socket.onmessage?.({ data: JSON.stringify(tick) });
      }
    }, 20);
    return socket;
  };
}
export function webSocketFactory(url: string): () => SocketLike {
  return () => new WebSocket(url) as unknown as SocketLike;
}
