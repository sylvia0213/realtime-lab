import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { INITIAL, StreamClient, TOPICS, type Snapshot } from './core/stream';
import { simulatorFactory, webSocketFactory } from './core/simulator';
const names: Record<string, string> = { aurora: 'Aurora API', nova: 'Nova Worker', orbit: 'Orbit Edge' };
const colors: Record<string, string> = { aurora: '#e8623b', nova: '#34876d', orbit: '#798bc3' };
const phases: Record<string, string> = { idle: '准备连接', connecting: '连接中', connected: '正在接收', reconnecting: '等待重连', stopped: '已暂停', failed: '连接失败' };
function Plot({ snapshot }: { snapshot: Snapshot }) {
  return <svg className="plot" viewBox="0 0 840 260" role="img" aria-label="三路模拟服务延迟的实时曲线，单位毫秒">
    {[0, 50, 100, 150, 200].map(v => <g key={v}><line x1="42" x2="824" y1={230 - v} y2={230 - v} stroke="#e7e8e3" strokeDasharray="3 5"/><text x="30" y={234-v} textAnchor="end" fill="#91978e" fontSize="10">{v}</text></g>)}
    {TOPICS.filter(t => snapshot.topics.includes(t)).map(topic => {
      const points = snapshot.points.filter(p => p.topic === topic);
      const path = points.map((p, i) => `${42 + (i / Math.max(points.length-1,1)) * 782},${230-Math.min(200,p.value)}`).join(' ');
      return <polyline key={topic} points={path} fill="none" stroke={colors[topic]} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"/>;
    })}
    {!snapshot.points.length && <text x="420" y="125" textAnchor="middle" fill="#8b928a" fontSize="13">启动数据流后，曲线会出现在这里</text>}
    <text x="42" y="254" fill="#91978e" fontSize="10">历史采样</text><text x="824" y="254" textAnchor="end" fill="#91978e" fontSize="10">最新 →</text>
  </svg>;
}
export function Lab() {
  const [rate, setRate] = useState(100);
  const rateRef = useRef(rate); rateRef.current = rate;
  const [source, setSource] = useState('simulation');
  const [url, setUrl] = useState('ws://127.0.0.1:8787');
  const [endpoint, setEndpoint] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState(100);
  const [baseline, setBaseline] = useState({ accepted: 0, flushes: 0 });
  const client = useMemo(() => new StreamClient(endpoint ? webSocketFactory(endpoint) : simulatorFactory(() => rateRef.current)), [endpoint]);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, () => INITIAL);
  useEffect(() => { client.start(); return () => client.stop(); }, [client]);
  useEffect(() => { client.setBatchInterval(mode); }, [client, mode]);
  const received = Math.max(0, snapshot.accepted - baseline.accepted);
  const notifications = Math.max(0, snapshot.flushes - baseline.flushes);
  const merged = received ? Math.max(0, (1 - notifications / received) * 100).toFixed(1) : '0.0';
  const running = !['idle', 'stopped', 'failed'].includes(snapshot.phase);
  function connect() {
    if (source === 'simulation') { setEndpoint(''); setError(''); setBaseline({ accepted: 0, flushes: 0 }); return; }
    try {
      const target = new URL(url);
      if (!['ws:', 'wss:'].includes(target.protocol)) throw new Error('请输入 ws:// 或 wss:// 地址');
      if (window.location.protocol === 'https:' && target.protocol === 'ws:') throw new Error('HTTPS 页面请连接 wss://；本地 ws:// 服务请从本地预览页连接。');
      setEndpoint(target.href); setBaseline({ accepted: 0, flushes: 0 }); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '地址无效'); }
  }
  function changeMode(value: number) { client.setBatchInterval(value); setBaseline({ accepted: client.getSnapshot().accepted, flushes: client.getSnapshot().flushes }); setMode(value); }
  return <div className="lab-shell">
    <div className="lab-top"><div><span className="eyebrow">REALTIME LAB / 001</span><h2>让数据流动起来。</h2><p>调节输入速率，切换通知策略，亲手观察实时界面的行为。</p></div><span className={`status ${snapshot.phase === 'connected' ? 'live' : ''}`} role="status"><i/>{phases[snapshot.phase]}</span></div>
    <div className="lab-notice">合成数据 · {endpoint ? '真实 WebSocket 传输' : '浏览器内模拟传输'} · 非线上监控数据</div>
    <div className="lab-controls">
      <label>模拟输入速率<select value={rate} disabled={!!endpoint} onChange={e => setRate(Number(e.target.value))}><option value="10">10 条 / 秒</option><option value="100">100 条 / 秒</option><option value="1000">1,000 条 / 秒</option></select></label>
      <div><span className="control-label">状态通知策略</span><div className="segmented"><button aria-pressed={mode===0} onClick={() => changeMode(0)}>逐条通知</button><button aria-pressed={mode===100} onClick={() => changeMode(100)}>100ms 批量</button></div></div>
      <div className="control-actions"><button className="button secondary small" onClick={() => running ? client.stop() : client.start()}>{running ? '暂停数据流' : '启动数据流'}</button><button className="button outline small" disabled={snapshot.phase!=='connected'} onClick={() => client.interrupt()}>模拟断线</button></div>
    </div>
    <div className="metrics"><div><span>有效消息 · 本轮</span><strong>{received.toLocaleString('en-US')}</strong><small>每条均经过校验与序号检查</small></div><div><span>状态通知 · 本轮</span><strong>{notifications.toLocaleString('en-US')}</strong><small>实际向订阅者发布的快照次数</small></div><div><span>通知合并比例</span><strong className="accent">{merged}<em>%</em></strong><small>不是 CPU 降幅或 FPS 指标</small></div><div><span>自动重连次数</span><strong>{snapshot.retries.toString().padStart(2,'0')}</strong><small>{snapshot.pendingRetryMs ? `等待约 ${snapshot.pendingRetryMs}ms` : '连接恢复后重新发送订阅'}</small></div></div>
    <div className="chart-head"><span>服务延迟 <small>/ ms</small></span><span>最多保留 240 条记录</span></div><Plot snapshot={snapshot}/>
    <div className="stream-list">{TOPICS.map(topic => <label key={topic} className="stream-row"><input type="checkbox" checked={snapshot.topics.includes(topic)} onChange={e => client.setTopics(e.target.checked ? [...snapshot.topics,topic] : snapshot.topics.filter(t=>t!==topic))}/><i style={{background:colors[topic]}}/><span>{names[topic]}</span><strong>{snapshot.latest[topic]?.value.toFixed(1) ?? '—'} <small>ms</small></strong></label>)}</div>
    <div className="lab-foot"><span>累计收到 {snapshot.received} · 忽略重复 / 过期 {snapshot.duplicates} · 无效 {snapshot.invalid} · 序号缺口 {snapshot.gaps}</span><span>切换通知策略后，本轮统计重新开始。</span></div>
    <details className="connection"><summary>连接自己的 WebSocket / 查看实验边界</summary><p>默认模拟器不经过网络。本地执行 <code>npm run mock-server</code> 后，可在本地预览中连接下方地址。服务协议见项目文档。</p><div className="connection-form"><label>数据源<select value={source} onChange={e=>setSource(e.target.value)}><option value="simulation">浏览器模拟器</option><option value="websocket">WebSocket 服务</option></select></label>{source==='websocket' && <label className="endpoint">服务地址<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="wss://example.com/stream"/></label>}<button className="button secondary small" onClick={connect}>应用数据源</button></div>{error && <p role="alert" className="error">{error}</p>}<p>输入速率受浏览器计时器调度影响。序号缺口只被检测和统计，本版本不提供数据回放、完整订单簿或线上可靠性保证。</p></details>
  </div>;
}
