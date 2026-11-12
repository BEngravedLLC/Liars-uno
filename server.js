'use strict';
/*
 * Liar's UNO Online — game server
 * Run with:  npm install  &&  npm start
 * Then open http://localhost:3000 (or your Replit link).
 */
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

// ---------- Settings you can tweak ----------
const PORT = process.env.PORT || 3000;
const CHALLENGE_SECONDS = 10;       // how long everyone has to call a bluff
const WLC_SUBMIT_SECONDS = 60;      // time to put a card down for a Wild Liar's Challenge
const OFFLINE_AUTOPLAY_SECONDS = 25; // if someone's offline on their turn, auto draw/pass after this
const TARGET_SCORE = 500;           // first to this many points wins the match
const MAX_PLAYERS = 6;
// --------------------------------------------

const COLORS = ['red', 'yellow', 'green', 'blue'];
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTIONS = ['skip', 'reverse', 'draw2'];
const CLAIMABLE = [...NUMBERS, ...ACTIONS];

const app = express();
const PUB = require('fs').existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
['index.html', 'client.js', 'style.css'].forEach((f) => app.get(f === 'index.html' ? '/' : '/' + f, (req, res) => res.sendFile(path.join(PUB, f))));
app.get('/health', (req, res) => res.send('ok'));
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

// ---------- Helpers ----------
const rnd = (n) => crypto.randomInt(n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const VALUE_NAMES = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wd4: 'Wild Draw 4', wlc: "Wild Liar's Challenge" };
function label(c) {
  if (!c) return '?';
  if (c.value === 'wd4') return c.color ? `Wild Draw 4 (calling ${cap(c.color)})` : 'Wild Draw 4';
  if (c.value === 'wlc') return VALUE_NAMES.wlc;
  return `${cap(c.color)} ${VALUE_NAMES[c.value] || c.value}`;
}
function cardPoints(c) {
  if (NUMBERS.includes(c.value)) return Number(c.value);
  if (ACTIONS.includes(c.value)) return 20;
  return 50;
}

// 112 cards: every number 0-9 in each color has one Regular + one Liar's card (80),
// 2 each of Skip / Reverse / Draw Two per color, all Liar's cards (24),
// 4 Wild Draw 4 (Liar's) and 4 Wild Liar's Challenge (Regular, played face up).
function buildDeck() {
  let id = 1;
  const d = [];
  for (const color of COLORS) {
    for (const value of NUMBERS) {
      d.push({ id: id++, color, value, liar: false });
      d.push({ id: id++, color, value, liar: true });
    }
    for (const value of ACTIONS) {
      d.push({ id: id++, color, value, liar: true });
      d.push({ id: id++, color, value, liar: true });
    }
  }
  for (let i = 0; i < 4; i++) {
    d.push({ id: id++, color: null, value: 'wd4', liar: true });
    d.push({ id: id++, color: null, value: 'wlc', liar: false });
  }
  return d;
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code, players: [], hostId: null, phase: 'lobby',
      deck: [], discard: [], order: [], turn: 0, dir: 1, dealer: -1,
      currentColor: null, topValue: null, pending: null, wlc: null,
      drawnCard: null, result: null, handNum: 0, chat: [], matchWinner: null,
      turnStarted: Date.now(), emptySince: null, seq: 0, drawStack: 0,
    });
  }
  return rooms.get(code);
}

const byId = (room, id) => room.players.find((p) => p.id === id);
const inHand = (room, p) => room.phase !== 'lobby' && room.order.includes(p.id);
const curPlayer = (room) => byId(room, room.order[room.turn]);
const idxAfter = (room, from, steps) => {
  const n = room.order.length;
  return (((from + room.dir * steps) % n) + n) % n;
};

function sys(room, text) {
  const msg = { type: 'sys', text, t: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 150) room.chat.shift();
  io.to(room.code).emit('chat', msg);
}

// Animation cues for every browser at the table
function fx(room, data) { io.to(room.code).emit('fx', data); }
function pushDiscard(room, entry, pid) {
  entry.seq = ++room.seq;
  entry.pid = pid || null;
  room.discard.push(entry);
}

function drawCards(room, p, n) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (room.deck.length === 0) refillDeck(room);
    if (room.deck.length === 0) break;
    const c = room.deck.pop();
    p.hand.push(c);
    got.push(c);
  }
  if (got.length) fx(room, { t: 'draw', pid: p.id, n: got.length });
  return got;
}

