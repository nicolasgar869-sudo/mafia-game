// Authoritative Mafia game server (Express + Socket.io). All secrets stay server-side.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static('public'));

const MAX_PLAYERS = 15, MIN_PLAYERS = 3, LAST_WORDS_SECS = 15;
const SPECIALS = ['detective', 'doctor', 'vigilante', 'bodyguard', 'mayor', 'jester'];
const rooms = {};
const defaults = () => ({ night: 60, day: 120, mafia: 0, reveal: true, lastWords: true,
  roles: { detective: true, doctor: true, vigilante: false, bodyguard: false, mayor: false, jester: false, godfather: false } });

// ---------- helpers ----------
const isM = p => p.role === 'mafia' || p.role === 'godfather';
const newCode = () => { let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms[c]); return c; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const list = r => Object.values(r.players);
const living = r => list(r).filter(p => p.alive);
const livingBy = (r, role) => living(r).filter(p => p.role === role);
const log = (r, text) => r.log.push({ text, day: r.day, phase: r.phase });
const clean = s => String(s || '').replace(/[<>]/g, '').trim();
const clamp = (v, a, b, d) => Math.min(b, Math.max(a, parseInt(v) || d));

function view(r, me) {
  const over = r.phase === 'over';
  return {
    code: r.code, me: me.id, isHost: r.host === me.id, role: me.role, alive: me.alive, spectator: !!me.spectator, shots: me.shots || 0,
    phase: r.phase, day: r.day, endsAt: r.endsAt, winner: r.winner, min: MIN_PLAYERS, set: r.set, lw: r.lw, hostId: r.host,
    players: list(r).map(q => ({
      id: q.id, name: q.name, alive: q.alive, connected: q.connected, spectator: !!q.spectator,
      role: (over || (!q.alive && !q.spectator && r.set.reveal) || q.id === me.id || (isM(me) && isM(q))) ? q.role : null,
    })),
    log: r.log, chat: r.chat, mchat: isM(me) ? r.mchat : [], notes: me.notes,
    votes: r.phase === 'day' ? r.votes : {},
    mafiaVotes: isM(me) && r.phase === 'night' ? r.mv : {},
    done: { heal: r.heal !== null, inspect: r.inspected, guard: r.guard !== null, vig: r.vigDone },
  };
}
function emit(r) { list(r).forEach(p => p.sid && io.to(p.sid).emit('state', view(r, p))); }

