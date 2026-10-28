const $ = s => document.querySelector(s);
const pid = localStorage.pid || (localStorage.pid = Math.random().toString(36).slice(2) + Date.now().toString(36));
const socket = io();
let S = null, tab = 'chat', prev = { phase: null, log: -1, turn: null }, prevCounts = {}, prevAlive = {};
let muted = localStorage.muted === '1', narrOn = localStorage.narr === '1', ac;
let mutedNames = new Set(JSON.parse(localStorage.mutedNames || '[]'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = id => ['home', 'lobby', 'game'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));
const MAFIA = ['mafia', 'godfather', 'silencer'], isM = r => MAFIA.includes(r);
const ICON = { mafia: '🔪', godfather: '🎩', silencer: '🤐', detective: '🔍', doctor: '⚕️', bodyguard: '🛡️', vigilante: '🔫', mayor: '🏛️', jester: '🃏', witch: '🧪', escort: '💃', spy: '🕶️', serialkiller: '🪓', town: '🏠' };
const BASIC = ['detective', 'doctor', 'vigilante', 'bodyguard', 'mayor', 'jester', 'godfather'], UNIQUE = ['witch', 'escort', 'spy', 'serialkiller', 'silencer'];

// ---------- languages: [English, Bahasa Melayu, 中文]. Host settings and server log lines stay in English. ----------
const LANGS = { en: 'English', ms: 'Bahasa Melayu', zh: '中文' }, LI = { en: 0, ms: 1, zh: 2 }, VOICE = { en: 'en-US', ms: 'ms-MY', zh: 'zh-CN' };
let lang = localStorage.lang || 'en';
const D = {
  sub: ['Lie, deduce, survive. Play with friends on any device.', 'Berbohong, menyiasat, bertahan. Main bersama rakan di mana-mana peranti.', '撒谎、推理、生存。和朋友在任何设备上一起玩。'],
  namePh: ['Your name', 'Nama anda', '你的名字'], pwPh: ['Room password (optional)', 'Kata laluan bilik (pilihan)', '房间密码（可选）'],
  create: ['Create a room', 'Cipta bilik', '创建房间'], or: ["or join a friend's room", 'atau sertai bilik rakan', '或加入朋友的房间'],
  codePh: ['ROOM CODE', 'KOD BILIK', '房间代码'], join: ['Join room', 'Sertai bilik', '加入房间'],
  tutorial: ['Play the tutorial', 'Main tutorial', '新手教程'], rules: ['Rules', 'Peraturan', '规则'],
  howto: ['How to play and roles', 'Cara bermain dan peranan', '玩法与角色'], ach: ['Achievements', 'Pencapaian', '成就'], history: ['Past games', 'Permainan lalu', '历史对局'],
  copy: ['Copy invite link', 'Salin pautan jemputan', '复制邀请链接'], copied: ['Link copied', 'Pautan disalin', '链接已复制'],
  rename: ['Change my name', 'Tukar nama saya', '修改名字'], addbot: ['Add bot', 'Tambah bot', '添加机器人'],
  leaveRoom: ['Leave room', 'Keluar bilik', '离开房间'], leave: ['Leave', 'Keluar', '离开'], leaveQ: ['Leave this game?', 'Keluar dari permainan ini?', '离开这局游戏？'],
  start: ['Start game', 'Mulakan permainan', '开始游戏'], voiceBtn: ['Voice chat', 'Sembang suara', '语音聊天'],
  sound: ['Sound on', 'Bunyi hidup', '声音开'], soundOff: ['Sound off', 'Bunyi mati', '声音关'], narr: ['Narrator on', 'Pencerita hidup', '旁白开'], narrOff: ['Narrator off', 'Pencerita mati', '旁白关'],
  tabChat: ['Chat', 'Sembang', '聊天'], tabLog: ['Log', 'Log', '记录'], tabRecap: ['Recap', 'Ringkasan', '回顾'], tabDead: ['Graveyard', 'Tanah perkuburan', '墓地'],
  send: ['Send', 'Hantar', '发送'], msgPh: ['Message', 'Mesej', '消息'],
  night: ['Night', 'Malam', '夜晚'], day: ['Day', 'Siang', '白天'], lastwords: ['Last words', 'Kata-kata terakhir', '临终遗言'], over: ['Game over', 'Permainan tamat', '游戏结束'],
  youare: ['You are {0}', 'Anda ialah {0}', '你是{0}'], spectating: ['Spectating', 'Menonton', '观战中'], youdead: ['You are dead ({0})', 'Anda telah mati ({0})', '你已死亡（{0}）'],
  winTown: ['The Town wins.', 'Penduduk menang.', '平民获胜。'], winMafia: ['The Mafia wins.', 'Mafia menang.', '黑手党获胜。'], winJester: ['The Jester wins.', 'Pelawak menang.', '小丑获胜。'], winSK: ['The Serial Killer wins.', 'Pembunuh Bersiri menang.', '连环杀手获胜。'],
  seeRecap: [' See the Recap tab.', ' Lihat tab Ringkasan.', ' 请查看“回顾”。'],
  paused: ['The host paused the game.', 'Hos menjeda permainan.', '房主已暂停游戏。'],
  bSpec: ['You joined mid-game and are spectating. You will play next round.', 'Anda menyertai di tengah permainan dan sedang menonton. Anda bermain pusingan seterusnya.', '你中途加入，正在观战。下一局你就能参与。'],
  bLwMe: ['You were lynched. Say your last words.', 'Anda dihukum gantung. Sampaikan kata-kata terakhir.', '你被处决了，说出你的遗言吧。'],
  bLwOther: ['{0} was lynched and may speak.', '{0} dihukum gantung dan boleh bercakap.', '{0} 被处决了，可以发言。'],
  bOut: ['You are out. Watch the game unfold.', 'Anda tersingkir. Saksikan permainan berlangsung.', '你出局了，继续观看游戏。'],
  bDay: ['Discuss, then vote for who to lynch. A majority is needed.', 'Berbincang, kemudian undi siapa yang hendak digantung. Majoriti diperlukan.', '讨论后投票决定处决谁，需要过半数。'],
  bSil: ['You were silenced today. You cannot speak or vote.', 'Anda disenyapkan hari ini. Anda tidak boleh bercakap atau mengundi.', '你今天被禁言了，不能说话也不能投票。'],
  bWake: ['🌙 The {0} is waking up (turn {1} of {2}). Keep your eyes closed.', '🌙 {0} sedang bangun (giliran {1} daripada {2}). Pejam mata anda.', '🌙 {0}正在醒来（第 {1}/{2} 轮）。请闭上眼睛。'],
  bTurn: [' It is your turn ({0} of {1}).', ' Giliran anda ({0} daripada {1}).', ' 轮到你了（第 {0}/{1} 轮）。'],
  fullmoon: [' Full moon: the Detective investigates twice.', ' Bulan purnama: Detektif menyiasat dua kali.', ' 满月：侦探可以调查两次。'],
  blackout: [' Blackout: chat and whispers are off today.', ' Gelap gelita: sembang dan bisikan ditutup hari ini.', ' 停电：今天无法聊天和私语。'],
  lover: [' Your lover is {0}.', ' Kekasih anda ialah {0}.', ' 你的恋人是 {0}。'],
  trial: ['⚖️ The Trial', '⚖️ Perbicaraan', '⚖️ 审判'], need: ['{0} votes needed to lynch', '{0} undi diperlukan untuk menggantung', '需要 {0} 票才能处决'],
  hiddenV: [' · votes are hidden', ' · undian disembunyikan', ' · 投票已隐藏'], noVotes: ['No votes yet. Cast yours below.', 'Belum ada undi. Undi di bawah.', '还没有投票，请在下方投票。'],
  vote: ['Vote', 'Undi', '投票'], abstain: ['Abstain', 'Berkecuali', '弃权'], skip: ['Skip', 'Langkau', '跳过'],
  skipday: ['Skip day ({0}/{1})', 'Langkau hari ({0}/{1})', '跳过白天（{0}/{1}）'], hold: ['Hold / skip', 'Tahan / langkau', '放弃 / 跳过'],
  rematch: ['Play again (new roles)', 'Main lagi (peranan baharu)', '再来一局（新角色）'], backLobby: ['Back to lobby', 'Kembali ke lobi', '返回大厅'],
  whisper: ['Whisper', 'Bisik', '私语'], whisperQ: ['Whisper (only they will see it):', 'Bisikan (hanya mereka nampak):', '私语（只有对方能看到）：'], yourvote: ['YOUR VOTE', 'UNDI ANDA', '你的投票'],
  silencedTag: ['🤐 silenced', '🤐 disenyapkan', '🤐 被禁言'], mutedTag: ['🚫 muted', '🚫 dibisukan', '🚫 被禁言'],
  a_kill: ['Kill', 'Bunuh', '击杀'], a_heal: ['Heal', 'Sembuh', '治疗'], a_guard: ['Guard', 'Kawal', '保护'], a_block: ['Block', 'Sekat', '阻挠'], a_inspect: ['Investigate', 'Siasat', '调查'],
  a_shoot: ['Shoot', 'Tembak', '开枪'], a_save: ['Save', 'Selamatkan', '拯救'], a_poison: ['Poison', 'Racun', '下毒'], a_silence: ['Silence', 'Senyapkan', '禁言'],
  tYou: ['you', 'anda', '你'], tHost: ['host', 'hos', '房主'], tBot: ['bot', 'bot', '机器人'], tOff: ['offline', 'luar talian', '离线'], kick: ['Kick', 'Tendang', '踢出'],
  waitN: ['Waiting for players ({0}/{1} minimum). Add bots to fill seats.', 'Menunggu pemain ({0}/{1} minimum). Tambah bot untuk mengisi kerusi.', '等待玩家（{0}/{1} 最少）。可添加机器人补位。'],
  readyH: ['Everyone in? Start when ready.', 'Semua dah masuk? Mulakan bila sedia.', '人齐了吗？准备好就开始。'], waitHost: ['Waiting for the host to start.', 'Menunggu hos memulakan.', '等待房主开始。'],
  nightClosed: ['Chat is closed while the town sleeps.', 'Sembang ditutup ketika bandar tidur.', '小镇入睡时聊天关闭。'], mafiaInfo: ['Mafia night chat. Only your team sees this.', 'Sembang malam Mafia. Hanya pasukan anda nampak.', '黑手党夜间聊天，只有你的队友能看到。'],
  spyInfo: ['You are secretly reading the Mafia chat. Names are hidden.', 'Anda diam-diam membaca sembang Mafia. Nama disembunyikan.', '你在偷看黑手党聊天，名字已隐藏。'],
  deadInfo: ['Graveyard chat: only dead players can read this.', 'Sembang tanah perkuburan: hanya pemain mati boleh baca.', '墓地聊天：只有死去的玩家能看到。'],
  recapWait: ['The recap and awards appear when the game ends.', 'Ringkasan dan anugerah muncul apabila permainan tamat.', '游戏结束后会显示回顾和奖项。'],
  awards: ['Awards', 'Anugerah', '奖项'], whoWas: ['Who was who', 'Siapa ialah siapa', '身份揭晓'], nightBy: ['Night by night', 'Malam demi malam', '逐夜回顾'],
  stats: ['Your record: {0} wins in {1} games ({2} as Mafia).', 'Rekod anda: {0} kemenangan dalam {1} permainan ({2} sebagai Mafia).', '你的战绩：{1} 局赢 {0} 局（黑手党 {2} 局）。'],
  rvKilled: ['{0} was killed', '{0} dibunuh', '{0} 被杀害'], rvLynched: ['{0} was lynched', '{0} dihukum gantung', '{0} 被处决'], rvOut: ['{0} is out', '{0} tersingkir', '{0} 出局'], rvRole: ['Role', 'Peranan', '身份'],
  nNight: ['Night falls. Everyone, close your eyes.', 'Malam tiba. Semua orang, pejamkan mata.', '夜幕降临，大家请闭眼。'], nWake: ['{0}, wake up.', '{0}, bangun.', '{0}，请睁眼。'],
  nDay: ['Morning comes. The town wakes up.', 'Pagi tiba. Penduduk bangun.', '天亮了，大家请睁眼。'], nDied: ['{0} has died.', '{0} telah mati.', '{0} 死了。'], nOver: ['The game is over.', 'Permainan tamat.', '游戏结束。'],
  tip1: ['Tutorial: at night every role takes a turn. You are the Detective, so wait for your turn.', 'Tutorial: pada waktu malam setiap peranan mendapat giliran. Anda Detektif, tunggu giliran anda.', '教程：夜里每个角色轮流行动。你是侦探，请等待你的回合。'],
  tip2: ['Tutorial: your turn! Press Investigate on someone to learn if they are Mafia or Innocent.', 'Tutorial: giliran anda! Tekan Siasat pada seseorang untuk tahu dia Mafia atau Tidak Bersalah.', '教程：轮到你了！点击“调查”某人，查看他是黑手党还是无辜。'],
  tip3: ['Tutorial: it is day. Chat with the bots, then press Vote on who you think is Mafia.', 'Tutorial: sekarang siang. Sembang dengan bot, kemudian tekan Undi pada orang yang anda rasa Mafia.', '教程：现在是白天。和机器人聊天，然后投票给你怀疑的黑手党。'],
  tip4: ['Tutorial complete! Go back and create a room to play with friends.', 'Tutorial selesai! Kembali dan cipta bilik untuk bermain bersama rakan.', '教程完成！返回并创建房间和朋友一起玩吧。'],
  rulesIntro: ['Each night the Mafia secretly choose someone to kill and special roles use their powers, one role at a time. Each day everyone discusses and votes to lynch a suspect. A strict majority is needed.', 'Setiap malam Mafia memilih mangsa dan peranan khas menggunakan kuasa, satu peranan pada satu masa. Setiap siang semua berbincang dan mengundi. Majoriti diperlukan.', '每晚黑手党秘密选择目标，特殊角色依次使用能力。白天大家讨论并投票处决嫌疑人，需要过半数。'],
  rulesWin: ['Town wins when all Mafia are gone. Mafia wins when they equal or outnumber everyone else.', 'Penduduk menang apabila semua Mafia tiada. Mafia menang apabila bilangan mereka sama atau melebihi yang lain.', '黑手党全部出局则平民获胜；黑手党人数不少于其他人则黑手党获胜。'],
  rCore: ['Core roles', 'Peranan utama', '基础角色'], rExtra: ['Extra roles', 'Peranan tambahan', '额外角色'], rUnique: ['Unique Roles', 'Peranan Unik', '特殊角色'],
  loverRule: ['Lovers: two players are linked. If one dies, the other dies too.', 'Kekasih: dua pemain dipautkan. Jika seorang mati, yang lain turut mati.', '恋人：两名玩家相连，一人死亡另一人也会死。'],
  locked: ['Locked', 'Dikunci', '未解锁'],
  a_first: ['First Win: win a game', 'Kemenangan Pertama: menang satu permainan', '首胜：赢得一局'], a_survivor: ['Survivor: live through 3 nights', 'Survivor: hidup selepas 3 malam', '幸存者：存活 3 个夜晚'],
  a_jester: ["Fool's Triumph: win as Jester", 'Kemenangan Pelawak: menang sebagai Pelawak', '愚者胜利：以小丑身份获胜'], a_mafia: ['Made Man: win as Mafia', 'Ahli Mafia: menang sebagai Mafia', '入伙：以黑手党身份获胜'],
  a_sharp: ['Sharp Eyes: find a Mafia as Detective', 'Mata Tajam: jumpa Mafia sebagai Detektif', '火眼金睛：以侦探身份找到黑手党'], a_saver: ['Life Saver: a Doctor save happens', 'Penyelamat: doktor berjaya menyelamatkan', '救命恩人：医生成功救人'],
  a_vet: ['Veteran: play 10 games', 'Veteran: main 10 permainan', '老手：玩 10 局'], a_sk: ['Last One Standing: win as Serial Killer', 'Terakhir Berdiri: menang sebagai Pembunuh Bersiri', '最后一人：以连环杀手获胜'],
  a_love: ['Till Death: you and your lover both survive', 'Hingga Akhir: anda dan kekasih sama-sama hidup', '生死相依：你和恋人都活到最后'], a_unlock: ['Achievement unlocked', 'Pencapaian dibuka', '解锁成就'],
};
const R = {   // role names, then descriptions
  mafia: [['Mafia', 'Mafia', '黑手党'], ['Choose a victim with your team. All Mafia must agree.', 'Pilih mangsa bersama pasukan. Semua Mafia mesti bersetuju.', '和队友选择目标，所有黑手党必须一致。']],
  godfather: [['Godfather', 'Godfather', '教父'], ['Mafia leader. The Detective sees you as innocent.', 'Ketua Mafia. Detektif nampak anda tidak bersalah.', '黑手党首领，侦探会认为你是无辜的。']],
  silencer: [['Silencer', 'Penyenyap', '禁言者'], ['Mafia. Vote on the victim, and silence one player for tomorrow.', 'Mafia. Undi mangsa dan senyapkan seorang pemain esok.', '黑手党成员。投票选目标，并让一名玩家明天无法说话和投票。']],
  detective: [['Detective', 'Detektif', '侦探'], ['Investigate one player each night.', 'Siasat seorang pemain setiap malam.', '每晚调查一名玩家。']],
  doctor: [['Doctor', 'Doktor', '医生'], ['Protect one player each night.', 'Lindungi seorang pemain setiap malam.', '每晚保护一名玩家。']],
  bodyguard: [['Bodyguard', 'Pengawal', '保镖'], ['Guard one player. If they are attacked, you die instead.', 'Kawal seorang pemain. Jika diserang, anda mati menggantikannya.', '守护一人，若他被攻击，你替他去死。']],
  vigilante: [['Vigilante', 'Vigilante', '义警'], ['You have one shot to use on any night, or hold your fire.', 'Anda ada satu tembakan pada mana-mana malam, atau tahan tembakan.', '你有一发子弹，可在任意夜晚使用，也可以不开枪。']],
  mayor: [['Mayor', 'Datuk Bandar', '市长'], ['Your lynch vote counts double.', 'Undi anda dikira dua kali ganda.', '你的投票算作两票。']],
  jester: [['Jester', 'Pelawak', '小丑'], ['Get yourself lynched to win.', 'Biar diri anda digantung untuk menang.', '让自己被处决即可获胜。']],
  witch: [['Witch', 'Ahli Sihir', '女巫'], ['One save potion and one poison potion for the whole game.', 'Satu ramuan menyelamat dan satu ramuan racun untuk seluruh permainan.', '整局游戏有一瓶解药和一瓶毒药。']],
  escort: [['Escort', 'Penyekat', '阻挠者'], ['Block one player each night. Their ability fails.', 'Sekat seorang pemain setiap malam. Kuasanya gagal.', '每晚阻挠一名玩家，使其能力失效。']],
  spy: [['Spy', 'Pengintip', '间谍'], ['You secretly read the Mafia night chat, with names hidden.', 'Anda diam-diam membaca sembang malam Mafia, nama disembunyikan.', '你能偷看黑手党夜间聊天，但看不到名字。']],
  serialkiller: [['Serial Killer', 'Pembunuh Bersiri', '连环杀手'], ['Kill one player each night. Be the last one standing.', 'Bunuh seorang pemain setiap malam. Jadi yang terakhir berdiri.', '每晚杀一人，成为最后的幸存者。']],
  town: [['Townsperson', 'Penduduk', '平民'], ['Find the Mafia and vote them out.', 'Cari Mafia dan undi mereka keluar.', '找出黑手党并投票淘汰他们。']],
};
const t = (k, ...a) => String((D[k] || [k])[LI[lang]] ?? (D[k] || [k])[0]).replace(/\{(\d)\}/g, (_, i) => a[i]);
const nm = k => (R[k] ? R[k][0][LI[lang]] : k), desc = k => R[k][1][LI[lang]];
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  document.querySelectorAll('.langsel').forEach(s => { s.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); s.value = lang; s.onchange = () => { lang = s.value; localStorage.lang = lang; applyI18n(); showStats(); if (S) render(); }; });
  $('#mute').textContent = muted ? t('soundOff') : t('sound'); $('#narr').textContent = narrOn ? t('narr') : t('narrOff');
}

