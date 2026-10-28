// Authoritative Mafia game server (Express + Socket.io). All secrets stay server-side.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static('public'));

const MAX_PLAYERS = 15, MIN_PLAYERS = 3, LAST_WORDS_SECS = 15, WHISPERS_PER_DAY = 2;
const BASIC = ['detective', 'doctor', 'vigilante', 'bodyguard', 'mayor', 'jester'];
const NEUTRAL_UNIQUE = ['witch', 'escort', 'spy', 'serialkiller'];
const MAFIA_ROLES = ['mafia', 'godfather', 'silencer'];
const ORDER = ['mafia', 'doctor', 'bodyguard', 'escort', 'detective', 'witch', 'serialkiller', 'vigilante'];   // night turn order
const BOTNAMES = ['Ada', 'Ben', 'Cleo', 'Dex', 'Eli', 'Faye', 'Gus', 'Hana'];
const BAD = /\b(fuck\w*|shit\w*|bitch\w*|asshole|cunt|dick)\b/gi;
const fs = require('fs');
const HFILE = __dirname + '/history.json';
let HIST = []; try { HIST = JSON.parse(fs.readFileSync(HFILE, 'utf8')); } catch (e) { /* first run */ }
app.get('/api/history', (q, res) => res.json(HIST.map(g => ({ id: g.id, ts: g.ts, winner: g.winner, n: g.players.length, days: g.days }))));
app.get('/api/history/:id', (q, res) => { const g = HIST.find(x => x.id === q.params.id); g ? res.json(g) : res.status(404).end(); });
const rooms = {};
const defaults = () => ({
  night: 20, day: 120, mafia: 0, botLevel: 'normal', metro: false, reveal: true, lastWords: true, events: false, anon: false, filter: true, lovers: false, voice: '',
  roles: { detective: true, doctor: true, vigilante: false, bodyguard: false, mayor: false, jester: false, godfather: false,
    witch: false, escort: false, spy: false, serialkiller: false, silencer: false },
});

// ---------- helpers ----------
const isM = p => MAFIA_ROLES.includes(p.role);
const grp = p => (isM(p) ? 'mafia' : p.role);
const sn = q => (q.bot ? q.name.replace('Bot ', '') : q.name);
const DISTRICTS = { financial: { name: 'Financial Center', yield: 35 }, industrial: { name: 'Industrial Ward', yield: 15 }, hub: { name: 'Central Hub', yield: 10 }, docks: { name: 'The Docks', yield: 20 }, heights: { name: 'Residential Heights', yield: 15 } };
const ADJ = { hub: ['financial', 'industrial', 'docks', 'heights'], financial: ['hub', 'industrial', 'docks'], industrial: ['hub', 'financial', 'heights'], docks: ['hub', 'financial', 'heights'], heights: ['hub', 'industrial', 'docks'] };
const dist = (a, b) => (a === b ? 0 : ADJ[a].includes(b) ? 1 : 2);        // 2 = non-adjacent (opposite corners)
const fac = p => (isM(p) ? 'mafia' : p.role === 'serialkiller' ? 'sk' : p.role === 'jester' ? 'jester' : 'town');
const PERSONAS = ['calm', 'paranoid', 'quiet', 'loud'];
const newCode = () => { let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms[c]); return c; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const list = r => Object.values(r.players);
const living = r => list(r).filter(p => p.alive);
const livingBy = (r, role) => living(r).filter(p => p.role === role);
const log = (r, text) => r.log.push({ text, day: r.day, phase: r.phase });
const clean = s => String(s || '').replace(/[<>]/g, '').trim();
const filt = (r, t) => (r.set.filter ? t.replace(BAD, m => '*'.repeat(m.length)) : t);
const clamp = (v, a, b, d) => Math.min(b, Math.max(a, parseInt(v) || d));
const pick = a => a[Math.floor(Math.random() * a.length)];
const later = (r, ms, fn) => setTimeout(function t() { if (r.paused) return setTimeout(t, 1500); fn(); }, ms);

const makeRoom = (pid, pw) => ({ code: newCode(), host: pid, pw: clean(pw).slice(0, 20), players: {}, phase: 'lobby', day: 0, log: [], chat: [], mchat: [], dchat: [], mv: {}, votes: {}, heal: null, guard: null, block: null,
  inspected: false, fin: {}, acts: [], story: [], awards: [], skip: {}, wc: {}, winner: null, lw: null, event: null, silenced: null, voteTotals: {}, msgs: {}, ment: {}, vh: [], muted: {}, set: defaults() });

function view(r, me) {
  const over = r.phase === 'over';
  const votes = r.phase !== 'day' ? {} : r.set.anon && !over ? (me.id in r.votes ? { [me.id]: r.votes[me.id] } : {}) : r.votes;
  return {
    code: r.code, me: me.id, isHost: r.host === me.id, role: me.role, alive: me.alive, spectator: !!me.spectator, shots: me.shots || 0,
    phase: r.phase, day: r.day, endsAt: r.endsAt, winner: r.winner, min: MIN_PLAYERS, set: r.set, lw: r.lw, hostId: r.host,
    paused: !!r.paused, metro: !!r.set.metro, ip: me.ip, pos: me.pos, moved: me.movedDay === r.day, facUsed: !!(r.facUsed && r.facUsed[me.id]), kevlar: !!me.kevlar, longRange: !!me.longRange, smug: !!me.smug,
    frozen: me.frozenDay === r.day, fund: (r.fund || {})[fac(me)] || 0, veto: !!(r.veto || {})[fac(me)], proxy: r.proxy || {}, discount: !!r.set.metro && control(r, 'industrial') === fac(me),
    sab: Object.fromEntries(Object.entries(r.sab || {}).filter(([, d]) => d === r.day)), leads: Object.fromEntries(Object.keys(DISTRICTS).map(d => [d, control(r, d) === fac(me)])), tutorial: !!r.tutorial, dchat: ((!me.alive && r.phase !== 'lobby') || over) ? r.dchat : [], turn: r.phase === 'night' ? r.turn : null, step: r.step, steps: (r.order || []).length, dur: r.dur, event: r.event, silenced: r.phase === 'day' ? r.silenced : null, skipN: Object.keys(r.skip || {}).length,
    potions: me.potions || null, lover: me.lover ? r.players[me.lover]?.name : null, whispers: me.whispers,
    players: list(r).map(q => ({
      id: q.id, name: q.name, av: q.av, bot: !!q.bot, muted: !!r.muted[q.id], alive: q.alive || (!!q.hidden && q.id !== me.id), pos: q.pos, ready: !!q.ready || !!q.bot, persona: q.bot ? q.persona : undefined, connected: q.connected, spectator: !!q.spectator,
      role: (over || (!q.alive && !q.spectator && r.set.reveal && !q.hidden) || q.id === me.id || (isM(me) && isM(q))) ? q.role : null,
    })),
    log: r.log, chat: r.chat,
    mchat: isM(me) ? r.mchat : (me.role === 'spy' && me.alive && r.phase === 'night' ? r.mchat.map(m => ({ name: '???', text: m.text })) : []),
    notes: me.notes, votes, mafiaVotes: isM(me) && r.phase === 'night' ? r.mv : {},
    done: { heal: r.heal !== null, inspect: r.inspected, guard: r.guard !== null, block: r.block !== null, fin: r.fin || {} },
    story: over ? r.story : [], awards: over ? r.awards : [],
  };
}
function emit(r) { list(r).forEach(p => p.sid && io.to(p.sid).emit('state', view(r, p))); }