function refillDeck(room) {
  if (room.discard.length <= 1) return;
  const top = room.discard.pop();
  const cards = room.discard.map((e) => e.card);
  room.discard = [top];
  room.deck = shuffle(cards);
  sys(room, '♻️ The draw pile ran out, so the discard pile was shuffled into a new one.');
}

const canMatch = (room, card) =>
  card.value === 'wd4' || card.value === 'wlc' ||
  card.color === room.currentColor || card.value === room.topValue;

const isTruth = (card, claim) =>
  card.value === claim.value && (card.value === 'wd4' || card.color === claim.color);

function validClaim(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (!COLORS.includes(claim.color)) return false;
  return claim.value === 'wd4' || CLAIMABLE.includes(claim.value);
}
const plausible = (room, claim) =>
  claim.value === 'wd4' || claim.color === room.currentColor || claim.value === room.topValue;

function markExposure(p) {
  if (p.hand.length === 1 && !p.calledUno) p.exposed = true;
}
function clearExposures(room, actorId) {
  room.players.forEach((p) => { if (p.id !== actorId) p.exposed = false; });
}
function resetUno(...ps) {
  ps.forEach((p) => { p.calledUno = false; p.exposed = false; });
}

function normalize(room) {
  const cur = ['play', 'challenge'].includes(room.phase) ? curPlayer(room) : null;
  room.players.forEach((p) => {
    if (p.hand.length !== 1) p.exposed = false;
    if (p.hand.length > 2) p.calledUno = false;
    if (p.hand.length === 2 && p !== cur) p.calledUno = false;
  });
}

function pickTarget(room, me, target) {
  const others = room.order.filter((id) => id !== me.id);
  if (others.length === 1) return others[0];
  return others.includes(target) ? target : null;
}

// ---------- Hand lifecycle ----------
function startHand(room) {
  if (room.matchWinner) {
    room.players.forEach((p) => { p.score = 0; });
    room.matchWinner = null;
    sys(room, '🆕 New match! Scores are back to zero.');
  }
  const n = room.players.length;
  room.order = room.players.map((p) => p.id);
  room.players.forEach((p) => { p.hand = []; resetUno(p); });
  room.deck = shuffle(buildDeck());
  room.discard = [];
  room.dealer = (room.dealer + 1) % n;
  for (let r = 0; r < 7; r++) room.players.forEach((p) => p.hand.push(room.deck.pop()));
  // Flip the starting card; action/wild cards get skipped.
  for (;;) {
    const c = room.deck.pop();
    if (ACTIONS.includes(c.value) || c.value === 'wd4' || c.value === 'wlc') { room.deck.unshift(c); continue; }
    pushDiscard(room, { card: c, faceDown: false });
    room.currentColor = c.color;
    room.topValue = c.value;
    break;
  }
  room.dir = 1;
  room.drawStack = 0;
  room.turn = (room.dealer + 1) % n;
  room.phase = 'play';
  room.pending = null;
  room.wlc = null;
  room.drawnCard = null;
  room.result = null;
  room.turnStarted = Date.now();
  room.handNum++;
  fx(room, { t: 'deal' });
  sys(room, `🎴 Hand #${room.handNum}: ${room.players[room.dealer].name} deals. ${curPlayer(room).name} goes first.`);
}

function endHand(room, winners) {
  const losers = room.order.map((id) => byId(room, id)).filter((p) => p && !winners.includes(p));
  const pts = losers.reduce((s, p) => s + p.hand.reduce((a, c) => a + cardPoints(c), 0), 0);
  winners.forEach((w) => { w.score += pts; w.wins = (w.wins || 0) + 1; });
  room.phase = 'handover';
  room.drawStack = 0;
  room.pending = null;
  room.wlc = null;
  room.drawnCard = null;
  room.result = {
    winners: winners.map((w) => w.name),
    winnerIds: winners.map((w) => w.id),
    points: pts,
    hands: losers.map((p) => ({ name: p.name, cards: p.hand })),
  };
  fx(room, { t: 'win', ids: winners.map((w) => w.id) });
  const names = winners.map((w) => w.name).join(' & ');
  sys(room, `🏆 ${names} won the hand${winners.length > 1 ? ' together' : ''} and ${winners.length > 1 ? 'each score' : 'scores'} ${pts} points!`);
  const top = Math.max(...room.players.map((p) => p.score));
  if (top >= TARGET_SCORE) {
    room.matchWinner = room.players.filter((p) => p.score === top).map((p) => p.name);
    sys(room, `👑 ${room.matchWinner.join(' & ')} wins the whole match with ${top} points! Bow down.`);
  }
}