const avatar = p => !p ? '' : p.av ? `<span class="av emo">${esc(p.av)}</span>` : (() => { let h = 0; for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) % 360; return `<span class="av" style="background:hsl(${h} 45% 42%)">${esc(p.name[0].toUpperCase())}</span>`; })();
const toast = m => { const e = $('#toast'); e.textContent = m; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 3200); };

// ---------- rules + achievements dialogs ----------
function openRules() {
  const li = k => `<p><b>${nm(k)}:</b> ${desc(k)}</p>`;
  $('#rulesbody').innerHTML = `<h2>${t('howto')}</h2><p>${t('rulesIntro')}</p><p>${t('rulesWin')}</p><h3>${t('rCore')}</h3>${['mafia', 'town', 'detective', 'doctor'].map(li).join('')}<h3>${t('rExtra')}</h3>${['godfather', 'bodyguard', 'vigilante', 'mayor', 'jester'].map(li).join('')}<h3>${t('rUnique')}</h3>${UNIQUE.map(li).join('')}<p>${t('loverRule')}</p>`;
  $('#rules').showModal();
}
const ACH = ['first', 'survivor', 'jester', 'mafia', 'sharp', 'saver', 'vet', 'sk', 'love'];
const got = () => new Set(JSON.parse(localStorage.ach || '[]'));
function openAch() {
  const g = got();
  $('#rulesbody').innerHTML = `<h2>🏆 ${t('ach')}</h2>` + ACH.map(a => `<p>${g.has(a) ? '✅' : '🔒'} ${g.has(a) ? t('a_' + a) : `<span class="tag">${t('locked')}: ${t('a_' + a).split(':')[1] || ''}</span>`}</p>`).join('');
  $('#rules').showModal();
}
['rulesHome', 'rulesLobby', 'rulesGame'].forEach(id => $('#' + id).onclick = openRules);
$('#achHome').onclick = openAch;
function checkAchievements(st) {
  const g = got(), me = S.players.find(p => p.id === S.me), add = [];
  const w = won(), r = S.role, partner = S.lover && S.players.find(p => p.name === S.lover);
  if (w) add.push('first'); if (S.alive && S.day >= 3) add.push('survivor'); if (w && S.winner === 'jester' && r === 'jester') add.push('jester');
  if (w && isM(r)) add.push('mafia'); if (r === 'detective' && S.notes.some(n => /MAFIA/.test(n))) add.push('sharp');
  if (r === 'doctor' && S.log.some(l => /saved by the Doctor/.test(l.text))) add.push('saver'); if (st.g >= 10) add.push('vet');
  if (w && r === 'serialkiller') add.push('sk'); if (me?.alive && partner?.alive) add.push('love');
  add.filter(a => !g.has(a)).forEach((a, i) => { g.add(a); setTimeout(() => toast('🏆 ' + t('a_unlock') + ': ' + t('a_' + a).split(':')[0]), 1500 + i * 3400); });
  localStorage.ach = JSON.stringify([...g]);
}

