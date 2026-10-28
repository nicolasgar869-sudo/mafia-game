const $ = s => document.querySelector(s);
const pid = localStorage.pid || (localStorage.pid = Math.random().toString(36).slice(2) + Date.now().toString(36));
const socket = io();
let S = null, tab = 'chat', prev = { phase: null, log: -1 }, muted = localStorage.muted === '1', ac;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = id => ['home', 'lobby', 'game'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));
const isM = r => r === 'mafia' || r === 'godfather';
const cap = s => s[0].toUpperCase() + s.slice(1);
const ROLES = {
  mafia: ['the Mafia', 'Choose a victim with your team. All Mafia must agree to end the night early.'],
  godfather: ['the Godfather', 'You lead the Mafia. The Detective sees you as innocent. Choose a victim with your team.'],
  detective: ['the Detective', 'Investigate one player each night.'],
  doctor: ['the Doctor', 'Protect one player each night.'],
  bodyguard: ['the Bodyguard', 'Guard one player. If they are attacked, you die in their place.'],
  vigilante: ['the Vigilante', 'You have one shot to use on any night. Or hold your fire.'],
  mayor: ['the Mayor', 'Your lynch vote counts double.'],
  jester: ['the Jester', 'Get yourself lynched to win.'],
  town: ['a Townsperson', 'Find the Mafia and vote them out.'],
};
const ROLE_KEYS = ['detective', 'doctor', 'vigilante', 'bodyguard', 'mayor', 'jester', 'godfather'];
const avatar = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return `<span class="av" style="background:hsl(${h} 45% 42%)">${esc(n[0].toUpperCase())}</span>`; };

// ---------- sound (synthesised, no files) ----------
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
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#code').value = urlRoom.toUpperCase();
$('#name').value = localStorage.name || '';
socket.on('connect', () => { if (localStorage.room) socket.emit('join', { code: localStorage.room, name: localStorage.name, pid }); });
socket.on('err', m => { $('#err').textContent = m; $('#err2').textContent = m; if (m.includes('not found')) localStorage.removeItem('room'); });
socket.on('joined', ({ code }) => { localStorage.room = code; history.replaceState(null, '', '?room=' + code); });
socket.on('kicked', () => { localStorage.removeItem('room'); alert('The host removed you from the room.'); location.href = '/'; });
let typingT;
socket.on('typing', n => { $('#typing').textContent = n + ' is typing…'; clearTimeout(typingT); typingT = setTimeout(() => $('#typing').textContent = '', 2000); });

$('#create').onclick = () => { localStorage.name = $('#name').value; socket.emit('create', { name: $('#name').value, pid }); };
$('#join').onclick = () => { localStorage.name = $('#name').value; socket.emit('join', { code: $('#code').value, name: $('#name').value, pid }); };
$('#start').onclick = () => socket.emit('start');
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
  $('#chat').classList.toggle('hidden', tab !== 'chat'); $('#log').classList.toggle('hidden', tab !== 'log');
  $('#chatform').classList.toggle('hidden', tab !== 'chat'); $('#emojis').classList.toggle('hidden', tab !== 'chat');
}

// ---------- rendering ----------
socket.on('state', s => { S = s; sounds(); render(); prev = { phase: S.phase, log: S.log.length }; });
function sounds() {
  if (prev.log >= 0 && S.log.length > prev.log) {
    const fresh = S.log.slice(prev.log).map(l => l.text).join(' ');
    if (/was (killed|lynched|shot)|killed protecting/.test(fresh)) SFX.death();
  }
  if (prev.phase !== S.phase) {
    if (S.phase === 'night') SFX.night(); else if (S.phase === 'day') SFX.day();
    else if (S.phase === 'lastwords') SFX.last(); else if (S.phase === 'over') SFX.win();
  }
}
function render() {
  document.body.className = S.phase === 'night' ? 'night' : 'day';
  if (S.phase === 'lobby') return renderLobby();
  show('game'); renderTabs();
  $('#phase').textContent = S.phase === 'over' ? 'Game over' : S.phase === 'lastwords' ? 'Last words' : `${cap(S.phase)} ${S.day}`;
  const r = $('#role');
  r.textContent = S.spectator ? 'Spectating' : S.alive ? `You are ${ROLES[S.role][0]}` : `You are dead (${S.role})`;
  r.className = 'role ' + (isM(S.role) ? 'mafia' : '');
  renderBanner(); renderPlayers(); renderFeeds();
}

