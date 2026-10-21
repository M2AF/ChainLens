const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { GAME_ROOMS, gameChatCredentials, mountGameChat } = require('../game-chat');
const ME = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
const OTHER = '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';

function database() {
  const messages = []; let seq = 0;
  return { messages, from(table) {
    let filters = [], operation = 'read', input, descending = false, limit = 100;
    const query = {
      select() { return query; }, eq(k,v) { filters.push(row => String(row[k]) === String(v)); return query; },
      gt(k,v) { filters.push(row => Number(row[k]) > Number(v)); return query; },
      order(k,options) { descending = !options.ascending; return query; }, limit(n) { limit=n; return query; },
      insert(row) { operation='insert'; input=row; return query; }, delete() { operation='delete'; return query; },
      single() { return run(true); }, maybeSingle() { return run(true); }, then(resolve,reject) { return run(false).then(resolve,reject); },
    };
    async function run(single) {
      if (table === 'cl_users') return { data: { id: ME } };
      if (operation === 'insert') { const row = {...input,id:++seq,created_at:new Date().toISOString()};messages.push(row);return {data:row}; }
      let rows = messages.filter(row => filters.every(fn => fn(row)));
      if (operation === 'delete') rows.forEach(row => messages.splice(messages.indexOf(row),1));
      rows.sort((a,b) => descending ? b.id-a.id : a.id-b.id); rows=rows.slice(0,limit);
      return {data:single ? rows[0] || null : rows};
    }
    return query;
  }};
}
test('game capabilities cannot authorize account APIs; invalid audience, scope and signature fail', () => {
  const credentials = gameChatCredentials('test-secret'); const token = credentials.issue(ME);
  assert.equal(credentials.verify(token).sub, ME);
  assert.throws(() => jwt.verify(token,'test-secret'));
  assert.throws(() => gameChatCredentials('other-secret').verify(token));
  assert.throws(() => credentials.verify(jwt.sign({sub:ME},'test-secret')));
  assert.throws(() => credentials.verify(credentials.issue('browser-claimed-id')));
});

test('each game has its own messages; verified authors, block filtering, cursors and deletion ownership', async t => {
  const app = express(); app.use(express.json()); const db=database();
  const credentials=gameChatCredentials('test-secret');
  const requireAuth=(req,res,next) => {if(req.headers.authorization !== 'Bearer account-session') return res.sendStatus(401);req.user={sub:ME};next();};
  mountGameChat(app,{db,requireAuth,credentials,allowed:()=>true,blockedIds:async()=>new Set([OTHER]),hydrate:async rows=>rows.map(row=>({...row,author:{id:row.user_id}}))});
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,method='GET',body,token='account-session')=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await request('/api/chat/games/poker','GET',null,'fake')).status,401);
  assert.equal((await request('/api/chat/games/unknown')).status,404);
  assert.equal((await request('/api/chat/game-rooms')).status,200);
  for(const game of GAME_ROOMS) {
    const response=await request(`/api/chat/games/${game.id}`,'POST',{type:'text',content:`hello ${game.id}`,user_id:OTHER},credentials.issue(ME));
    assert.equal(response.status,201);const message=(await response.json()).message;assert.equal(message.author.id,ME);
    const messages=(await (await request(`/api/chat/games/${game.id}`)).json()).messages;
    assert.deepEqual(messages.map(m=>m.content),[`hello ${game.id}`]);
  }
  assert.equal((await request('/api/chat/games/poker','POST',{type:'text',content:'https://bad.example'})).status,400);
  assert.equal((await request('/api/chat/games/poker?after=bad')).status,400);
  db.messages.push({id:100,game:'poker',user_id:OTHER,content:'blocked',message_type:'text'});
  assert.equal((await request('/api/chat/games/poker/100','DELETE')).status,404);
  assert.equal((await (await request('/api/chat/games/poker?after=99')).json()).messages.length,0);
  assert.equal((await request('/api/chat/games/pool/2','DELETE')).status,404);
  assert.equal((await request('/api/chat/games/poker/2','DELETE')).status,200);
});
