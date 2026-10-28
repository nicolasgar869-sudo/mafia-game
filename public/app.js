const $ = s => document.querySelector(s);
const pid = localStorage.pid || (localStorage.pid = Math.random().toString(36).slice(2) + Date.now().toString(36));
const socket = io();
let S = null, tab = 'chat', prev = { phase: null, log: -1 }, muted = localStorage.muted === '1', ac;
let mutedNames = new Set(JSON.parse(localStorage.mutedNames || '[]'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = id => ['home', 'lobby', 'game'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));
const MAFIA = ['mafia', 'godfather', 'silencer'], isM = r => MAFIA.includes(r);
const nm = k => ({ serialkiller: 'Serial Killer', town: 'Townsperson' }[k] || k[0].toUpperCase() + k.slice(1));
const BASIC = ['detective', 'doctor', 'vigilante', 'bodyguard', 'mayor', 'jester', 'godfather'];
const UNIQUE = ['witch', 'escort', 'spy', 'serialkiller', 'silencer'];
const ROLES = {
  mafia: ['the Mafia', 'Choose a victim with your team. All Mafia must agree to end the night early.'],
  godfather: ['the Godfather', 'Mafia leader. The Detective sees you as innocent. Choose a victim with your team.'],
  silencer: ['the Silencer', 'Mafia. Vote on the victim, and also silence one player so they cannot speak or vote tomorrow.'],
  detective: ['the Detective', 'Investigate one player each night.'],
  doctor: ['the Doctor', 'Protect one player each night.'],
  bodyguard: ['the Bodyguard', 'Guard one player. If they are attacked, you die in their place.'],
  vigilante: ['the Vigilante', 'You have one shot to use on any night, or hold your fire.'],
  mayor: ['the Mayor', 'Your lynch vote counts double.'],
  jester: ['the Jester', 'Get yourself lynched to win.'],
  witch: ['the Witch', 'One save potion and one poison potion for the whole game. One potion per night.'],
  escort: ['the Escort', 'Block one player each night. Their ability fails.'],
  spy: ['the Spy', 'You secretly read the Mafia night chat, but their names are hidden.'],
  serialkiller: ['the Serial Killer', 'Kill one player each night. You win as the last one standing.'],
  town: ['a Townsperson', 'Find the Mafia and vote them out.'],
};
const ICON = { mafia: '🔪', godfather: '🎩', silencer: '🤐', detective: '🔍', doctor: '⚕️', bodyguard: '🛡️', vigilante: '🔫', mayor: '🏛️', jester: '🃏', witch: '🧪', escort: '💃', spy: '🕶️', serialkiller: '🪓', town: '🏠' };
let prevCounts = {};
const avatar = p => !p ? '' : p.av ? `<span class="av emo">${esc(p.av)}</span>` : (() => { let h = 0; for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) % 360; return `<span class="av" style="background:hsl(${h} 45% 42%)">${esc(p.name[0].toUpperCase())}</span>`; })();
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3000); };

// ---------- rules ----------
function openRules() {
  const li = k => `<p><b>${nm(k)}:</b> ${ROLES[k][1]}</p>`;
  $('#rulesbody').innerHTML = `<h2>How to play</h2>
  <p>Each night the Mafia secretly choose someone to kill and special roles use their powers. Each day everyone discusses and votes to lynch a suspect. A strict majority of living players is needed.</p>
  <p><b>Town wins</b> when all Mafia are gone. <b>Mafia wins</b> when they equal or outnumber everyone else.</p>
  <p>Extras: whisper privately (2 per day), skip the day if every living player agrees, and watch for random events if the host turns them on.</p>
  <h3>Core roles</h3>${['mafia', 'town', 'detective', 'doctor'].map(li).join('')}
  <h3>Extra roles</h3>${['godfather', 'bodyguard', 'vigilante', 'mayor', 'jester'].map(li).join('')}
  <h3>Unique Roles</h3>${UNIQUE.map(li).join('')}<p><b>Lovers:</b> two players are linked. If one dies, the other dies too.</p>`;
  $('#rules').showModal();
}
['rulesHome', 'rulesLobby', 'rulesGame'].forEach(id => $('#' + id).onclick = openRules);