function renderLobby() {
  show('lobby');
  $('#lcode').textContent = S.code;
  $('#lplayers').innerHTML = S.players.map(p => `<li><span>${avatar(p.name)}${esc(p.name)}</span><span class="tag">${p.id === S.me ? 'you ' : ''}${p.id === S.hostId ? 'host ' : ''}${p.connected ? '' : 'offline'}${S.isHost && p.id !== S.me ? `<button data-kick="${p.id}">Kick</button>` : ''}</span></li>`).join('');
  document.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => socket.emit('kick', b.dataset.kick));
  const enough = S.players.length >= S.min;
  $('#start').classList.toggle('hidden', !S.isHost); $('#start').disabled = !enough;
  $('#lhint').textContent = S.isHost ? (enough ? 'Everyone in? Start when ready.' : `Waiting for players (${S.players.length}/${S.min} minimum).`) : 'Waiting for the host to start.';
  renderSettings();
}
function renderSettings() {
  const el = $('#settings'), s = S.set;
  if (!S.isHost) {
    el.innerHTML = `<div class="tag">Host settings</div><div>Night ${s.night}s, day ${s.day}s, Mafia ${s.mafia || 'auto'}. Extra roles: ${ROLE_KEYS.filter(k => s.roles[k]).map(cap).join(', ') || 'none'}. Roles on death: ${s.reveal ? 'revealed' : 'hidden'}. Last words: ${s.lastWords ? 'on' : 'off'}.</div>`;
    return;
  }
  if (el.contains(document.activeElement)) return;
  const num = (n, l, v) => `<label>${l}<input type="number" name="${n}" value="${v}"></label>`;
  const chk = (n, l, v) => `<label><input type="checkbox" name="${n}" ${v ? 'checked' : ''}>${l}</label>`;
  el.innerHTML = num('night', 'Night length (seconds)', s.night) + num('day', 'Day length (seconds)', s.day) + num('mafia', 'Mafia count (0 = automatic)', s.mafia)
    + `<div class="chk">${ROLE_KEYS.map(k => chk(k, cap(k), s.roles[k])).join('')}${chk('reveal', 'Reveal role on death', s.reveal)}${chk('lastWords', 'Last words', s.lastWords)}</div>`;
}
$('#settings').onchange = () => {
  if (!S?.isHost) return;
  const g = n => $('#settings').querySelector(`[name=${n}]`), roles = {};
  ROLE_KEYS.forEach(k => roles[k] = g(k).checked);
  socket.emit('settings', { night: g('night').value, day: g('day').value, mafia: g('mafia').value, reveal: g('reveal').checked, lastWords: g('lastWords').checked, roles });
};