// ---------- sound + narrator ----------
function tone(f, d, tt = 0, type = 'sine', v = .15) {
  if (muted) return;
  ac = ac || new AudioContext(); ac.resume();
  const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + tt;
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
function speak(text) {
  if (!narrOn || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = VOICE[lang]; u.rate = .95;
  speechSynthesis.speak(u);
}
$('#mute').onclick = () => { muted = !muted; localStorage.muted = muted ? '1' : '0'; applyI18n(); };
$('#narr').onclick = () => { narrOn = !narrOn; localStorage.narr = narrOn ? '1' : '0'; if (!narrOn) speechSynthesis?.cancel(); applyI18n(); };

// ---------- dramatic reveal ----------
const revealQ = []; let revealing = false;
function queueReveals(lines) {
  lines.forEach(x => { const m = x.match(/^(.+?) was (killed|lynched|shot|poisoned|overcome|removed)[^.]*\.(?: They were (\w+)\.)?/); if (m) revealQ.push({ name: m[1], kind: m[2], role: m[3] }); });
  if (!revealing) nextReveal();
}
function nextReveal() {
  const r = revealQ.shift(), el = $('#reveal');
  if (!r) { revealing = false; return el.classList.add('hidden'); }
  revealing = true;
  const title = r.kind === 'lynched' ? t('rvLynched', r.name) : /killed|shot|poisoned/.test(r.kind) ? t('rvKilled', r.name) : t('rvOut', r.name);
  el.querySelector('.front').innerHTML = `<b>💀</b>${esc(title)}`;
  el.querySelector('.back').innerHTML = r.role ? `<b>${ICON[r.role] || '❓'}</b><span class="tag">${t('rvRole')}</span>${esc(nm(r.role))}` : '<b>❓</b>';
  const c = el.querySelector('.rcard'); c.classList.remove('flipped'); el.classList.remove('hidden');
  setTimeout(() => c.classList.add('flipped'), 900); setTimeout(nextReveal, 3300);
}
$('#reveal').onclick = () => { revealQ.length = 0; nextReveal(); };

// ---------- connection ----------
const AVS = ['', '😀', '😎', '🤠', '🥸', '👻', '🦊', '🐼', '🐸', '🦉', '🐙', '🕵️'];
$('#av').innerHTML = AVS.map(a => `<option value="${a}">${a || 'Aa'}</option>`).join(''); $('#av').value = localStorage.av || '';
const urlRoom = new URLSearchParams(location.search).get('room'); if (urlRoom) $('#code').value = urlRoom.toUpperCase();
$('#name').value = localStorage.name || '';
function showStats() { const s = JSON.parse(localStorage.stats || '{"g":0,"w":0,"mw":0}'); $('#stats').textContent = s.g ? t('stats', s.w, s.g, s.mw) : ''; }
const creds = () => { localStorage.name = $('#name').value; localStorage.av = $('#av').value; return { name: $('#name').value, av: $('#av').value, pw: $('#pw').value, pid }; };
socket.on('connect', () => { if (localStorage.room) socket.emit('join', { code: localStorage.room, name: localStorage.name, av: localStorage.av, pid }); });
socket.on('err', m => { $('#err').textContent = m; $('#err2').textContent = m; toast(m); if (m.includes('not found')) localStorage.removeItem('room'); });
socket.on('joined', ({ code }) => { localStorage.room = code; history.replaceState(null, '', '?room=' + code); });
socket.on('kicked', () => { localStorage.removeItem('room'); alert('The host removed you from the room.'); location.href = '/'; });
socket.on('reported', ({ by, who }) => toast(`⚑ ${by} reported ${who}`));
socket.on('left', () => { localStorage.removeItem('room'); history.replaceState(null, '', location.pathname); S = null; document.body.className = 'day'; show('home'); });
let typingT;
socket.on('typing', n => { $('#typing').textContent = n + ' …'; clearTimeout(typingT); typingT = setTimeout(() => $('#typing').textContent = '', 2000); });
$('#create').onclick = () => socket.emit('create', creds());
$('#join').onclick = () => socket.emit('join', { code: $('#code').value, ...creds() });
$('#tutorial').onclick = () => socket.emit('tutorial', creds());
['leaveLobby', 'leaveGame'].forEach(id => $('#' + id).onclick = () => { if (confirm(t('leaveQ'))) socket.emit('leave'); });
$('#start').onclick = () => socket.emit('start');
$('#addbot').onclick = () => socket.emit('addbot');
$('#rename').onclick = () => { const n = prompt('New name:'); if (n) { localStorage.name = n; socket.emit('rename', n); } };
$('#copy').onclick = () => { navigator.clipboard?.writeText(`${location.origin}/?room=${S.code}`); $('#copy').textContent = t('copied'); };
$('#chatform').onsubmit = e => { e.preventDefault(); const v = $('#msg').value.trim(); if (v) socket.emit('chat', { text: v }); $('#msg').value = ''; };
let lastType = 0;
$('#msg').oninput = () => { if (Date.now() - lastType > 1500) { lastType = Date.now(); socket.emit('typing'); } };
$('#emojis').innerHTML = ['😂', '😱', '🤔', '👀', '🔪', '👍'].map(e => `<button type="button">${e}</button>`).join('');
$('#emojis').onclick = e => { if (e.target.tagName === 'BUTTON' && !e.target.disabled) socket.emit('chat', { text: e.target.textContent }); };
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); renderFeeds(); });

