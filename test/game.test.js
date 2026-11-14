import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApp } from '../server.js';
const wait = ms => new Promise(r=>setTimeout(r,ms));
test('two-player flow, word privacy, permissions, drawing and scoring', { timeout: 10000 }, async () => {
 const app=createApp();await new Promise(r=>app.http.listen(0,r));
 const url=`http://localhost:${app.http.address().port}`;
 const a=io(url),b=io(url);let sa,sb;
 a.on('state',s=>sa=s);b.on('state',s=>sb=s);
 const action=(s,type,data={})=>new Promise(r=>s.emit('action',{type,...data},r));
 try {
  await Promise.all([new Promise(r=>a.on('connect',r)),new Promise(r=>b.on('connect',r))]);
  assert.equal((await action(a,'create',{name:'Alice',settings:{drawTime:15,rounds:2}})).ok,true);
  await wait(40);assert.ok(sa.code);
  assert.equal((await action(b,'join',{name:'Bob',code:sa.code})).ok,true);
  assert.ok((await action(b,'start')).error);
  await action(a,'start');await wait(40);
  assert.equal(sa.phase,'choosing');assert.equal(sb.options.length,0);
  const word=sa.options[0];await action(a,'choose',{word});await wait(40);
  assert.equal(sa.word,word);assert.equal(sb.word,null);assert.ok(!sb.mask.includes(word));
  assert.ok((await action(b,'clear')).error);
  await action(a,'stroke',{stroke:{points:[[.1,.2],[.2,.3]],color:'#292742',size:5}});
  assert.equal([...app.rooms.values()][0].strokes.length,1);
  await action(a,'undo');assert.equal([...app.rooms.values()][0].strokes.length,0);
  await action(b,'guess',{text:'  '+word.toUpperCase()+'  '});await wait(40);
  assert.equal(sb.phase,'reveal');assert.ok(sb.players.find(p=>p.name==='Bob').score>=100);
  const points=sb.players.find(p=>p.name==='Bob').score;
  await action(b,'guess',{text:word});await wait(40);assert.equal(sb.players.find(p=>p.name==='Bob').score,points);
  b.disconnect();await wait(40);assert.equal(sa.phase,'lobby');
 } finally {a.disconnect();b.disconnect();app.close();}
});