// ---------- sound ----------
function tone(f, d, t = 0, type = 'sine', v = .15) {
  if (muted) return;
  ac = ac || new AudioContext(); ac.resume();
  const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + t;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.001, at + d);
  o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d);
}
const SFX = {
  night: () => [262, 220, 175, 131].forEach((f, i) => tone(f, .7, i * .3, 'triangle')),
  day: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, .22, i * .1, 'square', .07)),
  death: () => { tone(70, 1, 0, 'sawtooth', .2); tone(55, 1.2, .1, 'sine', .25); $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go'); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, i * .15, 'triangle')),
  last: () => tone(330, .4, 0, 'sine', .12),
};
$('#mute').textContent = muted ? 'Sound off' : 'Sound on';
$('#mute').onclick = () => { muted = !muted; localStorage.muted = muted ? '1' : '0'; $('#mute').textContent = muted ? 'Sound off' : 'Sound on'; };

// ---------- connection ----------
const AVS = ['', '😀', '😎', '🤠', '🥸', '👻', '🦊', '🐼', '🐸', '🦉', '🐙', '🕵️'];
$('#av').innerHTML = AVS.map(a => `<option value="${a}">${a || 'Initial'}</option>`).join('');
$('#av').value = localStorage.av || '';
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#code').value = urlRoom.toUpperCase();
$('#name').value = localStorage.name || '';
const showStats = () => { const s = JSON.parse(localStorage.stats || '{"g":0,"w":0,"mw":0}'); $('#stats').textContent = s.g ? `Your record: ${s.w} wins in ${s.g} games (${s.mw} as Mafia).` : ''; };
showStats();
const creds = () => { localStorage.name = $('#name').value; localStorage.av = $('#av').value; return { name: $('#name').value, av: $('#av').value, pw: $('#pw').value, pid }; };
socket.on('connect', () => { if (localStorage.room) socket.emit('join', { code: localStorage.room, name: localStorage.name, av: localStorage.av, pid }); });
socket.on('err', m => { $('#err').textContent = m; $('#err2').textContent = m; toast(m); if (m.includes('not found')) localStorage.removeItem('room'); });
socket.on('joined', ({ code }) => { localStorage.room = code; history.replaceState(null, '', '?room=' + code); });
socket.on('kicked', () => { localStorage.removeItem('room'); alert('The host removed you from the room.'); location.href = '/'; });
let typingT;
socket.on('typing', n => { $('#typing').textContent = n + ' is typing…'; clearTimeout(typingT); typingT = setTimeout(() => $('#typing').textContent = '', 2000); });

$('#create').onclick = () => socket.emit('create', creds());
$('#join').onclick = () => socket.emit('join', { code: $('#code').value, ...creds() });
['leaveLobby', 'leaveGame'].forEach(id => $('#' + id).onclick = () => { if (confirm('Leave this game?')) socket.emit('leave'); });
$('#start').onclick = () => socket.emit('start');
$('#addbot').onclick = () => socket.emit('addbot');
$('#rename').onclick = () => { const n = prompt('New name:'); if (n) { localStorage.name = n; socket.emit('rename', n); } };
$('#copy').onclick = () => { navigator.clipboard?.writeText(`${location.origin}/?room=${S.code}`); $('#copy').textContent = 'Link copied'; };
$('#chatform').onsubmit = e => { e.preventDefault(); const t = $('#msg').value.trim(); if (t) socket.emit('chat', { text: t }); $('#msg').value = ''; };
let lastType = 0;
$('#msg').oninput = () => { if (Date.now() - lastType > 1500) { lastType = Date.now(); socket.emit('typing'); } };
$('#emojis').innerHTML = ['😂', '😱', '🤔', '👀', '🔪', '👍'].map(e => `<button type="button">${e}</button>`).join('');
$('#emojis').onclick = e => { if (e.target.tagName === 'BUTTON' && !e.target.disabled) socket.emit('chat', { text: e.target.textContent }); };
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); });
function renderTabs() {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['chat', 'log', 'recap'].forEach(t => $('#' + t).classList.toggle('hidden', tab !== t));
  $('#chatform').classList.toggle('hidden', tab !== 'chat'); $('#emojis').classList.toggle('hidden', tab !== 'chat');
}

