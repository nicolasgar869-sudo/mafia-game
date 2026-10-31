const $ = s => document.querySelector(s);
const pid = localStorage.pid || (localStorage.pid = Math.random().toString(36).slice(2) + Date.now().toString(36));
const socket = io();
let S = null, tab = 'chat', prev = { phase: null, log: -1, turn: null }, prevCounts = {}, prevAlive = {};
let muted = localStorage.muted === '1', narrOn = localStorage.narr === '1', ac, hapOn = localStorage.hap !== '0';
let mutedNames = new Set(JSON.parse(localStorage.mutedNames || '[]'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = id => ['home', 'lobby', 'game'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));
const MAFIA = ['mafia', 'godfather', 'silencer'], isM = r => MAFIA.includes(r);
const ICON = { pirate: '🏴‍☠️', survivor: '🦺', plaguebearer: '🦠', jailer: '⛓️', mafia: '🔪', godfather: '🎩', silencer: '🤐', detective: '🔍', doctor: '⚕️', bodyguard: '🛡️', vigilante: '🔫', mayor: '🏛️', jester: '🃏', witch: '🧪', escort: '💃', spy: '🕶️', serialkiller: '🪓', town: '🏠' };
const BASIC = ['detective', 'doctor', 'vigilante', 'bodyguard', 'mayor', 'jester', 'godfather'], UNIQUE = ['witch', 'escort', 'spy', 'serialkiller', 'silencer', 'jailer', 'pirate', 'survivor', 'plaguebearer'];

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
  a_infect: ['Infect', 'Jangkiti', '感染'], a_duel: ['Duel', 'Berduel', '决斗'], winPirate: ['The Pirate wins.', 'Lanun menang.', '海盗获胜。'], winPlague: ['The plague wins. The infected win together.', 'Wabak menang. Yang dijangkiti menang bersama.', '瘟疫获胜，所有感染者一同获胜。'], winRed: ['The Red team wins.', 'Pasukan Merah menang.', '红队获胜。'], winBlue: ['The Blue team wins.', 'Pasukan Biru menang.', '蓝队获胜。'],
  a_jail: ['Jail', 'Penjara', '监禁'], a_kill: ['Kill', 'Bunuh', '击杀'], a_heal: ['Heal', 'Sembuh', '治疗'], a_guard: ['Guard', 'Kawal', '保护'], a_block: ['Block', 'Sekat', '阻挠'], a_inspect: ['Investigate', 'Siasat', '调查'],
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
  pirate: [['Pirate', 'Lanun', '海盗'], ['Challenge a player to a duel each night. Both pick Strike, Trick or Guard. Win two duels to win the game.', 'Cabar seorang pemain berduel setiap malam. Kedua-duanya pilih Strike, Trick atau Guard. Menang dua duel untuk menang permainan.', '每晚向一名玩家发起决斗，双方选择出招（攻击、诡计、防御）。赢得两场决斗即获胜。']],
  survivor: [['Survivor', 'Survivor', '幸存者'], ['Just stay alive. You can wear a bulletproof vest twice to survive a night attack.', 'Hanya perlu terus hidup. Anda boleh memakai jaket kalis peluru dua kali untuk selamat daripada serangan malam.', '只要活下来就行。你可以穿两次防弹衣来抵挡夜间袭击。']],
  plaguebearer: [['Plaguebearer', 'Pembawa Wabak', '瘟疫使者'], ['Infect one player each night. If every living player is infected, you and all the infected win together.', 'Jangkitkan seorang pemain setiap malam. Jika semua pemain hidup dijangkiti, anda dan semua yang dijangkiti menang bersama.', '每晚感染一名玩家。若所有存活玩家都被感染，你和所有感染者一同获胜。']],
  jailer: [['Jailer', 'Sipir', '狱卒'], ['Jail one player each night. You can talk privately, and you may execute them (2 times per game).', 'Penjarakan seorang pemain setiap malam. Anda boleh bercakap secara peribadi dan menghukum mati mereka (2 kali).', '每晚监禁一名玩家，可私下交谈，也可处决他（全局 2 次）。']],
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
const nm = k => { k = String(k).startsWith('mafia_') ? 'mafia' : k; return R[k] ? R[k][0][LI[lang]] : k; }, desc = k => R[k][1][LI[lang]];
const myGrp = () => (isM(S.role) ? (S.team ? 'mafia_' + S.team : 'mafia') : S.role);
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  document.querySelectorAll('.langsel').forEach(s => { s.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); s.value = lang; s.onchange = () => { lang = s.value; localStorage.lang = lang; applyI18n(); showStats(); if (S) render(); }; });
  $('#mute').textContent = muted ? t('soundOff') : t('sound'); $('#narr').textContent = narrOn ? t('narr') : t('narrOff'); $('#hap').textContent = hapOn ? 'Haptics on' : 'Haptics off';
}


