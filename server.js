// Ludo Table online server: serves the website and runs live games over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Ludo = require('./public/rules.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TURN_TIMEOUT = 30000;        // idle player's turn is played for them after 30 s
const ROOM_IDLE_MS = 30 * 60000;   // empty rooms are removed after 30 min
const SEAT_ORDER = [0, 2, 1, 3];   // 2 players sit opposite each other (Red vs Yellow)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (url.pathname === '/' || !path.extname(file)) file = path.join(PUBLIC, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    if (file.endsWith('index.html')) {
      // Facebook and WhatsApp link previews need a full image address
      const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^\w.:-]/g, '');
      data = Buffer.from(data.toString().replace('content="/og.png"', `content="${proto}://${host}/og.png"`));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map(); // code -> room

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from(crypto.randomBytes(5), b => A[b % A.length]).join(''); } while (rooms.has(c));
  return c;
}

function cleanName(n) {
  return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Player';
}

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function roomInfo(room) {
  return {
    t: 'room', code: room.code, started: !!room.table, host: room.host,
    players: room.players.map(p => ({ seat: p.seat, name: p.name, connected: !!p.ws, host: p.pid === room.host })),
  };
}

function broadcast(room, msg) { room.players.forEach(p => send(p.ws, msg)); }
function pushRoom(room) {
  room.players.forEach(p => send(p.ws, { ...roomInfo(room), you: p.seat }));
}

function startGame(room) {
  if (room.table) room.table.stop();
  const active = [0, 1, 2, 3].map(s => room.players.some(p => p.seat === s));
  room.table = new Ludo.Table(active, {
    turnTimeout: TURN_TIMEOUT,
    isAuto: seat => { const p = room.players.find(x => x.seat === seat); return !p || !p.ws; },
    onUpdate: (state, events) => { room.state = state; broadcast(room, { t: 'game', state, events }); },
  });
  pushRoom(room);
  room.table.start();
}

function touch(room) { room.lastActive = Date.now(); }

function join(ws, room, pid, name) {
  let p = room.players.find(x => x.pid === pid);
  if (p) {
    if (p.ws && p.ws !== ws) send(p.ws, { t: 'error', msg: 'You opened this game somewhere else.' });
    p.ws = ws; p.name = name;
  } else {
    if (room.table) return send(ws, { t: 'error', msg: 'That game has already started.' });
    const free = SEAT_ORDER.find(s => !room.players.some(x => x.seat === s));
    if (free === undefined) return send(ws, { t: 'error', msg: 'That game is full (4 players).' });
    p = { pid, name, seat: free, ws };
    room.players.push(p);
  }
  ws.room = room; ws.pid = pid;
  touch(room);
  pushRoom(room);
  if (room.table) {
    send(ws, { t: 'game', state: room.state, events: [] });
    room.table.refresh();
  }
}

function leave(ws, quit) {
  const room = ws.room;
  if (!room) return;
  const p = room.players.find(x => x.pid === ws.pid);
  ws.room = null;
  if (!p || p.ws !== ws) return;
  p.ws = null;
  if (quit && !room.table) room.players = room.players.filter(x => x !== p);
  if (room.host === p.pid) {
    const next = room.players.find(x => x.ws);
    if (next) room.host = next.pid;
  }
  touch(room);
  pushRoom(room);
  if (room.table) {
    // the computer plays for them until they come back; pause if nobody is left
    if (room.players.some(x => x.ws)) room.table.refresh(); else room.table.stop();
  }
}

const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const pid = String(m.pid || '').slice(0, 40);
    if (m.t === 'create') {
      if (!pid) return;
      leave(ws);
      const room = { code: makeCode(), players: [], host: pid, table: null, state: null, lastActive: Date.now() };
      rooms.set(room.code, room);
      join(ws, room, pid, cleanName(m.name));
    } else if (m.t === 'join') {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) return send(ws, { t: 'error', msg: 'No game found with that code. Check the link or ask for a new invite.' });
      if (!pid) return;
      if (ws.room && ws.room !== room) leave(ws);
      join(ws, room, pid, cleanName(m.name));
    } else if (m.t === 'leave') {
      leave(ws, true);
    } else {
      const room = ws.room;
      if (!room) return;
      touch(room);
      const p = room.players.find(x => x.pid === ws.pid);
      if (!p) return;
      if (m.t === 'start' || m.t === 'rematch') {
        if (p.pid !== room.host) return send(ws, { t: 'error', msg: 'Only the host can start the game.' });
        if (m.t === 'start' && room.table) return;
        if (room.players.length < 2) return send(ws, { t: 'error', msg: 'You need at least 2 players. Send the invite link to a friend.' });
        startGame(room);
      } else if ((m.t === 'roll' || m.t === 'move') && room.table) {
        room.table.act(p.seat, m.t === 'roll' ? { type: 'roll' } : { type: 'move', k: m.k, i: m.i });
      } else if (m.t === 'emote' && typeof m.e === 'string' && Date.now() - (ws.lastEmote || 0) > 800) {
        ws.lastEmote = Date.now();
        broadcast(room, { t: 'emote', seat: p.seat, e: m.e.slice(0, 8) });
      }
    }
  });
  ws.on('close', () => leave(ws));
});

// keep connections alive and tidy up old rooms
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.players.some(p => p.ws);
    if (!anyone && now - room.lastActive > ROOM_IDLE_MS) { if (room.table) room.table.stop(); rooms.delete(code); }
  }
}, 30000);

server.listen(PORT, () => console.log(`Ludo Table running on http://localhost:${PORT}`));