// ---------- state ----------
socket.on('left', () => { localStorage.removeItem('room'); history.replaceState(null, '', location.pathname); S = null; document.body.className = 'day'; show('home'); });
socket.on('state', s => { $('#err').textContent = ''; $('#err2').textContent = ''; S = s; sounds(); render(); prev = { phase: S.phase, log: S.log.length }; });
function won() {
  const r = S.role;
  if (S.winner === 'jester') return r === 'jester';
  if (S.winner === 'serialkiller') return r === 'serialkiller';
  if (S.winner === 'mafia') return isM(r);
  return !isM(r) && r !== 'serialkiller' && r !== 'jester';
}
function sounds() {
  if (prev.log >= 0 && S.log.length > prev.log && /was (killed|lynched|shot|poisoned)|killed protecting|heartbreak/.test(S.log.slice(prev.log).map(l => l.text).join(' '))) SFX.death();
  if (prev.phase !== S.phase) {
    prevCounts = {};
    if (S.phase === 'night') { SFX.night(); navigator.vibrate?.(200); } else if (S.phase === 'day') { SFX.day(); navigator.vibrate?.([100, 60, 100]); }
    else if (S.phase === 'lastwords') SFX.last();
    else if (S.phase === 'over') {
      SFX.win();
      if (prev.phase && !S.spectator && S.role) {   // record personal stats once per game
        const st = JSON.parse(localStorage.stats || '{"g":0,"w":0,"mw":0}'); st.g++; if (won()) { st.w++; if (isM(S.role)) st.mw++; }
        localStorage.stats = JSON.stringify(st); showStats();
      }
    }
  }
}
function render() {
  document.body.className = S.phase === 'night' ? 'night' : 'day';
  if (S.phase === 'lobby') return renderLobby();
  show('game'); renderTabs();
  $('#phaseicon').textContent = { night: '🌙', day: '☀️', lastwords: '🕯️', over: '🏁' }[S.phase];
  $('#phase').textContent = S.phase === 'over' ? 'Game over' : S.phase === 'lastwords' ? 'Last words' : `${S.phase[0].toUpperCase() + S.phase.slice(1)} ${S.day}`;
  const r = $('#role');
  r.textContent = S.spectator ? '👀 Spectating' : S.alive ? `${ICON[S.role]} You are ${ROLES[S.role][0]}` : `💀 You are dead (${S.role})`;
  r.className = 'role ' + (isM(S.role) ? 'mafia' : '');
  const v = $('#voice'); v.classList.toggle('hidden', !S.set.voice); v.href = S.set.voice || '#';
  const live = ['night', 'day', 'lastwords'].includes(S.phase);
  $('#hostbtns').innerHTML = S.isHost && live ? `<button id="pause">${S.paused ? 'Resume' : 'Pause'}</button><button id="skipphase">Skip phase</button>` : '';
  $('#pause') && ($('#pause').onclick = () => socket.emit('pause')); $('#skipphase') && ($('#skipphase').onclick = () => socket.emit('skipphase'));
  renderBanner(); renderBallot(); renderPlayers(); renderFeeds();
}