function advanceFrom(room, p, steps) {
  room.turn = idxAfter(room, room.order.indexOf(p.id), steps);
  room.drawnCard = null;
  room.turnStarted = Date.now();
}

// Applies a card's effect; returns how many seats to move the turn.
function applyEffect(room, pl, value, target) {
  const n = room.order.length;
  const idx = room.order.indexOf(pl.id);
  const nextP = byId(room, room.order[idxAfter(room, idx, 1)]);
  switch (value) {
    case 'skip':
      fx(room, { t: 'big', kind: 'skip', target: nextP.id });
      sys(room, `⛔ ${nextP.name} is skipped.`);
      return 2;
    case 'reverse':
      fx(room, { t: 'big', kind: 'reverse', target: n === 2 ? nextP.id : null });
      if (n === 2) { sys(room, `🔃 Reverse! With two players that means ${nextP.name} is skipped.`); return 2; }
      room.dir *= -1;
      sys(room, '🔃 Direction reversed!');
      return 1;
    case 'draw2':
    case 'wd4': {
      // House rule: draw cards stack. The next player can pass it on with another +2/+4, or take the whole pile.
      const add = value === 'draw2' ? 2 : 4;
      room.drawStack += add;
      fx(room, { t: 'big', kind: 'stack', add, total: room.drawStack, target: nextP.id, color: value === 'wd4' ? room.currentColor : null });
      sys(room, `${add === 2 ? '➕' : '💥'} ${nextP.name} is facing +${room.drawStack}! Stack a +2/+4 or take them.${value === 'wd4' ? ` Color is now ${cap(room.currentColor)}.` : ''}`);
      return 1;
    }
    case '7': {
      const t = byId(room, target);
      if (t && t !== pl) {
        [pl.hand, t.hand] = [t.hand, pl.hand];
        resetUno(pl, t);
        fx(room, { t: 'big', kind: 'swap', a: pl.id, b: t.id });
        sys(room, `🔄 Seven swap! ${pl.name} trades hands with ${t.name}.`);
      }
      return 1;
    }
    case '0': {
      const ps = room.order.map((id) => byId(room, id));
      const hands = ps.map((p) => p.hand);
      ps.forEach((p, i) => { ps[idxAfter(room, i, 1)].hand = hands[i]; });
      resetUno(...ps);
      fx(room, { t: 'big', kind: 'zero' });
      sys(room, '🔁 Zero pass! Everyone hands their cards to the next player.');
      return 1;
    }
    default:
      return 1;
  }
}

function resolveChallenge(room, challenger) {
  const pd = room.pending;
  if (!pd) return;
  room.pending = null;
  room.phase = 'play';
  const pl = byId(room, pd.playerId);
  const truth = isTruth(pd.card, pd.claim);
  const top = room.discard[room.discard.length - 1];

  if (challenger && !truth) {
    room.discard.pop();
    const eat = room.drawStack;
    room.drawStack = 0;
    fx(room, { t: 'big', kind: 'busted', target: pl.id, by: challenger.id, card: pd.card, eat });
    pl.hand.push(pd.card);
    drawCards(room, pl, 1 + eat);
    sys(room, `🚨 BUSTED! ${challenger.name} called it — ${pl.name}'s card was really a ${label(pd.card)}. ${pl.name} takes it back and draws ${1 + eat}${eat ? ` (that includes the +${eat} stack!)` : ''}.`);
    advanceFrom(room, pl, 1);
    return;
  }
  if (challenger) {
    top.revealed = true;
    fx(room, { t: 'big', kind: 'truth', target: pl.id, by: challenger.id });
    sys(room, `😇 ${pl.name} was telling the truth — it really is a ${label(pd.claim)}! ${challenger.name} draws 1 for doubting.`);
  } else {
    sys(room, `🤐 Nobody called it. The ${label(pd.claim)} stands.`);
  }
  room.currentColor = pd.claim.color;
  room.topValue = pd.claim.value;
  if (pl.hand.length === 0) {
    if (challenger) drawCards(room, challenger, 1);
    endHand(room, [pl]);
    return;
  }
  const steps = applyEffect(room, pl, pd.claim.value, pd.target);
  if (challenger) drawCards(room, challenger, 1);
  advanceFrom(room, pl, steps);
}