// ---------- state ----------
socket.on('state', s => { $('#err').textContent = ''; $('#err2').textContent = ''; S = s; sounds(); render(); prev = { phase: S.phase, log: S.log.length, turn: S.turn }; });
function won() {
  const r = S.role;
  if (S.winner === 'jester') return r === 'jester';
  if (S.winner === 'serialkiller') return r === 'serialkiller';
  if (S.winner === 'mafia') return isM(r);
  return !isM(r) && r !== 'serialkiller' && r !== 'jester';
}
function sounds() {
  const fresh = prev.log >= 0 && S.log.length > prev.log ? S.log.slice(prev.log).map(l => l.text) : [];
  const deaths = fresh.filter(x => /was (killed|lynched|shot|poisoned|overcome|removed)|killed protecting|heartbreak/.test(x));
  if (deaths.length) { SFX.death(); queueReveals(deaths); }
  if (prev.phase !== S.phase) {
    prevCounts = {};
    if (S.phase === 'night') { SFX.night(); navigator.vibrate?.(200); speak(t('nNight')); }
    else if (S.phase === 'day') { SFX.day(); navigator.vibrate?.([100, 60, 100]); speak(t('nDay') + ' ' + deaths.map(x => t('nDied', x.split(' was ')[0])).join(' ')); }
    else if (S.phase === 'lastwords') SFX.last();
    else if (S.phase === 'over') {
      SFX.win(); speak(t('nOver'));
      if (prev.phase && !S.spectator && S.role) {
        const st = JSON.parse(localStorage.stats || '{"g":0,"w":0,"mw":0}'); st.g++; if (won()) { st.w++; if (isM(S.role)) st.mw++; }
        localStorage.stats = JSON.stringify(st); showStats(); if (!S.tutorial) checkAchievements(st);
      }
    }
  }
  if (S.phase === 'night' && S.turn && S.turn !== prev.turn) speak(t('nWake', nm(S.turn)));
}

