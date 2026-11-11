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
    if (!e.target.closest('.me-av')) return;
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

  function avatarHTML(p, extra = '') {
    const color = AVATAR_COLORS[Math.max(0, S.players.findIndex((x) => x.id === p.id)) % AVATAR_COLORS.length];
    const img = AVATARS[p.id];
    return `<div class="avatar ${extra}" style="background:${color}">${img ? `<img src="${img}" alt="">` : esc(p.name[0].toUpperCase())}</div>`;
  }

  // ================= Helpers about state =================
  const me = () => S.players.find((p) => p.id === S.me);
  const pName = (id) => (S.players.find((p) => p.id === id) || {}).name || '?';
  const myTurn = () => S && S.turnId === S.me && S.phase === 'play';
  const playersInHand = () => S.players.filter((p) => p.inHand);
  const matches = (c) => c.value === 'wd4' || c.value === 'wlc' || c.color === S.currentColor || c.value === S.topValue;
  const isTruth = (card, claim) => card.value === claim.value && (card.value === 'wd4' || card.color === claim.color);

  // ================= Timers =================
  let pendingEnd = 0, pendingTotal = 10000, wlcEnd = 0;
  setInterval(() => {
    const bar = document.querySelector('#actionPanel .timer > div');
    if (!bar || !S) return;
    if (S.phase === 'challenge') bar.style.width = Math.max(0, (pendingEnd - Date.now()) / pendingTotal * 100) + '%';
    if (S.phase === 'wlc-submit') bar.style.width = Math.max(0, (wlcEnd - Date.now()) / 60000 * 100) + '%';
  }, 150);

  // ================= Render =================
  let modalKind = null;
  let dismissedResultFor = 0;
  let wlcSelected = null;

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
    // Close pickers that no longer make sense
    if (['claim', 'color', 'target'].includes(modalKind) && !myTurn()) closeModal();
    render();
  });

  function render() {
    if (!S) return;
    const m = me();
    $('#roomChip').textContent = 'Room ' + S.code;
    $('#handChip').textContent = S.handNum ? `Hand #${S.handNum}` : 'Lobby';
    $('#targetLbl').textContent = `(first to ${S.target})`;
    renderSeats();
    renderScores();
    renderMiddle();
    renderMe(m);
    renderActionPanel();
    renderResultModal();
    $('#resetScoresBtn').classList.toggle('hidden', !(S.hostId === S.me && ['lobby', 'handover'].includes(S.phase)));
  }

  function renderSeats() {
    const box = $('#seats');
    const others = S.players.filter((p) => p.id !== S.me);
    if (!others.length) { box.innerHTML = '<div class="seat waiting"><div class="seat-name">Waiting for someone to join...</div><div class="seat-sub">Copy the invite link up top 👆</div></div>'; return; }
    // Order seats starting from the player after me
    const ids = S.players.map((p) => p.id);
    const myIdx = ids.indexOf(S.me);
    const ordered = [...S.players.slice(myIdx + 1), ...S.players.slice(0, myIdx)];
    box.innerHTML = ordered.map((p) => {
      const color = AVATAR_COLORS[S.players.indexOf(p) % AVATAR_COLORS.length];
      const isTurn = S.turnId === p.id;
      const fan = Array.from({ length: Math.min(p.count, 12) }, () => '<i></i>').join('');
      const kick = S.hostId === S.me && ['lobby', 'handover'].includes(S.phase)
        ? `<button class="btn ghost kick-btn" data-kick="${p.id}" type="button">Remove</button>` : '';
      return `<div class="seat ${isTurn ? 'turn' : ''} ${p.connected ? '' : 'offline'} ${p.inHand || S.phase === 'lobby' ? '' : 'waiting'}">
        <div class="seat-top">
          ${avatarHTML(p)}
          <div class="seat-name">${esc(p.name)}</div>
          ${p.calledUno && p.count <= 2 ? '<span class="badge uno">UNO!</span>' : ''}
          ${p.id === S.hostId ? '<span class="badge host">host</span>' : ''}
        </div>
        <div class="seat-sub">${S.phase === 'lobby' ? 'Ready' : p.inHand ? `${p.count} card${p.count === 1 ? '' : 's'}` : 'Joins next hand'} · ${p.score} pts${p.connected ? '' : ' · offline'}${isTurn ? ' · <b style="color:var(--gold)">their turn</b>' : ''}</div>
        ${p.inHand ? `<div class="mini-fan">${fan}</div>` : ''}
        ${p.exposed ? `<button class="catch-btn" data-catch="${p.id}" type="button">🎯 Catch! They didn't say UNO</button>` : ''}
        ${kick}
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
        <span class="score-name">${avatarHTML(p)}${esc(p.name)}${p.id === S.me ? ' <small>(you)</small>' : ''}</span>
        <span>${p.score} <small>· ${p.wins} won</small></span>
        <div class="bar"><div style="width:${Math.min(100, p.score / S.target * 100)}%"></div></div>
      </div>`).join('');
  }

  function renderMiddle() {
    const lobby = S.phase === 'lobby';
    $('#lobbyBox').classList.toggle('hidden', !lobby);
    $('#pileBox').classList.toggle('hidden', lobby);
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
    // Draw pile
    $('#deckCount').textContent = `${S.deckCount} left`;
    $('#drawPile').disabled = !(myTurn() && S.drawnCard == null);
    // Discard
    const t = S.top;
    let html = '';
    if (t) {
      if (t.faceDown && !t.revealed) {
        html = cardHTML(null) + (t.claim ? `<div class="claim-tag">says: ${esc(label(t.claim))}</div>` : '');
      } else {
        html = cardHTML(t.card) + (t.revealed ? '<div class="claim-tag">✓ was true</div>' : '');
      }
    }
    html += `<div class="color-ring" style="border-color:var(--${S.currentColor || 'line'})"></div>`;
    $('#discard').innerHTML = html;
    $('#colorLabel').innerHTML = S.currentColor ? `Color: <b style="color:var(--${S.currentColor})">${cap(S.currentColor)} ${SYM[S.currentColor]}</b>` : '';
    $('#dirBox').textContent = S.dir === 1 ? '↻' : '↺';
    $('#dirBox').title = S.dir === 1 ? 'Clockwise' : 'Counter-clockwise';
    // Status line
    let s = '';
    if (S.phase === 'play') {
      if (myTurn()) s = S.drawnCard != null ? '<b>Play the card you drew</b> (lifted) or hit Keep & pass.' : '<b>Your turn!</b> Play a card, bluff with a Liar\'s card, or draw.';
      else s = `Waiting for <b>${esc(pName(S.turnId))}</b>...`;
    } else if (S.phase === 'handover') s = 'Hand over! 🎉 <button class="btn red" id="reopenBtn" type="button">Next hand →</button>';
    $('#status').innerHTML = s;
    const rb2 = $('#reopenBtn');
    if (rb2) rb2.onclick = () => socket.emit('nextHand');
  }
  $('#drawPile').onclick = () => socket.emit('draw');

  function renderMe(m) {
    if (!m) return;
    $('#meName').innerHTML = `${avatarHTML(m, 'me-av')} ${esc(m.name)} <small>${m.score} pts${S.hostId === S.me ? ' · host' : ''}</small>`;
    const inHand = m.inHand && S.phase !== 'lobby';
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
    const wlcPick = S.phase === 'wlc-submit' && S.wlc && S.wlc.playerId !== S.me && !S.wlc.claims[S.me] && inHand;
    $('#hand').innerHTML = hand.length ? hand.map((c) => {
      let cls = '';
      if (myTurn()) {
        if (S.drawnCard != null) cls = c.id === S.drawnCard ? 'playable' : 'dim';
        else cls = c.liar || matches(c) ? 'playable' : 'dim';
      } else if (wlcPick) cls = 'selectable' + (c.id === wlcSelected ? ' selected' : '');
      return cardHTML(c, cls);
    }).join('') : (S.phase === 'lobby' ? '<p class="hint">Your cards will show up here.</p>' : !m.inHand ? '<p class="hint">You\'ll be dealt in next hand. Grab a snack. 🍿</p>' : '');
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

  // ================= Start =================
  let passed = false;
  try { passed = sessionStorage.getItem('luno_gate') === '1'; } catch {}
  if (passed) showJoin(); else askQuestion('');
})();
