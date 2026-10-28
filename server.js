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
const rooms = {};
const defaults = () => ({
  night: 20, day: 120, mafia: 0, reveal: true, lastWords: true, events: false, anon: false, filter: true, lovers: false, voice: '',
  roles: { detective: true, doctor: true, vigilante: false, bodyguard: false, mayor: false, jester: false, godfather: false,
    witch: false, escort: false, spy: false, serialkiller: false, silencer: false },
});

// ---------- helpers ----------
const isM = p => MAFIA_ROLES.includes(p.role);
const grp = p => (isM(p) ? 'mafia' : p.role);
const sn = q => (q.bot ? q.name.replace('Bot ', '') : q.name);
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

function view(r, me) {
  const over = r.phase === 'over';
  const votes = r.phase !== 'day' ? {} : r.set.anon && !over ? (me.id in r.votes ? { [me.id]: r.votes[me.id] } : {}) : r.votes;
  return {
    code: r.code, me: me.id, isHost: r.host === me.id, role: me.role, alive: me.alive, spectator: !!me.spectator, shots: me.shots || 0,
    phase: r.phase, day: r.day, endsAt: r.endsAt, winner: r.winner, min: MIN_PLAYERS, set: r.set, lw: r.lw, hostId: r.host,
    paused: !!r.paused, turn: r.phase === 'night' ? r.turn : null, step: r.step, steps: (r.order || []).length, dur: r.dur, event: r.event, silenced: r.phase === 'day' ? r.silenced : null, skipN: Object.keys(r.skip || {}).length,
    potions: me.potions || null, lover: me.lover ? r.players[me.lover]?.name : null, whispers: me.whispers,
    players: list(r).map(q => ({
      id: q.id, name: q.name, av: q.av, bot: !!q.bot, alive: q.alive, connected: q.connected, spectator: !!q.spectator,
      role: (over || (!q.alive && !q.spectator && r.set.reveal) || q.id === me.id || (isM(me) && isM(q))) ? q.role : null,
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
  Object.assign(r, { winner: null, log: [], chat: [], mchat: [], day: 0, lw: null, event: null, silenced: null, story: [], awards: [] });
  list(r).forEach(p => { if (p.role) p.prev = p.role; Object.assign(p, { role: null, alive: true, notes: [], spectator: false, shots: 0, lover: null, whispers: [], potions: null }); });
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
  r.order = ORDER.filter(g => ps.some(p => grp(p) === g));
  if (s.lovers && n >= 4) { const [a, b] = shuffle([...ps]); a.lover = b.id; b.lover = a.id; }
  Object.assign(r, { day: 0, log: [], chat: [], mchat: [], winner: null, lw: null, story: [], awards: [], voteTotals: {}, msgs: {}, ment: {}, event: null, silenced: null });
  log(r, `The game begins with ${n} players and ${m} Mafia hiding among them.`);
  startNight(r);
}
function startNight(r) {
  r.day++;
  Object.assign(r, { mv: {}, heal: null, guard: null, block: null, shot: null, wsave: null, wpoison: null, sk: null, silence: null, inspected: false, insIdx: null,
    fin: {}, acts: [], votes: {}, botKill: null, skip: {}, silenced: null });
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
function kill(r, p, how) {
  p.alive = false;
  log(r, `${p.name} was ${how}.${r.set.reveal ? ` They were ${p.role}.` : ''}`);
  const o = p.lover && r.players[p.lover];
  if (o && o.alive) kill(r, o, 'overcome by a broken heart (heartbreak)');
}
function attack(r, id, how) {
  const v = r.players[id], e = r.eff;
  if (!v || !v.alive) return;
  if (id === e.heal) return log(r, `${v.name} was attacked but saved by the Doctor.`);
  if (id === e.save) return log(r, `${v.name} was attacked but saved by a mysterious potion.`);
  const bg = livingBy(r, 'bodyguard')[0];
  if (bg && id === e.guard && bg !== v) return kill(r, bg, `killed protecting ${v.name}`);
  kill(r, v, how);
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
  r.votes = {}; r.skip = {}; r.wc = {}; r.silenced = null; r.ment = {};
  const before = r.log.length;
  log(r, `Morning ${r.day} arrives.`);
  if (target) attack(r, target, 'killed in the night');
  if (r.shot && !bl('vigilante')) attack(r, r.shot, 'shot by the Vigilante');
  if (r.sk && !bl('serialkiller')) attack(r, r.sk, 'killed in the night');
  if (r.wpoison && !bl('witch')) attack(r, r.wpoison, 'poisoned');
  if (!r.log.slice(before).some(l => /killed|shot|saved|poisoned|heartbreak/.test(l.text))) log(r, 'The night passed quietly. No one died.');
  if (r.silence && !bl('silencer') && r.players[r.silence]?.alive) { r.silenced = r.silence; log(r, `${r.players[r.silence].name} was silenced and cannot speak or vote today.`); }
  if (!checkWin(r)) { botDay(r); emit(r); }
}
const weight = p => (p.role === 'mayor' ? 2 : 1);
function dayComplete(r) { return living(r).every(p => p.id in r.votes || p.id === r.silenced); }
function endDay(r) {
  if (r.phase !== 'day') return;
  const tally = {};
  Object.entries(r.votes).forEach(([voter, t]) => {
    if (t && r.players[t]?.alive) { tally[t] = (tally[t] || 0) + weight(r.players[voter]); r.voteTotals[t] = (r.voteTotals[t] || 0) + 1; }
  });
  if (r.set.anon && Object.keys(tally).length) log(r, 'Votes: ' + Object.entries(tally).map(([id, n]) => `${r.players[id].name} ${n}`).join(', '));
  const total = living(r).reduce((s, p) => s + weight(p), 0);
  const [id, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [];
  if (!id || n <= total / 2) { log(r, 'No majority was reached. Nobody was lynched.'); return startNight(r); }
  const v = r.players[id];
  kill(r, v, `lynched by majority vote (${n} votes)`);
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
function finish(r, winner) { r.winner = winner; setPhase(r, 'over'); r.awards = awards(r); emit(r); return true; }
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
function doAct(r, p, { type, target }) {
  if (!r || !p.alive || r.paused) return;
  const t = r.players[target], R = p.role;
  if (r.phase === 'night') {
    if (grp(p) !== r.turn) return;
    if (type === 'hold') { if (['vigilante', 'witch', 'serialkiller', 'silencer'].includes(R)) r.fin[R] = true; else return; }
    else {
      if (!t || !t.alive) return;
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
        p.notes.push(r.block === p.id ? `Night ${r.day}: You were distracted and learned nothing.` : `Night ${r.day}: ${t.name} is ${t.role === 'mafia' || t.role === 'silencer' ? 'MAFIA' : 'Innocent'}.`);
        r.insIdx = p.notes.length - 1;     // Godfather reads as Innocent
      } else return;
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
    if (type !== 'vote' || p.id === r.silenced) return;
    if (target && (!t || !t.alive || t.id === p.id)) return;
    r.votes[p.id] = target || null;
    dayComplete(r) ? endDay(r) : emit(r);
  }
}

// ---------- bots ----------
function botAct(r, p) {
  const others = living(r).filter(q => q.id !== p.id), nonM = others.filter(q => !isM(q));
  const id = a => pick(a)?.id, R = p.role;
  if (isM(p)) {
    if (R === 'silencer') doAct(r, p, { type: 'silence', target: id(nonM) });
    const human = Object.entries(r.mv).find(([v]) => !r.players[v].bot);
    if (!r.botKill || !r.players[r.botKill]?.alive) { r.botKill = human ? human[1] : id(nonM); r.mchat.push({ name: p.name, text: `Let's take out ${r.players[r.botKill]?.name}.`, ts: Date.now() }); }
    return doAct(r, p, { type: 'kill', target: r.botKill });
  }
  const map = { doctor: ['heal', id(living(r))], detective: ['inspect', id(others)], bodyguard: ['guard', id(others)], escort: ['block', id(others)], serialkiller: ['sk', id(others)] };
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
function botSay(r, p) {
  const c = living(r).filter(q => q.id !== p.id && !(isM(p) && isM(q)));       // a Mafia bot knows its own teammates, nothing else
  if (!c.length) return;
  const hot = [...c].sort((a, b) => (r.ment[b.id] || 0) - (r.ment[a.id] || 0))[0];
  const quiet = [...c].sort((a, b) => (r.msgs[a.id] || 0) - (r.msgs[b.id] || 0))[0];
  const dead = r.log.slice().reverse().find(l => l.day === r.day && /was (killed|shot|poisoned)/.test(l.text));
  const o = [];
  if ((r.ment[hot.id] || 0) > 0) o.push({ t: `I agree, ${sn(hot)} seems suspicious to me.`, s: hot }, { t: `${sn(hot)}, a lot of people are talking about you. Care to explain?`, s: hot });
  o.push({ t: `${sn(quiet)} has been very quiet. Mafia?`, s: quiet }, { t: `Not sure, but ${sn(quiet)} feels off to me.`, s: quiet });
  if (dead) o.push({ t: `Poor ${dead.text.split(' was ')[0]}... who could have done this?` });
  o.push({ t: r.day === 1 ? 'No info yet. Everyone say something so we can read each other.' : 'We cannot afford a wrong vote today.' }, { t: "I'm just a regular townsperson, I swear." }, { t: 'Let us not rush the vote.' });
  const m = pick(o); if (m.s) p.sus = m.s.id;
  say(r, p, m.t);
}
function botVote(r, p) {
  const c = living(r).filter(q => q.id !== p.id && !(isM(p) && isM(q)));
  const hot = [...c].sort((a, b) => (r.ment[b.id] || 0) - (r.ment[a.id] || 0))[0];
  return (c.find(q => q.id === p.sus) || ((r.ment[hot?.id] || 0) > 0 ? hot : null) || pick(c))?.id;
}
function botReact(r, from, text) {
  list(r).filter(b => b.bot && b.alive && b.id !== from.id && text.toLowerCase().includes(sn(b).toLowerCase())).forEach(b => {
    if (!(isM(b) && isM(from))) b.sus = from.id;
    if (Math.random() < 0.75) later(r, 2000 + Math.random() * 3000, () => say(r, b, pick([`Why me, ${sn(from)}? I'm innocent!`, "That's not fair. I've been trying to help.", `${sn(from)}, you are accusing me without proof.`, `Hmm, maybe ${sn(from)} is trying to deflect.`])));
  });
}
function botDay(r) {
  const d = r.day, ms = Math.max(5000, r.set.day * 1000), ok = () => r.phase === 'day' && r.day === d;
  list(r).filter(p => p.bot && p.alive).forEach(p => {
    for (let i = 0; i < 2; i++) later(r, ms * (0.08 + Math.random() * 0.5), () => { if (ok()) botSay(r, p); });
    later(r, ms * (0.6 + Math.random() * 0.25), () => { if (ok() && p.alive && !(p.id in r.votes)) doAct(r, p, { type: 'vote', target: botVote(r, p) }); });
  });
}

// ---------- sockets ----------
io.on('connection', socket => {
  let room = null, player = null;
  const err = msg => socket.emit('err', msg);
  const attach = (r, p) => { room = r; player = p; p.sid = socket.id; p.connected = true; socket.join(r.code); socket.emit('joined', { code: r.code }); emit(r); };
  const mk = (id, name, av, spectator) => ({ id, name, av: clean(av).slice(0, 4), alive: !spectator, role: null, notes: [], whispers: [], connected: true, spectator, shots: 0 });
  const host = () => room && room.host === player.id;

  socket.on('create', ({ name, pid, av, pw }) => {
    name = clean(name).slice(0, 16); if (!name) return err('Enter a name.');
    const r = { code: newCode(), host: pid, pw: clean(pw).slice(0, 20), players: {}, phase: 'lobby', day: 0, log: [], chat: [], mchat: [], mv: {}, votes: {}, heal: null, guard: null, block: null,
      inspected: false, fin: {}, acts: [], story: [], awards: [], skip: {}, wc: {}, winner: null, lw: null, event: null, silenced: null, voteTotals: {}, msgs: {}, set: defaults() };
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
    room.players[id] = { ...mk(id, nm, '🤖', false), bot: true };
    emit(room);
  });
  socket.on('start', () => {
    if (!host() || !['lobby', 'over'].includes(room.phase)) return;
    if (list(room).length < MIN_PLAYERS) return err(`Need at least ${MIN_PLAYERS} players.`);
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

  const silenced = () => room.phase === 'day' && room.silenced === player.id;
  const canChat = () => {
    const r = room, p = player;
    if (['lobby', 'over'].includes(r.phase)) return true;
    if (r.phase === 'day') return p.alive && !silenced() && r.event !== 'blackout';
    if (r.phase === 'lastwords') return r.lw === p.id;
    return p.alive && isM(p);
  };
  socket.on('chat', ({ text }) => {
    text = clean(text).slice(0, 300);
    if (!room || !text || !canChat()) return;
    room.msgs[player.id] = (room.msgs[player.id] || 0) + 1;
    const msg = { name: player.name, text: filt(room, text), ts: Date.now() };
    (room.phase === 'night' ? room.mchat : room.chat).push(msg);
    if (room.phase === 'day') { mention(room, player, text); botReact(room, player, text); }
    emit(room);
  });
  socket.on('whisper', ({ to, text }) => {
    const r = room, p = player, t = r && r.players[to];
    text = clean(text).slice(0, 200);
    if (!r || !t || !text || r.phase !== 'day' || !p.alive || !t.alive || t === p || silenced() || r.event === 'blackout') return;
    if ((r.wc[p.id] || 0) >= WHISPERS_PER_DAY) return err(`You used your ${WHISPERS_PER_DAY} whispers for today.`);
    r.wc[p.id] = (r.wc[p.id] || 0) + 1;
    const w = { from: p.name, to: t.name, text: filt(r, text) };
    p.whispers.push(w); t.whispers.push(w); emit(r);
  });
  socket.on('typing', () => {
    if (!room || !canChat()) return;
    list(room).filter(p => p.sid && p.id !== player.id && (room.phase !== 'night' || isM(p))).forEach(p => io.to(p.sid).emit('typing', player.name));
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