function actions() {
  if (!S.alive || S.spectator) return null;
  const d = S.done, r = S.role;
  if (S.phase === 'day') return { type: 'vote', label: 'Vote', ok: p => p.id !== S.me };
  if (S.phase !== 'night') return null;
  if (isM(r)) return { type: 'kill', label: 'Kill', ok: p => !isM(p.role) };
  if (r === 'doctor' && !d.heal) return { type: 'heal', label: 'Heal', ok: () => true };
  if (r === 'bodyguard' && !d.guard) return { type: 'guard', label: 'Guard', ok: p => p.id !== S.me };
  if (r === 'detective' && !d.inspect) return { type: 'inspect', label: 'Investigate', ok: p => p.id !== S.me };
  if (r === 'vigilante' && S.shots > 0 && !d.vig) return { type: 'shoot', label: 'Shoot', ok: p => p.id !== S.me };
  return null;
}
function renderBanner() {
  const b = $('#banner'), lwName = S.players.find(p => p.id === S.lw)?.name;
  if (S.phase === 'over') b.textContent = { town: 'The Town wins.', mafia: 'The Mafia wins.', jester: 'The Jester wins.' }[S.winner];
  else if (S.spectator) b.textContent = 'You joined mid-game and are spectating. You will play next round.';
  else if (S.phase === 'lastwords') b.textContent = S.lw === S.me ? 'You were lynched. Say your last words.' : `${lwName} was lynched and may speak.`;
  else if (!S.alive) b.textContent = 'You are out. Watch the game unfold.';
  else if (S.phase === 'day') b.textContent = 'Discuss, then vote for who to lynch. A majority is needed.';
  else b.textContent = ROLES[S.role][1];
  const note = S.notes.at(-1);
  if (note && S.role === 'detective') b.textContent += '  ' + note;
  if (S.alive && S.phase === 'night' && S.role === 'vigilante' && S.shots > 0 && !S.done.vig) b.innerHTML += ' <button id="hold">Hold fire</button>';
  if (S.isHost && S.phase === 'over') b.innerHTML += ' <button id="rematch" class="primary">Play again (new roles)</button> <button id="again">Back to lobby</button>';
  $('#hold') && ($('#hold').onclick = () => socket.emit('act', { type: 'hold' }));
  $('#rematch') && ($('#rematch').onclick = () => socket.emit('start'));
  $('#again') && ($('#again').onclick = () => socket.emit('again'));
}
function renderPlayers() {
  const act = actions(), votes = S.phase === 'day' ? S.votes : S.mafiaVotes, pick = votes[S.me], counts = {};
  Object.values(votes).forEach(t => t && (counts[t] = (counts[t] || 0) + 1));
  $('#players').innerHTML = S.players.filter(p => !p.spectator).map(p => {
    const can = act && p.alive && act.ok(p);
    const tag = p.role ? `<span class="tag ${isM(p.role) ? 'mafia' : ''}">${p.role}</span>` : '';
    const cnt = counts[p.id] ? `<span class="tag">${counts[p.id]} vote${counts[p.id] > 1 ? 's' : ''}</span>` : '';
    return `<div class="pcard ${p.alive ? '' : 'dead'} ${pick === p.id ? 'picked' : ''}"><span class="n">${avatar(p.name)}${esc(p.name)}${p.connected ? '' : ' (offline)'}</span>${tag}${cnt}${can ? `<button data-id="${p.id}">${act.label}</button>` : ''}</div>`;
  }).join('');
  document.querySelectorAll('.pcard button').forEach(b => b.onclick = () => socket.emit('act', { type: act.type, target: b.dataset.id }));
  if (act?.type === 'vote') { $('#players').insertAdjacentHTML('beforeend', `<div class="pcard"><span class="n">Skip</span><button id="skip">Abstain</button></div>`); $('#skip').onclick = () => socket.emit('act', { type: 'vote', target: null }); }
}
function renderFeeds() {
  const night = S.phase === 'night', mafiaChat = night && isM(S.role);
  const msgs = mafiaChat ? S.mchat : S.chat;
  const feed = $('#chat'), atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 30;
  feed.innerHTML = (mafiaChat ? '<div class="entry">Mafia night chat. Only your team sees this.</div>' : '') +
    (night && !mafiaChat ? '<div class="entry">Chat is closed while the town sleeps.</div>' : '') +
    (night ? '' : '') +
    msgs.map(m => m.sys ? `<div class="entry sys">${esc(m.text)}</div>` : `<div class="msg"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  const can = ['over'].includes(S.phase) || (S.phase === 'day' && S.alive) || (S.phase === 'lastwords' && S.lw === S.me) || mafiaChat && S.alive;
  $('#msg').disabled = !can; document.querySelectorAll('#emojis button').forEach(b => b.disabled = !can);
  $('#log').innerHTML = S.log.map(l => `<div class="entry">${esc(l.text)}</div>`).join('') + S.notes.map(n => `<div class="entry note">Private: ${esc(n)}</div>`).join('');
}
setInterval(() => {
  if (!S?.endsAt) return $('#timer').textContent = '';
  const s = Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
  $('#timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}, 500);