function checkAllResponded(room) {
  const pd = room.pending;
  if (!pd) return;
  const others = room.order.filter((id) => id !== pd.playerId).map((id) => byId(room, id));
  if (others.every((p) => pd.responded.has(p.id) || !p.connected)) resolveChallenge(room, null);
}

function takeStack(room, p) {
  const n = room.drawStack;
  room.drawStack = 0;
  fx(room, { t: 'big', kind: 'ouch', target: p.id, n });
  drawCards(room, p, n);
  sys(room, `😩 ${p.name} takes the +${n} and loses their turn.`);
  advanceFrom(room, p, 1);
}

// ---------- Wild Liar's Challenge ----------
function startWLC(room, pl, color) {
  room.phase = 'wlc-submit';
  room.wlc = { playerId: pl.id, color, subs: {}, revealed: {}, deadline: Date.now() + WLC_SUBMIT_SECONDS * 1000 };
  fx(room, { t: 'big', kind: 'wlc', color, target: pl.id });
  sys(room, `🃏 ${pl.name} plays a WILD LIAR'S CHALLENGE and calls ${cap(color).toUpperCase()}! Everyone else: put a ${color} card face down... or bluff.`);
}

function wlcSubmit(room, p, card, value) {
  p.hand = p.hand.filter((c) => c.id !== card.id);
  room.wlc.subs[p.id] = { card, claim: { color: room.wlc.color, value } };
  sys(room, `🫣 ${p.name} puts a card face down and says it's a ${label({ color: room.wlc.color, value })}.`);
  const others = room.order.filter((id) => id !== room.wlc.playerId);
  if (others.every((id) => room.wlc.subs[id])) {
    room.phase = 'wlc-judge';
    sys(room, `🔎 ${byId(room, room.wlc.playerId).name}, who's lying? Flip someone's card, or call it done.`);
  }
}

function finishWLC(room) {
  const w = room.wlc;
  const discarders = [];
  for (const [pid, s] of Object.entries(w.subs)) {
    const rv = w.revealed[pid];
    if (rv && !rv.truth) continue; // liar already took it back
    room.discard.splice(room.discard.length - 1, 0, { card: s.card, faceDown: true, claim: s.claim, seq: ++room.seq, pid });
    const p = byId(room, pid);
    if (p) { discarders.push(p.name); markExposure(p); }
  }
  if (discarders.length) sys(room, `📥 ${discarders.join(', ')} slide their cards under the Wild Liar's Challenge.`);
  const pl = byId(room, w.playerId);
  room.wlc = null;
  room.phase = 'play';
  const winners = room.order.map((id) => byId(room, id)).filter((p) => p.hand.length === 0);
  if (winners.length) return endHand(room, winners);
  advanceFrom(room, pl, 1);
}

function autoSubmit(room, p) {
  const color = room.wlc.color;
  const card = p.hand.find((c) => c.color === color) || p.hand[0];
  const value = card.color === color && CLAIMABLE.includes(card.value) ? card.value : '5';
  wlcSubmit(room, p, card, value);
}

// ---------- Player views ----------
function view(room, me) {
  const playing = ['play', 'challenge', 'wlc-submit', 'wlc-judge'].includes(room.phase);
  const top = room.discard[room.discard.length - 1];
  let topView = null;
  if (top) {
    topView = top.faceDown && !top.revealed
      ? { faceDown: true, claim: top.claim }
      : { card: top.card, faceDown: !!top.faceDown, revealed: !!top.revealed, claim: top.claim || null };
  }
  const now = Date.now();
  const seatIds = room.phase === 'lobby' ? room.players.map((p) => p.id)
    : [...room.order, ...room.players.filter((p) => !room.order.includes(p.id)).map((p) => p.id)];
  return {
    code: room.code,
    me: me.id,
    hostId: room.hostId,
    phase: room.phase,
    target: TARGET_SCORE,
    players: seatIds.map((id) => byId(room, id)).filter(Boolean).map((p) => ({
      id: p.id, name: p.name, count: p.hand.length, score: p.score, wins: p.wins || 0,
      connected: p.connected, inHand: inHand(room, p), calledUno: p.calledUno,
      exposed: p.exposed && p.hand.length === 1,
    })),
    hand: me.hand,
    top: topView,
    topSeq: top ? top.seq : 0,
    topPid: top ? top.pid : null,
    pile: room.discard.slice(-5, -1).map((e) => (e.faceDown && !e.revealed ? { seq: e.seq, back: true } : { seq: e.seq, card: e.card })),
    currentColor: room.currentColor,
    topValue: room.topValue,
    dir: room.dir,
    deckCount: room.deck.length,
    drawStack: room.drawStack,
    turnId: playing ? room.order[room.turn] : null,
    drawnCard: room.drawnCard,
    handNum: room.handNum,
    pending: room.pending && {
      playerId: room.pending.playerId,
      claim: room.pending.claim,
      target: room.pending.target,
      msLeft: Math.max(0, room.pending.deadline - now),
      responded: [...room.pending.responded],
    },
    wlc: room.wlc && {
      playerId: room.wlc.playerId,
      color: room.wlc.color,
      claims: Object.fromEntries(Object.entries(room.wlc.subs).map(([k, s]) => [k, s.claim])),
      revealed: room.wlc.revealed,
      msLeft: Math.max(0, room.wlc.deadline - now),
    },
    result: room.result,
    matchWinner: room.matchWinner,
  };
}