function render() {
  document.body.className = S.phase === 'night' ? 'night' : 'day';
  if (S.phase === 'lobby') return renderLobby();
  show('game'); renderTabs();
  $('#phaseicon').textContent = { night: '🌙', day: '☀️', lastwords: '🕯️', over: '🏁' }[S.phase];
  $('#phase').textContent = (S.phase === 'over' || S.phase === 'lastwords') ? t(S.phase) : `${t(S.phase)} ${S.day}`;
  const r = $('#role');
  r.textContent = S.spectator ? '👀 ' + t('spectating') : S.alive ? `${ICON[S.role]} ${t('youare', nm(S.role))}` : `💀 ${t('youdead', nm(S.role))}`;
  r.className = 'role ' + (isM(S.role) ? 'mafia' : '');
  const v = $('#voice'); v.classList.toggle('hidden', !S.set.voice); v.href = S.set.voice || '#';
  const live = ['night', 'day', 'lastwords'].includes(S.phase);
  $('#hostbtns').innerHTML = S.isHost && live ? `<button id="pause">${S.paused ? '▶' : '⏸'}</button><button id="skipphase">⏭</button>` : '';
  $('#pause') && ($('#pause').onclick = () => socket.emit('pause')); $('#skipphase') && ($('#skipphase').onclick = () => socket.emit('skipphase'));
  renderScene(); renderBanner(); renderTip(); renderBallot(); renderPlayers(); renderFeeds();
}