function renderLobby() {
  show('lobby');
  $('#lcode').textContent = S.code;
  $('#addbot').classList.toggle('hidden', !S.isHost);
  $('#lplayers').innerHTML = S.players.map(p => `<li><span>${avatar(p)}${esc(p.name)}</span><span class="tag">${p.id === S.me ? 'you ' : ''}${p.id === S.hostId ? 'host ' : ''}${p.bot ? 'bot ' : p.connected ? '' : 'offline'}${S.isHost && p.id !== S.me ? ` <button data-kick="${p.id}">Kick</button>` : ''}</span></li>`).join('');
  document.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => socket.emit('kick', b.dataset.kick));
  const enough = S.players.length >= S.min;
  $('#start').classList.toggle('hidden', !S.isHost); $('#start').disabled = !enough;
  $('#lhint').textContent = S.isHost ? (enough ? 'Everyone in? Start when ready.' : `Waiting for players (${S.players.length}/${S.min} minimum). Add bots to fill seats.`) : 'Waiting for the host to start.';
  renderSettings();
}
function renderSettings() {
  const el = $('#settings'), s = S.set;
  if (!S.isHost) {
    const on = ks => ks.filter(k => k === 'lovers' ? s.lovers : s.roles[k]).map(nm).join(', ') || 'none';
    el.innerHTML = `<div class="tag">Host settings</div><div>Night ${s.night}s, day ${s.day}s, Mafia ${s.mafia || 'auto'}.<br>Roles: ${on(BASIC)}.<br>Unique Roles: ${on([...UNIQUE, 'lovers'])}.<br>Events ${s.events ? 'on' : 'off'}, anonymous votes ${s.anon ? 'on' : 'off'}, last words ${s.lastWords ? 'on' : 'off'}, roles on death ${s.reveal ? 'revealed' : 'hidden'}.</div>`;
    return;
  }
  if (el.contains(document.activeElement)) return;
  const num = (n, l, v) => `<label>${l}<input type="number" name="${n}" value="${v}"></label>`;
  const chk = (n, l, v) => `<label><input type="checkbox" name="${n}" ${v ? 'checked' : ''}>${l}</label>`;
  el.innerHTML = `<h3>Game</h3>${num('night', 'Seconds per night turn', s.night)}${num('day', 'Day length (seconds)', s.day)}${num('mafia', 'Mafia count (0 = automatic)', s.mafia)}
    <div class="chk">${chk('reveal', 'Reveal role on death', s.reveal)}${chk('lastWords', 'Last words', s.lastWords)}${chk('events', 'Random events', s.events)}${chk('anon', 'Anonymous voting', s.anon)}${chk('filter', 'Profanity filter', s.filter)}</div>
    <label>Voice chat link<input type="text" name="voice" placeholder="https://meet.google.com/..." value="${esc(s.voice)}"></label>
    <h3>Roles</h3><div class="chk">${BASIC.map(k => chk(k, nm(k), s.roles[k])).join('')}</div>
    <h3 class="unique">Unique Roles</h3><div class="chk unique">${UNIQUE.map(k => chk(k, nm(k), s.roles[k])).join('')}${chk('lovers', 'Lovers', s.lovers)}</div>`;
}
$('#settings').onchange = () => {
  if (!S?.isHost) return;
  const g = n => $('#settings').querySelector(`[name=${n}]`), roles = {};
  [...BASIC, ...UNIQUE].forEach(k => roles[k] = g(k).checked);
  socket.emit('settings', { night: g('night').value, day: g('day').value, mafia: g('mafia').value, voice: g('voice').value, roles,
    ...Object.fromEntries(['reveal', 'lastWords', 'events', 'anon', 'filter', 'lovers'].map(k => [k, g(k).checked])) });
};