function broadcast(room) {
  normalize(room);
  room.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('state', view(room, p));
  });
}

// ---------- Actions ----------
const actions = {
  start(room, me) {
    if (room.phase !== 'lobby') return 'The game already started.';
    if (me.id !== room.hostId) return 'Only the host can start the game.';
    if (room.players.length < 2) return 'You need at least 2 players.';
    startHand(room);
  },

  nextHand(room) {
    if (room.phase !== 'handover') return;
    if (room.players.length < 2) return 'You need at least 2 players.';
    startHand(room);
  },

  newMatch(room, me) {
    if (me.id !== room.hostId) return 'Only the host can reset the scores.';
    if (!['lobby', 'handover'].includes(room.phase)) return 'Finish this hand first.';
    room.players.forEach((p) => { p.score = 0; p.wins = 0; });
    room.matchWinner = null;
    sys(room, '🧽 The host wiped the scoreboard clean.');
  },

  kick(room, me, { targetId }) {
    if (me.id !== room.hostId) return;
    if (!['lobby', 'handover'].includes(room.phase)) return 'You can only remove players between hands.';
    const t = byId(room, targetId);
    if (!t || t === me) return;
    room.players = room.players.filter((p) => p !== t);
    room.order = room.order.filter((id) => id !== t.id);
    if (t.socketId) io.to(t.socketId).emit('kicked');
    sys(room, `👋 ${t.name} was removed from the table.`);
  },

  play(room, me, { cardId, claim, color, target }) {
    if (room.phase !== 'play') return 'Hang on, not right now.';
    if (curPlayer(room) !== me) return "It's not your turn.";
    const card = me.hand.find((c) => c.id === cardId);
    if (!card) return "You don't have that card.";
    if (room.drawnCard != null && room.drawnCard !== cardId) return 'After drawing, you can only play the card you just drew (or pass).';
    clearExposures(room, me.id);
    const stacking = room.drawStack > 0;
    if (stacking && !card.liar) return `+${room.drawStack} is coming at you! Stack a +2 or +4 (they're Liar's cards, played face down), or take the cards.`;

    if (!card.liar) {
      if (!canMatch(room, card)) return "That card doesn't match the pile.";
      if (card.value === 'wlc' && !COLORS.includes(color)) return 'Pick a color first.';
      let tgt = null;
      if (card.value === '7') {
        tgt = pickTarget(room, me, target);
        if (!tgt) return 'Pick who to swap hands with.';
      }
      me.hand = me.hand.filter((c) => c !== card);
      pushDiscard(room, { card, faceDown: false }, me.id);
      fx(room, { t: 'play', pid: me.id });
      room.drawnCard = null;
      markExposure(me);
      if (card.value === 'wlc') {
        room.currentColor = color;
        room.topValue = 'wlc';
        if (me.hand.length === 0) { sys(room, `${me.name} played a Wild Liar's Challenge as their last card!`); return endHand(room, [me]); }
        startWLC(room, me, color);
        return;
      }
      room.currentColor = card.color;
      room.topValue = card.value;
      sys(room, `${me.name} played a ${label(card)}.`);
      if (me.hand.length === 0) return endHand(room, [me]);
      advanceFrom(room, me, applyEffect(room, me, card.value, tgt));
      return;
    }

    // Liar's card: face down with a claim
    if (!validClaim(claim)) return 'Pick what you are saying the card is.';
    const c = { color: claim.color, value: claim.value };
    if (stacking && !['draw2', 'wd4'].includes(c.value)) return 'To stack, say your card is a Draw Two or a Wild Draw 4.';
    if (!stacking && !plausible(room, c)) return "That claim doesn't match the pile, so nobody would buy it. Pick something believable!";
    let tgt = null;
    if (c.value === '7') {
      tgt = pickTarget(room, me, target);
      if (!tgt) return 'Pick who to swap hands with.';
    }
    me.hand = me.hand.filter((x) => x !== card);
    pushDiscard(room, { card, faceDown: true, claim: c }, me.id);
    fx(room, { t: 'play', pid: me.id, faceDown: true });
    room.drawnCard = null;
    markExposure(me);
    room.phase = 'challenge';
    room.pending = { playerId: me.id, card, claim: c, target: tgt, deadline: Date.now() + CHALLENGE_SECONDS * 1000, responded: new Set() };
    sys(room, `🤔 ${me.name} plays a card face down and says it's a ${label(c)}${tgt ? ` (swapping with ${byId(room, tgt).name})` : ''}.`);
    checkAllResponded(room);
  },

  draw(room, me, _d, socket) {
    if (room.phase !== 'play') return 'Hang on, not right now.';
    if (curPlayer(room) !== me) return "It's not your turn.";
    if (room.drawnCard != null) return 'You already drew. Play that card or pass.';
    clearExposures(room, me.id);
    if (room.drawStack > 0) return takeStack(room, me);
    const [c] = drawCards(room, me, 1);
    if (!c) { sys(room, `${me.name} tried to draw but the deck is empty. Turn passes.`); advanceFrom(room, me, 1); return; }
    if (c.liar || canMatch(room, c)) {
      room.drawnCard = c.id;
      sys(room, `${me.name} draws a card...`);
      socket.emit('toast', `You drew a ${c.liar ? "Liar's " : ''}${label(c)}. Play it or pass.`);
    } else {
      sys(room, `${me.name} draws a card and passes.`);
      socket.emit('toast', `You drew a ${label(c)}. It can't be played, so your turn is over.`);
      advanceFrom(room, me, 1);
    }
  },

  pass(room, me) {
    if (room.phase !== 'play' || curPlayer(room) !== me) return;
    if (room.drawnCard == null) return 'Draw a card first.';
    sys(room, `${me.name} keeps the card and passes.`);
    advanceFrom(room, me, 1);
  },

  takeStack(room, me) {
    if (room.phase !== 'play' || curPlayer(room) !== me || room.drawStack <= 0) return;
    clearExposures(room, me.id);
    takeStack(room, me);
  },

  challenge(room, me) {
    const pd = room.pending;
    if (room.phase !== 'challenge' || !pd) return 'Too late!';
    if (pd.playerId === me.id) return "You can't call your own bluff, silly.";
    if (!inHand(room, me)) return;
    resolveChallenge(room, me);
  },

  believe(room, me) {
    const pd = room.pending;
    if (room.phase !== 'challenge' || !pd || pd.playerId === me.id) return;
    pd.responded.add(me.id);
    checkAllResponded(room);
  },

  uno(room, me) {
    if (!inHand(room, me) || room.phase === 'handover') return;
    const ok = me.hand.length === 1 ||
      (me.hand.length === 2 && curPlayer(room) === me && room.phase === 'play');
    if (!ok) return 'Save it! You yell UNO when you\'re about to have just one card left.';
    if (me.calledUno) return;
    me.calledUno = true;
    me.exposed = false;
    fx(room, { t: 'big', kind: 'uno', target: me.id });
    sys(room, `📣 ${me.name} yells "UNO!"`);
  },

  catch(room, me, { targetId }) {
    if (!inHand(room, me) || room.phase === 'handover') return;
    const t = byId(room, targetId);
    if (!t || t === me) return;
    if (t.exposed && t.hand.length === 1 && !t.calledUno) {
      drawCards(room, t, 2);
      t.exposed = false;
      fx(room, { t: 'big', kind: 'caught', target: t.id, by: me.id });
      sys(room, `🎯 ${me.name} caught ${t.name} forgetting to say UNO! ${t.name} draws 2.`);
    } else return 'Too late, or they already called it!';
  },

  wlcSubmit(room, me, { cardId, value }) {
    const w = room.wlc;
    if (room.phase !== 'wlc-submit' || !w) return;
    if (me.id === w.playerId || !inHand(room, me)) return;
    if (w.subs[me.id]) return 'You already put a card down.';
    const card = me.hand.find((c) => c.id === cardId);
    if (!card) return 'Pick a card from your hand.';
    if (!CLAIMABLE.includes(value)) return 'Say which card it is.';
    wlcSubmit(room, me, card, value);
  },

  wlcChallenge(room, me, { targetId }) {
    const w = room.wlc;
    if (room.phase !== 'wlc-judge' || !w || me.id !== w.playerId) return;
    const s = w.subs[targetId];
    if (!s || w.revealed[targetId]) return;
    const t = byId(room, targetId);
    const truth = s.card.color === w.color;
    w.revealed[targetId] = { card: s.card, truth };
    if (!truth) {
      fx(room, { t: 'big', kind: 'busted', target: t.id, by: me.id, card: s.card });
      t.hand.push(s.card);
      drawCards(room, t, 1);
      sys(room, `🚨 ${t.name} was bluffing! It was really a ${label(s.card)}. Back in the hand, plus 1 card.`);
      if (Object.keys(w.subs).every((id) => w.revealed[id])) finishWLC(room);
    } else {
      fx(room, { t: 'big', kind: 'truth', target: t.id, by: me.id });
      sys(room, `😇 ${t.name} really had a ${w.color} card. Challenge over!`);
      finishWLC(room);
    }
  },

  wlcDone(room, me) {
    if (room.phase !== 'wlc-judge' || !room.wlc || me.id !== room.wlc.playerId) return;
    finishWLC(room);
  },
};