// ---------- game flow ----------
function setPhase(r, phase, secs) {
  clearTimeout(r.timer);
  r.phase = phase;
  r.endsAt = secs ? Date.now() + secs * 1000 : null;
  if (secs) r.timer = setTimeout(() => ({ night: endNight, day: endDay, lastwords: endLastWords })[phase](r), secs * 1000);
}
function reset(r) {
  Object.assign(r, { winner: null, log: [], chat: [], mchat: [], day: 0, lw: null });
  list(r).forEach(p => { if (p.role) p.prev = p.role; Object.assign(p, { role: null, alive: true, notes: [], spectator: false, shots: 0 }); });
}
function startGame(r) {
  const ps = list(r), n = ps.length, s = r.set;
  const m = Math.max(1, Math.min(s.mafia || Math.floor(n / 3), Math.floor((n - 1) / 2)));
  const roles = Array(m).fill('mafia');
  if (s.roles.godfather) roles[0] = 'godfather';
  SPECIALS.forEach(k => { if (s.roles[k] && roles.length < n) roles.push(k); });
  while (roles.length < n) roles.push('town');
  // reshuffle several times and keep the arrangement that repeats the fewest roles from last round
  let best, bestScore = Infinity;
  for (let i = 0; i < 50 && bestScore > 0; i++) {
    const a = shuffle([...roles]), sc = a.reduce((c, x, j) => c + (x === ps[j].prev ? 1 : 0), 0);
    if (sc < bestScore) { bestScore = sc; best = a; }
  }
  ps.forEach((p, i) => Object.assign(p, { role: best[i], alive: true, notes: [], shots: best[i] === 'vigilante' ? 1 : 0 }));
  r.day = 0; r.log = []; r.chat = []; r.mchat = []; r.winner = null; r.lw = null;
  log(r, `The game begins with ${n} players and ${m} Mafia hiding among them.`);
  startNight(r);
}
function startNight(r) {
  r.day++; r.mv = {}; r.heal = null; r.guard = null; r.inspected = false; r.vigDone = false; r.shot = null; r.votes = {};
  setPhase(r, 'night', r.set.night);
  log(r, `Night ${r.day} falls over the town.`);
  emit(r);
}
function nightComplete(r) {
  const m = living(r).filter(isM);
  const agreed = m.every(p => r.mv[p.id]) && new Set(m.map(p => r.mv[p.id])).size === 1;
  const need = (role, done) => !livingBy(r, role).length || done;
  return agreed && need('doctor', r.heal !== null) && need('detective', r.inspected) && need('bodyguard', r.guard !== null)
    && (!livingBy(r, 'vigilante').some(p => p.shots > 0) || r.vigDone);
}
function kill(r, p, how) {
  p.alive = false;
  log(r, `${p.name} was ${how}.${r.set.reveal ? ` They were ${p.role}.` : ''}`);
}
function attack(r, id, how) {
  const v = r.players[id];
  if (!v || !v.alive) return;
  if (id === r.heal) return log(r, `${v.name} was attacked but saved by the Doctor.`);
  const bg = livingBy(r, 'bodyguard')[0];
  if (bg && id === r.guard && bg !== v) return kill(r, bg, `killed protecting ${v.name}`);
  kill(r, v, how);
}
function endNight(r) {
  if (r.phase !== 'night') return;
  const tally = {};
  Object.values(r.mv).forEach(t => { if (r.players[t]?.alive) tally[t] = (tally[t] || 0) + 1; });
  const top = Math.max(0, ...Object.values(tally));
  const victims = Object.keys(tally).filter(k => tally[k] === top);
  const target = victims.length ? victims[Math.floor(Math.random() * victims.length)] : null;
  setPhase(r, 'day', r.set.day);
  r.votes = {};
  const before = r.log.length;
  log(r, `Morning ${r.day} arrives.`);
  if (target) attack(r, target, 'killed in the night');
  if (r.shot) attack(r, r.shot, 'shot by the Vigilante');
  if (!r.log.slice(before).some(l => /killed|shot|saved/.test(l.text))) log(r, 'The night passed quietly. No one died.');
  if (!checkWin(r)) emit(r);
}
const weight = p => (p.role === 'mayor' ? 2 : 1);
function dayComplete(r) { return living(r).every(p => p.id in r.votes); }
function endDay(r) {
  if (r.phase !== 'day') return;
  const tally = {};
  Object.entries(r.votes).forEach(([voter, t]) => { if (t && r.players[t]?.alive) tally[t] = (tally[t] || 0) + weight(r.players[voter]); });
  const total = living(r).reduce((s, p) => s + weight(p), 0);
  const [id, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [];
  if (!id || n <= total / 2) { log(r, 'No majority was reached. Nobody was lynched.'); return startNight(r); }
  const v = r.players[id];
  kill(r, v, `lynched by majority vote (${n} votes)`);
  if (v.role === 'jester') {
    r.winner = 'jester'; setPhase(r, 'over'); log(r, `${v.name} was the Jester and wins by being lynched!`); return emit(r);
  }
  if (checkWin(r)) return;
  if (r.set.lastWords) { r.lw = id; setPhase(r, 'lastwords', LAST_WORDS_SECS); log(r, `${v.name} may speak their last words.`); emit(r); }
  else startNight(r);
}
function endLastWords(r) { if (r.phase !== 'lastwords') return; r.lw = null; startNight(r); }
function checkWin(r) {
  const m = living(r).filter(isM).length, t = living(r).length - m;
  const winner = m === 0 ? 'town' : m >= t ? 'mafia' : null;
  if (!winner) return false;
  r.winner = winner; setPhase(r, 'over');
  log(r, winner === 'town' ? 'All Mafia are gone. The Town wins!' : 'The Mafia outnumber the Town. The Mafia wins!');
  emit(r); return true;
}

// ---------- sockets ----------
io.on('connection', socket => {
  let room = null, player = null;
  const err = msg => socket.emit('err', msg);
  const attach = (r, p) => { room = r; player = p; p.sid = socket.id; p.connected = true; socket.join(r.code); socket.emit('joined', { code: r.code }); emit(r); };
  const newPlayer = (id, name, spectator) => ({ id, name, alive: !spectator, role: null, notes: [], connected: true, spectator, shots: 0 });

  socket.on('create', ({ name, pid }) => {
    name = clean(name).slice(0, 16); if (!name) return err('Enter a name.');
    const r = { code: newCode(), host: pid, players: {}, phase: 'lobby', day: 0, log: [], chat: [], mchat: [], mv: {}, votes: {}, heal: null, guard: null, inspected: false, vigDone: false, shot: null, winner: null, lw: null, set: defaults() };
    r.players[pid] = newPlayer(pid, name, false);
    rooms[r.code] = r; attach(r, r.players[pid]);
  });

  socket.on('join', ({ code, name, pid }) => {
    const r = rooms[String(code || '').toUpperCase().trim()];
    if (!r) return err('Room not found. Check the code.');
    if (r.players[pid]) {
      const p = r.players[pid];
      if (!p.connected && r.phase !== 'lobby') { r.chat.push({ sys: 1, text: `${p.name} is back.` }); }
      return attach(r, p);
    }
    name = clean(name).slice(0, 16); if (!name) return err('Enter a name.');
    if (list(r).length >= MAX_PLAYERS) return err('Room is full.');
    if (list(r).some(p => p.name.toLowerCase() === name.toLowerCase())) return err('That name is taken in this room.');
    const late = r.phase !== 'lobby';
    r.players[pid] = newPlayer(pid, name, late);
    if (late) r.chat.push({ sys: 1, text: `${name} joined as a spectator.` });
    attach(r, r.players[pid]);
  });

  socket.on('settings', s => {
    if (!room || room.host !== player.id || room.phase !== 'lobby') return;
    const S = room.set;
    S.night = clamp(s.night, 20, 300, 60); S.day = clamp(s.day, 20, 600, 120); S.mafia = clamp(s.mafia, 0, 5, 0);
    S.reveal = !!s.reveal; S.lastWords = !!s.lastWords;
    Object.keys(S.roles).forEach(k => { S.roles[k] = !!(s.roles && s.roles[k]); });
    emit(room);
  });

  socket.on('rename', name => {
    name = clean(name).slice(0, 16);
    if (!room || room.phase !== 'lobby' || !name || list(room).some(p => p.id !== player.id && p.name.toLowerCase() === name.toLowerCase())) return err('That name is not available.');
    player.name = name; emit(room);
  });

  socket.on('kick', id => {
    if (!room || room.host !== player.id || room.phase !== 'lobby' || id === player.id || !room.players[id]) return;
    const k = room.players[id]; if (k.sid) io.to(k.sid).emit('kicked');
    delete room.players[id]; emit(room);
  });

  socket.on('start', () => {
    if (!room || room.host !== player.id || !['lobby', 'over'].includes(room.phase)) return;
    if (list(room).length < MIN_PLAYERS) return err(`Need at least ${MIN_PLAYERS} players.`);
    if (room.phase === 'over') reset(room);
    startGame(room);
  });

  socket.on('again', () => {
    if (!room || room.host !== player.id || room.phase !== 'over') return;
    reset(room); setPhase(room, 'lobby'); emit(room);
  });

  socket.on('act', ({ type, target }) => {
    const r = room, p = player;
    if (!r || !p.alive) return;
    const t = r.players[target];
    if (r.phase === 'night') {
      if (type === 'hold' && p.role === 'vigilante') r.vigDone = true;
      else {
        if (!t || !t.alive) return;
        if (type === 'kill' && isM(p) && !isM(t)) r.mv[p.id] = target;
        else if (type === 'heal' && p.role === 'doctor' && r.heal === null) r.heal = target;
        else if (type === 'guard' && p.role === 'bodyguard' && r.guard === null && t.id !== p.id) r.guard = target;
        else if (type === 'shoot' && p.role === 'vigilante' && p.shots > 0 && !r.vigDone && t.id !== p.id) { p.shots--; r.shot = target; r.vigDone = true; }
        else if (type === 'inspect' && p.role === 'detective' && !r.inspected && t.id !== p.id) {
          r.inspected = true;
          p.notes.push(`Night ${r.day}: ${t.name} is ${t.role === 'mafia' ? 'MAFIA' : 'Innocent'}.`);   // Godfather reads as Innocent
        } else return;
      }
      nightComplete(r) ? endNight(r) : emit(r);
    } else if (r.phase === 'day' && type === 'vote') {
      if (target && (!t || !t.alive || t.id === p.id)) return;
      r.votes[p.id] = target || null;
      dayComplete(r) ? endDay(r) : emit(r);
    }
  });

  const canChat = () => {
    const r = room, p = player;
    if (['lobby', 'over'].includes(r.phase)) return true;
    if (r.phase === 'day') return p.alive;
    if (r.phase === 'lastwords') return r.lw === p.id;
    return p.alive && isM(p);   // night
  };
  socket.on('chat', ({ text }) => {
    text = clean(text).slice(0, 300);
    if (!room || !text || !canChat()) return;
    const msg = { name: player.name, text, ts: Date.now() };
    (room.phase === 'night' ? room.mchat : room.chat).push(msg);
    emit(room);
  });
  socket.on('typing', () => {
    if (!room || !canChat()) return;
    list(room).filter(p => p.sid && p.id !== player.id && (room.phase !== 'night' || isM(p)))
      .forEach(p => io.to(p.sid).emit('typing', player.name));
  });

  socket.on('disconnect', () => {
    if (!room) return;
    player.connected = false;
    if (room.phase !== 'lobby') room.chat.push({ sys: 1, text: `${player.name} disconnected.` });
    emit(room);
    if (list(room).every(p => !p.connected)) {
      const r = room;
      setTimeout(() => { if (list(r).every(p => !p.connected)) { clearTimeout(r.timer); delete rooms[r.code]; } }, 10 * 60 * 1000);
    }
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log(`Mafia running on http://localhost:${PORT}`));
