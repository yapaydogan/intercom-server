const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 9000;
const TIMEOUT = 12000;
const devices = {};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Intercom server running');
});

const wss = new WebSocket.Server({ server });

function broadcastList() {
  const list = Object.values(devices).map(d => ({ id: d.id, name: d.name }));
  const msg = JSON.stringify({ type: 'list', devices: list });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function relay(to, msg) {
  const target = devices[to];
  if (target && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', ws => {
  let myId = null;

  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === 'join') {
      myId = data.id;
      ws.myId = myId;
      devices[myId] = { id: myId, name: data.name, ws, lastSeen: Date.now() };
      console.log(`+ ${data.name} katildi`);
      broadcastList();
    } else if (data.type === 'ping') {
      if (devices[myId]) devices[myId].lastSeen = Date.now();
    } else if (['offer','answer','ice'].includes(data.type)) {
      relay(data.to, { ...data, from: myId });
    }
  });

  ws.on('close', () => {
    if (myId && devices[myId]) {
      console.log(`- ${devices[myId].name} ayrildi`);
      delete devices[myId];
      broadcastList();
    }
  });

  broadcastList();
});

setInterval(() => {
  const now = Date.now();
  let changed = false;
  Object.keys(devices).forEach(id => {
    if (now - devices[id].lastSeen > TIMEOUT) {
      delete devices[id];
      changed = true;
    }
  });
  if (changed) broadcastList();
}, 5000);

server.listen(PORT, () => {
  console.log(`Sunucu calisiyor: port ${PORT}`);
});