// ---------- Connections ----------
function cleanName(s) {
  return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
function cleanAvatar(s) {
  // Only small PNG/JPEG data URLs (the browser shrinks every upload, SVGs included, to a 96px picture first).
  if (typeof s !== 'string' || s.length > 60000) return null;
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : null;
}
const avatarMap = (room) => Object.fromEntries(room.players.filter((p) => p.avatar).map((p) => [p.id, p.avatar]));
function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'UNO';
}

io.on('connection', (socket) => {
  socket.on('join', (data, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const name = cleanName(data && data.name);
    if (!name) return ack({ error: 'Type a name first!' });
    const code = cleanCode(data && data.room);
    const room = getRoom(code);
    let p = data && data.token ? room.players.find((x) => x.token === data.token) : null;
    if (p) {
      if (p.socketId && p.socketId !== socket.id) io.sockets.sockets.get(p.socketId)?.disconnect(true);
      p.connected = true;
      p.offlineSince = null;
      p.socketId = socket.id;
      sys(room, `🔌 ${p.name} is back.`);
    } else {
      if (room.players.length >= MAX_PLAYERS) return ack({ error: `That table is full (${MAX_PLAYERS} players max). Try another room code.` });
      let finalName = name;
      let k = 2;
      while (room.players.some((x) => x.name.toLowerCase() === finalName.toLowerCase())) finalName = `${name} ${k++}`;
      p = {
        id: crypto.randomBytes(6).toString('hex'),
        token: crypto.randomBytes(16).toString('hex'),
        name: finalName, hand: [], score: 0, wins: 0,
        connected: true, socketId: socket.id, offlineSince: null,
        calledUno: false, exposed: false, avatar: null,
      };
      room.players.push(p);
      sys(room, room.phase === 'lobby' ? `👋 ${p.name} sat down at the table.` : `👋 ${p.name} joined and will be dealt in next hand.`);
    }
    if (data && 'avatar' in data) p.avatar = cleanAvatar(data.avatar);
    if (!room.hostId || !byId(room, room.hostId)) room.hostId = p.id;
    room.emptySince = null;
    socket.data.room = code;
    socket.data.pid = p.id;
    socket.join(code);
    ack({ ok: true, token: p.token, id: p.id, room: code });
    socket.emit('chatHistory', room.chat);
    io.to(code).emit('avatars', avatarMap(room));
    broadcast(room);
  });

  socket.on('avatar', (img) => {
    const room = rooms.get(socket.data.room);
    const me = room && byId(room, socket.data.pid);
    if (!me) return;
    me.avatar = img ? cleanAvatar(img) : null;
    if (img && !me.avatar) return socket.emit('toast', "That picture didn't work. Try a different PNG, JPG or SVG.");
    io.to(room.code).emit('avatars', avatarMap(room));
  });

  socket.on('chat', (text) => {
    const room = rooms.get(socket.data.room);
    const me = room && byId(room, socket.data.pid);
    if (!me) return;
    const clean = String(text || '').trim().slice(0, 300);
    if (!clean) return;
    const msg = { type: 'chat', from: me.name, fromId: me.id, text: clean, t: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 150) room.chat.shift();
    io.to(room.code).emit('chat', msg);
  });

  for (const [name, fn] of Object.entries(actions)) {
    socket.on(name, (data) => {
      const room = rooms.get(socket.data.room);
      const me = room && byId(room, socket.data.pid);
      if (!me) return;
      try {
        const err = fn(room, me, data || {}, socket);
        if (typeof err === 'string') socket.emit('toast', err);
      } catch (e) {
        console.error(e);
        socket.emit('toast', 'Oops, something went wrong with that move.');
      }
      broadcast(room);
    });
  }

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    const me = room && byId(room, socket.data.pid);
    if (!me || me.socketId !== socket.id) return;
    me.connected = false;
    me.socketId = null;
    me.offlineSince = Date.now();
    sys(room, `📴 ${me.name} lost connection.`);
    if (room.hostId === me.id) {
      const nh = room.players.find((p) => p.connected);
      if (nh) room.hostId = nh.id;
    }
    if (room.phase === 'challenge') checkAllResponded(room);
    broadcast(room);
  });
});