// ---------- role portraits (inline SVG) ----------
const fedora = (c, band) => `<ellipse cx="32" cy="15" rx="19" ry="4.5" fill="${c}"/><path d="M21 15q1-12 11-12t11 12z" fill="${c}"/><rect x="21" y="11.5" width="22" height="3" fill="${band}"/>`;
const cap = c => `<path d="M19 20q13-14 26 0z" fill="${c}"/><rect x="19" y="19" width="26" height="3" fill="#0003"/>`;
const PR = {
  mafia: ['#23232f', '#f1c9a5', fedora('#1a1a1a', '#b3202a') + '<path d="M37 22l3 9" stroke="#a33" stroke-width="1.5"/>'],
  godfather: ['#0e0e14', '#f1c9a5', fedora('#3a3a44', '#999') + '<circle cx="22" cy="50" r="3.2" fill="#d62839"/><path d="M22 53v7" stroke="#2a7" stroke-width="1.5"/>'],
  silencer: ['#2a2a30', '#e8c4a0', cap('#333') + '<rect x="24" y="31" width="16" height="5" rx="1" fill="#c9c9c9"/>'],
  detective: ['#8b6b3d', '#f1c9a5', fedora('#6b4f2a', '#2a1d0e') + '<circle cx="49" cy="45" r="6" fill="none" stroke="#e8e8e8" stroke-width="2.2"/><path d="M53.5 49.5l6 7" stroke="#e8e8e8" stroke-width="3"/>'],
  doctor: ['#f0f4f7', '#f1c9a5', cap('#3aa17e') + '<circle cx="32" cy="12" r="4" fill="#cfd8dc" stroke="#90a4ae"/><rect x="29" y="48" width="6" height="12" fill="#d32f2f"/><rect x="26" y="51" width="12" height="6" fill="#d32f2f"/>'],
  bodyguard: ['#14141a', '#d9a77f', '<path d="M19 22q0-12 13-12t13 12q-6-6-13-6t-13 6z" fill="#222"/><rect x="21" y="23" width="10" height="6" rx="2" fill="#000"/><rect x="33" y="23" width="10" height="6" rx="2" fill="#000"/><rect x="30" y="25" width="4" height="2" fill="#000"/><path d="M46 28q4 3 2 12" stroke="#bbb" stroke-width="1.5" fill="none"/>'],
  vigilante: ['#3b3f47', '#f1c9a5', '<path d="M16 30q0-22 16-22t16 22l-4 6V24H20v12z" fill="#2a2d33"/><rect x="21" y="23" width="22" height="7" rx="3" fill="#111"/><circle cx="27" cy="26.5" r="1.8" fill="#fff"/><circle cx="37" cy="26.5" r="1.8" fill="#fff"/>'],
  mayor: ['#1d3557', '#f1c9a5', '<rect x="23" y="3" width="18" height="12" fill="#222"/><ellipse cx="32" cy="15" rx="16" ry="3.5" fill="#222"/><rect x="23" y="11" width="18" height="2.5" fill="#c9a227"/><path d="M10 64L42 44" stroke="#c9a227" stroke-width="5"/><circle cx="27" cy="27" r="4.5" fill="none" stroke="#222"/><circle cx="37" cy="27" r="4.5" fill="none" stroke="#222"/>'],
  jester: ['#7b2d8e', '#f1c9a5', '<path d="M17 19L9 4l15 8 8-10 8 10 15-8-8 15z" fill="#e63946"/><circle cx="9" cy="4" r="2.5" fill="#ffd166"/><circle cx="55" cy="4" r="2.5" fill="#ffd166"/><circle cx="32" cy="2" r="2.5" fill="#ffd166"/><path d="M6 64c2-15 13-21 26-21v21z" fill="#ffd166"/>'],
  witch: ['#4b2a6b', '#9bd17a', '<path d="M15 19L33-2 49 19z" fill="#1d1d2b"/><rect x="12" y="17" width="40" height="4.5" rx="2" fill="#1d1d2b"/><rect x="21" y="14" width="22" height="3" fill="#8e44ad"/><circle cx="33" cy="32" r="1.3" fill="#3b6b2a"/>'],
  escort: ['#c0392b', '#f1c9a5', '<path d="M17 30q-2-21 15-21t15 21v11h-5V27H22v14h-5z" fill="#3b2a20"/><path d="M28 33q4 3 8 0" stroke="#d6336c" stroke-width="2" fill="none"/>'],
  spy: ['#2b2f38', '#e8c4a0', '<path d="M14 62l8-18 10 8 10-8 8 18z" fill="#1a1d24"/>' + cap('#222') + '<rect x="21" y="24" width="22" height="5" rx="2" fill="#0b0b0b"/>'],
  serialkiller: ['#2a2018', '#f3f3f3', '<circle cx="27" cy="25" r="2.6" fill="#222"/><circle cx="37" cy="25" r="2.6" fill="#222"/><rect x="29" y="31" width="6" height="6" rx="1" fill="none" stroke="#999"/><path d="M26 19l2 5M38 19l-2 5" stroke="#c0392b" stroke-width="2"/><path d="M48 40l8 12" stroke="#ddd" stroke-width="3"/>'],
  pirate: ['#7a1f1f', '#e0b894', '<path d="M15 21q17-20 34 0z" fill="#16161d"/><rect x="15" y="19" width="34" height="3" fill="#16161d"/><circle cx="32" cy="12" r="2.6" fill="#eee"/><path d="M25 10l14 4M39 10l-14 4" stroke="#eee" stroke-width="1"/><circle cx="37" cy="27" r="3.6" fill="#111"/><path d="M33 24L21 17" stroke="#111" stroke-width="1.4"/><circle cx="48" cy="46" r="2" fill="#ffd166"/>'],
  survivor: ['#5b7d3a', '#e0b894', '<path d="M19 21q13-15 26 0z" fill="#f2b705"/><rect x="19" y="19" width="26" height="3" fill="#c98f00"/><rect x="22" y="47" width="20" height="17" fill="#f26b3a"/><path d="M27 47v17M37 47v17" stroke="#fff" stroke-width="2"/>'],
  plaguebearer: ['#3f3f2a', '#b9d77a', '<path d="M16 31q0-23 16-23t16 23l-4 6V25H20v12z" fill="#2c2c1c"/><path d="M32 25l-5 12h10z" fill="#d8c9a0"/><circle cx="26" cy="25" r="2.4" fill="#e8ff9a"/><circle cx="38" cy="25" r="2.4" fill="#e8ff9a"/><circle cx="50" cy="46" r="3" fill="#8bdc4a"/><circle cx="14" cy="50" r="2" fill="#8bdc4a"/>'],
  jailer: ['#334155', '#e0b894', cap('#1e293b') + '<path d="M29 12l3-4 3 4-3 3z" fill="#facc15"/><circle cx="49" cy="46" r="4.5" fill="none" stroke="#e5c07b" stroke-width="2"/><path d="M49 51v8M49 55h4" stroke="#e5c07b" stroke-width="2"/>'],
  town: ['#4a90d9', '#f1c9a5', cap('#e07a2f')],
};
const portrait = (role, size = 24) => { const [body, skin, extra] = PR[role] || PR.town; return `<svg class="pt" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect width="64" height="64" fill="rgba(255,255,255,.07)"/><path d="M6 64c2-15 13-21 26-21s24 6 26 21z" fill="${body}"/><circle cx="32" cy="27" r="13" fill="${skin}"/><circle cx="27" cy="27" r="1.6" fill="#222"/><circle cx="37" cy="27" r="1.6" fill="#222"/><path d="M28 33q4 3 8 0" stroke="#7a3b2e" stroke-width="1.5" fill="none"/>${extra}</svg>`; };
const avatar = p => {
  if (!p) return '';
  const fr = p.cos && p.cos.frame ? ' frame-' + p.cos.frame : '';
  if (p.av) return `<span class="av emo${fr}">${esc(p.av)}</span>`;
  let h = 0; for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="av${fr}" style="background:hsl(${h} 45% 42%)">${esc(p.name[0].toUpperCase())}</span>`;
};
const toast = m => { const e = $('#toast'); e.textContent = m; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 3200); };

// ---------- rules + achievements dialogs ----------
function openRules() {
  const li = k => `<p>${badge(k)} <b>${nm(k)}:</b> ${desc(k)}</p>`;
  $('#rulesbody').innerHTML = `<h2>${t('howto')}</h2><p>${t('rulesIntro')}</p><p>${t('rulesWin')}</p><h3>${t('rCore')}</h3>${['mafia', 'town', 'detective', 'doctor'].map(li).join('')}<h3>${t('rExtra')}</h3>${['godfather', 'bodyguard', 'vigilante', 'mayor', 'jester'].map(li).join('')}<h3>${t('rUnique')}</h3>${UNIQUE.map(li).join('')}<p>${t('loverRule')}</p><h3>Game modes</h3>${MODESD.map(m => `<p><b>${m[1]} ${m[2]}:</b> ${m[3]}</p>`).join('')}`;
  $('#rules').showModal();
}
const ACH = ['first', 'survivor', 'jester', 'mafia', 'sharp', 'saver', 'vet', 'sk', 'love'];
const got = () => new Set(JSON.parse(localStorage.ach || '[]'));
const COS = [
  { id: 'bronze', type: 'frame', name: 'Bronze frame', ach: 'first' }, { id: 'emerald', type: 'frame', name: 'Emerald frame', ach: 'survivor' },
  { id: 'crimson', type: 'frame', name: 'Crimson frame', ach: 'mafia' }, { id: 'gold', type: 'frame', name: 'Gold frame', ach: 'vet' }, { id: 'pink', type: 'frame', name: 'Rose frame', ach: 'love' },
  { id: 'cyan', type: 'color', name: 'Cyan chat name', ach: 'sharp' }, { id: 'mint', type: 'color', name: 'Mint chat name', ach: 'saver' },
  { id: 'harlequin', type: 'back', name: 'Harlequin card back', ach: 'jester' }, { id: 'obsidian', type: 'back', name: 'Obsidian card back', ach: 'sk' },
];
const cosSel = () => JSON.parse(localStorage.cos || '{}');
function openAch() {
  const g = got(), c = cosSel(), TYPES = { frame: 'Avatar frames', color: 'Chat colors', back: 'Card backs' };
  $('#rulesbody').innerHTML = `<h2>🏆 ${t('ach')}</h2>` + ACH.map(a => `<p>${g.has(a) ? '✅' : '🔒'} ${g.has(a) ? t('a_' + a) : `<span class="tag">${t('locked')}: ${t('a_' + a).split(':')[1] || ''}</span>`}</p>`).join('') +
    '<h2>🎨 Cosmetics</h2>' + Object.entries(TYPES).map(([ty, label]) => `<h3>${label}</h3><p><button data-cos="${ty}:">None${!c[ty] ? ' ✓' : ''}</button> ` + COS.filter(x => x.type === ty).map(x => g.has(x.ach) ? `<button data-cos="${ty}:${x.id}">${x.name}${c[ty] === x.id ? ' ✓' : ''}</button>` : `<span class="tag">🔒 ${x.name} (earn: ${t('a_' + x.ach).split(':')[0]})</span>`).join(' ') + '</p>').join('');
  $('#rulesbody').querySelectorAll('[data-cos]').forEach(b => b.onclick = () => { const [ty, id] = b.dataset.cos.split(':'); const n = cosSel(); n[ty] = id; localStorage.cos = JSON.stringify(n); socket.emit('cos', n); openAch(); });
  if (!$('#rules').open) $('#rules').showModal();
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
const vib = p => { if (hapOn) navigator.vibrate?.(p); };
$('#hap').onclick = () => { hapOn = !hapOn; localStorage.hap = hapOn ? '1' : '0'; applyI18n(); vib([60]); };
$('#mute').onclick = () => { muted = !muted; localStorage.muted = muted ? '1' : '0'; applyI18n(); };
$('#narr').onclick = () => { narrOn = !narrOn; localStorage.narr = narrOn ? '1' : '0'; if (!narrOn) speechSynthesis?.cancel(); applyI18n(); };

// ---------- dramatic reveal ----------
const revealQ = []; let revealing = false;
const KIND = x => /lynched/.test(x) ? 'lynched' : /shot by/.test(x) ? 'shot' : /poisoned/.test(x) ? 'poisoned' : /heartbreak|broken heart/.test(x) ? 'heart' : /executed/.test(x) ? 'executed' : /in a duel/.test(x) ? 'duel' : /caught in the collapse/.test(x) ? 'collapse' : /killed protecting/.test(x) ? 'guard' : /removed after/.test(x) ? 'left' : 'killed';
const DEMO = { killed: '🩸', shot: '💥', poisoned: '🧪', lynched: '🔨', heart: '💔', executed: '⛓️', guard: '🛡️', left: '💨', duel: '⚔️', collapse: '🌋' };
function queueReveals(lines) {
  lines.forEach(x => { const m = x.match(/^(.+?) was (killed|lynched|shot|poisoned|overcome|removed|executed|caught)[^.]*\.(?: They were (\w+)\.)?/); if (m) revealQ.push({ name: m[1], kind: KIND(x), role: m[3] }); });
  if (!revealing) nextReveal();
}
function nextReveal() {
  const r = revealQ.shift(), el = $('#reveal');
  if (!r) { revealing = false; return el.classList.add('hidden'); }
  revealing = true;
  const title = r.kind === 'lynched' ? t('rvLynched', r.name) : ['left', 'heart'].includes(r.kind) ? t('rvOut', r.name) : t('rvKilled', r.name);
  el.querySelector('.front').innerHTML = `<b>💀</b>${esc(title)}`; el.querySelector('.front').className = 'face front' + (cosSel().back ? ' cb-' + cosSel().back : '');
  el.querySelector('.back').innerHTML = r.role ? `${portrait(r.role, 120)}<span class="tag">${t('rvRole')}</span>${esc(nm(r.role))}` : '<b>❓</b>';
  const c = el.querySelector('.rcard'); c.classList.remove('flipped'); el.classList.remove('hidden');
  const fx = $('#dfx'); fx.className = 'dfx'; void fx.offsetWidth; fx.className = 'dfx ' + r.kind; fx.dataset.e = DEMO[r.kind];   // a different animation per cause of death
  if (['killed', 'shot', 'lynched', 'executed', 'duel', 'collapse'].includes(r.kind)) shake();
  setTimeout(() => c.classList.add('flipped'), 1100); setTimeout(nextReveal, 3600);
}
$('#reveal').onclick = () => { revealQ.length = 0; nextReveal(); };
function shake() { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 700); }
function confetti() { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; const box = $('#confetti'); box.innerHTML = Array.from({ length: 90 }, () => `<i style="left:${Math.random() * 100}%;background:hsl(${Math.random() * 360} 85% 60%);animation-duration:${2.5 + Math.random() * 2.5}s;animation-delay:${Math.random() * 1.2}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join(''); setTimeout(() => { box.innerHTML = ''; }, 7000); }

// ---------- connection ----------
const AVS = ['', '😀', '😎', '🤠', '🥸', '👻', '🦊', '🐼', '🐸', '🦉', '🐙', '🕵️'];
$('#av').innerHTML = AVS.map(a => `<option value="${a}">${a || 'Aa'}</option>`).join(''); $('#av').value = localStorage.av || '';
const urlRoom = new URLSearchParams(location.search).get('room'); if (urlRoom) $('#code').value = urlRoom.toUpperCase();
$('#name').value = localStorage.name || '';
function showStats() { const s = JSON.parse(localStorage.stats || '{"g":0,"w":0,"mw":0}'); $('#stats').textContent = s.g ? t('stats', s.w, s.g, s.mw) : ''; }
const creds = () => { localStorage.name = $('#name').value; localStorage.av = $('#av').value; return { name: $('#name').value, av: $('#av').value, pw: $('#pw').value, pid, cos: JSON.parse(localStorage.cos || '{}') }; };
socket.on('connect', () => { if (localStorage.room) socket.emit('join', { code: localStorage.room, name: localStorage.name, av: localStorage.av, pid, cos: JSON.parse(localStorage.cos || '{}') }); });
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
$('#tutorialMap').onclick = () => socket.emit('tutorial', { ...creds(), metro: true });
['leaveLobby', 'leaveGame'].forEach(id => $('#' + id).onclick = () => { if (confirm(t('leaveQ'))) socket.emit('leave'); });
$('#start').onclick = () => socket.emit('start');
$('#addbot').onclick = () => socket.emit('addbot');
$('#rename').onclick = () => { const n = prompt('New name:'); if (n) { localStorage.name = n; socket.emit('rename', n); } };
$('#copy').onclick = () => { navigator.clipboard?.writeText(`${location.origin}/?room=${S.code}`); $('#copy').textContent = t('copied'); };
$('#chatform').onsubmit = e => { e.preventDefault(); const v = $('#msg').value.trim(); if (v) socket.emit('chat', { text: v }); $('#msg').value = ''; };
let lastType = 0;
$('#msg').oninput = () => { if (Date.now() - lastType > 1500) { lastType = Date.now(); socket.emit('typing'); } };
$('#emojis').innerHTML = ['😂', '😱', '🤔', '👀', '🔪', '👍'].map(e => `<button type="button">${e}</button>`).join('');
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); renderFeeds(); });