// night/day skyline: one house per player, windows go dark when a player dies
function renderScene() {
  const ps = S.players.filter(p => !p.spectator), W = Math.max(320, ps.length * 58 + 40);
  const houses = ps.map((p, i) => {
    const x = 24 + i * 58, off = !p.alive, out = off && prevAlive[p.id] === true;
    return `<g><title>${esc(p.name)}</title><rect class="house" x="${x}" y="46" width="44" height="34"/><polygon class="roof" points="${x - 4},46 ${x + 22},26 ${x + 48},46"/><rect class="win ${out ? 'out' : off ? 'off' : ''}" x="${x + 15}" y="54" width="14" height="14" rx="2"/></g>`;
  }).join('');
  $('#scene').innerHTML = `<svg viewBox="0 0 ${W} 90" preserveAspectRatio="xMidYMax slice"><circle class="orb" cx="${W - 36}" cy="22" r="${S.phase === 'night' ? 11 : 14}"/>${houses}<rect class="ground" x="0" y="80" width="${W}" height="10"/></svg>`;
  prevAlive = Object.fromEntries(ps.map(p => [p.id, p.alive]));
}

function renderTabs() {
  const showDead = !S.alive || S.phase === 'over';
  document.querySelector('[data-tab=dead]').classList.toggle('hidden', !showDead);
  if (tab === 'dead' && !showDead) tab = 'chat';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['chat', 'log', 'recap'].forEach(x => $('#' + x).classList.toggle('hidden', tab !== x)); $('#deadfeed').classList.toggle('hidden', tab !== 'dead');
}
function renderTip() {
  const el = $('#tip'); if (!S.tutorial) return el.classList.add('hidden');
  const mine = S.turn === S.role;
  el.textContent = S.phase === 'over' ? t('tip4') : S.phase === 'night' ? (mine ? t('tip2') : t('tip1')) : t('tip3');
  el.classList.remove('hidden');
}