function actions() {
  if (!S.alive || S.spectator) return [];
  const d = S.done, f = d.fin, r = S.role, A = (type, label, ok) => ({ type, label, ok });
  if (S.phase === 'day') return S.silenced === S.me ? [] : [A('vote', 'Vote', p => p.id !== S.me)];
  if (S.phase !== 'night') return [];
  if (S.turn !== (isM(r) ? 'mafia' : r)) return [];
  const out = [];
  if (isM(r)) out.push(A('kill', 'Kill', p => !isM(p.role)));
  if (r === 'silencer' && !f.silencer) out.push(A('silence', 'Silence', p => !isM(p.role)));
  if (r === 'doctor' && !d.heal) out.push(A('heal', 'Heal', () => true));
  if (r === 'bodyguard' && !d.guard) out.push(A('guard', 'Guard', p => p.id !== S.me));
  if (r === 'escort' && !d.block) out.push(A('block', 'Block', p => p.id !== S.me));
  if (r === 'detective' && !d.inspect) out.push(A('inspect', 'Investigate', p => p.id !== S.me));
  if (r === 'vigilante' && S.shots > 0 && !f.vigilante) out.push(A('shoot', 'Shoot', p => p.id !== S.me));
  if (r === 'serialkiller' && !f.serialkiller) out.push(A('sk', 'Kill', p => p.id !== S.me));
  if (r === 'witch' && !f.witch) { if (S.potions.save) out.push(A('witchsave', 'Save', () => true)); if (S.potions.poison) out.push(A('witchpoison', 'Poison', p => p.id !== S.me)); }
  return out;
}
function canHold() {
  const f = S.done.fin, r = S.role;
  return S.alive && S.phase === 'night' && S.turn === (isM(r) ? 'mafia' : r) && ((r === 'vigilante' && S.shots > 0 && !f.vigilante) || (r === 'witch' && !f.witch && (S.potions.save + S.potions.poison > 0)) || (r === 'serialkiller' && !f.serialkiller) || (r === 'silencer' && !f.silencer));
}
function renderBanner() {
  const b = $('#banner'), lwName = S.players.find(p => p.id === S.lw)?.name, living = S.players.filter(p => p.alive && !p.spectator).length;
  if (S.phase === 'over') b.textContent = { town: 'The Town wins.', mafia: 'The Mafia wins.', jester: 'The Jester wins.', serialkiller: 'The Serial Killer wins.' }[S.winner] + (S.awards.length ? ' See the Recap tab.' : '');
  else if (S.paused) b.textContent = 'The host paused the game.';
  else if (S.spectator) b.textContent = 'You joined mid-game and are spectating. You will play next round.';
  else if (S.phase === 'lastwords') b.textContent = S.lw === S.me ? 'You were lynched. Say your last words.' : `${lwName} was lynched and may speak.`;
  else if (!S.alive) b.textContent = 'You are out. Watch the game unfold.';
  else if (S.phase === 'day') b.textContent = S.silenced === S.me ? 'You were silenced today. You cannot speak or vote.' : 'Discuss, then vote for who to lynch. A majority is needed.';
  else if (S.phase === 'night' && S.turn !== (isM(S.role) ? 'mafia' : S.role)) b.textContent = `🌙 The ${nm(S.turn)} is waking up (turn ${S.step + 1} of ${S.steps}). Keep your eyes closed.`;
  else b.textContent = ROLES[S.role][1] + (S.phase === 'night' ? ` It is your turn (${S.step + 1} of ${S.steps}).` : '');
  if (S.phase === 'night' && S.event === 'fullmoon') b.textContent += ' Full moon: the Detective investigates twice.';
  if (S.phase === 'day' && S.event === 'blackout') b.textContent += ' Blackout: chat and whispers are off today.';
  if (S.lover && S.alive) b.textContent += ` Your lover is ${S.lover}.`;
  const note = S.notes.at(-1);
  if (note && S.role === 'detective') b.textContent += '  ' + note;
  if (canHold()) b.innerHTML += ' <button id="hold">Hold / skip</button>';
  if (S.alive && S.phase === 'day' && !S.paused) b.innerHTML += ` <button id="skipday">Skip day (${S.skipN}/${living})</button>`;
  if (S.isHost && S.phase === 'over') b.innerHTML += ' <button id="rematch" class="primary">Play again (new roles)</button> <button id="again">Back to lobby</button>';
  $('#hold') && ($('#hold').onclick = () => socket.emit('act', { type: 'hold' }));
  $('#skipday') && ($('#skipday').onclick = () => socket.emit('act', { type: 'skipday' }));
  $('#rematch') && ($('#rematch').onclick = () => socket.emit('start'));
  $('#again') && ($('#again').onclick = () => socket.emit('again'));
}
function renderBallot() {
  const el = $('#ballot');
  if (S.phase !== 'day') return el.classList.add('hidden');
  el.classList.remove('hidden');
  const lv = S.players.filter(p => p.alive && !p.spectator), need = Math.floor(lv.length / 2) + 1, by = {};
  Object.entries(S.votes).forEach(([v, t]) => { if (t) (by[t] = by[t] || []).push(v); });
  const rows = lv.filter(p => by[p.id]).sort((a, b) => by[b.id].length - by[a.id].length);
  el.innerHTML = `<div class="bh"><span>⚖️ The Trial</span><span class="tag">${need} votes needed to lynch${S.set.anon ? ' · votes are hidden' : ''}</span></div>` +
    (rows.length ? rows.map(p => { const n = by[p.id].length; return `<div class="brow ${n >= need ? 'lethal' : ''} ${n > (prevCounts[p.id] || 0) ? 'bump' : ''}"><span class="bn">${avatar(p)}${esc(p.name)}</span><div class="bar"><i style="width:${Math.min(100, n / need * 100)}%"></i></div><span class="vs">${by[p.id].map(v => avatar(S.players.find(x => x.id === v))).join('')}</span><b>${n}</b></div>`; }).join('') : '<div class="tag">No votes yet. Cast yours below.</div>');
  prevCounts = Object.fromEntries(rows.map(p => [p.id, by[p.id].length]));
}
function renderPlayers() {
  const acts = actions(), votes = S.phase === 'day' ? S.votes : S.mafiaVotes, pick = votes[S.me];
  const canWhisper = S.alive && S.phase === 'day' && S.silenced !== S.me && S.event !== 'blackout' && !S.spectator;
  $('#players').innerHTML = S.players.filter(p => !p.spectator).map(p => {
    const mine = acts.filter(a => p.alive && a.ok(p));
    const tag = p.role ? `<span class="tag ${isM(p.role) ? 'mafia' : ''}">${ICON[p.role]} ${nm(p.role)}</span>` : '';
    const sil = S.silenced === p.id ? '<span class="tag">🤐 silenced</span>' : '';
    const btns = mine.map(a => `<button data-id="${p.id}" data-type="${a.type}">${a.type === 'vote' ? '🗳️ ' : ''}${a.label}</button>`).join('') + (canWhisper && p.alive && p.id !== S.me ? `<button data-w="${p.id}" class="ghost">Whisper</button>` : '');
    return `<div class="pcard ${p.alive ? '' : 'dead'} ${pick === p.id ? 'picked' : ''}"><span class="n">${avatar(p)}${esc(p.name)}${p.connected ? '' : ' (offline)'}${p.id !== S.me && !p.bot ? `<button class="mini" data-mute="${esc(p.name)}" title="Mute chat">${mutedNames.has(p.name) ? '🔈' : '🔇'}</button>` : ''}</span>${tag}${sil}<div class="acts">${btns}</div></div>`;
  }).join('');
  document.querySelectorAll('.pcard [data-type]').forEach(b => b.onclick = () => socket.emit('act', { type: b.dataset.type, target: b.dataset.id }));
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const t = prompt('Whisper (only they will see it):'); if (t) socket.emit('whisper', { to: b.dataset.w, text: t }); });
  document.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { const n = b.dataset.mute; mutedNames.has(n) ? mutedNames.delete(n) : mutedNames.add(n); localStorage.mutedNames = JSON.stringify([...mutedNames]); render(); });
  if (acts.some(a => a.type === 'vote')) { $('#players').insertAdjacentHTML('beforeend', `<div class="pcard"><span class="n">Skip</span><button id="skip">Abstain</button></div>`); $('#skip').onclick = () => socket.emit('act', { type: 'vote', target: null }); }
}
function renderFeeds() {
  const night = S.phase === 'night', mafiaChat = night && isM(S.role), spy = night && S.role === 'spy' && S.alive;
  const msgs = (mafiaChat || spy) ? S.mchat : S.chat.filter(m => !mutedNames.has(m.name));
  const feed = $('#chat'), atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 30;
  feed.innerHTML = (mafiaChat ? '<div class="entry">Mafia night chat. Only your team sees this.</div>' : '') + (spy ? '<div class="entry">You are secretly reading the Mafia chat. Names are hidden.</div>' : '') +
    (night && !mafiaChat && !spy ? '<div class="entry">Chat is closed while the town sleeps.</div>' : '') +
    msgs.map(m => m.sys ? `<div class="entry sys">${esc(m.text)}</div>` : `<div class="msg"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('') +
    (night ? '' : S.whispers.map(w => `<div class="msg whisper"><b>${esc(w.from === S.players.find(p => p.id === S.me)?.name ? 'You → ' + w.to : w.from + ' → you')}</b> ${esc(w.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  const can = S.phase === 'over' || (S.phase === 'day' && S.alive && S.silenced !== S.me && S.event !== 'blackout') || (S.phase === 'lastwords' && S.lw === S.me) || (mafiaChat && S.alive);
  $('#msg').disabled = !can; document.querySelectorAll('#emojis button').forEach(b => b.disabled = !can);
  $('#log').innerHTML = S.log.map(l => `<div class="entry">${esc(l.text)}</div>`).join('') + S.notes.map(n => `<div class="entry note">Private: ${esc(n)}</div>`).join('');
  $('#recap').innerHTML = S.phase !== 'over' ? '<div class="entry">The recap and awards appear when the game ends.</div>' :
    `<div class="recap"><h4>Awards</h4>${S.awards.map(a => `<div class="msg">${esc(a)}</div>`).join('') || '<div class="entry">No awards this time.</div>'}<h4>Who was who</h4>${S.players.filter(p => !p.spectator).map(p => `<div class="entry">${esc(p.name)}: ${nm(p.role)}</div>`).join('')}<h4>Night by night</h4>${S.story.map(x => `<div class="entry">${esc(x)}</div>`).join('')}</div>`;
}
setInterval(() => {
  if (!S) return;
  if (S.paused) return $('#timer').textContent = ' paused';
  if (!S.endsAt) return $('#timer').textContent = '';
  const s = Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
  $('#timer').textContent = ` ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('#timerbar i').style.width = S.dur ? Math.max(0, Math.min(100, (S.endsAt - Date.now()) / S.dur * 100)) + '%' : '0';
}, 500);
