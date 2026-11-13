import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StreamClient, parseTick, retryDelay, type SocketLike } from '../src/core/stream.ts';
class Socket implements SocketLike {
  onopen:(()=>void)|null=null; onclose:(()=>void)|null=null; onerror:(()=>void)|null=null;
  onmessage:((e:{data:unknown})=>void)|null=null; sent:string[]=[];closed=false;
  send(data:string){this.sent.push(data);} close(){this.closed=true;this.onclose?.();}
  tick(seq:number, topic='aurora'){this.onmessage?.({data:JSON.stringify({topic,seq,value:50,timestamp:100})});}
}
test('invalid frames and stale sequences never replace latest values; history stays bounded',()=>{
  const socket=new Socket();const client=new StreamClient(()=>socket);client.setBatchInterval(0);client.start();socket.onopen?.();
  socket.tick(1);socket.tick(1);socket.tick(0);socket.tick(3);socket.onmessage?.({data:'broken'});
  assert.equal(client.getSnapshot().duplicates,2);assert.equal(client.getSnapshot().gaps,1);assert.equal(client.getSnapshot().invalid,1);
  for(let i=4;i<600;i++)socket.tick(i);
  assert.equal(client.getSnapshot().points.length,240);assert.equal(client.getSnapshot().latest.aurora.seq,599);client.stop();
});
test('batching processes every valid frame but only notifies once per window',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const s=new Socket();const c=new StreamClient(()=>s);c.start();s.onopen?.();
  for(let i=1;i<=100;i++)s.tick(i);
  assert.equal(c.getSnapshot().accepted,0);t.mock.timers.tick(100);
  assert.equal(c.getSnapshot().accepted,100);assert.equal(c.getSnapshot().flushes,1);
  assert.equal(c.getSnapshot(),c.getSnapshot());c.stop();
});
test('reconnection restores selected topics and ignores callbacks from previous generations',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const sockets:Socket[]=[];const c=new StreamClient(()=>{const s=new Socket();sockets.push(s);return s;},{random:()=>0});
  c.setBatchInterval(0);c.setTopics(['nova']);c.start();const old=sockets[0];old.onopen?.();const stale=old.onmessage;old.tick(1,'nova');c.interrupt();
  t.mock.timers.tick(250);const next=sockets[1];next.onopen?.();assert.deepEqual(JSON.parse(next.sent[0]).topics,['nova']);
  stale?.({data:JSON.stringify({topic:'nova',seq:99,value:50,timestamp:100})});assert.equal(c.getSnapshot().latest.nova.seq,1);
  next.tick(2,'nova');assert.equal(c.getSnapshot().accepted,2);c.stop();
});
test('stop cancels queued retry and start is idempotent',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let count=0;const s=new Socket();const c=new StreamClient(()=>{count++;return s;});c.start();c.start();assert.equal(count,1);s.onopen?.();c.interrupt();c.stop();t.mock.timers.tick(30000);assert.equal(count,1);assert.equal(c.getSnapshot().phase,'stopped');
});
test('retry limit terminates permanently failing transports',t=>{
  t.mock.timers.enable({apis:['setTimeout']});let count=0;const c=new StreamClient(()=>{count++;throw Error('offline');},{maxRetries:2,random:()=>0});c.start();t.mock.timers.tick(250);t.mock.timers.tick(500);assert.equal(count,3);assert.equal(c.getSnapshot().phase,'failed');c.stop();
});
test('resubscription establishes a new baseline instead of counting deliberately skipped messages',()=>{
  const s=new Socket();const c=new StreamClient(()=>s);c.setBatchInterval(0);c.start();s.onopen?.();s.tick(1);c.setTopics([]);s.tick(2);c.setTopics(['aurora']);s.tick(50);assert.equal(c.getSnapshot().gaps,0);c.stop();
});
test('protocol validation rejects bad types and retry delay stays capped',()=>{
  assert.equal(parseTick(JSON.stringify({topic:'x',seq:1,value:2,timestamp:1})),null);
  assert.equal(parseTick(JSON.stringify({topic:'aurora',seq:1.5,value:2,timestamp:1})),null);
  assert.equal(retryDelay(10,()=>1),8000);assert.equal(retryDelay(0,()=>0),250);
});