// ---------- lobby ----------
function renderLobby() {
  show('lobby'); $('#lcode').textContent = S.code; $('#addbot').classList.toggle('hidden', !S.isHost);
  $('#lplayers').innerHTML = S.players.map(p => `<li><span>${avatar(p)}${esc(p.name)}</span><span class="tag">${p.id === S.me ? t('tYou') + ' ' : ''}${p.id === S.hostId ? t('tHost') + ' ' : ''}${p.bot ? t('tBot') + ' ' : p.connected ? '' : t('tOff')}${S.isHost && p.id !== S.me ? ` <button data-kick="${p.id}">${t('kick')}</button>` : ''}</span></li>`).join('');
  document.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => socket.emit('kick', b.dataset.kick));
  const enough = S.players.length >= S.min;
  $('#start').classList.toggle('hidden', !S.isHost); $('#start').disabled = !enough;
  $('#lhint').textContent = S.isHost ? (enough ? t('readyH') : t('waitN', S.players.length, S.min)) : t('waitHost');
  renderSettings();
}
function renderSettings() {
  const el = $('#settings'), s = S.set;
  if (!S.isHost) {
    const on = ks => ks.filter(k => k === 'lovers' ? s.lovers : s.roles[k]).map(nm).join(', ') || '-';
    el.innerHTML = `<div class="tag">Host settings</div><div>${s.night}s/turn, ${s.day}s day, Mafia ${s.mafia || 'auto'}, bots: ${s.botLevel}.<br>${t('rExtra')}: ${on(BASIC)}.<br>${t('rUnique')}: ${on([...UNIQUE, 'lovers'])}.</div>`;
    return;
  }
  if (el.contains(document.activeElement)) return;
  const num = (n, l, v) => `<label>${l}<input type="number" name="${n}" value="${v}"></label>`;
  const chk = (n, l, v) => `<label><input type="checkbox" name="${n}" ${v ? 'checked' : ''}>${l}</label>`;
  el.innerHTML = `<h3>Game</h3>${num('night', 'Seconds per night turn', s.night)}${num('day', 'Day length (seconds)', s.day)}${num('mafia', 'Mafia count (0 = automatic)', s.mafia)}
    <label>Bot difficulty<select name="botLevel">${['easy', 'normal', 'hard'].map(l => `<option ${s.botLevel === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="chk">${chk('reveal', 'Reveal role on death', s.reveal)}${chk('lastWords', 'Last words', s.lastWords)}${chk('events', 'Random events', s.events)}${chk('anon', 'Anonymous voting', s.anon)}${chk('filter', 'Profanity filter', s.filter)}</div>
    <label>Voice chat link<input type="text" name="voice" placeholder="https://meet.google.com/..." value="${esc(s.voice)}"></label>
    <h3>Roles</h3><div class="chk">${BASIC.map(k => chk(k, nm(k), s.roles[k])).join('')}</div>
    <h3 class="unique">${t('rUnique')}</h3><div class="chk unique">${UNIQUE.map(k => chk(k, nm(k), s.roles[k])).join('')}${chk('lovers', 'Lovers', s.lovers)}</div>`;
}
$('#settings').onchange = () => {
  if (!S?.isHost) return;
  const g = n => $('#settings').querySelector(`[name=${n}]`), roles = {};
  [...BASIC, ...UNIQUE].forEach(k => roles[k] = g(k).checked);
  socket.emit('settings', { night: g('night').value, day: g('day').value, mafia: g('mafia').value, voice: g('voice').value, botLevel: g('botLevel').value, roles,
    ...Object.fromEntries(['reveal', 'lastWords', 'events', 'anon', 'filter', 'lovers'].map(k => [k, g(k).checked])) });
};

// ---------- gameplay ----------
function actions() {
  if (!S.alive || S.spectator) return [];
  const d = S.done, f = d.fin, r = S.role, A = (type, ok) => ({ type, label: t('a_' + type.replace('inspect', 'inspect').replace('witchsave', 'save').replace('witchpoison', 'poison').replace('sk', 'kill')), ok });
  if (S.phase === 'day') return S.silenced === S.me ? [] : [{ type: 'vote', label: t('vote'), ok: p => p.id !== S.me }];
  if (S.phase !== 'night' || S.turn !== (isM(r) ? 'mafia' : r)) return [];
  const out = [], other = p => p.id !== S.me;
  if (isM(r)) out.push(A('kill', p => !isM(p.role)));
  if (r === 'silencer' && !f.silencer) out.push(A('silence', p => !isM(p.role)));
  if (r === 'doctor' && !d.heal) out.push(A('heal', () => true));
  if (r === 'bodyguard' && !d.guard) out.push(A('guard', other));
  if (r === 'escort' && !d.block) out.push(A('block', other));
  if (r === 'detective' && !d.inspect) out.push(A('inspect', other));
  if (r === 'vigilante' && S.shots > 0 && !f.vigilante) out.push(A('shoot', other));
  if (r === 'serialkiller' && !f.serialkiller) out.push(A('sk', other));
  if (r === 'witch' && !f.witch) { if (S.potions.save) out.push(A('witchsave', () => true)); if (S.potions.poison) out.push(A('witchpoison', other)); }
  return out;
}
function canHold() {
  const f = S.done.fin, r = S.role;
  return S.alive && S.phase === 'night' && S.turn === (isM(r) ? 'mafia' : r) && ((r === 'vigilante' && S.shots > 0 && !f.vigilante) || (r === 'witch' && !f.witch && (S.potions.save + S.potions.poison > 0)) || (r === 'serialkiller' && !f.serialkiller) || (r === 'silencer' && !f.silencer));
}
function renderBanner() {
  const b = $('#banner'), lwName = S.players.find(p => p.id === S.lw)?.name, living = S.players.filter(p => p.alive && !p.spectator).length;
  const mine = S.turn === (isM(S.role) ? 'mafia' : S.role);
  let x;
  if (S.phase === 'over') x = { town: t('winTown'), mafia: t('winMafia'), jester: t('winJester'), serialkiller: t('winSK') }[S.winner] + (S.awards.length ? t('seeRecap') : '');
  else if (S.paused) x = t('paused');
  else if (S.spectator) x = t('bSpec');
  else if (S.phase === 'lastwords') x = S.lw === S.me ? t('bLwMe') : t('bLwOther', lwName);
  else if (!S.alive) x = t('bOut');
  else if (S.phase === 'day') x = S.silenced === S.me ? t('bSil') : t('bDay');
  else if (S.phase === 'night' && !mine) x = t('bWake', nm(S.turn), S.step + 1, S.steps);
  else x = desc(S.role) + (S.phase === 'night' ? t('bTurn', S.step + 1, S.steps) : '');
  if (S.phase === 'night' && S.event === 'fullmoon') x += t('fullmoon');
  if (S.phase === 'day' && S.event === 'blackout') x += t('blackout');
  if (S.lover && S.alive) x += t('lover', S.lover);
  const note = S.notes.at(-1); if (note && S.role === 'detective') x += '  ' + note;
  b.textContent = x;
  if (canHold()) b.innerHTML += ` <button id="hold">${t('hold')}</button>`;
  if (S.alive && S.phase === 'day' && !S.paused) b.innerHTML += ` <button id="skipday">${t('skipday', S.skipN, living)}</button>`;
  if (S.isHost && S.phase === 'over') b.innerHTML += ` <button id="rematch" class="primary">${t('rematch')}</button> <button id="again">${t('backLobby')}</button>`;
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
  Object.entries(S.votes).forEach(([v, tg]) => { if (tg) (by[tg] = by[tg] || []).push(v); });
  const rows = lv.filter(p => by[p.id]).sort((a, b) => by[b.id].length - by[a.id].length);
  el.innerHTML = `<div class="bh"><span>${t('trial')}</span><span class="tag">${t('need', need)}${S.set.anon ? t('hiddenV') : ''}</span></div>` +
    (rows.length ? rows.map(p => { const n = by[p.id].length; return `<div class="brow ${n >= need ? 'lethal' : ''} ${n > (prevCounts[p.id] || 0) ? 'bump' : ''}"><span class="bn">${avatar(p)}${esc(p.name)}</span><div class="bar"><i style="width:${Math.min(100, n / need * 100)}%"></i></div><span class="vs">${by[p.id].map(v => avatar(S.players.find(x => x.id === v))).join('')}</span><b>${n}</b></div>`; }).join('') : `<div class="tag">${t('noVotes')}</div>`);
  prevCounts = Object.fromEntries(rows.map(p => [p.id, by[p.id].length]));
}
function renderPlayers() {
  const acts = actions(), votes = S.phase === 'day' ? S.votes : S.mafiaVotes, pick = votes[S.me];
  const canWhisper = S.alive && S.phase === 'day' && S.silenced !== S.me && S.event !== 'blackout' && !S.spectator;
  $('#players').innerHTML = S.players.filter(p => !p.spectator).map(p => {
    const mine = acts.filter(a => p.alive && a.ok(p));
    const tag = p.role ? `<span class="tag ${isM(p.role) ? 'mafia' : ''}">${ICON[p.role]} ${nm(p.role)}</span>` : '';
    const flags = (S.silenced === p.id ? `<span class="tag">${t('silencedTag')}</span>` : '') + (p.muted ? `<span class="tag">${t('mutedTag')}</span>` : '');
    const btns = mine.map(a => `<button data-id="${p.id}" data-type="${a.type}">${a.type === 'vote' ? '🗳️ ' : ''}${a.label}</button>`).join('') + (canWhisper && p.alive && p.id !== S.me ? `<button data-w="${p.id}" class="ghost">${t('whisper')}</button>` : '');
    const mod = p.id !== S.me && !p.bot ? `<button class="mini" data-mute="${esc(p.name)}" title="Mute for me">${mutedNames.has(p.name) ? '🔈' : '🔇'}</button>` + (S.isHost ? `<button class="mini hm" data-hmute="${p.id}" title="Mute for everyone">🚫</button>` : `<button class="mini hm" data-report="${p.id}" title="Report">⚑</button>`) : '';
    return `<div class="pcard ${p.alive ? '' : 'dead'} ${pick === p.id ? 'picked' : ''}" data-yv="${t('yourvote')}"><span class="n">${avatar(p)}${esc(p.name)}${p.connected ? '' : ' ⚠'}${mod}</span>${tag}${flags}<div class="acts">${btns}</div></div>`;
  }).join('');
  document.querySelectorAll('.pcard [data-type]').forEach(b => b.onclick = () => socket.emit('act', { type: b.dataset.type, target: b.dataset.id }));
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const v = prompt(t('whisperQ')); if (v) socket.emit('whisper', { to: b.dataset.w, text: v }); });
  document.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { const n = b.dataset.mute; mutedNames.has(n) ? mutedNames.delete(n) : mutedNames.add(n); localStorage.mutedNames = JSON.stringify([...mutedNames]); render(); });
  document.querySelectorAll('[data-hmute]').forEach(b => b.onclick = () => socket.emit('mute', b.dataset.hmute));
  document.querySelectorAll('[data-report]').forEach(b => b.onclick = () => { socket.emit('report', b.dataset.report); toast('⚑ OK'); });
  if (acts.some(a => a.type === 'vote')) { $('#players').insertAdjacentHTML('beforeend', `<div class="pcard"><span class="n">${t('skip')}</span><button id="skip">${t('abstain')}</button></div>`); $('#skip').onclick = () => socket.emit('act', { type: 'vote', target: null }); }
}
function renderFeeds() {
  const night = S.phase === 'night', mafiaChat = night && isM(S.role), spy = night && S.role === 'spy' && S.alive;
  const line = m => m.sys ? `<div class="entry sys">${esc(m.text)}</div>` : `<div class="msg"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`;
  const msgs = (mafiaChat || spy) ? S.mchat : S.chat.filter(m => !mutedNames.has(m.name));
  const feed = $('#chat'), atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 30;
  feed.innerHTML = (mafiaChat ? `<div class="entry">${t('mafiaInfo')}</div>` : '') + (spy ? `<div class="entry">${t('spyInfo')}</div>` : '') + (night && !mafiaChat && !spy ? `<div class="entry">${t('nightClosed')}</div>` : '') +
    msgs.map(line).join('') + (night ? '' : S.whispers.map(w => `<div class="msg whisper"><b>${esc(w.from === S.players.find(p => p.id === S.me)?.name ? 'You → ' + w.to : w.from + ' → you')}</b> ${esc(w.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  $('#deadfeed').innerHTML = `<div class="entry">${t('deadInfo')}</div>` + S.dchat.map(line).join('');
  const inGame = ['night', 'day', 'lastwords'].includes(S.phase), dead = !S.alive;
  const canPublic = S.phase === 'over' || (S.phase === 'day' && S.alive && S.silenced !== S.me && S.event !== 'blackout') || (S.phase === 'lastwords' && S.lw === S.me) || (mafiaChat && S.alive);
  const formOn = tab === 'dead' ? (dead && inGame) || S.phase === 'over' : tab === 'chat' ? !(dead && inGame) : false;
  $('#chatform').classList.toggle('hidden', !formOn); $('#emojis').classList.toggle('hidden', !formOn);
  const can = tab === 'dead' ? true : canPublic; $('#msg').disabled = !can; document.querySelectorAll('#emojis button').forEach(b => b.disabled = !can);
  $('#log').innerHTML = S.log.map(l => `<div class="entry">${esc(l.text)}</div>`).join('') + S.notes.map(n => `<div class="entry note">Private: ${esc(n)}</div>`).join('');
  $('#recap').innerHTML = S.phase !== 'over' ? `<div class="entry">${t('recapWait')}</div>` :
    `<div class="recap"><h4>${t('awards')}</h4>${S.awards.map(a => `<div class="msg">${esc(a)}</div>`).join('') || '-'}<h4>${t('whoWas')}</h4>${S.players.filter(p => !p.spectator).map(p => `<div class="entry">${esc(p.name)}: ${ICON[p.role]} ${nm(p.role)}</div>`).join('')}<h4>${t('nightBy')}</h4>${S.story.map(x => `<div class="entry">${esc(x)}</div>`).join('')}<div class="entry"><a href="history.html" style="color:var(--accent)">${t('history')} →</a></div></div>`;
}
setInterval(() => {
  if (!S) return;
  if (S.paused) return $('#timer').textContent = ' ⏸';
  if (!S.endsAt) { $('#timerbar i').style.width = '0'; return $('#timer').textContent = ''; }
  const s = Math.max(0, Math.round((S.endsAt - Date.now()) / 1000));
  $('#timer').textContent = ` ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('#timerbar i').style.width = S.dur ? Math.max(0, Math.min(100, (S.endsAt - Date.now()) / S.dur * 100)) + '%' : '0';
}, 500);
applyI18n(); showStats();