// ---------- Timers: challenge windows, offline players, cleanup ----------
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    const offlineLong = (p) => p && !p.connected && now - (p.offlineSince || now) > OFFLINE_AUTOPLAY_SECONDS * 1000;

    if (room.phase === 'challenge' && room.pending && now >= room.pending.deadline) {
      resolveChallenge(room, null); changed = true;
    }
    if (room.phase === 'play') {
      const cp = curPlayer(room);
      if (offlineLong(cp) && now - room.turnStarted > OFFLINE_AUTOPLAY_SECONDS * 1000) {
        if (room.drawStack > 0) { sys(room, `🤖 ${cp.name} is offline.`); takeStack(room, cp); changed = true; }
        else {
          if (room.drawnCard == null) drawCards(room, cp, 1);
          sys(room, `🤖 ${cp.name} is offline, so they draw and pass.`);
          advanceFrom(room, cp, 1); changed = true;
        }
      }
    }
    if (room.phase === 'wlc-submit' && room.wlc) {
      const late = now >= room.wlc.deadline;
      for (const id of room.order) {
        if (room.phase !== 'wlc-submit') break;
        const p = byId(room, id);
        if (id === room.wlc.playerId || room.wlc.subs[id]) continue;
        if (late || offlineLong(p)) { autoSubmit(room, p); changed = true; }
      }
    }
    if (room.phase === 'wlc-judge' && room.wlc && offlineLong(byId(room, room.wlc.playerId))) {
      finishWLC(room); changed = true;
    }
    if (room.phase === 'lobby') {
      const gone = room.players.filter((p) => !p.connected && now - (p.offlineSince || now) > 30000);
      if (gone.length) {
        room.players = room.players.filter((p) => !gone.includes(p));
        if (!byId(room, room.hostId) && room.players[0]) room.hostId = room.players[0].id;
        changed = true;
      }
    }
    if (changed) broadcast(room);

    const anyone = room.players.some((p) => p.connected);
    if (!anyone) {
      room.emptySince = room.emptySince || now;
      if (now - room.emptySince > 6 * 60 * 60 * 1000) rooms.delete(room.code);
    } else room.emptySince = null;
  }
}, 500);

if (process.env.LUNO_DEBUG) {
  app.get('/debug/:code', (req, res) => {
    const r = rooms.get(req.params.code);
    if (!r) return res.json({});
    const live = r.wlc ? Object.entries(r.wlc.subs).filter(([id]) => !(r.wlc.revealed[id] && !r.wlc.revealed[id].truth)).map(([, s]) => s.card) : [];
    const subs = live.length;
    const hands = r.players.reduce((s, p) => s + p.hand.length, 0);
    const ids = new Set([...r.deck, ...r.discard.map((e) => e.card), ...r.players.flatMap((p) => p.hand), ...live].map((c) => c.id));
    res.json({ phase: r.phase, total: hands + r.deck.length + r.discard.length + subs, unique: ids.size });
  });
}

server.listen(PORT, () => console.log(`Liar's UNO is running on port ${PORT}`));