// ---------- state ----------
socket.on('state', s => { $('#err').textContent = ''; $('#err2').textContent = ''; S = s; sounds(); render(); prev = { phase: S.phase, log: S.log.length, turn: S.turn }; });
function won() {
  const r = S.role, w = S.winner;
  if (r === 'survivor' && S.alive) return true;                      // the Survivor wins just by living
  if (w === 'red' || w === 'blue') return S.team === w;
  if (w === 'plague') return !!S.iSick;
  if (['jester', 'serialkiller', 'pirate'].includes(w)) return r === w;
  if (w === 'mafia') return isM(r);
  return !isM(r) && !['serialkiller', 'jester', 'pirate', 'plaguebearer'].includes(r);
}
function sounds() {
  const fresh = prev.log >= 0 && S.log.length > prev.log ? S.log.slice(prev.log).map(l => l.text) : [];
  const deaths = fresh.filter(x => /was (killed|lynched|shot|poisoned|overcome|removed|executed|caught)|killed protecting|heartbreak/.test(x));
  if (deaths.length) { SFX.death(); vib([500]); queueReveals(deaths); }
  if (prev.phase === 'night' && S.phase === 'day') showMorning(S.day, fresh);
  if (prev.phase !== S.phase) {
    prevCounts = {};
    if (S.phase === 'night' && S.day === 1 && prev.phase && prev.phase !== 'night' && S.role && !S.spectator) deal();
    if (S.phase === 'night') trans('to-night'); else if (S.phase === 'day' && prev.phase === 'night') trans('to-day');
    if (S.phase === 'night') { SFX.night(); speak(t('nNight')); }
    else if (S.phase === 'day') { SFX.day(); speak(t('nDay') + ' ' + deaths.map(x => t('nDied', x.split(' was ')[0])).join(' ')); }
    else if (S.phase === 'lastwords') SFX.last();
    else if (S.phase === 'over') {
      SFX.win(); speak(t('nOver')); if (S.role && !S.spectator && won()) confetti(); if (S.role && !S.spectator) vib(won() ? [80, 40, 80, 40, 80, 40, 350] : [350, 120, 350]);
      if (prev.phase && !S.spectator && S.role) {
        const st = JSON.parse(localStorage.stats || '{"g":0,"w":0,"mw":0}'); st.g++; if (won()) { st.w++; if (isM(S.role)) st.mw++; }
        localStorage.stats = JSON.stringify(st); showStats(); if (!S.tutorial) checkAchievements(st);
      }
    }
  }
  if (S.phase === 'night' && S.turn && S.turn !== prev.turn) { speak(t('nWake', nm(S.turn))); if (S.alive && S.turn === myGrp()) vib([90, 50, 90]); }
}

function render() {
  document.body.className = S.phase === 'night' ? 'night' : 'day';
  if (S.phase === 'lobby') return renderLobby();
  show('game'); renderTabs();
  $('#phaseicon').textContent = { night: '🌙', day: '☀️', lastwords: '🕯️', over: '🏁' }[S.phase];
  $('#phase').textContent = (S.phase === 'over' || S.phase === 'lastwords') ? t(S.phase) : `${t(S.phase)} ${S.day}`;
  const r = $('#role');
  r.innerHTML = S.spectator ? '👀 ' + esc(t('spectating')) : S.alive ? `${portrait(S.role, 26)} ${esc(t('youare', nm(S.role)))}` : `💀 ${esc(t('youdead', nm(S.role)))}`;
  r.className = 'role ' + (isM(S.role) ? 'mafia' : '');
  const v = $('#voice'); v.classList.toggle('hidden', !S.set.voice); v.href = S.set.voice || '#';
  const live = ['night', 'day', 'lastwords'].includes(S.phase);
  $('#hostbtns').innerHTML = S.isHost && live ? `<button id="pause">${S.paused ? '▶' : '⏸'}</button><button id="skipphase">⏭</button>` : '';
  $('#pause') && ($('#pause').onclick = () => socket.emit('pause')); $('#skipphase') && ($('#skipphase').onclick = () => socket.emit('skipphase'));
  renderScene(); renderBanner(); renderTip(); renderMetro(); renderPoll(); renderClues(); renderBallot(); renderPlayers(); renderFeeds(); syncMusic();
}

// night/day skyline: one house per player, windows go dark when a player dies
function renderTabs() {
  const showDead = !S.alive || S.phase === 'over';
  document.querySelector('[data-tab=dead]').classList.toggle('hidden', !showDead);
  if (tab === 'dead' && !showDead) tab = 'chat';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['chat', 'log', 'recap'].forEach(x => $('#' + x).classList.toggle('hidden', tab !== x)); $('#deadfeed').classList.toggle('hidden', tab !== 'dead');
}
const TIPM = ['', 'Map mode: every night each role acts in turn. Targets 1 district away cost +10 IP, and 2 away need a Long-Range Kit.', 'Your turn! Investigate someone. The same district is free, next door costs 10 IP.', 'Day: click a district on the map, then press Move here. You can move once a day, and adjacent districts are free.', 'Nice move! Now open the 🛒 Market and buy Kevlar Body Armor. It saves you from one night attack.', 'Armor ready! Each night districts pay IP to the faction with the most players inside. Chat, then vote.', 'Map tutorial complete! Create a room and tick Metropolitan mode to play with friends.'];
function tutM() { if (!S.tutorial || !S.metro) return 0; if (S.phase === 'over') return 6; if (S.phase === 'night') return S.turn === myGrp() ? 2 : 1; return S.kevlar ? 5 : S.moved ? 4 : 3; }
function renderTip() {
  const el = $('#tip'); if (!S.tutorial) return el.classList.add('hidden');
  const mine = S.turn === myGrp();
  el.textContent = S.metro ? TIPM[tutM()] : S.phase === 'over' ? t('tip4') : S.phase === 'night' ? (mine ? t('tip2') : t('tip1')) : t('tip3');
  el.classList.remove('hidden');
}

