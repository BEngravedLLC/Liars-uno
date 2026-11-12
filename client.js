/* Liar's UNO Online — browser side */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const COLORS = ['red', 'yellow', 'green', 'blue'];
  const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const ACTIONS = ['skip', 'reverse', 'draw2'];
  const SYM = { red: '●', yellow: '✦', green: '▼', blue: '■' };
  const SHORT = { skip: '⊘', reverse: '⇄', draw2: '+2', wd4: '+4', wlc: '?!' };
  const NAMES = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wd4: 'Wild Draw 4', wlc: "Wild Liar's Challenge" };
  const AVATAR_COLORS = ['#e5322f', '#2f7fe0', '#36a85a', '#d99a00', '#9b4dd8', '#e05a9b'];
  let AVATARS = {}; // player id -> picture
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const label = (c) => {
    if (!c) return '?';
    if (c.value === 'wd4') return c.color ? `Wild Draw 4 (${cap(c.color)})` : 'Wild Draw 4';
    if (c.value === 'wlc') return NAMES.wlc;
    return `${cap(c.color)} ${NAMES[c.value] || c.value}`;
  };

  // ================= 1. The 7+ question =================
  const QUESTIONS = [
    { q: 'How many legs does a spider have?', a: '8', w: ['6', '10', 'Spiders walk on vibes'] },
    { q: 'What color do you get when you mix blue and yellow?', a: 'Green', w: ['Purple', 'Plaid', 'Invisible'] },
    { q: 'What sound does a cow make?', a: 'Moo', w: ['Quack', 'Beep boop', 'Meow (it\'s confused)'] },
    { q: 'How many days are in a week?', a: '7', w: ['5', '12', 'Depends how much homework you have'] },
    { q: 'What is 2 + 3?', a: '5', w: ['23', '4', 'A lot'] },
    { q: 'Which animal says "ribbit"?', a: 'Frog', w: ['Giraffe', 'Goldfish', 'Grandpa after a nap'] },
    { q: 'What do bees make?', a: 'Honey', w: ['Pizza', 'Phone calls', 'Glitter'] },
    { q: 'How many wheels does a bicycle have?', a: '2', w: ['3', '7', 'Zero, it floats'] },
    { q: 'What day comes after Tuesday?', a: 'Wednesday', w: ['Friday', 'Pancake Day', 'Tuesday 2'] },
    { q: 'Which one is the biggest?', a: 'Elephant', w: ['Mouse', 'Hamster', 'A really confident ant'] },
    { q: 'What shape has 3 sides?', a: 'Triangle', w: ['Circle', 'Square', 'A pancake'] },
    { q: 'What do you call a baby dog?', a: 'Puppy', w: ['Kitten', 'Tadpole', 'Mini-woof'] },
    { q: 'What color is a banana when it\'s ready to eat?', a: 'Yellow', w: ['Blue', 'Purple', 'Sparkly'] },
    { q: 'Where do penguins live?', a: 'Antarctica', w: ['The Sahara Desert', 'The Moon', 'Inside your freezer'] },
    { q: 'What do you use to brush your teeth?', a: 'A toothbrush', w: ['A hairbrush', 'A paintbrush', 'Your pet cat'] },
  ];
  const WRONG = [
    "Hmm... are you a toddler in a trench coat? Try this one 🧥",
    "Nope! The card police are watching you. 👮 Another go:",
    "Oof. That answer just got sent to timeout. Try again!",
    "Wrong! Even the goldfish got that one. 🐠 New question:",
    "Bzzzt! Your brain needs a juice box. 🧃 Try this:",
    "Not quite! Did a baby just grab the mouse? 👶 Another one:",
    "LOL no. Nice bluff though, save it for the game. 😏",
  ];
  let lastQ = -1;
  function askQuestion(msg) {
    let i;
    do { i = Math.floor(Math.random() * QUESTIONS.length); } while (i === lastQ);
    lastQ = i;
    const q = QUESTIONS[i];
    $('#gateQ').textContent = q.q;
    const opts = [q.a, ...q.w].sort(() => Math.random() - 0.5);
    const box = $('#gateOpts');
    box.innerHTML = '';
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o;
      b.onclick = () => {
        if (o === q.a) {
          try { sessionStorage.setItem('luno_gate', '1'); } catch {}
          showJoin();
        } else {
          b.classList.add('wrong');
          $('#gateMsg').textContent = WRONG[Math.floor(Math.random() * WRONG.length)];
          setTimeout(() => askQuestion(), 900);
        }
      };
      box.appendChild(b);
    });
    if (msg !== undefined) $('#gateMsg').textContent = msg;
  }

  // ================= 2. Join =================
  const params = new URLSearchParams(location.search);
  function showJoin() {
    $('#gate').classList.add('hidden');
    $('#join').classList.remove('hidden');
    $('#nameIn').value = store.get('luno_name') || '';
    $('#roomIn').value = (params.get('room') || store.get('luno_room') || 'UNO').toUpperCase();
    showPhoto();
    $('#nameIn').focus();
  }

  const socket = io();
  let joinInfo = null; // {name, room}
  let S = null; // latest state from the server

  function doJoin(name, room, cb) {
    const token = store.get('luno_token_' + room);
    socket.emit('join', { name, room, token, avatar: myPhoto }, (res) => {
      if (res && res.ok) {
        store.set('luno_token_' + res.room, res.token);
        store.set('luno_name', name);
        store.set('luno_room', res.room);
        joinInfo = { name, room: res.room };
        cb && cb(null);
      } else cb && cb((res && res.error) || 'Could not join.');
    });
  }

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#nameIn').value.trim();
    const room = ($('#roomIn').value.trim() || 'UNO').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name) { $('#joinErr').textContent = 'Type your name first!'; return; }
    doJoin(name, room, (err) => {
      if (err) { $('#joinErr').textContent = err; return; }
      $('#join').classList.add('hidden');
      $('#game').classList.remove('hidden');
      history.replaceState(null, '', '?room=' + encodeURIComponent(joinInfo.room));
    });
  });

  socket.on('connect', () => { if (joinInfo) doJoin(joinInfo.name, joinInfo.room); });
  socket.on('kicked', () => {
    if (joinInfo) store.del('luno_token_' + joinInfo.room);
    joinInfo = null;
    alertToast('The host removed you from the table.');
    $('#game').classList.add('hidden');
    $('#join').classList.remove('hidden');
  });

  socket.on('avatars', (map) => { AVATARS = map || {}; render(); });

  // ================= Profile picture =================
  let myPhoto = store.get('luno_avatar') || null;
  let photoForGame = false;
  function showPhoto() {
    $('#photoPreview').src = myPhoto || '';
    $('#photoPreview').classList.toggle('hidden', !myPhoto);
    $('#photoPlus').classList.toggle('hidden', !!myPhoto);
    $('#photoClear').classList.toggle('hidden', !myPhoto);
    $('#photoPickBtn').textContent = myPhoto ? 'Change picture' : 'Upload PNG, JPG or SVG';
  }
  const pickPhoto = () => { $('#photoFile').value = ''; $('#photoFile').click(); };
  $('#photoBtn').onclick = pickPhoto;
  $('#photoPickBtn').onclick = pickPhoto;
  $('#photoClear').onclick = () => { myPhoto = null; store.del('luno_avatar'); showPhoto(); };
  // Every picture (SVG too) gets drawn onto a 96px square and saved as a small PNG/JPG.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (file.size > 10 * 1024 * 1024) return reject(new Error('That file is huge! Try one under 10 MB.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        const w = img.naturalWidth || size, h = img.naturalHeight || size;
        const sc = Math.max(size / w, size / h);
        ctx.drawImage(img, (size - w * sc) / 2, (size - h * sc) / 2, w * sc, h * sc);
        URL.revokeObjectURL(url);
        let out = cv.toDataURL('image/png');
        if (out.length > 40000) {
          const flat = document.createElement('canvas');
          flat.width = flat.height = size;
          const fx = flat.getContext('2d');
          fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, size, size); fx.drawImage(cv, 0, 0);
          out = flat.toDataURL('image/jpeg', 0.85);
        }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that picture. Try a PNG, JPG or SVG.")); };
      img.src = url;
    });
  }
  $('#photoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      myPhoto = await shrinkImage(f);
      store.set('luno_avatar', myPhoto);
      showPhoto();
      if (photoForGame && joinInfo) { socket.emit('avatar', myPhoto); alertToast('Looking good! 📸'); }
    } catch (err) { alertToast(err.message); }
    photoForGame = false;
  });
  $('#meName').addEventListener('click', (e) => {
    if (!e.target.closest('.frame')) return;
    photoForGame = true;
    pickPhoto();
  });

  // ================= Toasts =================
  function alertToast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }
  socket.on('toast', alertToast);

  // ================= Chat =================
  function addMsg(m) {
    const log = $('#chatLog');
    const d = document.createElement('div');
    const mine = S && m.fromId === S.me;
    d.className = 'msg ' + (m.type === 'sys' ? 'sys' : '') + (mine ? ' mine' : '');
    d.innerHTML = m.type === 'sys' ? esc(m.text) : `<b>${esc(m.from)}:</b> ${esc(m.text)}`;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.appendChild(d);
    while (log.children.length > 200) log.firstChild.remove();
    if (atBottom || mine) log.scrollTop = log.scrollHeight;
    if (m.type === 'chat' && !mine && window.innerWidth <= 900 && !$('#side').classList.contains('open')) {
      alertToast(`💬 ${m.from}: ${m.text}`);
    }
  }
  socket.on('chatHistory', (list) => { $('#chatLog').innerHTML = ''; list.forEach(addMsg); $('#chatLog').scrollTop = 1e9; });
  socket.on('chat', addMsg);
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chatIn').value.trim();
    if (!v) return;
    socket.emit('chat', v);
    $('#chatIn').value = '';
  });

  // ================= Cards =================
  function cardHTML(c, extra = '') {
    if (!c) return `<div class="card back ${extra}"><span>LIAR'S</span></div>`;
    const wild = c.value === 'wd4' || c.value === 'wlc';
    const cls = wild ? 'wild' : c.color;
    const v = SHORT[c.value] || c.value;
    const tag = c.value === 'wlc' ? 'CHALLENGE' : '';
    return `<div class="card ${cls} ${extra}" data-id="${c.id ?? ''}" title="${esc((c.liar ? "Liar's card: " : '') + label(c))}">
      <span class="corner tl">${v}</span>
      <span class="big">${v}</span>
      <span class="corner br">${v}</span>
      ${!wild && c.color ? `<span class="sym">${SYM[c.color]}</span>` : ''}
      ${c.liar ? '<span class="liar-ring"></span>' : ''}
      ${tag ? `<span class="tagline">${tag}</span>` : ''}
    </div>`;
  }
  const colorOrder = { red: 0, yellow: 1, green: 2, blue: 3, null: 4 };
  const valOrder = (v) => (NUMBERS.includes(v) ? Number(v) : { skip: 10, reverse: 11, draw2: 12, wd4: 13, wlc: 14 }[v]);
  const sortHand = (h) => [...h].sort((a, b) => (colorOrder[a.color] - colorOrder[b.color]) || (valOrder(a.value) - valOrder(b.value)) || (a.liar - b.liar));

  const colorOf = (id) => AVATAR_COLORS[Math.max(0, S.players.findIndex((x) => x.id === id)) % AVATAR_COLORS.length];
  const avInner = (p) => (AVATARS[p.id] ? `<img src="${AVATARS[p.id]}" alt="">` : esc(p.name[0].toUpperCase()));
  function frameHTML(p, turn) {
    return `<div class="frame ${turn ? 'turn' : ''} ${p.connected ? '' : 'offline'}"><div class="av" style="background:${colorOf(p.id)}">${avInner(p)}</div></div>`;
  }
  const miniAv = (p) => `<span class="mini-av" style="background:${colorOf(p.id)}">${avInner(p)}</span>`;

  // ================= Helpers about state =================
  const me = () => S.players.find((p) => p.id === S.me);
  const pName = (id) => (S.players.find((p) => p.id === id) || {}).name || '?';
  const myTurn = () => S && S.turnId === S.me && S.phase === 'play';
  const playersInHand = () => S.players.filter((p) => p.inHand);
  const matches = (c) => c.value === 'wd4' || c.value === 'wlc' || c.color === S.currentColor || c.value === S.topValue;
  const isTruth = (card, claim) => card.value === claim.value && (card.value === 'wd4' || card.color === claim.color);
  const isMine = (st) => st && st.turnId === st.me && st.phase === 'play';
  const mustSubmit = (st) => st && st.phase === 'wlc-submit' && st.wlc && st.wlc.playerId !== st.me && !st.wlc.claims[st.me] && (st.players.find((p) => p.id === st.me) || {}).inHand;
  const canCall = (st) => st && st.phase === 'challenge' && st.pending && st.pending.playerId !== st.me && !st.pending.responded.includes(st.me) && (st.players.find((p) => p.id === st.me) || {}).inHand;

  // ================= Timers =================
  let pendingEnd = 0, pendingTotal = 10000, wlcEnd = 0;
  setInterval(() => {
    const bar = document.querySelector('#actionPanel .timer > div');
    if (!bar || !S) return;
    if (S.phase === 'challenge') bar.style.width = Math.max(0, (pendingEnd - Date.now()) / pendingTotal * 100) + '%';
    if (S.phase === 'wlc-submit') bar.style.width = Math.max(0, (wlcEnd - Date.now()) / 60000 * 100) + '%';
  }, 150);

  // ================= Sound (made in the browser, no files needed) =================
  let muted = store.get('luno_muted') === '1';
  let actx = null;
  function ac() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type = 'sine', vol = 0.15) {
    const a = ac(), t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(start, dur, vol = 0.2, freq = 2000) {
    const a = ac(), t = a.currentTime + start;
    const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  }
  const SFX = {
    flip: () => noise(0, 0.09, 0.35, 2600),
    draw: () => noise(0, 0.2, 0.18, 900),
    deal: () => { for (let i = 0; i < 7; i++) noise(i * 0.09, 0.06, 0.2, 2600); },
    turn: () => { tone(660, 0, 0.2, 'triangle', 0.22); tone(990, 0.14, 0.4, 'triangle', 0.22); },
    alert: () => { tone(880, 0, 0.1, 'square', 0.05); tone(1175, 0.13, 0.14, 'square', 0.05); },
    busted: () => { tone(160, 0, 0.5, 'sawtooth', 0.12); tone(120, 0.06, 0.5, 'sawtooth', 0.1); },
    truth: () => { tone(1046, 0, 0.55, 'sine', 0.18); tone(1568, 0.08, 0.6, 'sine', 0.1); },
    uno: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.2, 'square', 0.07)); },
    whoosh: () => noise(0, 0.35, 0.18, 500),
    win: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.16)); },
  };
  function sound(name) { if (muted || !SFX[name]) return; try { SFX[name](); } catch {} }
  function setMuteIcon() { $('#muteBtn').textContent = muted ? '🔇' : '🔊'; }
  setMuteIcon();
  $('#muteBtn').onclick = () => { muted = !muted; store.set('luno_muted', muted ? '1' : '0'); setMuteIcon(); if (!muted) sound('alert'); };

  // ================= Tab title flash when it's your turn =================
  const baseTitle = document.title;
  let titleFlip = false;
  setInterval(() => {
    const needs = S && (myTurn() || mustSubmit(S));
    if (needs && document.hidden) { titleFlip = !titleFlip; document.title = titleFlip ? '🟡 YOUR TURN! 🟡' : baseTitle; }
    else if (document.title !== baseTitle) document.title = baseTitle;
  }, 900);

  // ================= Positions & flying cards =================
  const arena = () => $('#arena');
  function centerOf(el) {
    const a = arena().getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }
  function targetEl(pid) {
    if (pid === S.me) return $('#hand').children.length ? $('#hand') : $('#meName');
    return document.querySelector(`.seat[data-pid="${pid}"] .frame`);
  }
  function flyCard(fromEl, toEl, delay = 0, html = null) {
    if (!fromEl || !toEl) return;
    const from = centerOf(fromEl), to = centerOf(toEl);
    const holder = document.createElement('div');
    holder.innerHTML = html || "<div class=\"card back\"><span>LIAR'S</span></div>";
    const el = holder.firstElementChild;
    $('#flyLayer').appendChild(el);
    const w = el.offsetWidth / 2, h = el.offsetHeight / 2;
    const spin = (Math.random() * 40 - 20) | 0;
    const anim = el.animate([
      { transform: `translate(${from.x - w}px, ${from.y - h}px) rotate(-14deg) scale(1)`, opacity: 1 },
      { transform: `translate(${(from.x + to.x) / 2 - w}px, ${Math.min(from.y, to.y) - h - 50}px) rotate(${spin + 180}deg) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${to.x - w}px, ${to.y - h}px) rotate(${spin + 360}deg) scale(.55)`, opacity: 0.2 },
    ], { duration: 520, delay, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
    anim.onfinish = () => el.remove();
  }
  function flyDraw(pid, n) {
    const deck = $('#drawPile .s1');
    const to = targetEl(pid);
    for (let i = 0; i < Math.min(n, 6); i++) flyCard(deck, to, i * 120);
    if (pid !== S.me) setTimeout(() => shakeSeat(pid), 300);
  }
  function dealAnim() {
    const deck = $('#drawPile .s1');
    const ids = (S ? S.players : []).map((p) => p.id);
    for (let r = 0; r < 4; r++) ids.forEach((id, k) => flyCard(deck, targetEl(id) || $('#meName'), r * 140 + k * 40));
  }
  function shakeSeat(pid) {
    const s = pid === S.me ? $('#meName') : document.querySelector(`.seat[data-pid="${pid}"]`);
    if (!s) return;
    s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
    setTimeout(() => s.classList.remove('shake'), 600);
  }
  function confetti(x, y, count = 40) {
    const b = document.createElement('div');
    b.className = 'burst';
    b.style.left = x + 'px'; b.style.top = y + 'px';
    const cols = ['#e8272b', '#f7c21b', '#2fae54', '#1f7fe0', '#fff'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
      p.style.background = cols[i % cols.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.animationDelay = (Math.random() * 0.15) + 's';
      b.appendChild(p);
    }
    $('#flyLayer').appendChild(b);
    setTimeout(() => b.remove(), 1600);
  }

  // ================= Big pop-ups =================
  const popQueue = [];
  let popBusy = false;
  function bigPop(o) {
    popQueue.push(o);
    if (!popBusy) nextPop();
  }
  function nextPop() {
    const o = popQueue.shift();
    if (!o) { popBusy = false; return; }
    popBusy = true;
    const el = document.createElement('div');
    el.className = 'pop ' + (o.cls || '');
    el.innerHTML = `${o.glyph ? `<span class="glyph" ${o.small ? 'style="font-size:min(84px,15vw)"' : ''}>${esc(o.glyph)}</span>` : ''}
      ${o.word ? `<span class="word">${esc(o.word)}</span>` : ''}${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}`;
    $('#bigfx').appendChild(el);
    if (o.sound) sound(o.sound);
    if (o.confetti) { const c = centerOf($('#bigfx')); confetti(c.x, c.y); }
    setTimeout(() => el.remove(), 1500);
    setTimeout(nextPop, popQueue.length > 2 ? 650 : 1050);
  }
  function bigFx(f) {
    const n = (id) => pName(id);
    const colCls = { red: 'red', green: 'green', blue: 'blue', yellow: '' };
    switch (f.kind) {
      case 'skip': bigPop({ glyph: '⊘', word: 'SKIP!', sub: `${n(f.target)} loses a turn`, cls: 'red shakey', sound: 'whoosh' }); shakeSeat(f.target); break;
      case 'reverse': {
        const ring = $('#dirRing'); ring.classList.add('burst'); setTimeout(() => ring.classList.remove('burst'), 1200);
        bigPop({ glyph: '⇄', word: 'REVERSE!', sub: f.target ? `${n(f.target)} is skipped` : 'Direction flipped', cls: 'blue spin', sound: 'whoosh' });
        break;
      }
      case 'draw2': bigPop({ glyph: '+2', word: 'DRAW TWO!', sub: `${n(f.target)} draws 2`, cls: 'shakey', sound: 'whoosh' }); break;
      case 'wd4': bigPop({ glyph: '+4', word: 'WILD!', sub: `${n(f.target)} draws 4 · color is ${cap(f.color)}`, cls: (colCls[f.color] || '') + ' shakey', sound: 'whoosh' }); break;
      case 'swap': bigPop({ glyph: '7', word: 'SWAP!', sub: `${n(f.a)} ⇄ ${n(f.b)}`, cls: 'spin', sound: 'whoosh' }); shakeSeat(f.a); shakeSeat(f.b); break;
      case 'zero': bigPop({ glyph: '0', word: 'PASS IT ON!', sub: 'Everyone passes their hand', cls: 'spin', sound: 'whoosh' }); break;
      case 'busted': bigPop({ glyph: '✗', word: 'BUSTED!', sub: `${n(f.target)} was lying! It was a ${label(f.card)}`, cls: 'red shakey', sound: 'busted' }); shakeSeat(f.target); break;
      case 'truth': bigPop({ glyph: '✓', word: 'TRUTH!', sub: `${n(f.target)} wasn't lying · ${n(f.by)} draws 1`, cls: 'green', sound: 'truth' }); shakeSeat(f.by); break;
      case 'uno': bigPop({ glyph: 'UNO!', word: '', sub: `${n(f.target)} has one card left!`, sound: 'uno', confetti: true, small: true }); break;
      case 'caught': bigPop({ glyph: '!', word: 'CAUGHT!', sub: `${n(f.target)} forgot to yell UNO · +2 cards`, cls: 'red shakey', sound: 'busted' }); shakeSeat(f.target); break;
      case 'wlc': bigPop({ glyph: '?!', word: "LIAR'S CHALLENGE!", sub: `${n(f.target)} calls ${String(f.color).toUpperCase()}`, cls: (colCls[f.color] || '') + ' spin', sound: 'alert' }); break;
      default: break;
    }
  }
  socket.on('fx', (f) => {
    if (!S) return;
    if (f.t === 'draw') { flyDraw(f.pid, f.n); sound('draw'); }
    else if (f.t === 'deal') { dealAnim(); sound('deal'); }
    else if (f.t === 'play') sound('flip');
    else if (f.t === 'big') bigFx(f);
    else if (f.t === 'win') {
      const iWon = f.ids.includes(S.me);
      bigPop({ glyph: iWon ? '🏆' : '★', word: iWon ? 'YOU WIN!' : `${f.ids.map(pName).join(' & ')} WINS!`, sound: 'win', confetti: true });
    }
  });
  function yourTurnAlert(text) {
    bigPop({ glyph: text, word: '', small: true, sound: 'turn' });
    try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {}
  }

  // ================= Render =================
  let modalKind = null;
  let dismissedResultFor = 0;
  let wlcSelected = null;
  let lastLandSeq = -1;
  let prevHandIds = null;
  let prevHandNum = 0;
  let pointerAng = 90;

  socket.on('state', (st) => {
    const prev = S;
    S = st;
    if (S.pending) {
      pendingEnd = Date.now() + S.pending.msLeft;
      if (!prev || !prev.pending || prev.pending.playerId !== S.pending.playerId || prev.phase !== 'challenge') pendingTotal = Math.max(S.pending.msLeft, 1);
    }
    if (S.wlc) wlcEnd = Date.now() + S.wlc.msLeft;
    if (S.phase !== 'wlc-submit') wlcSelected = null;
    if (wlcSelected && !S.hand.some((c) => c.id === wlcSelected)) wlcSelected = null;
    if (['claim', 'color', 'target'].includes(modalKind) && !myTurn()) closeModal();
    render();
    // Turn alerts
    if (isMine(S) && !isMine(prev)) yourTurnAlert('YOUR TURN!');
    else if (isMine(S) && isMine(prev) && prev.topSeq !== S.topSeq && S.topPid === S.me) yourTurnAlert('GO AGAIN!');
    if (mustSubmit(S) && !mustSubmit(prev)) yourTurnAlert('PICK A CARD!');
    if (canCall(S) && !canCall(prev)) sound('alert');
  });

  function render() {
    if (!S) return;
    const m = me();
    $('#roomChip').textContent = 'Room ' + S.code;
    $('#handChip').textContent = S.handNum ? `Hand #${S.handNum}` : 'Lobby';
    $('#targetLbl').textContent = `(first to ${S.target})`;
    $('#arena').classList.toggle('my-turn', myTurn() || !!mustSubmit(S));
    renderTurnPill();
    renderSeats();
    renderScores();
    renderMiddle();
    renderMe(m);
    renderActionPanel();
    renderResultModal();
    renderPointer();
    $('#resetScoresBtn').classList.toggle('hidden', !(S.hostId === S.me && ['lobby', 'handover'].includes(S.phase)));
  }
  let rT = null;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(render, 120); });

  function renderTurnPill() {
    const p = $('#turnPill');
    let txt = '', mine = false;
    if (S.phase === 'play' || S.phase === 'challenge') {
      if (S.turnId === S.me && S.phase === 'play') { txt = '🟡 YOUR TURN!'; mine = true; }
      else if (S.phase === 'challenge') txt = `🤔 ${pName(S.pending && S.pending.playerId)} might be bluffing...`;
      else txt = `⏳ ${pName(S.turnId)}'s turn`;
    } else if (S.phase === 'wlc-submit') { mine = !!mustSubmit(S); txt = mine ? '🟡 PICK A CARD TO PUT DOWN!' : "🃏 Wild Liar's Challenge"; }
    else if (S.phase === 'wlc-judge') { mine = S.wlc && S.wlc.playerId === S.me; txt = mine ? '🟡 FLIP SOMEONE\'S CARD!' : `🔎 ${pName(S.wlc && S.wlc.playerId)} is flipping cards`; }
    else if (S.phase === 'handover') txt = '🏆 Hand over';
    else txt = '🪑 Waiting room';
    p.textContent = txt;
    p.classList.toggle('mine', mine);
    p.classList.remove('hidden');
  }

  const SLOTS = { 1: ['top'], 2: ['tl', 'tr'], 3: ['left', 'top', 'right'], 4: ['left', 'tl', 'tr', 'right'], 5: ['left', 'tl', 'top', 'tr', 'right'] };
  function slotPos(slot) {
    const narrow = arena().clientWidth < 700;
    const P = narrow
      ? { left: [13, 25, 'left'], tl: [28, 10, 'top'], top: [50, 10, 'top'], tr: [72, 10, 'top'], right: [84, 25, 'right'] }
      : { left: [9, 42, 'left'], tl: [28, 14, 'top'], top: [50, 12, 'top'], tr: [72, 14, 'top'], right: [91, 42, 'right'] };
    return P[slot];
  }

  function renderSeats() {
    const box = $('#seats');
    const others = S.players.filter((p) => p.id !== S.me);
    if (!others.length) { box.innerHTML = '<div class="empty-seat">Waiting for someone to join...<br><small>Hit 🔗 Copy invite link up top</small></div>'; return; }
    const ids = S.players.map((p) => p.id);
    const myIdx = ids.indexOf(S.me);
    const ordered = [...S.players.slice(myIdx + 1), ...S.players.slice(0, myIdx)];
    const slots = SLOTS[Math.min(ordered.length, 5)];
    const fanMax = arena().clientWidth < 700 ? 8 : 14;
    box.innerHTML = ordered.map((p, i) => {
      const [x, y, side] = slotPos(slots[i]);
      const isTurn = S.turnId === p.id && ['play', 'challenge'].includes(S.phase);
      const inHand = p.inHand;
      const fan = inHand ? `<div class="fan">${Array.from({ length: Math.min(p.count, fanMax) }, () => "<div class=\"card back\"><span>LIAR'S</span></div>").join('')}</div>` : '';
      const kick = S.hostId === S.me && ['lobby', 'handover'].includes(S.phase)
        ? `<button class="btn ghost kick-btn" data-kick="${p.id}" type="button">Remove</button>` : '';
      const tags = [
        isTurn ? '<span class="tag turn">▶ THEIR TURN</span>' : '',
        p.calledUno && p.count <= 2 && inHand ? '<span class="tag uno">UNO!</span>' : '',
        p.id === S.hostId ? '<span class="tag host">👑 host</span>' : '',
        !p.connected ? '<span class="tag">offline</span>' : '',
        S.phase !== 'lobby' && !inHand ? '<span class="tag">next hand</span>' : '',
      ].join('');
      return `<div class="seat side-${side}" data-pid="${p.id}" style="left:${x}%;top:${y}%">
        <div class="seat-row">
          <div><div class="banner">${esc(p.name)}</div>${frameHTML(p, isTurn)}</div>
          ${inHand ? `<div class="count-badge"><span class="mc">${p.count}</span></div>` : ''}
        </div>
        <div class="seat-tags">${tags}</div>
        ${p.exposed ? `<button class="catch-btn" data-catch="${p.id}" type="button">🎯 Catch! No UNO</button>` : ''}
        ${kick}
        ${fan}
      </div>`;
    }).join('');
  }
  $('#seats').addEventListener('click', (e) => {
    const c = e.target.closest('[data-catch]');
    if (c) socket.emit('catch', { targetId: c.dataset.catch });
    const k = e.target.closest('[data-kick]');
    if (k && confirmKick(k.dataset.kick)) socket.emit('kick', { targetId: k.dataset.kick });
  });
  function confirmKick(id) { return window.confirm(`Remove ${pName(id)} from the table?`); }

  function renderScores() {
    const sorted = [...S.players].sort((a, b) => b.score - a.score);
    $('#scores').innerHTML = sorted.map((p) => `
      <div class="score-row">
        <span class="score-name">${miniAv(p)}${esc(p.name)}${p.id === S.me ? ' <small>(you)</small>' : ''}</span>
        <span>${p.score} <small>· ${p.wins} won</small></span>
        <div class="bar"><div style="width:${Math.min(100, p.score / S.target * 100)}%"></div></div>
      </div>`).join('');
  }

  const rotFor = (seq) => ((seq * 47) % 36) - 18;
  const offFor = (seq) => [((seq * 13) % 16) - 8, ((seq * 7) % 12) - 6];
  function renderMiddle() {
    const lobby = S.phase === 'lobby';
    $('#lobbyBox').classList.toggle('hidden', !lobby);
    $('#center').classList.toggle('hidden', lobby);
    if (lobby) {
      const n = S.players.length;
      const host = S.hostId === S.me;
      $('#lobbyBox').innerHTML = `
        <h2>Waiting room</h2>
        <p>${n} of 6 players at the table. Send the invite link so others can join room <b>${esc(S.code)}</b>.</p>
        ${host
          ? `<button class="btn big red" id="startBtn" type="button" ${n < 2 ? 'disabled' : ''}>${n < 2 ? 'Need at least 2 players' : `Deal the cards (${n} players)`}</button>`
          : `<p>Waiting for ${esc(pName(S.hostId))} (the host) to start.</p>`}`;
      const sb = $('#startBtn');
      if (sb) sb.onclick = () => socket.emit('start');
      $('#status').innerHTML = '';
      return;
    }
    // Deck
    $('#deckCount').textContent = `${S.deckCount} left`;
    $('#drawPile').disabled = !(myTurn() && S.drawnCard == null);
    // Messy discard pile
    const under = (S.pile || []).map((e) => {
      const [ox, oy] = offFor(e.seq);
      const st = `style="transform:translate(${ox}px,${oy}px) rotate(${rotFor(e.seq)}deg)"`;
      return e.back ? `<div class="card back under" ${st}><span>LIAR'S</span></div>` : cardHTML(e.card, 'under').replace('<div class="card', `<div ${st} class="card`);
    }).join('');
    const t = S.top;
    let topHtml = '';
    if (t) {
      const seq = S.topSeq || 0;
      const [ox, oy] = offFor(seq);
      const st = `style="transform:translate(${ox}px,${oy}px) rotate(${rotFor(seq)}deg)"`;
      if (t.faceDown && !t.revealed) {
        topHtml = `<div class="card back top" ${st}><span>LIAR'S</span></div>` + (t.claim ? `<div class="claim-tag">says: ${esc(label(t.claim))}</div>` : '');
      } else {
        topHtml = cardHTML(t.card, 'top').replace('<div class="card', `<div ${st} class="card`) + (t.revealed ? '<div class="claim-tag true">✓ it was true</div>' : '');
      }
    }
    $('#discard').innerHTML = under + topHtml;
    // Animate the newest card flying in from whoever played it
    const topEl = $('#discard .card.top');
    if (topEl && S.topSeq > lastLandSeq) {
      if (lastLandSeq >= 0 && S.topPid) {
        const src = targetEl(S.topPid);
        if (src) {
          const a = centerOf(src), b = centerOf(topEl);
          const [ox, oy] = offFor(S.topSeq), rot = rotFor(S.topSeq);
          topEl.animate([
            { transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) rotate(${rot - 200}deg) scale(.75)` },
            { transform: `translate(${ox}px, ${oy - 30}px) rotate(${rot}deg) scale(1.25)`, offset: 0.75 },
            { transform: `translate(${ox}px, ${oy}px) rotate(${rot}deg) scale(1)` },
          ], { duration: 560, easing: 'cubic-bezier(.25,.9,.35,1)' });
        }
      }
      lastLandSeq = S.topSeq;
    }
    // Color + direction
    const col = S.currentColor;
    $('#colorGlow').style.background = col ? `radial-gradient(circle, var(--${col}) 0%, transparent 68%)` : 'transparent';
    $('#colorLabel').className = 'color-chip ' + (col || '');
    $('#colorLabel').style.background = col ? `var(--${col})` : 'transparent';
    $('#colorLabel').innerHTML = col ? `COLOR: ${col.toUpperCase()} ${SYM[col]}` : '';
    $('#dirRing').classList.toggle('ccw', S.dir === -1);
    // Status line
    let s = '';
    if (S.phase === 'play') {
      if (myTurn()) s = S.drawnCard != null ? '<b>Play the card you drew</b> (glowing) or hit Keep & pass.' : '<b>Your turn!</b> Play a card, bluff with a Liar\'s card, or draw.';
      else s = `Waiting for <b>${esc(pName(S.turnId))}</b>...`;
    } else if (S.phase === 'handover') s = 'Hand over! 🎉 <button class="btn red" id="reopenBtn" type="button">Next hand →</button>';
    $('#status').innerHTML = s;
    const rb2 = $('#reopenBtn');
    if (rb2) rb2.onclick = () => socket.emit('nextHand');
  }
  $('#drawPile').onclick = () => socket.emit('draw');

  function renderPointer() {
    const ptr = $('#pointer');
    let pid = null;
    if (['play', 'challenge'].includes(S.phase)) pid = S.phase === 'challenge' && S.pending ? S.pending.playerId : S.turnId;
    else if (S.phase === 'wlc-judge' && S.wlc) pid = S.wlc.playerId;
    const el = pid && (pid === S.me ? $('#meName .frame') : document.querySelector(`.seat[data-pid="${pid}"] .frame`));
    if (!el) { ptr.classList.add('off'); return; }
    const c = centerOf($('#center')), t = centerOf(el);
    let ang = Math.atan2(t.y - c.y, t.x - c.x) * 180 / Math.PI;
    while (ang - pointerAng > 180) ang -= 360;
    while (ang - pointerAng < -180) ang += 360;
    pointerAng = ang;
    ptr.style.setProperty('--ang', ang + 'deg');
    ptr.classList.remove('off');
  }

  function renderMe(m) {
    if (!m) return;
    const inHand = m.inHand && S.phase !== 'lobby';
    const turn = myTurn() || !!mustSubmit(S) || (S.phase === 'wlc-judge' && S.wlc && S.wlc.playerId === S.me);
    $('#meName').innerHTML = `<div class="banner">${esc(m.name)}</div>${frameHTML(m, turn)}
      <div class="sub">${inHand ? `${S.hand.length} card${S.hand.length === 1 ? '' : 's'} · ` : ''}${m.score} pts${m.calledUno && S.hand.length <= 2 && inHand ? ' · <span class="tag uno">UNO!</span>' : ''}</div>`;
    const unoOk = inHand && S.phase !== 'handover' && !m.calledUno &&
      (S.hand.length === 1 || (S.hand.length === 2 && myTurn()));
    $('#drawBtn').disabled = !(myTurn() && S.drawnCard == null);
    $('#passBtn').classList.toggle('hidden', !(myTurn() && S.drawnCard != null));
    $('#unoBtn').disabled = !unoOk;
    $('#unoBtn').classList.toggle('pulse', unoOk);
    $('#unoBtn').textContent = m.calledUno && S.hand.length <= 2 ? 'UNO! ✓' : 'UNO!';
    $('#drawBtn').classList.toggle('hidden', !inHand);
    $('#unoBtn').classList.toggle('hidden', !inHand);

    const hand = sortHand(S.hand);
    const wlcPick = mustSubmit(S);
    const newDeal = S.handNum !== prevHandNum;
    const fresh = new Set(prevHandIds && !newDeal ? hand.filter((c) => !prevHandIds.has(c.id)).map((c) => c.id) : newDeal && S.phase !== 'lobby' ? hand.map((c) => c.id) : []);
    $('#hand').innerHTML = hand.length ? hand.map((c) => {
      let cls = '';
      if (myTurn()) {
        if (S.drawnCard != null) cls = c.id === S.drawnCard ? 'playable' : 'dim';
        else cls = c.liar || matches(c) ? 'playable' : 'dim';
      } else if (wlcPick) cls = 'selectable' + (c.id === wlcSelected ? ' selected' : '');
      if (fresh.has(c.id)) cls += ' fresh';
      return cardHTML(c, cls);
    }).join('') : (S.phase === 'lobby' ? '<p class="hint">Your cards will show up here.</p>' : !m.inHand ? '<p class="hint">You\'ll be dealt in next hand. Grab a snack. 🍿</p>' : '');
    layoutHand(fresh, newDeal);
    prevHandIds = new Set(hand.map((c) => c.id));
    prevHandNum = S.handNum;
  }

  // Fan the hand into an arc and squeeze it to fit
  function layoutHand(fresh, newDeal) {
    const cards = [...$('#hand').querySelectorAll('.card')];
    const n = cards.length;
    if (!n) return;
    const W = $('#hand').clientWidth - 20;
    const cw = cards[0].offsetWidth;
    let gap = n > 1 ? (W - n * cw) / (n - 1) : 0;
    gap = Math.max(-cw * 0.86, Math.min(gap, 4));
    const step = Math.min(5, 44 / n);
    const drop = Math.min(16, n * 2);
    const deck = $('#drawPile .s1');
    const dc = deck && !$('#center').classList.contains('hidden') ? centerOf(deck) : null;
    let k = 0;
    cards.forEach((el, i) => {
      if (i) el.style.marginLeft = gap + 'px';
      const t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      el.style.setProperty('--r', (i - (n - 1) / 2) * step + 'deg');
      el.style.setProperty('--y', t * t * drop + 'px');
      el.style.zIndex = i + 1;
      if (el.classList.contains('fresh')) {
        if (dc) {
          const c = centerOf(el);
          el.style.setProperty('--fx', (dc.x - c.x) + 'px');
          el.style.setProperty('--fy', (dc.y - c.y) + 'px');
        }
        el.style.animationDelay = (newDeal ? 150 + k * 90 : 250 + k * 120) + 'ms';
        k++;
      }
    });
  }

  $('#hand').addEventListener('click', (e) => {
    const el = e.target.closest('.card');
    if (!el || !S) return;
    const card = S.hand.find((c) => String(c.id) === el.dataset.id);
    if (!card) return;
    // Wild Liar's Challenge: pick a card to put down
    if (S.phase === 'wlc-submit' && S.wlc && S.wlc.playerId !== S.me && !S.wlc.claims[S.me]) {
      wlcSelected = card.id;
      render();
      return;
    }
    if (!myTurn()) { alertToast(S.phase === 'play' ? `Hold your horses, it's ${pName(S.turnId)}'s turn.` : 'Not right now!'); return; }
    if (S.drawnCard != null && card.id !== S.drawnCard) { alertToast('After drawing you can only play the card you just drew, or pass.'); return; }
    if (card.liar) return openClaimPicker(card);
    if (!matches(card)) { el.style.animation = 'shake .35s'; alertToast(`That doesn't match. You need ${cap(S.currentColor)} or a ${S.topValue && (NAMES[S.topValue] || S.topValue)}.`); return; }
    if (card.value === 'wlc') return openColorPicker('Wild Liar\'s Challenge: pick a color', (color) => socket.emit('play', { cardId: card.id, color }));
    if (card.value === '7') return withTarget((target) => socket.emit('play', { cardId: card.id, target }));
    socket.emit('play', { cardId: card.id });
  });

  $('#drawBtn').onclick = () => socket.emit('draw');
  $('#passBtn').onclick = () => socket.emit('pass');
  $('#unoBtn').onclick = () => socket.emit('uno');
  $('#resetScoresBtn').onclick = () => { if (confirm('Reset everyone\'s score to 0?')) socket.emit('newMatch'); };

  // ================= Action panel (challenges) =================
  function chip(claim) {
    const bg = claim.value === 'wd4' ? '#1a1a1a' : `var(--${claim.color})`;
    const fg = claim.color === 'yellow' && claim.value !== 'wd4' ? '#2b1c00' : '#fff';
    return `<span class="claim-big" style="background:${bg};color:${fg}">${esc(label(claim))}</span>`;
  }

  function renderActionPanel() {
    const ap = $('#actionPanel');
    let html = '';
    if (S.phase === 'challenge' && S.pending) {
      const pd = S.pending;
      const tgt = pd.target ? ` and swap hands with <b>${esc(pName(pd.target))}</b>` : '';
      if (pd.playerId === S.me) {
        html = `<h3>🤫 You say it's a ${chip(pd.claim)}${tgt}</h3><p>Keep a straight face... waiting to see if anyone calls your bluff.</p>`;
      } else if (me().inHand) {
        const answered = pd.responded.includes(S.me);
        html = `<h3>${esc(pName(pd.playerId))} plays face down and says it's a ${chip(pd.claim)}${tgt}</h3>
          ${answered ? '<p>You let it slide. Waiting on the others...</p>' :
            `<div class="row"><button class="btn red big" id="bluffBtn" type="button" style="width:auto">🚨 Call bluff!</button>
             <button class="btn big" id="believeBtn" type="button" style="width:auto">😐 I believe it</button></div>`}`;
      } else html = `<h3>${esc(pName(pd.playerId))} says it's a ${chip(pd.claim)}</h3>`;
      html += '<div class="timer"><div></div></div>';
    } else if (S.phase === 'wlc-submit' && S.wlc) {
      const w = S.wlc;
      const col = `<b style="color:var(--${w.color})">${w.color.toUpperCase()}</b>`;
      const done = Object.keys(w.claims);
      const waitingOn = playersInHand().filter((p) => p.id !== w.playerId && !w.claims[p.id]).map((p) => p.name);
      if (w.playerId === S.me) {
        html = `<h3>🃏 Wild Liar's Challenge: you called ${col}</h3><p>Waiting for ${esc(waitingOn.join(', ') || 'everyone')} to put a card down...</p>`;
      } else if (w.claims[S.me]) {
        html = `<h3>Card down! You said ${chip(w.claims[S.me])}</h3><p>Waiting for ${esc(waitingOn.join(', ') || 'everyone')}...</p>`;
      } else if (me().inHand) {
        const sel = S.hand.find((c) => c.id === wlcSelected);
        html = `<h3>🃏 ${esc(pName(w.playerId))} called ${col}!</h3>
          <p>${sel ? `You picked: <b>${esc(label(sel))}</b>. Now say which ${w.color} card it is:` : `Tap a card in your hand to put it face down. It should be ${w.color}... or bluff!`}</p>
          ${sel ? `<div class="claim-grid" style="justify-content:center">${[...NUMBERS, ...ACTIONS].map((v) =>
            `<button class="claim-chip bg-${w.color} ${sel.color === w.color && sel.value === v ? 'truth' : ''}" data-wlcv="${v}" type="button">${SHORT[v] || v}</button>`).join('')}</div>` : ''}`;
      }
      if (done.length) html += `<p style="margin-top:10px">${done.map((id) => `${esc(pName(id))}: ${chip(w.claims[id])}`).join(' ')}</p>`;
      html += '<div class="timer"><div></div></div>';
    } else if (S.phase === 'wlc-judge' && S.wlc) {
      const w = S.wlc;
      const judge = w.playerId === S.me;
      html = `<h3>🔎 ${judge ? 'Who\'s lying? Flip cards one at a time.' : `${esc(pName(w.playerId))} is deciding who to flip...`}</h3>`;
      html += Object.entries(w.claims).map(([id, claim]) => {
        const r = w.revealed[id];
        const right = r ? `${cardHTML(r.card)} <b>${r.truth ? '✅ Truth' : '❌ Bluff!'}</b>`
          : judge ? `<button class="btn red" data-flip="${id}" type="button">Flip it!</button>` : '<span class="hint">hidden</span>';
        return `<div class="wlc-row"><span><b>${esc(pName(id))}</b> says ${chip(claim)}</span><span style="display:flex;gap:8px;align-items:center">${right}</span></div>`;
      }).join('');
      if (judge) html += '<div class="row"><button class="btn gold" id="wlcDoneBtn" type="button">Done, let the rest go</button></div>';
    }
    ap.classList.toggle('hidden', !html);
    ap.innerHTML = html;
    const b1 = $('#bluffBtn'), b2 = $('#believeBtn'), d = $('#wlcDoneBtn');
    if (b1) b1.onclick = () => socket.emit('challenge');
    if (b2) b2.onclick = () => socket.emit('believe');
    if (d) d.onclick = () => socket.emit('wlcDone');
  }
  $('#actionPanel').addEventListener('click', (e) => {
    const f = e.target.closest('[data-flip]');
    if (f) socket.emit('wlcChallenge', { targetId: f.dataset.flip });
    const v = e.target.closest('[data-wlcv]');
    if (v && wlcSelected != null) socket.emit('wlcSubmit', { cardId: wlcSelected, value: v.dataset.wlcv });
  });

  // ================= Modals =================
  function openModal(kind, html) {
    modalKind = kind;
    $('#modalCard').innerHTML = html;
    $('#modal').classList.remove('hidden');
  }
  function closeModal() {
    modalKind = null;
    $('#modal').classList.add('hidden');
    $('#modalCard').innerHTML = '';
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && modalKind !== 'result') closeModal(); });

  function openColorPicker(title, cb) {
    openModal('color', `<h2>${esc(title)}</h2>
      <div class="color-grid">${COLORS.map((c) => `<button class="bg-${c}" data-color="${c}" type="button">${cap(c)} ${SYM[c]}</button>`).join('')}</div>
      <div class="modal-foot"><button class="btn ghost" data-close type="button">Cancel</button></div>`);
    $('#modalCard').onclick = (e) => {
      if (e.target.closest('[data-close]')) return closeModal();
      const b = e.target.closest('[data-color]');
      if (b) { closeModal(); cb(b.dataset.color); }
    };
  }

  function withTarget(cb) {
    const others = playersInHand().filter((p) => p.id !== S.me);
    if (others.length === 1) return cb(others[0].id);
    openModal('target', `<h2>🔄 Seven swap: trade hands with who?</h2>
      <div class="pick-list">${others.map((p) => `<button class="btn" data-target="${p.id}" type="button">${esc(p.name)} · ${p.count} cards</button>`).join('')}</div>
      <div class="modal-foot"><button class="btn ghost" data-close type="button">Cancel</button></div>`);
    $('#modalCard').onclick = (e) => {
      if (e.target.closest('[data-close]')) return closeModal();
      const b = e.target.closest('[data-target]');
      if (b) { closeModal(); cb(b.dataset.target); }
    };
  }

  function openClaimPicker(card) {
    const truthful = matches(card);
    const cc = S.currentColor;
    const tv = S.topValue;
    const chipBtn = (claim) => {
      const isT = isTruth(card, claim);
      const txt = claim.value === 'wd4' ? `+4 ${cap(claim.color)}` : (SHORT[claim.value] || claim.value);
      return `<button class="claim-chip ${claim.value === 'wd4' ? '' : 'bg-' + claim.color} ${isT ? 'truth' : ''}"
        ${claim.value === 'wd4' ? `style="background:#1a1a1a;border-color:var(--${claim.color})"` : ''}
        data-claim="${claim.color}|${claim.value}" type="button" title="${esc(label(claim))}">${txt}</button>`;
    };
    const sameColor = [...NUMBERS, ...ACTIONS].map((v) => chipBtn({ color: cc, value: v })).join('');
    const sameSymbol = [...NUMBERS, ...ACTIONS].includes(tv)
      ? COLORS.filter((c) => c !== cc).map((c) => chipBtn({ color: c, value: tv })).join('') : '';
    const wilds = COLORS.map((c) => chipBtn({ color: c, value: 'wd4' })).join('');
    openModal('claim', `
      <h2>Play it face down 🤫</h2>
      <div style="display:flex;gap:14px;align-items:center;margin-top:8px">${cardHTML(card)}
        <p>${truthful ? 'This one actually matches, so you can tell the truth (marked <b>✓ truth</b>)... or get fancy.' : '<b style="color:var(--gold)">It doesn\'t match.</b> Time to bluff! Pick something believable.'}</p></div>
      <div class="sec">Say it's a ${cap(cc)} card</div><div class="claim-grid">${sameColor}</div>
      ${sameSymbol ? `<div class="sec">Or another ${esc(NAMES[tv] || tv)}</div><div class="claim-grid">${sameSymbol}</div>` : ''}
      <div class="sec">Or a Wild Draw 4 (pick the new color)</div><div class="claim-grid">${wilds}</div>
      <div class="modal-foot"><button class="btn ghost" data-close type="button">Cancel</button></div>`);
    $('#modalCard').onclick = (e) => {
      if (e.target.closest('[data-close]')) return closeModal();
      const b = e.target.closest('[data-claim]');
      if (!b) return;
      const [color, value] = b.dataset.claim.split('|');
      closeModal();
      const send = (target) => socket.emit('play', { cardId: card.id, claim: { color, value }, target });
      if (value === '7') withTarget(send); else send();
    };
  }

  function renderResultModal() {
    if (S.phase !== 'handover' || !S.result) {
      if (modalKind === 'result') closeModal();
      return;
    }
    if (dismissedResultFor === S.handNum) return;
    const r = S.result;
    const iWon = r.winnerIds.includes(S.me);
    const scores = [...S.players].sort((a, b) => b.score - a.score)
      .map((p) => `<div class="score-row"><span>${esc(p.name)}</span><span>${p.score}</span><div class="bar"><div style="width:${Math.min(100, p.score / S.target * 100)}%"></div></div></div>`).join('');
    const hands = r.hands.map((h) => `<div><b>${esc(h.name)}</b> was stuck with:</div><div class="result-hand">${h.cards.map((c) => cardHTML(c)).join('') || '<span class="hint">nothing</span>'}</div>`).join('');
    openModal('result', `
      <div class="crown">${S.matchWinner ? '👑' : iWon ? '🏆' : '🙃'}</div>
      <h2 style="text-align:center">${S.matchWinner ? `${esc(S.matchWinner.join(' & '))} wins the match!` : `${esc(r.winners.join(' & '))} won the hand!`}</h2>
      <p style="text-align:center">+${r.points} points${r.winners.length > 1 ? ' each' : ''}${iWon ? '. Absolutely ruthless. 😎' : '. Revenge next hand?'}</p>
      ${hands}
      <div class="sec">Scores (first to ${S.target})</div>${scores}
      <div class="modal-foot">
        <button class="btn ghost" data-close type="button">Look at the table</button>
        <button class="btn red" data-next type="button">${S.matchWinner ? 'Start a new match' : 'Deal next hand'}</button>
      </div>`);
    $('#modalCard').onclick = (e) => {
      if (e.target.closest('[data-close]')) { dismissedResultFor = S.handNum; closeModal(); showReopen(); }
      if (e.target.closest('[data-next]')) socket.emit('nextHand');
    };
  }
  function showReopen() {
    $('#status').innerHTML = 'Hand over! <button class="btn red" id="reopenBtn" type="button">Next hand →</button>';
    $('#reopenBtn').onclick = () => socket.emit('nextHand');
  }

  // ================= Rule book (floating) =================
  const rb = $('#rulebook');
  $('#rulesBtn').onclick = () => rb.classList.toggle('hidden');
  $('#rbClose').onclick = () => rb.classList.add('hidden');
  $('#rbFade').onclick = () => rb.classList.toggle('faded');
  (() => {
    let drag = null;
    $('#rbHead').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || window.innerWidth <= 900) return;
      const r = rb.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      $('#rbHead').setPointerCapture(e.pointerId);
    });
    $('#rbHead').addEventListener('pointermove', (e) => {
      if (!drag) return;
      const x = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - 120);
      const y = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - 50);
      rb.style.left = x + 'px'; rb.style.top = y + 'px'; rb.style.right = 'auto';
    });
    $('#rbHead').addEventListener('pointerup', () => { drag = null; });
  })();

  // ================= Misc buttons =================
  $('#sideBtn').onclick = () => $('#side').classList.toggle('open');
  $('#inviteBtn').onclick = async () => {
    const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(S ? S.code : 'UNO')}`;
    try { await navigator.clipboard.writeText(link); alertToast('Invite link copied! Send it to your opponents. 😈'); }
    catch { prompt('Copy this link:', link); }
  };

  // Floating red shards in the background
  for (let i = 0; i < 16; i++) {
    const sh = document.createElement('i');
    sh.style.left = Math.random() * 100 + '%';
    sh.style.top = 20 + Math.random() * 90 + '%';
    sh.style.animationDuration = 6 + Math.random() * 8 + 's';
    sh.style.animationDelay = -Math.random() * 10 + 's';
    sh.style.transform = `rotate(${Math.random() * 90}deg)`;
    $('#shards').appendChild(sh);
  }

  // ================= Start =================
  let passed = false;
  try { passed = sessionStorage.getItem('luno_gate') === '1'; } catch {}
  if (passed) showJoin(); else askQuestion('');
})();
