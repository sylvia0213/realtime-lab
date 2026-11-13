export type Phase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopped' | 'failed';
export type Tick = { topic: string; seq: number; value: number; timestamp: number };
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}
export type Snapshot = Readonly<{
  phase: Phase; received: number; accepted: number; duplicates: number; invalid: number;
  gaps: number; flushes: number; retries: number; pendingRetryMs: number;
  topics: readonly string[]; points: readonly Tick[]; latest: Readonly<Record<string, Tick>>;
}>;
export const TOPICS = ['aurora', 'nova', 'orbit'] as const;
export const INITIAL: Snapshot = {
  phase: 'idle', received: 0, accepted: 0, duplicates: 0, invalid: 0, gaps: 0,
  flushes: 0, retries: 0, pendingRetryMs: 0, topics: TOPICS, points: [], latest: {},
};
export function parseTick(data: unknown): Tick | null {
  try {
    const t = typeof data === 'string' ? JSON.parse(data) : null;
    if (!t || !TOPICS.includes(t.topic) || !Number.isSafeInteger(t.seq) || t.seq < 0 ||
      !Number.isFinite(t.value) || t.value < 0 || !Number.isFinite(t.timestamp) || t.timestamp < 0) return null;
    return { topic: t.topic, seq: t.seq, value: t.value, timestamp: t.timestamp };
  } catch { return null; }
}
export function retryDelay(attempt: number, random = Math.random): number {
  return Math.round(Math.min(500 * 2 ** Math.max(0, attempt), 8000) * (0.5 + random() * 0.5));
}
/** One transport, bounded history, monotonic sequences per topic, immutable cached snapshots. */
export class StreamClient {
  private snapshot: Snapshot = INITIAL;
  private listeners = new Set<() => void>();
  private socket?: SocketLike;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private wanted = false;
  private generation = 0;
  private attempts = 0;
  private dirty = false;
  private seen = new Map<string, number>();
  private points: Tick[] = [];
  private latest: Record<string, Tick> = {};
  private counters = { received: 0, accepted: 0, duplicates: 0, invalid: 0, gaps: 0 };
  private topics: string[] = [...TOPICS];
  private interval = 100;
  constructor(private factory: () => SocketLike, private options: { random?: () => number; maxRetries?: number } = {}) {}
  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(extra: Partial<Snapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...extra };
    this.listeners.forEach(fn => fn());
  }
  start() { if (this.wanted) return; this.wanted = true; this.attempts = 0; this.connect(); }
  stop() {
    this.wanted = false; this.generation++;
    clearTimeout(this.retryTimer); clearTimeout(this.flushTimer); this.flushTimer = undefined;
    this.detach(); this.flush(); this.publish({ phase: 'stopped', pendingRetryMs: 0 });
  }
  private detach() {
    if (!this.socket) return;
    const old = this.socket; this.socket = undefined;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    old.close();
  }
  private connect() {
    if (!this.wanted) return;
    const generation = ++this.generation;
    this.publish({ phase: this.attempts ? 'reconnecting' : 'connecting', pendingRetryMs: 0 });
    try {
      const socket = this.factory(); this.socket = socket;
      const active = () => this.wanted && generation === this.generation;
      socket.onopen = () => { if (!active()) return; this.publish({ phase: 'connected', pendingRetryMs: 0 }); this.sendTopics(); };
      socket.onmessage = event => { if (active()) this.receive(event.data); };
      socket.onclose = () => { if (!active()) return; this.detach(); this.reconnect(); };
      socket.onerror = () => { if (!active()) return; this.detach(); this.reconnect(); };
    } catch { this.reconnect(); }
  }
  private reconnect() {
    this.generation++;
    if (!this.wanted) return;
    if (this.attempts >= (this.options.maxRetries ?? 5)) { this.wanted = false; this.publish({ phase: 'failed' }); return; }
    const delay = retryDelay(this.attempts++, this.options.random);
    this.publish({ phase: 'reconnecting', retries: this.snapshot.retries + 1, pendingRetryMs: delay });
    clearTimeout(this.retryTimer); this.retryTimer = setTimeout(() => this.connect(), delay);
  }
  interrupt() { if (this.socket && this.snapshot.phase === 'connected') { this.detach(); this.reconnect(); } }
  setTopics(topics: string[]) {
    const next = [...new Set(topics.filter(t => TOPICS.includes(t as typeof TOPICS[number])))];
    // A re-subscription establishes a new local sequence baseline; missed unsubscribed data is not a gap.
    for (const t of next) if (!this.topics.includes(t)) this.seen.delete(t);
    this.topics = next; this.publish({ topics: [...next] }); this.sendTopics();
  }
  private sendTopics() {
    if (this.socket && this.snapshot.phase === 'connected') {
      try { this.socket.send(JSON.stringify({ type: 'subscribe', topics: this.topics })); }
      catch { this.detach(); this.reconnect(); }
    }
  }
  setBatchInterval(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) throw new Error('Batch interval must be a non-negative number');
    this.interval = ms; clearTimeout(this.flushTimer); this.flushTimer = undefined; this.flush();
  }
  private receive(data: unknown) {
    this.counters.received++;
    const tick = parseTick(data);
    if (!tick) this.counters.invalid++;
    else if (this.topics.includes(tick.topic)) {
      const prev = this.seen.get(tick.topic);
      if (prev !== undefined && tick.seq <= prev) this.counters.duplicates++;
      else {
        if (prev !== undefined && tick.seq > prev + 1) this.counters.gaps += tick.seq - prev - 1;
        this.seen.set(tick.topic, tick.seq); this.attempts = 0;
        this.counters.accepted++; this.latest[tick.topic] = tick;
        this.points.push(tick); if (this.points.length > 240) this.points.shift();
      }
    }
    this.dirty = true;
    if (this.interval === 0) this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => { this.flushTimer = undefined; this.flush(); }, this.interval);
  }
  private flush() {
    if (!this.dirty) return; this.dirty = false;
    this.publish({ ...this.counters, points: [...this.points], latest: { ...this.latest }, flushes: this.snapshot.flushes + 1 });
  }
}