// ---------- lobby ----------
function renderLobby() {
  show('lobby'); $('#lcode').textContent = S.code; $('#addbot').classList.toggle('hidden', !S.isHost);
  const PER = { calm: '😌 Calm', paranoid: '😰 Paranoid', quiet: '🤫 Quiet', loud: '📣 Loud accuser' };
  $('#lplayers').innerHTML = S.players.map(p => `<li><span>${avatar(p)}${esc(p.name)}</span><span class="tag">${p.id === S.me ? t('tYou') + ' ' : ''}${p.id === S.hostId ? t('tHost') + ' ' : ''}${p.bot ? t('tBot') + ' ' : p.connected ? '' : t('tOff')}${p.ready && !p.bot && p.id !== S.hostId ? '✅ ready ' : ''}${S.isHost && p.bot ? `<select data-persona="${p.id}">${Object.entries(PER).map(([k, v]) => `<option value="${k}" ${p.persona === k ? 'selected' : ''}>${v}</option>`).join('')}</select> <button data-botname="${p.id}">✏️</button>` : ''}${S.isHost && p.id !== S.me ? ` <button data-kick="${p.id}">${t('kick')}</button>` : ''}</span></li>`).join('');
  document.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => socket.emit('kick', b.dataset.kick));
  document.querySelectorAll('[data-persona]').forEach(e => e.onchange = () => socket.emit('botconfig', { id: e.dataset.persona, persona: e.value }));
  document.querySelectorAll('[data-botname]').forEach(b => b.onclick = () => { const n = prompt('Bot name:'); if (n) socket.emit('botconfig', { id: b.dataset.botname, name: n }); });
  const me = S.players.find(p => p.id === S.me), waiting = S.players.filter(p => !p.bot && p.connected && p.id !== S.hostId && !p.ready);
  const rb = $('#readyBtn'); rb.classList.toggle('hidden', S.isHost); rb.textContent = me?.ready ? '✅ Ready (tap to undo)' : "I'm ready";
  const enough = S.players.length >= S.min;
  $('#start').classList.toggle('hidden', !S.isHost); $('#start').disabled = !enough || waiting.length > 0;
  $('#lhint').textContent = S.isHost ? (!enough ? t('waitN', S.players.length, S.min) : waiting.length ? 'Waiting for ready: ' + waiting.map(p => p.name).join(', ') : t('readyH')) : t('waitHost');
  renderSettings();
}
$('#readyBtn').onclick = () => socket.emit('ready');
function renderSettings() {
  const el = $('#settings'), s = S.set;
  if (!S.isHost) {
    const on = ks => ks.filter(k => k === 'lovers' ? s.lovers : s.roles[k]).map(nm).join(', ') || '-';
    el.innerHTML = `<div class="tag">Host settings</div><div><b>Mode: ${modeName(s.mode)}</b> · ${s.night}s/turn, ${s.day}s day, bot skill: ${{ easy: 'Beginner', normal: 'Intermediate', hard: 'Expert' }[s.botLevel]}.<br>${t('rExtra')}: ${on(BASIC)}.<br>${t('rUnique')}: ${on([...UNIQUE, 'lovers'])}.</div>`;
    return;
  }
  if (el.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;
  const num = (n, l, v) => `<label>${l}<input type="number" name="${n}" value="${v}"></label>`;
  const chk = (n, l, v) => `<label><input type="checkbox" name="${n}" ${v ? 'checked' : ''}>${l}</label>`;
  const rchk = k => `<label><span><input type="checkbox" name="${k}" ${s.roles[k] ? 'checked' : ''}> ${nm(k)}</span><button type="button" class="info" data-info="${k}" aria-label="About ${nm(k)}">ℹ️</button></label>`;
  el.innerHTML = `<h3>Game mode</h3><div class="modegrid">${MODESD.map(([id, ic, name, d]) => `<button type="button" class="modecard ${s.mode === id ? 'on' : ''}" data-mode="${id}"><b>${ic} ${name}</b><span>${d}</span></button>`).join('')}</div>
    <h3>Game</h3>${num('night', 'Seconds per night turn', s.night)}${num('day', 'Day length (seconds)', s.day)}${num('mafia', 'Mafia count (0 = automatic)', s.mafia)}
    <label>Bot skill<select name="botLevel">${[['easy', 'Beginner'], ['normal', 'Intermediate'], ['hard', 'Expert']].map(([v, l]) => `<option value="${v}" ${s.botLevel === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <p class="tag">Beginner: guesses and never bluffs. Intermediate: reacts to mentions, sometimes bluffs, allies hold territory in map modes. Expert: remembers votes and silence, bluffs, and learns how your table plays.</p>
    <div class="chk">${chk('reveal', 'Reveal role on death', s.reveal)}${chk('lastWords', 'Last words', s.lastWords)}${chk('events', 'Random events', s.events)}${chk('anon', 'Anonymous voting', s.anon)}${chk('filter', 'Profanity filter', s.filter)}${chk('coach', 'Bots explain their thinking after the game', s.coach)}</div>
    <label>Voice chat link<input type="text" name="voice" placeholder="https://meet.google.com/..." value="${esc(s.voice)}"></label>
    <h3>Roles</h3><div class="chk">${BASIC.map(rchk).join('')}</div>
    <h3 class="unique">${t('rUnique')}</h3><div class="chk unique">${UNIQUE.map(rchk).join('')}${chk('lovers', 'Lovers', s.lovers)}</div>`;
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => sendSettings({ mode: b.dataset.mode }));
  el.querySelectorAll('[data-info]').forEach(b => b.onclick = e => { e.preventDefault(); openRoleInfo(b.dataset.info); });
}
function sendSettings(over = {}) {
  if (!S?.isHost) return;
  const g = n => $('#settings').querySelector(`[name=${n}]`), roles = {};
  [...BASIC, ...UNIQUE].forEach(k => roles[k] = g(k).checked);
  socket.emit('settings', { night: g('night').value, day: g('day').value, mafia: g('mafia').value, voice: g('voice').value, botLevel: g('botLevel').value, mode: S.set.mode, roles,
    ...Object.fromEntries(['reveal', 'lastWords', 'events', 'anon', 'filter', 'lovers', 'coach'].map(k => [k, g(k).checked])), ...over });
}
$('#settings').onchange = () => sendSettings();

// ---------- gameplay ----------
function actions() {
  if (!S.alive || S.spectator) return [];
  const d = S.done, f = d.fin, r = S.role, A = (type, ok) => ({ type, label: t('a_' + type.replace('inspect', 'inspect').replace('witchsave', 'save').replace('witchpoison', 'poison').replace('sk', 'kill')), ok });
  if (S.phase === 'day') return S.silenced === S.me ? [] : [{ type: 'vote', label: t('vote'), ok: p => p.id !== S.me }];
  if (S.phase !== 'night' || S.turn !== myGrp()) return [];
  const out = [], other = p => p.id !== S.me;
  if (isM(r)) out.push(A('kill', p => !isM(p.role)));
  if (r === 'silencer' && !f.silencer) out.push(A('silence', p => !isM(p.role)));
  if (r === 'jailer' && !f.jailer && !S.jailee) out.push(A('jail', other));
  if (r === 'pirate' && !f.pirate) out.push(A('duel', other));
  if (r === 'plaguebearer' && !f.plaguebearer) out.push(A('infect', other));
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
  return S.alive && S.phase === 'night' && S.turn === myGrp() && ((r === 'vigilante' && S.shots > 0 && !f.vigilante) || (r === 'witch' && !f.witch && (S.potions.save + S.potions.poison > 0)) || (r === 'serialkiller' && !f.serialkiller) || (r === 'silencer' && !f.silencer) || (r === 'jailer' && !f.jailer && !S.jailee) || (r === 'pirate' && !f.pirate) || (r === 'survivor' && !f.survivor) || (r === 'plaguebearer' && !f.plaguebearer));
}

// ---------- metropolitan map + market (English only) ----------
const DN = { financial: 'Financial Center', industrial: 'Industrial Ward', hub: 'Central Hub', docks: 'The Docks', heights: 'Residential Heights' };
const DY = { financial: 35, industrial: 15, hub: 10, docks: 20, heights: 15 };
const DA = { hub: ['financial', 'industrial', 'docks', 'heights'], financial: ['hub', 'industrial', 'docks'], industrial: ['hub', 'financial', 'heights'], docks: ['hub', 'financial', 'heights'], heights: ['hub', 'industrial', 'docks'] };
const FACI = { financial: ['Freeze Assets', 'player'], industrial: ['Sabotage', 'district'], hub: ['Subpoena', 'player'], docks: ['Contraband', null], heights: ['Eavesdrop', null] };
const FHINT = { financial: 'Freeze a player\'s IP today', industrial: 'Disable another district\'s facility tomorrow', hub: 'Publicly reveal a player\'s recent moves', docks: 'Next night action ignores jammers', heights: 'Intercept a line from a private channel' };
const ddist = (a, b) => (a === b ? 0 : DA[a].includes(b) ? 1 : 2);
const livingOpts = self => S.players.filter(p => p.alive && !p.spectator && (self || p.id !== S.me)).map(p => [p.id, p.name]);
function choose(title, opts, cb) {
  $('#rulesbody').innerHTML = `<h2>${esc(title)}</h2>` + opts.map(o => `<p><button data-v="${o[0]}">${esc(o[1])}</button></p>`).join('');
  $('#rulesbody').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { $('#rules').close(); cb(b.dataset.v); });
  $('#rules').showModal();
}
const ITEMS = [
  ['Judicial and voting', [['proxy', 'Buy an extra vote', 25, 'player'], ['indict', 'Call Special Indictment (vote now)', 40], ['donate', 'Donate 25 to your faction fund', 25], ['veto', 'Executive Veto (spends 100 from the fund)', 0]]],
  ['Logistics', [['longrange', 'Long-Range Kit (reach targets 2 districts away)', 35, null, 1], ['hire', 'Hire a bodyguard for one night (player)', 45, 'player']]],
  ['Intel', [['wiretap', 'Untraceable Wiretap (player or district)', 50, 'both', 1], ['scraps', 'Intercept Scraps', 35]]],
  ['Black Market', [['kevlar', 'Kevlar Body Armor', 60, null, 1], ['jammer', 'Signal Jammer (district)', 40, 'district', 1], ['dossier', 'Fabricated Dossier (frame a player)', 40, 'player', 1]]],
];
function openShop() {
  $('#rulesbody').innerHTML = `<h2>🛒 Market · ${S.ip} IP</h2><p class="tag">${S.discount ? 'Your faction holds the Industrial Ward: Black Market items are 25% off. ' : ''}Night actions on targets 1 district away cost +10 IP; 2 away needs a Long-Range Kit.</p>` +
    ITEMS.map(([h, items]) => `<h3>${h}</h3>` + items.map(([id, label, cost, , bm]) => `<p><button data-item="${id}">${esc(label)}${id === 'veto' ? ` (fund ${S.fund}${S.veto ? ', armed' : ''})` : ` · ${bm && S.discount ? Math.ceil(cost * .75) : cost} IP`}</button></p>`).join('')).join('');
  $('#rulesbody').querySelectorAll('[data-item]').forEach(b => b.onclick = () => {
    const it = ITEMS.flatMap(x => x[1]).find(i => i[0] === b.dataset.item), tg = it[3]; $('#rules').close();
    if (!tg) return socket.emit('act', { type: 'buy', item: it[0] });
    const opts = tg === 'district' ? Object.entries(DN) : tg === 'player' ? livingOpts(true) : [...livingOpts(true), ...Object.entries(DN)];
    choose(it[1], opts, v => socket.emit('act', { type: 'buy', item: it[0], target: v }));
  });
  $('#rules').showModal();
}
const NODE = { financial: [80, 70], industrial: [340, 70], hub: [210, 150], docks: [80, 230], heights: [340, 230] };
const EDGES = [['hub', 'financial'], ['hub', 'industrial'], ['hub', 'docks'], ['hub', 'heights'], ['financial', 'industrial'], ['industrial', 'heights'], ['heights', 'docks'], ['docks', 'financial']];
let selDist = null;
function buildMap() {
  $('#map').innerHTML = `<svg viewBox="0 0 420 300" role="img" aria-label="City map">${EDGES.map(([a, b]) => `<line class="edge" x1="${NODE[a][0]}" y1="${NODE[a][1]}" x2="${NODE[b][0]}" y2="${NODE[b][1]}"/>`).join('')}${Object.keys(NODE).map(d => `<g class="node" data-d="${d}"><rect x="${NODE[d][0] - 62}" y="${NODE[d][1] - 34}" width="124" height="68" rx="14"/><text class="nl" x="${NODE[d][0]}" y="${NODE[d][1] - 15}" text-anchor="middle">${DN[d]}</text><text class="ny" x="${NODE[d][0]}" y="${NODE[d][1] - 3}" text-anchor="middle">+${DY[d]}/night</text><text class="ld" x="${NODE[d][0]}" y="${NODE[d][1] + 29}" text-anchor="middle"></text></g>`).join('')}<g id="toks"></g></svg>`;
  $('#map').querySelectorAll('.node').forEach(n => n.onclick = () => { selDist = n.dataset.d; renderMetro(); });
}
function renderMetro() {
  const el = $('#metro');
  if (!S.metro || S.spectator) return el.classList.add('hidden');
  el.classList.remove('hidden');
  if (!$('#map svg')) buildMap();
  if (!selDist) selDist = S.pos;
  const day = S.phase === 'day' && S.alive, step = tutM();
  $('#mapbar').innerHTML = `<b>💰 ${S.ip ?? 0} IP</b><span class="tag">📍 ${DN[S.pos] || '?'}${S.frozen ? ' · ❄️ frozen' : ''}${S.kevlar ? ' · 🦺 armor' : ''}${S.longRange ? ' · 🎯 kit' : ''}${S.smug ? ' · 📦 contraband' : ''} · fund ${S.fund}${S.veto ? ' (veto armed)' : ''}</span><button id="shopBtn" ${day ? '' : 'disabled'}>🛒 Market</button>`;
  $('#shopBtn').onclick = openShop; $('#shopBtn').classList.toggle('pulse', step === 4);
  document.querySelectorAll('#map .node').forEach(n => {
    const d = n.dataset.d;
    n.classList.toggle('me', S.pos === d); n.classList.toggle('sel', selDist === d); n.classList.toggle('sab', !!S.sab[d]); n.classList.toggle('danger', (S.danger || []).includes(d));
    n.classList.toggle('pulse', step === 3 && ddist(S.pos, d) === 1 && !S.moved);
    n.querySelector('.ld').textContent = (S.leads[d] ? '★ you lead' : '') + (S.sab[d] ? ' ⚠ sabotaged' : '') + ((S.danger || []).includes(d) ? ' ☠ collapsing' : '');
  });
  const groups = {}, keep = new Set(), toks = $('#toks');
  S.players.filter(p => p.pos && p.alive && !p.spectator).forEach(p => (groups[p.pos] = groups[p.pos] || []).push(p));
  Object.entries(groups).forEach(([d, arr]) => arr.sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((p, i) => {   // avatars walk along the lines between districts
    keep.add('tok-' + p.id);
    const cols = Math.min(arr.length, 4), x = NODE[d][0] + ((i % 4) - (cols - 1) / 2) * 24, y = NODE[d][1] + 19 + Math.floor(i / 4) * 22;
    let tk = document.getElementById('tok-' + p.id);
    if (!tk) { tk = document.createElementNS('http://www.w3.org/2000/svg', 'g'); tk.id = 'tok-' + p.id; tk.innerHTML = '<title></title><circle r="11"></circle><text y="4" text-anchor="middle"></text>'; tk.style.transition = 'none'; toks.appendChild(tk); tk.style.transform = `translate(${x}px,${y}px)`; void tk.getBoundingClientRect(); tk.style.transition = ''; }
    tk.style.transform = `translate(${x}px,${y}px)`;
    tk.setAttribute('class', 'tok' + (p.id === S.me ? ' mine' : '') + (p.cos && p.cos.frame ? ' frame-' + p.cos.frame : ''));
    let hue = 0; for (const c of p.name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
    tk.querySelector('circle').style.fill = `hsl(${hue} 45% 42%)`; tk.querySelector('text').textContent = p.av || p.name[0].toUpperCase(); tk.querySelector('title').textContent = p.name;
  }));
  [...toks.children].forEach(c => { if (!keep.has(c.id)) c.remove(); });
  const d = selDist, here = S.players.filter(p => p.pos === d && p.alive && !p.spectator);
  const mv = day && d !== S.pos && !S.moved ? `<button data-move="${d}">${ddist(S.pos, d) === 2 ? 'Express ($15)' : 'Move here'}</button>` : '';
  const fc = day && S.pos === d && !S.facUsed && !S.sab[d] ? `<button data-fac="${d}" title="${FHINT[d]}">${FACI[d][0]}</button>` : '';
  $('#mapinfo').innerHTML = `<b>${DN[d]}</b> <span class="tag">+${DY[d]}/night · ${here.length} here · ${FHINT[d]}</span><div class="tp">${here.map(p => `<span class="chip">${avatar(p)}${esc(p.name)}</span>`).join('') || '<span class="tag">empty</span>'}</div><div class="acts">${mv}${fc}</div>`;
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => socket.emit('act', { type: 'move', target: b.dataset.move }));
  document.querySelectorAll('[data-fac]').forEach(b => b.onclick = () => {
    const k = FACI[b.dataset.fac][1];
    if (!k) return socket.emit('act', { type: 'facility' });
    choose(FACI[b.dataset.fac][0], k === 'player' ? livingOpts(false) : Object.entries(DN).filter(([x]) => x !== 'industrial'), v => socket.emit('act', { type: 'facility', target: v }));
  });
}
function renderBanner() {
  const b = $('#banner'), lwName = S.players.find(p => p.id === S.lw)?.name, living = S.players.filter(p => p.alive && !p.spectator).length;
  const mine = S.turn === myGrp();
  let x;
  if (S.phase === 'over') x = { town: t('winTown'), mafia: t('winMafia'), jester: t('winJester'), serialkiller: t('winSK'), pirate: t('winPirate'), plague: t('winPlague'), red: t('winRed'), blue: t('winBlue') }[S.winner] + (S.awards.length ? t('seeRecap') : '');
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
  if (S.team) x += ` You are on the ${S.team} team: your Mafia attack the rival team. Lose all your Mafia and you lose.`;
  if (S.duelFor) x = '⚔️ A Pirate challenges you to a duel! Pick your move before time runs out.';
  const note = S.notes.at(-1); if (note && S.role === 'detective') x += '  ' + note;
  if (S.jailed) x = '⛓️ You are in jail tonight. You cannot use your power. You can talk privately with the Jailer.';
  if (S.jailee) x += ' Prisoner: ' + (S.players.find(p => p.id === S.jailee)?.name || '?') + '.';
  b.textContent = x;
  if (S.jailee && S.exec > 0 && S.phase === 'night') b.innerHTML += ` <button id="exec" class="danger">Execute prisoner (${S.exec} left)</button>`;
  if (S.alive && S.phase === 'day' && !S.paused && !S.spectator) b.innerHTML += ' <button id="pollBtn">📊 Poll</button>';
  $('#exec') && ($('#exec').onclick = () => { if (confirm('Execute the prisoner at dawn?')) socket.emit('act', { type: 'execute' }); });
  if (S.duelFor) b.innerHTML += MOVEL.map(([k, l]) => ` <button data-dm="${k}">${l}</button>`).join('');
  if (S.role === 'survivor' && S.alive && S.phase === 'night' && S.turn === 'survivor' && S.vests > 0 && !S.done.fin.survivor) b.innerHTML += ` <button id="vest">🦺 Wear vest (${S.vests} left)</button>`;
  if (S.phase === 'day' && papers[S.day]) b.innerHTML += ' <button id="paperBtn2">📰 Paper</button>';
  document.querySelectorAll('[data-dm]').forEach(e => e.onclick = () => socket.emit('act', { type: 'dmove', move: e.dataset.dm }));
  $('#vest') && ($('#vest').onclick = () => socket.emit('act', { type: 'vest' }));
  $('#paperBtn2') && ($('#paperBtn2').onclick = () => openPaper(S.day));
  if (canHold()) b.innerHTML += ` <button id="hold">${t('hold')}</button>`;
  if (S.alive && S.phase === 'day' && !S.paused) b.innerHTML += ` <button id="skipday">${t('skipday', S.skipN, living)}</button>`;
  if (S.isHost && S.phase === 'over') b.innerHTML += ` <button id="rematch" class="primary">${t('rematch')}</button> <button id="again">${t('backLobby')}</button>`;
  $('#pollBtn') && ($('#pollBtn').onclick = () => choose('Start a poll', [['trust', 'Who do you trust the most?'], ['suspect', 'Who is the most suspicious?'], ['skip', 'Should we skip the day?']], k => socket.emit('poll', { kind: k })));
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
  Object.entries(S.proxy || {}).forEach(([id, n]) => { for (let i = 0; i < n; i++) (by[id] = by[id] || []).push('$'); });   // bought votes
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
    const tag = p.role ? `<span class="tag ${isM(p.role) ? 'mafia' : ''}">${portrait(p.role, 18)} ${nm(p.role)}</span>` : '';
    const extra = (S.mode === 'mystery' && p.look ? `<span class="tag">👤 ${p.look.hair} hair · ${p.look.coat} coat · ${p.look.item}</span>` : '') + (p.victim ? '<span class="tag">☠️ victim</span>' : '') + (S.mode === 'team' && p.team ? `<span class="tag team-${p.team}">${p.team === 'red' ? '🟥' : '🟦'} ${p.team}</span>` : '') + ((S.sickIds || []).includes(p.id) ? '<span class="tag">🦠 infected</span>' : '');
    const flags = (S.silenced === p.id ? `<span class="tag">${t('silencedTag')}</span>` : '') + (p.muted ? `<span class="tag">${t('mutedTag')}</span>` : '');
    const btns = mine.map(a => `<button data-id="${p.id}" data-type="${a.type}">${a.type === 'vote' ? '🗳️ ' : ''}${a.label}</button>`).join('') + (canWhisper && p.alive && p.id !== S.me ? `<button data-w="${p.id}" class="ghost">${t('whisper')}</button>` : '');
    const mod = p.id !== S.me && !p.bot ? `<button class="mini" data-mute="${esc(p.name)}" title="Mute for me">${mutedNames.has(p.name) ? '🔈' : '🔇'}</button>` + (S.isHost ? `<button class="mini hm" data-hmute="${p.id}" title="Mute for everyone">🚫</button>` : `<button class="mini hm" data-report="${p.id}" title="Report">⚑</button>`) : '';
    return `<div class="pcard ${p.alive ? '' : 'dead'} ${pick === p.id ? 'picked' : ''}" data-yv="${t('yourvote')}"><span class="n">${avatar(p)}${esc(p.name)}${p.connected ? '' : ' ⚠'}${mod}</span>${tag}${S.metro && p.pos ? `<span class="tag">📍 ${DN[p.pos]}</span>` : ''}${extra}${flags}<div class="acts">${btns}</div></div>`;
  }).join('');
  document.querySelectorAll('.pcard [data-type]').forEach(b => b.onclick = () => { if (b.dataset.type === 'duel') choose('Pick your duel move', MOVEL, v => socket.emit('act', { type: 'duel', target: b.dataset.id, move: v })); else socket.emit('act', { type: b.dataset.type, target: b.dataset.id }); });
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const v = prompt(t('whisperQ')); if (v) socket.emit('whisper', { to: b.dataset.w, text: v }); });
  document.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { const n = b.dataset.mute; mutedNames.has(n) ? mutedNames.delete(n) : mutedNames.add(n); localStorage.mutedNames = JSON.stringify([...mutedNames]); render(); });
  document.querySelectorAll('[data-hmute]').forEach(b => b.onclick = () => socket.emit('mute', b.dataset.hmute));
  document.querySelectorAll('[data-report]').forEach(b => b.onclick = () => { socket.emit('report', b.dataset.report); toast('⚑ OK'); });
  if (acts.some(a => a.type === 'vote')) { $('#players').insertAdjacentHTML('beforeend', `<div class="pcard"><span class="n">${t('skip')}</span><button id="skip">${t('abstain')}</button></div>`); $('#skip').onclick = () => socket.emit('act', { type: 'vote', target: null }); }
}
function renderFeeds() {
  const night = S.phase === 'night', jail = night && (S.jailed || !!S.jailee), mafiaChat = night && isM(S.role) && !jail, spy = night && S.role === 'spy' && S.alive;
  const line = m => m.sys ? `<div class="entry sys">${esc(m.text)}</div>` : `<div class="msg${/^[\p{Extended_Pictographic}\uFE0F\u200D\s]{1,16}$/u.test(m.text) ? ' big' : ''}"><b${m.c ? ` class="cc-${m.c}"` : ''}>${esc(m.name)}</b> ${esc(m.text)}</div>`;
  const msgs = jail ? S.jchat : (mafiaChat || spy) ? S.mchat : S.chat.filter(m => !mutedNames.has(m.name));
  const feed = $('#chat'), atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 30;
  feed.innerHTML = (mafiaChat ? `<div class="entry">${t('mafiaInfo')}</div>` : '') + (spy ? `<div class="entry">${t('spyInfo')}</div>` : '') + (jail ? '<div class="entry">⛓️ Private jail chat. Only the Jailer and the prisoner see this.</div>' : '') + (night && !mafiaChat && !spy && !jail ? `<div class="entry">${t('nightClosed')}</div>` : '') +
    msgs.map(line).join('') + (night ? '' : S.whispers.map(w => `<div class="msg whisper"><b>${esc(w.from === S.players.find(p => p.id === S.me)?.name ? 'You → ' + w.to : w.from + ' → you')}</b> ${esc(w.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  $('#deadfeed').innerHTML = `<div class="entry">${t('deadInfo')}</div>` + S.dchat.map(line).join('');
  const inGame = ['night', 'day', 'lastwords'].includes(S.phase), dead = !S.alive;
  const canPublic = S.phase === 'over' || (S.phase === 'day' && S.alive && S.silenced !== S.me && S.event !== 'blackout') || (S.phase === 'lastwords' && S.lw === S.me) || ((mafiaChat || jail) && S.alive);
  const formOn = tab === 'dead' ? (dead && inGame) || S.phase === 'over' : tab === 'chat' ? !(dead && inGame) : false;
  $('#chatform').classList.toggle('hidden', !formOn); $('#emojis').classList.toggle('hidden', !formOn);
  const can = tab === 'dead' ? true : canPublic; $('#msg').disabled = !can; document.querySelectorAll('#emojis button').forEach(b => b.disabled = !can);
  $('#log').innerHTML = S.log.map(l => `<div class="entry">${esc(l.text)}</div>`).join('') + S.notes.map(n => `<div class="entry note">Private: ${esc(n)}</div>`).join('');
  $('#recap').innerHTML = S.phase !== 'over' ? `<div class="entry">${t('recapWait')}</div>` :
    `<div class="recap"><h4>${t('awards')}</h4>${S.awards.map(a => `<div class="msg">${esc(a)}</div>`).join('') || '-'}<h4>${t('whoWas')}</h4>${S.players.filter(p => !p.spectator).map(p => `<div class="entry">${esc(p.name)}: ${portrait(p.role, 18)} ${nm(p.role)}</div>`).join('')}<h4>${t('nightBy')}</h4>${S.story.map(x => `<div class="entry">${esc(x)}</div>`).join('')}<div class="entry"><a href="history.html" style="color:var(--accent)">${t('history')} →</a></div></div>`;
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

// ---------- sunset / dawn transition, falling lights, fog ----------
function trans(kind) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = $('#trans'); el.className = ''; void el.offsetWidth; el.className = kind; setTimeout(() => { el.className = ''; }, 3000);
}
$('#fx').innerHTML = Array.from({ length: 16 }, () => `<i class="mote" style="left:${Math.random() * 100}%;animation-duration:${9 + Math.random() * 12}s;animation-delay:${-Math.random() * 20}s"></i>`).join('');

// ---------- animated role dealing ----------
function deal() {
  const el = $('#deal'), c = el.querySelector('.rcard');
  c.className = 'rcard dealing';
  el.querySelector('.front').className = 'face front' + (cosSel().back ? ' cb-' + cosSel().back : '');
  el.querySelector('.front').innerHTML = '<b>🎭</b>Dealing your role...';
  el.querySelector('.back').innerHTML = `${portrait(S.role, 120)}<span class="tag">${esc(t('youare', ''))}</span><strong>${esc(nm(S.role))}</strong><span class="tag" style="font-size:.8rem">${esc(desc(S.role))}</span>`;
  el.classList.remove('hidden');
  setTimeout(() => c.classList.add('flipped'), 1400);
  clearTimeout(deal.t); deal.t = setTimeout(() => el.classList.add('hidden'), 6500);
}
$('#deal').onclick = () => $('#deal').classList.add('hidden');

// ---------- generated phase music (WebAudio, no files) ----------
let musicOn = localStorage.music !== '0', mTick = null, mi = 0;
const mtone = (f, d, v = .04, type = 'sine') => { if (musicOn && !muted) tone(f, d, 0, type, v); };
function musicMode() {
  if (!S || ['lobby', 'over'].includes(S.phase)) return null;
  if (S.phase === 'night') return 'night';
  if (S.phase === 'day') { const left = S.endsAt && S.dur ? (S.endsAt - Date.now()) / S.dur : 1, votes = Object.values(S.votes || {}).filter(Boolean).length; return left < 0.3 || votes >= 2 ? 'vote' : 'day'; }
  return 'night';
}
function musicStep() {
  const m = musicMode(); if (!m) return; mi++;
  if (m === 'day') mtone([262, 330, 392, 523, 392, 330, 294, 349][mi % 8], .7, .035, 'triangle');
  else if (m === 'night') { if (mi % 8 === 1) mtone(55, 3.5, .06); if (Math.random() < .25) mtone([220, 262, 311, 330][Math.floor(Math.random() * 4)], 1.4, .025); }
  else { if (mi % 2 === 0) { mtone(60, .18, .12); setTimeout(() => mtone(50, .2, .1), 150); } if (mi % 4 === 0) mtone(466, .5, .02, 'sawtooth'); }   // heartbeat while the vote is tense
}
function syncMusic() { const want = musicOn && S && !['lobby', 'over'].includes(S.phase); if (want && !mTick) mTick = setInterval(musicStep, 450); if (!want && mTick) { clearInterval(mTick); mTick = null; } }
const setMusicLabel = () => { $('#mus').textContent = musicOn ? 'Music on' : 'Music off'; };
$('#mus').onclick = () => { musicOn = !musicOn; localStorage.music = musicOn ? '1' : '0'; setMusicLabel(); syncMusic(); };
setMusicLabel();
document.addEventListener('click', () => { if (ac) ac.resume(); }, { once: false });

// ---------- polls ----------
function renderPoll() {
  const el = $('#poll'), p = S.poll;
  if (!p || !['day', 'lastwords'].includes(S.phase)) return el.classList.add('hidden');
  el.classList.remove('hidden');
  const tot = p.counts.reduce((a, b) => a + b, 0) || 1, left = Math.max(0, Math.round((p.endsAt - Date.now()) / 1000));
  el.innerHTML = `<div class="bh"><span>📊 ${esc(p.q)}</span><span class="tag">by ${esc(p.by)} · ${p.closed ? 'closed' : left + 's'}</span></div>` +
    p.opts.map((o, i) => `<button class="popt ${p.mine === i ? 'mine' : ''}" data-i="${i}" ${p.closed || !S.alive ? 'disabled' : ''}><span class="pbar" style="width:${p.counts[i] / tot * 100}%"></span><span class="plabel">${esc(o)}</span><b>${p.counts[i]}</b></button>`).join('');
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => socket.emit('pollvote', +b.dataset.i));
}

// ---------- emote wheel + stickers ----------
const WHEEL = ['😂', '😱', '🤔', '👀', '🔪', '👍', '😈', '🙏', '😡', '🤫', '💀', '🎭'];
const STICKERS = ['🕵️', '🔍', '🩸', '🔫', '🧪', '🃏', '🛡️', '🤐', '⚖️', '🗳️', '🌙', '☀️', '🏠', '👑', '🎩', '💃', '🕶️', '⛓️', '🔨', '💔', '🔥', '🎉', '🥳', '😎', '😴', '🤥', '🫣', '😇', '🥶', '🤯', '🙄', '😭', '🤝', '🫡', '💯', '🚨'];
function toggleEmotes() {
  const el = $('#emotes'); if (!el.classList.contains('hidden')) return el.classList.add('hidden');
  el.innerHTML = `<div class="wheel">${WHEEL.map((e, i) => `<button style="--a:${i * 30}deg">${e}</button>`).join('')}<span class="hubl">React</span></div><div class="stk">${STICKERS.map(e => `<button>${e}</button>`).join('')}</div>`;
  el.classList.remove('hidden');
}
$('#emotes').onclick = e => { if (e.target.tagName === 'BUTTON' && !$('#msg').disabled) socket.emit('chat', { text: e.target.textContent }); };
$('#emojis').insertAdjacentHTML('beforeend', '<button type="button" id="moreEmo" title="More reactions">＋</button>');
$('#emojis').onclick = e => { if (e.target.id === 'moreEmo') return toggleEmotes(); if (e.target.tagName === 'BUTTON' && !e.target.disabled) socket.emit('chat', { text: e.target.textContent }); };

// ---------- quality: connection banner, keyboard, accessibility ----------
socket.on('disconnect', () => $('#conn').classList.remove('hidden'));
socket.on('connect', () => $('#conn').classList.add('hidden'));
$('#name').onkeydown = $('#code').onkeydown = e => { if (e.key === 'Enter') ($('#code').value ? $('#join') : $('#create')).click(); };
[['name', 'Your name'], ['pw', 'Room password'], ['code', 'Room code'], ['msg', 'Chat message']].forEach(([i, l]) => $('#' + i).setAttribute('aria-label', l));

// ---------- game modes, role info, alignment ----------
const MODESD = [
  ['classic', '🎭', 'Classic', 'The original: Town against the Mafia.'],
  ['metro', '🏙️', 'Metropolitan', 'A map of five districts with IP, a Market, movement and control bonuses.'],
  ['royale', '🌋', 'Battle Royale', 'Map mode where one more district collapses every day. Stay in the safe zone. Best with 8 to 15 players (5 minimum).'],
  ['team', '🟥', 'Team Battle', 'Two teams, each with its own hidden Mafia who attack the rival team. Lose all your Mafia and you lose. 6+ players.'],
  ['coop', '🤝', 'Co-op Mystery', 'Everyone is Town. Hidden AI Mafia join the table and play differently each game. 2+ players.'],
  ['mystery', '🔎', 'Murder Mystery', 'A body is found at the start and a true clue about the killer appears each day. 5+ players.'],
];
const modeName = id => (MODESD.find(m => m[0] === id) || MODESD[0])[2];
const ALIGN = { bad: ['mafia', 'godfather', 'silencer'], neutral: ['jester', 'serialkiller', 'survivor', 'pirate', 'plaguebearer'] };
const alignOf = k => (ALIGN.bad.includes(k) ? 'bad' : ALIGN.neutral.includes(k) ? 'neutral' : 'good');
const BADGE = { good: ['Good', '#2ecc71'], bad: ['Bad', '#ef4b57'], neutral: ['Neutral', '#f0b95a'] };
const WINS = { jester: 'Wins by getting lynched.', serialkiller: 'Wins as the last one standing.', survivor: 'Wins by being alive when the game ends, even if their side loses.', pirate: 'Wins by winning two duels and staying alive.', plaguebearer: 'Wins by infecting every living player. All the infected win with them.', good: 'Wins with the Town: eliminate all Mafia and other threats.', bad: 'Wins with the Mafia: equal or outnumber everyone else.' };
const badge = k => `<span class="badge" style="background:${BADGE[alignOf(k)][1]}">${BADGE[alignOf(k)][0]}</span>`;
function openRoleInfo(k) {
  $('#rulesbody').innerHTML = `<div class="rinfo">${portrait(k, 76)}<div><h2>${esc(nm(k))}</h2>${badge(k)}</div></div><p>${esc(desc(k))}</p><p class="tag">${esc(WINS[k] || WINS[alignOf(k)])}</p>`;
  if (!$('#rules').open) $('#rules').showModal();
}
const MOVEL = [['strike', '⚔️ Strike (beats Trick)'], ['trick', '🎭 Trick (beats Guard)'], ['guard', '🛡️ Guard (beats Strike)']];

// ---------- morning results card + daily newspaper ----------
const papers = {};
const VERB = { killed: 'was killed', shot: 'was shot', poisoned: 'was poisoned', executed: 'was executed', duel: 'died in a duel', guard: 'died protecting someone', heart: 'died of a broken heart', collapse: 'was caught in a collapse', lynched: 'was lynched', left: 'left the game' };
function compileMorning(lines) {
  const R = { deaths: [], saves: [], sil: [], warn: [], ev: [], clues: [] };
  lines.forEach(x => {
    const m = x.match(/^(.+?) was (killed|lynched|shot|poisoned|overcome|removed|executed|caught)[^.]*\.(?: They were (\w+)\.)?/);
    if (m) R.deaths.push({ name: m[1], kind: KIND(x), role: m[3] });
    else if (/was attacked but/.test(x)) R.saves.push(x);
    else if (/was silenced/.test(x)) R.sil.push(x);
    else if (/Zone warning/.test(x)) R.warn.push(x);
    else if (/New clue/.test(x)) R.clues.push(x.replace('New clue: ', ''));
    else if (/Subpoena|full moon|storm|blackout/i.test(x)) R.ev.push(x);
  });
  return R;
}
function showMorning(day, lines) {
  const R = compileMorning(lines); papers[day] = R;
  const rows = [...R.deaths.map(d => `<div class="rline">☠️ <b>${esc(d.name)}</b> ${VERB[d.kind] || 'died'}${d.role ? ` · ${portrait(d.role, 18)} ${esc(nm(d.role))}` : ''}</div>`), ...R.saves.map(x => `<div class="rline">🛡️ ${esc(x)}</div>`), ...R.sil.map(x => `<div class="rline">🤐 ${esc(x)}</div>`), ...R.warn.map(x => `<div class="rline">⚠️ ${esc(x)}</div>`), ...R.clues.map(x => `<div class="rline">🔎 ${esc(x)}</div>`), ...R.ev.map(x => `<div class="rline">🌗 ${esc(x)}</div>`)];
  if (!R.deaths.length && !R.saves.length) rows.unshift('<div class="rline">🕊️ A quiet night. Nobody died.</div>');
  const el = $('#results'); el.innerHTML = `<h3>☀️ Morning ${day}</h3>${rows.join('')}<div class="row"><button id="rpaper" class="primary">📰 Read the paper</button><button id="rclose">Close</button></div>`;
  el.classList.remove('hidden');
  $('#rclose').onclick = () => el.classList.add('hidden'); $('#rpaper').onclick = () => { el.classList.add('hidden'); openPaper(day); };
  clearTimeout(showMorning.t); showMorning.t = setTimeout(() => el.classList.add('hidden'), 15000);
}
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const HEAD = {
  killed: ['{n} FOUND DEAD; TOWN "DEEPLY CONCERNED," SAYS EVERYONE', 'LOCAL RESIDENT {n} NO LONGER LOCAL, NOR RESIDENT', '{n} DEAD. POLICE BLAME "FOUL PLAY" OR "BAD LUCK"', 'BREAKING: {n} HAS LEFT THE CHAT (PERMANENTLY)'],
  shot: ['{n} SHOT BY MYSTERY VIGILANTE; NEIGHBORS SPLIT ON "FAIR ENOUGH"', 'GUNFIRE AT DAWN: {n} DOWN, ALIBIS UP'],
  poisoned: ['{n} POISONED; SOUP SALES PLUNGE', 'SUSPICIOUS TEA CLAIMS {n}'],
  executed: ['{n} EXECUTED BY JAILER; "I HAD A BAD FEELING," HE SAYS', 'NIGHT IN JAIL ENDS BADLY FOR {n}'],
  duel: ['{n} FALLS IN PIRATE DUEL; WITNESS: "IT WAS MOSTLY ROCK-PAPER-SCISSORS"', 'SWORDS DRAWN, {n} LOSES; HARBOR CLOSED FOR DRAMA'],
  guard: ['BRAVE BODYGUARD {n} TAKES THE HIT; TIPS UP 300%'],
  heart: ['{n} DIES OF BROKEN HEART; ROMANCE CRITICS DEVASTATED'],
  collapse: ['{n} LOST IN COLLAPSE; ARCHITECTS "NOT SURPRISED"'],
  left: ['{n} LEAVES TOWN; LEAVES NO FORWARDING ADDRESS'],
  lynched: ['{n} LYNCHED; TOWN CALLS IT "A GROUP DECISION"'],
  saved: ['MIRACLE SAVE: ATTACK FAILS, VICTIM "JUST HAD A NAP"', 'DOCTORS ARE HEROES (THIS WEEK)', 'DEATH TAKES A HOLIDAY; GOES HOME EMPTY-HANDED'],
  quiet: ['NOTHING HAPPENED; NEIGHBORS BAFFLED BY PEACE', 'QUIET NIGHT RAISES SUSPICION OF QUIET NIGHT', 'ALL IS WELL; EVERYONE SUSPICIOUSLY WELL RESTED'],
};
function paperHTML(day) {
  const R = papers[day] || { deaths: [], saves: [], sil: [], warn: [], ev: [], clues: [] };
  const rnd = mulberry(day * 7919 + (S.code || 'X').charCodeAt(0) * 31), P = a => a[Math.floor(rnd() * a.length)];
  const live = S.players.filter(p => p.alive && !p.spectator).map(p => p.name), who = () => P(live.length ? live : ['A concerned citizen']);
  const d0 = R.deaths[0], vic = d0 ? esc(d0.name) : '';
  const main = d0 ? P(HEAD[d0.kind] || HEAD.killed).replace('{n}', esc(d0.name.toUpperCase())) : R.saves.length ? P(HEAD.saved) : P(HEAD.quiet);
  const lede = d0 ? P([`Residents woke to grim news. ${vic} ${VERB[d0.kind] || 'was found dead'}${d0.role ? ` and was, according to records, a ${esc(nm(d0.role))}` : ''}. Police are "looking into it" with great enthusiasm.`, `The town is in shock after ${vic} ${VERB[d0.kind] || 'died'}. Neighbors describe the victim as "someone who existed."`, `Sources confirm ${vic} ${VERB[d0.kind] || 'died'}. Authorities urge calm, snacks, and slightly more suspicion.`]) : P(['Nothing to report except everyone looking at everyone else. Experts call this "Tuesday."', 'The night passed without incident. Locals are suspicious of how suspiciously fine this is.', 'No crimes were reported. The crime reporter has been reassigned to weather.']);
  const side = R.deaths.slice(1).map(d => `<li>${P(HEAD[d.kind] || HEAD.killed).replace('{n}', esc(d.name.toUpperCase()))}</li>`).join('') + R.saves.map(() => `<li>${P(HEAD.saved)}</li>`).join('') + R.warn.map(x => `<li>${esc(x)}</li>`).join('');
  const sky = P(['Weather: 100% chance of suspicion.', 'Weather: cloudy with a chance of accusations.', "Weather: foggy. Much like everyone's alibis.", 'Weather: sunny, ideal for lynching.']);
  const horo = P(['Gemini: someone you trust is not who they say they are. Also, it is Tuesday.', 'Scorpio: a quiet friend knows more than they say. Vote accordingly.', 'Leo: do not eat anything a stranger offers. Especially soup.', 'Virgo: the stars say "maybe." The stars are no help.']);
  const ads = P(['FOR SALE: one slightly used alibi. Never lied to.', 'WANTED: honest person. No Mafia need apply (we checked).', 'LOST: my faith in everyone. Reward: new friends.', 'FREE: dramatic final speech. Practice on the town square.']);
  const quote = `"I saw nothing, heard nothing, and was definitely asleep," says ${esc(who())}.`;
  return `<div class="paper"><div class="mast">THE DAILY SUSPECT</div><div class="dateline">Morning ${day} · Price: one alibi</div><h1 class="headline">${main}</h1><p class="lede">${lede}</p>${side ? `<ul class="more">${side}</ul>` : ''}<p class="quote">${quote}</p><div class="cols"><div><b>Weather</b><br>${sky}</div><div><b>Horoscope</b><br>${horo}</div><div><b>Classifieds</b><br>${ads}</div></div></div>`;
}
function openPaper(day) {
  const days = Object.keys(papers).map(Number).sort((a, b) => a - b), i = days.indexOf(day);
  $('#paperbody').innerHTML = paperHTML(day) + `<div class="row"><button id="pprev" ${i > 0 ? '' : 'disabled'}>◀ Earlier</button><button id="pnext" ${i < days.length - 1 ? '' : 'disabled'}>Later ▶</button></div>`;
  $('#pprev').onclick = () => openPaper(days[i - 1]); $('#pnext').onclick = () => openPaper(days[i + 1]);
  if (!$('#paper').open) $('#paper').showModal();
}

// ---------- murder mystery case file ----------
function renderClues() {
  const el = $('#clues');
  if (S.mode !== 'mystery') return el.classList.add('hidden');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="bh"><span>🔎 Case file</span><span class="tag">${S.players.filter(p => p.victim).map(p => 'Victim: ' + esc(p.name)).join('')}</span></div>` + (S.clues.map(c => `<div class="rline">Day ${c.day}: ${esc(c.text)}</div>`).join('') || '<div class="tag">No clues yet.</div>') + "<div class=\"tag\">Every player's look is shown on their card. Use the clues to find the killer.</div>";
}

// ---------- town scene: houses, lamps, trees, sky ----------
function renderScene() {
  const ps = S.players.filter(p => !p.spectator), night = S.phase === 'night', W = Math.max(360, ps.length * 66 + 56);
  const hue = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const houses = ps.map((p, i) => {
    const x = 30 + i * 66, h = hue(p.name), v = h % 3, dead = !p.alive, out = dead && prevAlive[p.id] === true;
    const wall = `hsl(${h} 26% ${night ? 17 : 42}%)`, roof = `hsl(${(h + 35) % 360} 32% ${night ? 12 : 27}%)`;
    const win = (wx, wy, ww = 11, hh = 11) => `<rect class="wframe" x="${wx - 1.5}" y="${wy - 1.5}" width="${ww + 3}" height="${hh + 3}" rx="2"/><rect class="win ${out ? 'out' : dead ? 'off' : ''}" x="${wx}" y="${wy}" width="${ww}" height="${hh}" rx="1.5"/>${dead ? `<path class="board" d="M${wx} ${wy + 3}h${ww}M${wx} ${wy + 8}h${ww}"/>` : `<path class="pane" d="M${wx + ww / 2} ${wy}v${hh}M${wx} ${wy + hh / 2}h${ww}"/>`}`;
    let body;
    if (v === 0) body = `<rect x="${x}" y="52" width="48" height="30" style="fill:${wall}"/><polygon points="${x - 5},52 ${x + 24},28 ${x + 53},52" style="fill:${roof}"/><rect x="${x + 36}" y="31" width="7" height="14" style="fill:${roof}"/>${dead ? '' : `<circle class="smoke" cx="${x + 39.5}" cy="27" r="3"/><circle class="smoke s2" cx="${x + 41}" cy="22" r="2.5"/>`}${win(x + 6, 58)}${win(x + 31, 58)}<rect class="door" x="${x + 20}" y="66" width="9" height="16" rx="1.5"/>`;
    else if (v === 1) body = `<rect x="${x + 2}" y="38" width="44" height="44" style="fill:${wall}"/><rect x="${x - 1}" y="34" width="50" height="6" rx="1" style="fill:${roof}"/>${win(x + 8, 45)}${win(x + 29, 45)}${win(x + 8, 62, 11, 10)}<rect class="door" x="${x + 29}" y="66" width="10" height="16" rx="1.5"/>`;
    else body = `<rect x="${x - 2}" y="52" width="52" height="30" style="fill:${wall}"/><rect x="${x - 4}" y="46" width="56" height="7" rx="1" style="fill:${roof}"/><path class="awning" d="M${x - 4} 53h56l-5 9H${x + 1}z"/>${win(x + 4, 66, 18, 11)}<rect class="door" x="${x + 32}" y="66" width="10" height="16" rx="1.5"/>`;
    const stone = dead ? `<g class="tomb"><path d="M${x + 36} 82v-9a5 5 0 0 1 10 0v9z"/><path d="M${x + 41} 74v5M${x + 39} 76h4"/></g>` : '';
    const you = p.id === S.me ? `<path class="you" d="M${x + 24} 17l-5-8h10z"/>` : '';
    return `<g class="hs ${dead ? 'dead' : ''}"><title>${esc(p.name)}</title>${body}${stone}${you}<text class="hn" x="${x + 24}" y="95" text-anchor="middle">${esc(p.name.slice(0, 9))}</text></g>`;
  }).join('');
  const lamps = ps.map((p, i) => (i % 2 ? `<g class="lamp"><line x1="${20 + i * 66}" y1="82" x2="${20 + i * 66}" y2="63"/><circle cx="${20 + i * 66}" cy="61" r="${night ? 5 : 3}"/></g>` : '')).join('');
  const tree = x => `<g class="tree"><rect x="${x}" y="68" width="4" height="14"/><circle cx="${x + 2}" cy="64" r="9"/></g>`;
  const sky = night ? Array.from({ length: Math.round(W / 40) }, (_, i) => `<circle class="star" cx="${(i * 83 + 17) % W}" cy="${(i * 37) % 36 + 6}" r="${i % 3 ? 0.8 : 1.4}"/>`).join('') : `<ellipse class="cloud" cx="${W * 0.25}" cy="18" rx="24" ry="7"/><ellipse class="cloud c2" cx="${W * 0.6}" cy="30" rx="30" ry="8"/>`;
  const orb = night ? `<circle class="orb" cx="${W - 42}" cy="22" r="13"/><circle cx="${W - 46}" cy="19" r="2.4" class="crater"/><circle cx="${W - 38}" cy="26" r="1.8" class="crater"/>` : `<g class="rays" style="transform-origin:${W - 42}px 24px">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="${W - 42}" y1="6" x2="${W - 42}" y2="1" transform="rotate(${a} ${W - 42} 24)"/>`).join('')}</g><circle class="orb" cx="${W - 42}" cy="24" r="11"/>`;
  $('#scene').innerHTML = `<svg viewBox="0 0 ${W} 100" preserveAspectRatio="xMidYMax meet" role="img" aria-label="The town">${sky}${orb}<path class="hills" d="M0 74Q${W * 0.2} 48 ${W * 0.4} 68T${W * 0.8} 62 ${W} 70V100H0z"/>${tree(10)}${tree(W - 18)}${houses}${lamps}<rect class="ground" x="0" y="82" width="${W}" height="18"/><path class="road" d="M0 90H${W}"/></svg>`;
  prevAlive = Object.fromEntries(ps.map(p => [p.id, p.alive]));
}