// ---------- game flow ----------
const PH = { night: r => nextStep(r), day: r => endDay(r), lastwords: r => endLastWords(r) };
function setPhase(r, phase, secs) {
  clearTimeout(r.timer);
  r.phase = phase; r.paused = false; r.remain = null;
  r.endsAt = secs ? Date.now() + secs * 1000 : null;
  r.dur = secs ? secs * 1000 : 0;
  if (secs) r.timer = setTimeout(() => PH[phase](r), secs * 1000);
}
function reset(r) {
  Object.assign(r, { winner: null, log: [], chat: [], mchat: [], day: 0, lw: null, event: null, silenced: null, story: [], awards: [], dchat: [], vh: [] });
  list(r).forEach(p => { if (p.role) p.prev = p.role; Object.assign(p, { role: null, alive: true, notes: [], spectator: false, shots: 0, lover: null, whispers: [], potions: null, ready: false, hidden: false }); });
}
function startGame(r) {
  const ps = list(r), n = ps.length, s = r.set;
  const m = Math.max(1, Math.min(s.mafia || Math.floor(n / 3), Math.floor((n - 1) / 2)));
  const roles = Array(m).fill('mafia');
  let i = 0;
  if (s.roles.godfather) roles[i++] = 'godfather';
  if (s.roles.silencer && i < m) roles[i++] = 'silencer';
  [...BASIC, ...NEUTRAL_UNIQUE].forEach(k => { if (s.roles[k] && roles.length < n) roles.push(k); });
  while (roles.length < n) roles.push('town');
  let best, bestScore = Infinity;                       // keep the deal that repeats the fewest roles from last round
  for (let k = 0; k < 50 && bestScore > 0; k++) {
    const a = shuffle([...roles]), sc = a.reduce((c, x, j) => c + (x === ps[j].prev ? 1 : 0), 0);
    if (sc < bestScore) { bestScore = sc; best = a; }
  }
  ps.forEach((p, j) => Object.assign(p, { role: best[j], alive: true, notes: [], whispers: [], lover: null, shots: best[j] === 'vigilante' ? 1 : 0, potions: best[j] === 'witch' ? { save: 1, poison: 1 } : null }));
  if (r.tutorial) { const me = ps.find(p => !p.bot), d = ps.find(p => p.role === 'detective'); if (me && d && me !== d) [me.role, d.role] = [d.role, me.role]; }   // tutorial: you are the Detective
  if (s.metro) ps.forEach(p => Object.assign(p, { ip: 50, pos: pick(Object.keys(DISTRICTS)), moves: [], kevlar: false, longRange: false, smug: false, hidden: false, frozenDay: 0, movedDay: 0 }));
  r.order = ORDER.filter(g => ps.some(p => grp(p) === g));
  if (s.lovers && n >= 4) { const [a, b] = shuffle([...ps]); a.lover = b.id; b.lover = a.id; }
  Object.assign(r, { day: 0, log: [], chat: [], mchat: [], winner: null, lw: null, story: [], awards: [], voteTotals: {}, msgs: {}, ment: {}, dchat: [], vh: [], event: null, silenced: null, jam: {}, framed: {}, taps: [], sab: {}, veto: {}, fund: {}, delayed: [], proxy: {}, bypass: {}, moved: {}, facUsed: {} });
  log(r, `The game begins with ${n} players and ${m} Mafia hiding among them.`);
  startNight(r);
}
function startNight(r) {
  r.day++;
  Object.assign(r, { mv: {}, heal: null, guard: null, block: null, shot: null, wsave: null, wpoison: null, sk: null, silence: null, inspected: false, insIdx: null,
    fin: {}, acts: [], votes: {}, botKill: null, skip: {}, silenced: null, proxy: {} });
  r.event = r.set.events && r.day > 1 && Math.random() < 0.3 ? pick(['fullmoon', 'blackout']) : null;
  r.insLeft = r.event === 'fullmoon' ? 2 : 1;
  log(r, `Night ${r.day} falls over the town.`);
  if (r.event === 'fullmoon') log(r, 'A full moon rises. The Detective may investigate twice tonight.');
  if (r.event === 'blackout') log(r, 'A storm is coming. There will be a blackout: no chatting tomorrow.');
  r.step = -1;
  nextStep(r);
}
// Night runs one role at a time: Mafia, Doctor, Bodyguard, Escort, Detective, Witch, Serial Killer, Vigilante.
function stepComplete(r) {
  const t = r.turn, ac = living(r).filter(p => grp(p) === t);
  switch (t) {
    case 'mafia': return ac.every(p => r.mv[p.id]) && new Set(ac.map(p => r.mv[p.id])).size === 1 && (!ac.some(p => p.role === 'silencer') || !!r.fin.silencer);
    case 'doctor': return r.heal !== null;
    case 'bodyguard': return r.guard !== null;
    case 'escort': return r.block !== null;
    case 'detective': return r.inspected;
    case 'witch': return !!r.fin.witch;
    case 'serialkiller': return !!r.fin.serialkiller;
    case 'vigilante': return !!r.fin.vigilante;
  }
  return true;
}
function canAct(r, t) {
  const ac = living(r).filter(p => grp(p) === t);
  if (!ac.length) return false;                                   // role exists but is dead: fake a short turn so nobody can tell
  if (t === 'vigilante') return ac.some(p => p.shots > 0);
  if (t === 'witch') return ac.some(p => p.potions.save + p.potions.poison > 0);
  return true;
}
function nextStep(r) {
  if (r.phase !== 'night' && r.step !== -1) return;
  clearTimeout(r.timer);
  r.advancing = false;
  r.step++;
  if (r.step >= r.order.length) return endNight(r);
  const t = (r.turn = r.order[r.step]), act = canAct(r, t);
  setPhase(r, 'night', act ? r.set.night * (t === 'mafia' ? 2 : 1) : 3);
  if (act) living(r).filter(p => p.bot && grp(p) === t).forEach(p => later(r, 1000 + Math.random() * 2500, () => { if (r.phase === 'night' && r.turn === t && p.alive) botAct(r, p); }));
  emit(r);
}
function kill(r, p, how, hide) {
  p.alive = false;
  const msg = `${p.name} was ${how}.${r.set.reveal ? ` They were ${p.role}.` : ''}`;
  if (hide) { p.hidden = true; r.delayed.push(msg); } else log(r, msg);
  const o = p.lover && r.players[p.lover];
  if (o && o.alive) kill(r, o, 'overcome by a broken heart (heartbreak)', hide);
}
function attack(r, id, how, g) {
  const v = r.players[id], e = r.eff;
  if (!v || !v.alive) return;
  if (r.set.metro && r.jam[v.pos] && !r.bypass[g]) return;                         // Signal Jammer blocks the attack
  if (id === e.heal) return log(r, `${v.name} was attacked but saved by the Doctor.`);
  if (id === e.save) return log(r, `${v.name} was attacked but saved by a mysterious potion.`);
  const bg = livingBy(r, 'bodyguard')[0];
  if (bg && id === e.guard && bg !== v) return kill(r, bg, `killed protecting ${v.name}`);
  if (v.kevlar) { v.kevlar = false; return log(r, `${v.name} was attacked but survived thanks to body armor.`); }
  kill(r, v, how, g === 'mafia' && r.set.metro && control(r, 'docks') === 'mafia');   // Docks control: no crime scene until tomorrow
}
function endNight(r) {
  if (r.phase !== 'night') return;
  const bl = role => r.block && r.players[r.block]?.role === role;
  r.story.push(`Night ${r.day}: ${r.acts.join('; ') || 'no actions'}`);
  const tally = {};
  Object.entries(r.mv).forEach(([v, t]) => { if (r.block !== v && r.players[t]?.alive) tally[t] = (tally[t] || 0) + 1; });
  const top = Math.max(0, ...Object.values(tally)), victims = Object.keys(tally).filter(k => tally[k] === top);
  const target = victims.length ? pick(victims) : null;
  r.eff = { heal: bl('doctor') ? null : r.heal, guard: bl('bodyguard') ? null : r.guard, save: bl('witch') ? null : r.wsave };
  setPhase(r, 'day', r.set.day);
  r.votes = {}; r.skip = {}; r.wc = {}; r.silenced = null; r.ment = {}; r.moved = {}; r.facUsed = {};
  const before = r.log.length;
  log(r, `Morning ${r.day} arrives.`);
  if (r.set.metro) { r.delayed.forEach(m => log(r, m)); r.delayed = []; list(r).forEach(p => { p.hidden = false; }); }
  if (target) attack(r, target, 'killed in the night', 'mafia');
  if (r.shot && !bl('vigilante')) attack(r, r.shot, 'shot by the Vigilante', 'vigilante');
  if (r.sk && !bl('serialkiller')) attack(r, r.sk, 'killed in the night', 'serialkiller');
  if (r.wpoison && !bl('witch')) attack(r, r.wpoison, 'poisoned', 'witch');
  if (!r.log.slice(before).some(l => /killed|shot|saved|poisoned|heartbreak/.test(l.text))) log(r, 'The night passed quietly. No one died.');
  if (r.silence && !bl('silencer') && r.players[r.silence]?.alive) { r.silenced = r.silence; log(r, `${r.players[r.silence].name} was silenced and cannot speak or vote today.`); }
  if (r.set.metro) metroMorning(r);
  if (!checkWin(r)) { botDay(r); botMove(r); emit(r); }
}
const weight = (r, p) => (p.role === 'mayor' ? 2 : 1) + (r.set.metro && control(r, 'hub') === fac(p) ? 1 : 0);
function dayComplete(r) { return living(r).every(p => p.id in r.votes || p.id === r.silenced); }
function endDay(r) {
  if (r.phase !== 'day') return;
  const tally = {};
  Object.entries(r.votes).forEach(([voter, t]) => {
    if (t && r.players[t]?.alive) { tally[t] = (tally[t] || 0) + weight(r, r.players[voter]); r.voteTotals[t] = (r.voteTotals[t] || 0) + 1; }
  });
  Object.entries(r.proxy || {}).forEach(([id, n]) => { if (r.players[id]?.alive) tally[id] = (tally[id] || 0) + n; });
  if (r.set.anon && Object.keys(tally).length) log(r, 'Votes: ' + Object.entries(tally).map(([id, n]) => `${r.players[id].name} ${n}`).join(', '));
  const total = living(r).reduce((s, p) => s + weight(r, p), 0) + Object.values(r.proxy || {}).reduce((a, b) => a + b, 0);
  const [id, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [];
  if (!id || n <= total / 2) { log(r, 'No majority was reached. Nobody was lynched.'); return startNight(r); }
  const v = r.players[id];
  if (r.set.metro && (r.veto || {})[fac(v)]) { delete r.veto[fac(v)]; log(r, `Executive Veto! The guilty verdict against ${v.name} was thrown out.`); return startNight(r); }
  kill(r, v, `lynched by majority vote (${n} votes)`);
  if (r.set.reveal) r.vh.push({ mafia: isM(v), voters: Object.entries(r.votes).filter(([, tt]) => tt === id).map(([x]) => x) });
  if (v.role === 'jester') { log(r, `${v.name} was the Jester and wins by being lynched!`); return finish(r, 'jester'); }
  if (checkWin(r)) return;
  if (r.set.lastWords && v.alive === false) { r.lw = id; setPhase(r, 'lastwords', LAST_WORDS_SECS); log(r, `${v.name} may speak their last words.`); emit(r); }
  else startNight(r);
}
function endLastWords(r) { if (r.phase !== 'lastwords') return; r.lw = null; startNight(r); }
function awards(r) {
  const ps = list(r).filter(p => !p.spectator), a = [];
  const top = f => ps.map(p => [p, f(p)]).sort((x, y) => y[1] - x[1])[0];
  let t = top(p => r.voteTotals[p.id] || 0); if (t && t[1] > 0) a.push(`Most Suspicious: ${t[0].name} (${t[1]} votes against them)`);
  t = top(p => r.msgs[p.id] || 0); if (t && t[1] > 0) a.push(`Chatterbox: ${t[0].name} (${t[1]} messages)`);
  const liar = ps.find(p => isM(p) && p.alive); if (liar) a.push(`Best Liar: ${liar.name} survived as ${liar.role}`);
  const det = ps.find(p => p.role === 'detective' && p.notes.some(x => /MAFIA/.test(x))); if (det) a.push(`Sharpest Detective: ${det.name} found a Mafia member`);
  return a;
}
function saveHistory(r) {
  if (r.tutorial) return;
  HIST.unshift({ id: Math.random().toString(36).slice(2, 10), ts: Date.now(), winner: r.winner, days: r.day, players: list(r).filter(p => !p.spectator).map(p => ({ name: p.name, role: p.role, alive: p.alive, bot: !!p.bot })), story: r.story, log: r.log, awards: r.awards });
  HIST = HIST.slice(0, 30);
  try { fs.writeFileSync(HFILE, JSON.stringify(HIST)); } catch (e) { /* read-only disk: history stays in memory */ }
}
function finish(r, winner) { r.winner = winner; setPhase(r, 'over'); r.awards = awards(r); saveHistory(r); emit(r); return true; }
function checkWin(r) {
  const lv = living(r), m = lv.filter(isM).length, t = lv.length - m;
  let w = null;
  if (m === 0 && !lv.some(p => p.role === 'serialkiller')) w = 'town';
  else if (m === 0 && lv.length <= 2) w = 'serialkiller';
  else if (m > 0 && m >= t) w = 'mafia';
  if (!w) return false;
  log(r, { town: 'All Mafia are gone. The Town wins!', mafia: 'The Mafia outnumber the Town. The Mafia wins!', serialkiller: 'The Serial Killer is the last one standing and wins!' }[w]);
  return finish(r, w);
}

// ---------- actions (shared by humans and bots) ----------
function doAct(r, p, msg = {}) {
  const { type, target } = msg;
  if (!r || !p.alive || r.paused) return;
  const t = r.players[target], R = p.role;
  if (r.phase === 'night') {
    if (grp(p) !== r.turn) return;
    if (type === 'hold') { if (['vigilante', 'witch', 'serialkiller', 'silencer'].includes(R)) r.fin[R] = true; else return; }
    else {
      if (!t || !t.alive) return;
      let cost = 0, kit = false;
      if (r.set.metro) {                                                           // distance penalties
        const d = dist(p.pos, t.pos);
        if (d === 2) { if (!p.longRange) return deny(p, 'Target is 2 districts away: you need a Long-Range Kit.'); kit = true; }
        else if (d === 1) cost = 10;
        if (p.paidDay !== r.day && p.ip < cost) return deny(p, `Not enough IP: targets 1 district away cost +${cost} IP.`);
      }
      if (type === 'kill' && isM(p) && !isM(t)) r.mv[p.id] = target;
      else if (type === 'heal' && R === 'doctor' && r.heal === null) r.heal = target;
      else if (type === 'guard' && R === 'bodyguard' && r.guard === null && t !== p) r.guard = target;
      else if (type === 'block' && R === 'escort' && r.block === null && t !== p) {
        r.block = target;
        if (t.role === 'detective' && r.inspected && r.insIdx != null) t.notes[r.insIdx] = `Night ${r.day}: You were distracted and learned nothing.`;
      } else if (type === 'shoot' && R === 'vigilante' && p.shots > 0 && !r.fin.vigilante && t !== p) { p.shots--; r.shot = target; r.fin.vigilante = true; }
      else if (type === 'witchsave' && R === 'witch' && p.potions.save > 0 && !r.fin.witch) { p.potions.save--; r.wsave = target; r.fin.witch = true; }
      else if (type === 'witchpoison' && R === 'witch' && p.potions.poison > 0 && !r.fin.witch && t !== p) { p.potions.poison--; r.wpoison = target; r.fin.witch = true; }
      else if (type === 'sk' && R === 'serialkiller' && !r.fin.serialkiller && t !== p) { r.sk = target; r.fin.serialkiller = true; }
      else if (type === 'silence' && R === 'silencer' && !r.fin.silencer && !isM(t)) { r.silence = target; r.fin.silencer = true; }
      else if (type === 'inspect' && R === 'detective' && !r.inspected && t !== p) {
        if (--r.insLeft <= 0) r.inspected = true;
        p.notes.push(r.block === p.id ? `Night ${r.day}: You were distracted and learned nothing.` : (r.set.metro && r.jam[t.pos] && !p.smug) ? `Night ${r.day}: Signal jammed. You learned nothing.` : `Night ${r.day}: ${t.name} is ${(t.role === 'mafia' || t.role === 'silencer' || (r.set.metro && r.framed[t.id])) ? 'MAFIA' : 'Innocent'}.`);
        r.insIdx = p.notes.length - 1;     // Godfather reads as Innocent
      } else return;
      if (r.set.metro) {
        if (kit) p.longRange = false;
        if (p.paidDay !== r.day) { p.ip -= cost; p.paidDay = r.day; }
        if (p.smug) { p.smug = false; r.bypass[grp(p)] = true; }                   // Contraband Smuggle
      }
      r.acts.push(`${p.name} (${R}) → ${t.name}`);
    }
    if (stepComplete(r) && !r.advancing) { r.advancing = true; clearTimeout(r.timer); r.endsAt = Date.now() + 900; r.timer = setTimeout(() => nextStep(r), 900); }
    emit(r);
  } else if (r.phase === 'day') {
    if (type === 'skipday') {
      r.skip[p.id] = true;
      if (living(r).every(x => r.skip[x.id])) { log(r, 'The town agreed to skip the day. Nobody was lynched.'); return startNight(r); }
      return emit(r);
    }
    if (r.set.metro && ['move', 'facility', 'buy'].includes(type)) return metroDay(r, p, msg);
    if (type !== 'vote' || p.id === r.silenced) return;
    if (target && (!t || !t.alive || t.id === p.id)) return;
    r.votes[p.id] = target || null;
    dayComplete(r) ? endDay(r) : emit(r);
  }
}

// ---------- metropolitan map and IP economy (host option) ----------
const deny = (p, m) => p.sid && io.to(p.sid).emit('err', m);
function control(r, d) {                                    // faction with a strict majority of living players stationed in district d
  const c = {}; living(r).filter(p => p.pos === d).forEach(p => { c[fac(p)] = (c[fac(p)] || 0) + 1; });
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return e.length && (e.length === 1 || e[0][1] > e[1][1]) ? e[0][0] : null;
}
function eavesdrop(r, p, label) {
  const ch = [{ n: 'the Mafia chat', l: r.mchat.map(m => `"${m.text}"`) }], pairs = {};
  list(r).forEach(q => (q.whispers || []).forEach(w => { const k = [w.from, w.to].sort().join('|'); (pairs[k] = pairs[k] || []).push(`${w.from}: "${w.text}"`); }));
  Object.values(pairs).forEach(l => ch.push({ n: 'a private whisper', l: [...new Set(l)] }));
  const best = ch.sort((a, b) => b.l.length - a.l.length)[0];
  p.notes.push(best && best.l.length ? `${label} from ${best.n}: ${pick(best.l)}` : `${label}: nothing to intercept.`);
}
function metroMorning(r) {
  const lv = living(r);
  Object.keys(DISTRICTS).forEach(d => {
    const here = lv.filter(p => p.pos === d); if (!here.length) return;
    const c = control(r, d), earn = c ? here.filter(p => fac(p) === c) : here;
    const sh = Math.floor(DISTRICTS[d].yield / earn.length);
    earn.forEach(p => { p.ip += sh; p.notes.push(`Night ${r.day}: +${sh} IP from ${DISTRICTS[d].name}.`); });
    if (d === 'financial' && c) {                                                  // Tax Harvest
      let pool = 0; lv.filter(p => p.pos !== 'financial' && fac(p) !== c).forEach(p => { const x = Math.min(5, p.ip); p.ip -= x; pool += x; });
      const ctl = here.filter(p => fac(p) === c), g = ctl.length ? Math.floor(pool / ctl.length) : 0;
      if (g) ctl.forEach(p => { p.ip += g; p.notes.push(`Tax Harvest: +${g} IP.`); });
    }
  });
  const hc = control(r, 'heights');                                                // Neighborhood Watch
  if (hc && lv.filter(p => p.pos === 'heights').length >= 3) lv.filter(p => fac(p) === hc).forEach(p => p.notes.push('Neighborhood Watch: 3+ players are gathered in Residential Heights.'));
  r.taps.forEach(tp => {                                                           // Untraceable Wiretaps
    const by = r.players[tp.by], tg = r.players[tp.target]; if (!by) return;
    const d = tg ? tg.pos : tp.target, who = tg ? [tg] : list(r).filter(q => q.alive && q.pos === d);
    const lines = r.acts.filter(a => who.some(q => a.startsWith(q.name + ' (')));
    by.notes.push(r.jam[d] ? `Wiretap on ${tg ? tg.name : DISTRICTS[d].name}: signal jammed.` : `Wiretap on ${tg ? tg.name + ' (' + DISTRICTS[d].name + ')' : DISTRICTS[d].name + ': ' + (who.map(q => q.name).join(', ') || 'empty')}: ${lines.join('; ') || 'no night activity'}.`);
  });
  Object.assign(r, { jam: {}, framed: {}, taps: [], bypass: {} });
}
function metroDay(r, p, m) {
  const { type, target, item } = m, frozen = p.frozenDay === r.day, t = r.players[target];
  if (type === 'move') {
    if (!DISTRICTS[target] || target === p.pos) return;
    if (p.movedDay === r.day) return deny(p, 'You already moved today.');
    const cost = dist(p.pos, target) === 2 ? 15 : 0;                               // Express Travel
    if (cost && (frozen || p.ip < cost)) return deny(p, frozen ? 'Your assets are frozen.' : 'Express Travel costs 15 IP.');
    p.ip -= cost; p.moves.push(`Day ${r.day}: ${DISTRICTS[p.pos].name} to ${DISTRICTS[target].name}`); p.pos = target; p.movedDay = r.day;
    p.notes.push(`You moved to ${DISTRICTS[target].name}${cost ? ' (Express Travel, -15 IP)' : ''}.`); return emit(r);
  }
  if (type === 'facility') {
    if (r.facUsed[p.id]) return deny(p, 'You already used your district action today.');
    if (r.sab[p.pos] === r.day) return deny(p, 'This facility was sabotaged.');
    switch (p.pos) {
      case 'financial': if (!t || !t.alive) return; t.frozenDay = r.day; p.notes.push(`Froze ${t.name}'s assets for today.`); break;
      case 'industrial': if (!DISTRICTS[target] || target === 'industrial') return; r.sab[target] = r.day + 1; p.notes.push(`Sabotaged the ${DISTRICTS[target].name} facility for tomorrow.`); break;
      case 'hub': if (!t || !t.alive) return; log(r, `Subpoena: ${t.name} was in ${DISTRICTS[t.pos].name}. Recent moves: ${t.moves.slice(-2).join('; ') || 'none'}.`); break;
      case 'docks': p.smug = true; p.notes.push('Contraband ready: your next night action ignores jammers.'); break;
      case 'heights': eavesdrop(r, p, 'Eavesdrop'); break;
    }
    r.facUsed[p.id] = true; return emit(r);
  }
  const f = fac(p), base = { proxy: 25, indict: 40, donate: 25, veto: 0, kevlar: 60, jammer: 40, dossier: 40, longrange: 35, wiretap: 50, scraps: 35 }[item];
  if (base === undefined) return;
  if (frozen) return deny(p, 'Your assets are frozen.');
  if (item === 'veto') {
    if ((r.fund[f] || 0) < 100) return deny(p, 'The faction fund needs 100 IP.');
    if (r.veto[f]) return deny(p, 'Executive Veto is already armed.');
    r.fund[f] -= 100; r.veto[f] = true; p.notes.push('Executive Veto armed for your faction.'); return emit(r);
  }
  const bm = ['kevlar', 'jammer', 'dossier', 'longrange', 'wiretap'].includes(item), price = bm && control(r, 'industrial') === f ? Math.ceil(base * 0.75) : base;
  if (p.ip < price) return deny(p, `Not enough IP (need ${price}).`);
  switch (item) {
    case 'proxy': if (!t || !t.alive) return; r.proxy[target] = (r.proxy[target] || 0) + 1; break;
    case 'indict': p.ip -= price; log(r, `${p.name} called a Special Indictment. The town votes now!`); return endDay(r);
    case 'donate': r.fund[f] = (r.fund[f] || 0) + 25; break;
    case 'kevlar': if (p.kevlar) return; p.kevlar = true; break;
    case 'jammer': if (!DISTRICTS[target]) return; r.jam[target] = true; break;
    case 'dossier': if (!t || !t.alive) return; r.framed[target] = true; break;
    case 'longrange': p.longRange = true; break;
    case 'wiretap': if (!t && !DISTRICTS[target]) return; r.taps.push({ by: p.id, target }); break;
    case 'scraps': eavesdrop(r, p, 'Intercepted scraps'); break;
  }
  p.ip -= price; p.notes.push(`Bought ${item} for ${price} IP.`); emit(r);
}
function botMove(r) {
  if (!r.set.metro) return;
  const d = r.day;
  list(r).filter(p => p.bot && p.alive).forEach(p => later(r, 1000 + Math.random() * 3000, () => { if (r.phase === 'day' && r.day === d && Math.random() < 0.6) doAct(r, p, { type: 'move', target: pick(ADJ[p.pos]) }); }));
}

// ---------- bots ----------
function botAct(r, p) {
  const ok = q => !r.set.metro || dist(p.pos, q.pos) === 0 || (dist(p.pos, q.pos) === 1 && p.ip >= 10);   // bots respect distance costs
  const others = living(r).filter(q => q.id !== p.id && ok(q)), nonM = others.filter(q => !isM(q));
  const id = a => pick(a)?.id, R = p.role;
  if (isM(p)) {
    if (R === 'silencer') doAct(r, p, { type: 'silence', target: id(nonM) });
    const human = Object.entries(r.mv).find(([v]) => !r.players[v].bot);
    if (!r.botKill || !r.players[r.botKill]?.alive) { r.botKill = human ? human[1] : id(nonM); r.mchat.push({ name: p.name, text: `Let's take out ${r.players[r.botKill]?.name}.`, ts: Date.now() }); }
    return doAct(r, p, { type: 'kill', target: r.botKill });
  }
  const map = { doctor: ['heal', id(living(r).filter(ok))], detective: ['inspect', id(others)], bodyguard: ['guard', id(others)], escort: ['block', id(others)], serialkiller: ['sk', id(others)] };
  if (map[R]) doAct(r, p, { type: map[R][0], target: map[R][1] });
  else if (R === 'vigilante' || R === 'witch') doAct(r, p, { type: 'hold' });
}
// Bots chat and vote using only PUBLIC information (who was mentioned, who has been quiet). They never peek at hidden roles.
function mention(r, from, text) {
  list(r).forEach(q => { if (q.alive && q.id !== from.id && text.toLowerCase().includes(sn(q).toLowerCase())) r.ment[q.id] = (r.ment[q.id] || 0) + 1; });
}
function say(r, p, text) {
  if (r.phase !== 'day' || !p.alive || p.id === r.silenced || r.event === 'blackout') return;
  r.chat.push({ name: p.name, text, ts: Date.now() }); r.msgs[p.id] = (r.msgs[p.id] || 0) + 1;
  mention(r, p, text); emit(r);
}
function score(r, p, q) {                       // how suspicious q looks to bot p, from PUBLIC information only
  let v = (r.ment[q.id] || 0) * 2 - Math.min(2, r.msgs[q.id] || 0) * 0.3 + Math.random();
  r.vh.forEach(h => { if (h.voters.includes(q.id)) v += h.mafia ? -3 : 3; });      // voted for someone later revealed innocent = suspicious
  if (p.grudge === q.id) v += 2;                                                     // remembers who accused it
  return v;
}
function botSay(r, p) {
  const lvl = r.set.botLevel, c = living(r).filter(q => q.id !== p.id && !(isM(p) && isM(q)));
  if (!c.length) return;
  const hot = [...c].sort((a, b) => (r.ment[b.id] || 0) - (r.ment[a.id] || 0))[0];
  const quiet = [...c].sort((a, b) => (r.msgs[a.id] || 0) - (r.msgs[b.id] || 0))[0];
  const top = [...c].sort((a, b) => score(r, p, b) - score(r, p, a))[0];
  const dead = r.log.slice().reverse().find(l => l.day === r.day && /was (killed|shot|poisoned)/.test(l.text));
  const generic = [{ t: r.day === 1 ? 'No info yet. Everyone say something so we can read each other.' : 'We cannot afford a wrong vote today.' }, { t: "I'm just a regular townsperson, I swear." }, { t: 'Let us not rush the vote.' }];
  let o = [];
  if (lvl === 'easy') { const x = pick(c); o = [...generic, { t: `${sn(x)} looks suspicious.`, s: x }]; }
  else if (lvl === 'hard') {
    const bad = r.vh.some(h => h.voters.includes(top.id) && !h.mafia), gr = p.grudge && c.find(q => q.id === p.grudge);
    if (bad) o.push({ t: `${sn(top)} voted for an innocent player earlier. That worries me.`, s: top, w: 4 });
    if (gr) o.push({ t: `${sn(gr)} accused me before. I am keeping an eye on them.`, s: gr, w: 3 });
    o.push({ t: `My top suspect is ${sn(top)}. Prove me wrong.`, s: top, w: 3 }, { t: `${sn(quiet)} has said almost nothing. Silence is a strategy.`, s: quiet });
    if (dead) o.push({ t: `Poor ${dead.text.split(' was ')[0]}. Think about who benefits from that.` });
    o = o.flatMap(x => Array(x.w || 1).fill(x));
  } else {
    if ((r.ment[hot.id] || 0) > 0) o.push({ t: `I agree, ${sn(hot)} seems suspicious to me.`, s: hot }, { t: `${sn(hot)}, a lot of people are talking about you. Care to explain?`, s: hot });
    o.push({ t: `${sn(quiet)} has been very quiet. Mafia?`, s: quiet }, { t: `Not sure, but ${sn(quiet)} feels off to me.`, s: quiet });
    if (dead) o.push({ t: `Poor ${dead.text.split(' was ')[0]}... who could have done this?` });
    o.push(...generic);
  }
  const m = pick(o), per = p.persona || 'calm'; if (m.s) p.sus = m.s.id;
  let text = m.t;
  if (per === 'loud') text = text.toUpperCase().replace(/[.?]$/, '!');
  else if (per === 'quiet') { if (Math.random() < 0.5) return; text = m.s ? `${sn(m.s)}?` : pick(['Hmm.', 'Not sure yet.', 'I am watching.']); }
  else if (per === 'paranoid') { const x = pick(c); p.sus = x.id; text = pick([`Trust nobody. ${sn(x)} is hiding something.`, `I do not like how calm ${sn(x)} is.`, 'Someone here is lying to all of us.', `Why is ${sn(x)} so quiet? Why?`]); }
  say(r, p, text);
}
function botVote(r, p) {
  const lvl = r.set.botLevel, c = living(r).filter(q => q.id !== p.id && !(isM(p) && isM(q)));
  if (p.persona === 'loud' && c.find(q => q.id === p.sus)) return p.sus;
  if (p.persona === 'quiet') { const lead = [...c].sort((a, b) => Object.values(r.votes).filter(x => x === b.id).length - Object.values(r.votes).filter(x => x === a.id).length)[0]; if (lead && Object.values(r.votes).includes(lead.id)) return lead.id; }
  if (lvl === 'easy') return pick(c)?.id;
  if (lvl === 'hard') {
    const lead = q => Object.values(r.votes).filter(t => t === q.id).length * 1.5;         // bandwagon on the current leader
    return [...c].sort((a, b) => score(r, p, b) + lead(b) - score(r, p, a) - lead(a))[0]?.id;
  }
  const hot = [...c].sort((a, b) => (r.ment[b.id] || 0) - (r.ment[a.id] || 0))[0];
  return (c.find(q => q.id === p.sus) || ((r.ment[hot?.id] || 0) > 0 ? hot : null) || pick(c))?.id;
}
function botReact(r, from, text) {
  list(r).filter(b => b.bot && b.alive && b.id !== from.id && text.toLowerCase().includes(sn(b).toLowerCase())).forEach(b => {
    if (!(isM(b) && isM(from))) { b.sus = from.id; b.grudge = from.id; }
    if (Math.random() < 0.75) later(r, 2000 + Math.random() * 3000, () => say(r, b, pick([`Why me, ${sn(from)}? I'm innocent!`, "That's not fair. I've been trying to help.", `${sn(from)}, you are accusing me without proof.`, `Hmm, maybe ${sn(from)} is trying to deflect.`])));
  });
}
function botDay(r) {
  const d = r.day, ms = Math.max(5000, r.set.day * 1000), ok = () => r.phase === 'day' && r.day === d;
  list(r).filter(p => p.bot && p.alive).forEach(p => {
    for (let i = 0; i < ({ quiet: 1, calm: 2, paranoid: 3, loud: 4 }[p.persona] || 2); i++) later(r, ms * (0.08 + Math.random() * 0.5), () => { if (ok()) botSay(r, p); });
    later(r, ms * (0.6 + Math.random() * 0.25), () => { if (ok() && p.alive && !(p.id in r.votes)) doAct(r, p, { type: 'vote', target: botVote(r, p) }); });
  });
}

// ---------- sockets ----------
io.on('connection', socket => {
  let room = null, player = null;
  const err = msg => socket.emit('err', msg);
  const attach = (r, p) => { room = r; player = p; p.sid = socket.id; p.connected = true; socket.join(r.code); socket.emit('joined', { code: r.code }); emit(r); };
  const mk = (id, name, av, spectator) => ({ ready: false, id, name, av: clean(av).slice(0, 4), alive: !spectator, role: null, notes: [], whispers: [], connected: true, spectator, shots: 0 });
  const host = () => room && room.host === player.id;

  socket.on('create', ({ name, pid, av, pw }) => {
    name = clean(name).slice(0, 16); if (!name) return err('Enter a name.');
    const r = makeRoom(pid, pw);
    r.players[pid] = mk(pid, name, av, false);
    rooms[r.code] = r; attach(r, r.players[pid]);
  });

  socket.on('join', ({ code, name, pid, av, pw }) => {
    const r = rooms[String(code || '').toUpperCase().trim()];
    if (!r) return err('Room not found. Check the code.');
    if (r.players[pid]) {
      const p = r.players[pid];
      if (!p.connected && r.phase !== 'lobby') r.chat.push({ sys: 1, text: `${p.name} is back.` });
      return attach(r, p);
    }
    if (r.pw && r.pw !== clean(pw)) return err('Wrong room password.');
    name = clean(name).slice(0, 16); if (!name) return err('Enter a name.');
    if (list(r).length >= MAX_PLAYERS) return err('Room is full.');
    if (list(r).some(p => p.name.toLowerCase() === name.toLowerCase())) return err('That name is taken in this room.');
    const late = r.phase !== 'lobby';
    r.players[pid] = mk(pid, name, av, late);
    if (late) r.chat.push({ sys: 1, text: `${name} joined as a spectator.` });
    attach(r, r.players[pid]);
  });

  socket.on('settings', s => {
    if (!host() || room.phase !== 'lobby') return;
    const S = room.set;
    S.night = clamp(s.night, 10, 120, 20); S.day = clamp(s.day, 20, 600, 120); S.mafia = clamp(s.mafia, 0, 5, 0);
    ['reveal', 'lastWords', 'events', 'anon', 'filter', 'lovers'].forEach(k => { S[k] = !!s[k]; });
    S.metro = !!s.metro;
    S.botLevel = ['easy', 'normal', 'hard'].includes(s.botLevel) ? s.botLevel : 'normal';
    const v = clean(s.voice).slice(0, 200); S.voice = /^https:\/\//.test(v) ? v : '';
    Object.keys(S.roles).forEach(k => { S.roles[k] = !!(s.roles && s.roles[k]); });
    emit(room);
  });

  socket.on('rename', name => {
    name = clean(name).slice(0, 16);
    if (!room || room.phase !== 'lobby' || !name || list(room).some(p => p.id !== player.id && p.name.toLowerCase() === name.toLowerCase())) return err('That name is not available.');
    player.name = name; emit(room);
  });
  socket.on('kick', id => {
    if (!host() || room.phase !== 'lobby' || id === player.id || !room.players[id]) return;
    const k = room.players[id]; if (k.sid) io.to(k.sid).emit('kicked');
    delete room.players[id]; emit(room);
  });
  socket.on('addbot', () => {
    if (!host() || room.phase !== 'lobby' || list(room).length >= MAX_PLAYERS) return;
    const used = list(room).map(p => p.name), nm = BOTNAMES.map(n => 'Bot ' + n).find(n => !used.includes(n)) || 'Bot ' + Math.random().toString(36).slice(2, 5);
    const id = 'bot' + Math.random().toString(36).slice(2, 8);
    room.players[id] = { ...mk(id, nm, '🤖', false), bot: true, persona: pick(PERSONAS) };
    emit(room);
  });
  socket.on('ready', () => { if (room && room.phase === 'lobby' && !player.bot) { player.ready = !player.ready; emit(room); } });
  socket.on('botconfig', ({ id, name, persona }) => {
    const b = room && room.players[id];
    if (!host() || room.phase !== 'lobby' || !b || !b.bot) return;
    name = clean(name).slice(0, 16);
    if (name && !list(room).some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) b.name = name;
    if (PERSONAS.includes(persona)) b.persona = persona;
    emit(room);
  });
  socket.on('start', () => {
    if (!host() || !['lobby', 'over'].includes(room.phase)) return;
    if (list(room).length < MIN_PLAYERS) return err(`Need at least ${MIN_PLAYERS} players.`);
    const waiting = list(room).filter(p => !p.bot && p.connected && p.id !== room.host && !p.ready);
    if (room.phase === 'lobby' && waiting.length) return err('Waiting for: ' + waiting.map(p => p.name).join(', '));
    if (room.phase === 'over') reset(room);
    startGame(room);
  });
  socket.on('again', () => { if (!host() || room.phase !== 'over') return; reset(room); setPhase(room, 'lobby'); emit(room); });

  socket.on('pause', () => {
    if (!host() || !['night', 'day', 'lastwords'].includes(room.phase)) return;
    const r = room;
    if (!r.paused) { r.paused = true; r.remain = r.endsAt - Date.now(); clearTimeout(r.timer); r.endsAt = null; }
    else { r.paused = false; r.endsAt = Date.now() + r.remain; r.timer = setTimeout(() => PH[r.phase](r), r.remain); }
    emit(r);
  });
  socket.on('skipphase', () => { if (host() && ['night', 'day', 'lastwords'].includes(room.phase)) { room.paused = false; PH[room.phase](room); } });

  socket.on('act', msg => doAct(room, player, msg || {}));

  const deadChat = () => !player.alive && ['night', 'day', 'lastwords'].includes(room.phase) && !(room.phase === 'lastwords' && room.lw === player.id);
  const silenced = () => room.phase === 'day' && room.silenced === player.id;
  const canChat = () => {
    const r = room, p = player;
    if (r.muted[p.id]) return false;
    if (deadChat()) return true;
    if (['lobby', 'over'].includes(r.phase)) return true;
    if (r.phase === 'day') return p.alive && !silenced() && r.event !== 'blackout';
    if (r.phase === 'lastwords') return r.lw === p.id;
    return p.alive && isM(p);
  };
  socket.on('chat', ({ text }) => {
    text = clean(text).slice(0, 300);
    if (!room || !text) return;
    if (room.muted[player.id]) return err('The host muted you.');
    if (!canChat()) return;
    if (deadChat()) { room.dchat.push({ name: player.name, text: filt(room, text), ts: Date.now() }); return emit(room); }
    room.msgs[player.id] = (room.msgs[player.id] || 0) + 1;
    const msg = { name: player.name, text: filt(room, text), ts: Date.now() };
    (room.phase === 'night' ? room.mchat : room.chat).push(msg);
    if (room.phase === 'day') { mention(room, player, text); botReact(room, player, text); }
    emit(room);
  });
  socket.on('whisper', ({ to, text }) => {
    const r = room, p = player, t = r && r.players[to];
    text = clean(text).slice(0, 200);
    if (!r || !t || !text || r.phase !== 'day' || !p.alive || !t.alive || t === p || silenced() || r.muted[p.id] || r.event === 'blackout') return;
    if ((r.wc[p.id] || 0) >= WHISPERS_PER_DAY) return err(`You used your ${WHISPERS_PER_DAY} whispers for today.`);
    r.wc[p.id] = (r.wc[p.id] || 0) + 1;
    const w = { from: p.name, to: t.name, text: filt(r, text) };
    p.whispers.push(w); t.whispers.push(w); emit(r);
  });
  socket.on('typing', () => {
    if (!room || !canChat() || deadChat()) return;
    list(room).filter(p => p.sid && p.id !== player.id && (room.phase !== 'night' || isM(p))).forEach(p => io.to(p.sid).emit('typing', player.name));
  });

  socket.on('mute', id => {
    if (!host() || !room.players[id] || id === player.id) return;
    if (room.muted[id]) delete room.muted[id]; else room.muted[id] = true;
    emit(room);
  });
  socket.on('report', id => {
    const t = room && room.players[id], h = room && room.players[room.host];
    if (t && h && h.sid) io.to(h.sid).emit('reported', { by: player.name, who: t.name });
  });
  socket.on('tutorial', ({ name, pid, av }) => {
    const r = makeRoom(pid, ''); r.tutorial = true;
    Object.assign(r.set, { night: 15, day: 60, lastWords: false, botLevel: 'easy' });
    r.players[pid] = mk(pid, clean(name).slice(0, 16) || 'You', av, false); rooms[r.code] = r;
    ['Ada', 'Ben', 'Cleo', 'Dex'].forEach((n, i) => { const id = 'bot' + i + Math.random().toString(36).slice(2, 6); r.players[id] = { ...mk(id, 'Bot ' + n, '🤖', false), bot: true }; });
    attach(r, r.players[pid]); startGame(r);
  });

  socket.on('leave', () => {
    const r = room, p = player; if (!r) return;
    socket.leave(r.code); p.sid = null; p.connected = false;
    if (r.host === p.id) {
      const nh = list(r).find(q => !q.bot && q.connected && q.id !== p.id);
      if (nh) r.host = nh.id; else { clearTimeout(r.timer); delete rooms[r.code]; room = player = null; return socket.emit('left'); }
    }
    if (['lobby', 'over'].includes(r.phase) || p.spectator) { delete r.players[p.id]; emit(r); }
    else {
      if (p.alive) kill(r, p, 'removed after leaving the game');
      p.left = true;
      if (!checkWin(r)) {
        if (r.phase === 'night' && stepComplete(r)) nextStep(r);
        else if (r.phase === 'day' && dayComplete(r)) endDay(r);
        else emit(r);
      }
    }
    room = player = null; socket.emit('left');
  });

  socket.on('disconnect', () => {
    if (!room) return;
    player.connected = false;
    if (room.phase !== 'lobby') room.chat.push({ sys: 1, text: `${player.name} disconnected.` });
    emit(room);
    if (list(room).filter(p => !p.bot).every(p => !p.connected)) {
      const r = room;
      setTimeout(() => { if (list(r).filter(p => !p.bot).every(p => !p.connected)) { clearTimeout(r.timer); delete rooms[r.code]; } }, 10 * 60 * 1000);
    }
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log(`Mafia running on http://localhost:${PORT}`));
