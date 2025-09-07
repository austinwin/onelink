import TTT_PLUS from './games/ttt_plus.js';
import NOTAKTO   from './games/notakto.js';
import DAB       from './games/dots.js';
import PIXEL     from './games/pixel.js';
import C4        from './games/connect4.js';
import SOKO      from './games/sokoban.js';

// ---------------- Device & alias ----------------
function shortId(){ return Math.random().toString(36).slice(2,8); }
function getDeviceId(){
  let id = localStorage.getItem('olu_device');
  if(!id){ id = shortId(); localStorage.setItem('olu_device', id); }
  return id;
}
function getSavedAlias(){ return localStorage.getItem('olu_alias') || ''; }
function saveAlias(val){ localStorage.setItem('olu_alias', val||''); }
const DEVICE_ID = getDeviceId();

// ---------------- URL codec ----------------
function encodeState(obj){
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function decodeState(str){
  const b64 = str.replaceAll('-','+').replaceAll('_','/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const json = decodeURIComponent(escape(atob(b64 + pad)));
  return JSON.parse(json);
}
function makeLinkFromState(s){
  const url = new URL(location.href);
  url.hash = '#s=' + encodeState(s);
  return url.toString();
}
function readStateFromURL(){
  const h = location.hash || '';
  const m = h.match(/#s=([A-Za-z0-9_-]+)/);
  return m ? decodeState(m[1]) : null;
}
function shallowClone(o){ return JSON.parse(JSON.stringify(o)); }

// ---------------- Social meta & players ----------------
function newMeta(){
  return { gameId: shortId(), createdAt: Date.now(), views: 0, sharers: [], lastShareAt: null };
}
function ensureMeta(s){
  if(!s.meta) s.meta = newMeta();
  if(!Array.isArray(s.meta.sharers)) s.meta.sharers = [];
  if(s.meta.sharers.length > 24) s.meta.sharers = s.meta.sharers.slice(-24);
  return s;
}
function ensurePlayers(s){
  if(!s.players) s.players = { X:{id:null,alias:null}, O:{id:null,alias:null} };
  return s;
}
function aliasOf(state, mark){
  const a = (state.players?.[mark]?.alias)||'';
  return a || null;
}
function seatOwnerId(state, mark){ return state.players?.[mark]?.id || null; }
function mySeat(state){
  if(seatOwnerId(state, 'X') === DEVICE_ID) return 'X';
  if(seatOwnerId(state, 'O') === DEVICE_ID) return 'O';
  return null;
}
function isMyTurn(state){
  const seat = mySeat(state);
  return seat && state.turn === seat && !state.winner && !state.loser;
}

// ---------------- Deterministic twists ----------------
function seedRand(seedStr){
  let h = 2166136261 >>> 0;
  for(let i=0;i<seedStr.length;i++){ h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function(){ h ^= h<<13; h ^= h>>>17; h ^= h<<5; return ((h>>>0)/4294967296); };
}
export function getActiveTwists(meta, gameKey){
  const views = meta?.views||0;
  const rnd = seedRand((meta?.gameId||'g') + ':' + gameKey + ':' + (meta?.createdAt||0));
  const twists = {
    forbidCellIdx: null,
    forceCornerEveryN: null,
    paletteLimit: null,
    pixelDecayOnShare: false,
    turnBudget: 1
  };
  if(views >= 10){
    if(gameKey==='ttt' || gameKey==='notakto') twists.forbidCellIdx = Math.floor(rnd()*9);
    if(gameKey==='pixel') twists.paletteLimit = 4;
  }
  if(views >= 25){
    if(gameKey==='ttt' || gameKey==='notakto') twists.forceCornerEveryN = 3;
    if(gameKey==='pixel') twists.pixelDecayOnShare = true;
  }
  if(views >= 50){
    twists.turnBudget = 2; // global twist: 2 actions per turn
  }
  return twists;
}

// ---------------- Registry ----------------
const GAMES = {
  ttt: TTT_PLUS,
  notakto: NOTAKTO,
  dots: DAB,
  pixel: PIXEL,
  c4: C4,
  soko: SOKO
};

// ---------------- DOM refs ----------------
const els = {
  gameSel: document.getElementById('gameSel'),
  newBtn: document.getElementById('newBtn'),
  swapBtn: document.getElementById('swapBtn'),
  viewport: document.getElementById('viewport'),
  status: document.getElementById('status'),
  shareLink: document.getElementById('shareLink'),
  copyBtn: document.getElementById('copyBtn'),
  openLink: document.getElementById('openLink'),
  reshareBtn: document.getElementById('reshareBtn'),
  turnWho: document.getElementById('turnWho'),
  modePill: document.getElementById('modePill'),
  budgetLeft: document.getElementById('budgetLeft'),
  aliasInput: document.getElementById('aliasInput'),
  saveAliasBtn: document.getElementById('saveAliasBtn'),
  claimX: document.getElementById('claimX'),
  claimO: document.getElementById('claimO'),
  releaseSeat: document.getElementById('releaseSeat'),
  viewsCount: document.getElementById('viewsCount'),
  sharersCount: document.getElementById('sharersCount'),
  friendsCount: document.getElementById('friendsCount'),
  historyRibbon: document.getElementById('historyRibbon'),
};

// ---------------- Engine state ----------------
let activeGameKey = 'ttt';
let coreState = null;   // { g, p }
let canAct = false;
let sessionOpens = 0;   // local opens, flushed into meta.views on share

// ---------------- History helpers (bounded) ----------------
// Compact entries to avoid bloat: {n, by, k, p} where k=kind, p=payload-small
function pushHistoryEntry(p, by, gameKey, payload){
  if(!Array.isArray(p.h)) p.h = [];
  const entry = { n: (p.h.length+1), by, k: gameKey, p: payload };
  p.h.push(entry);
  if(p.h.length > 24) p.h = p.h.slice(-24);
}
function renderHistoryRibbon(p){
  els.historyRibbon.innerHTML = '';
  if(!Array.isArray(p.h) || p.h.length===0){
    const chip = document.createElement('div');
    chip.className='chip'; chip.textContent = 'No moves yet';
    els.historyRibbon.appendChild(chip);
    return;
  }
  p.h.forEach((e, idx)=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `#${e.n} ${e.by} • ${e.k}:${summ(e.k, e.p)}`;
    chip.title = 'Local replay preview only';
    chip.addEventListener('click', ()=> previewReplay(idx));
    els.historyRibbon.appendChild(chip);
  });
}
function summ(k, p){
  if(k==='ttt' || k==='notakto'){ return `@${p}`; }
  if(k==='dots'){ return `${p.t}${p.i}`; }
  if(k==='pixel'){ return `px${p.i}`; }
  if(k==='c4'){ return `c${p.c}`; }
  if(k==='soko'){
    if(p.t==='move') return p.d;
    if(p.t==='regen') return (p.level||'regen');
    return '?';
  }
  return '?';
}
// Local-only replay: regenerate from seed + history up to index -> draw to a temp canvas overlay
function previewReplay(upToIndex){
  // Non-destructive: we simulate using the plugin’s initState() and applyMove()
  try{
    const g = GAMES[coreState.g];
    const seedStart = coreState.p.start || 'X';
    let s = g.deserialize(g.serialize(g.initState(seedStart)));
    // carry meta/players for visual hints; not necessary for logic
    s.meta = coreState.p.meta; s.players = coreState.p.players;
    const hist = (coreState.p.h||[]).slice(0, upToIndex+1);
    const moverSeq = [];
    let t = s.turn;
    for(const e of hist){
      // Respect turn budget in replay: same logic as engine
      const twists = getActiveTwists(s.meta, coreState.g);
      let budget = twists.turnBudget || 1;
      const mover = t;
      s = g.applyMove(s, e.p);
      budget -= 1;
      if(!s.winner && !s.loser && budget>0){ s.turn = mover; } // stick turn if budget remains
      else { /* turn already toggled by game */ }
      moverSeq.push(mover);
      t = s.turn;
    }
    // Render in place (temporary) using existing viewport, but dim UI
    g.render(els.viewport, s, ()=>{}, false);
  } catch(_){}
}

// ---------------- Social meta flows ----------------
function bumpSessionOpens(){ sessionOpens += 1; }
function flushSessionOpensIntoMeta(){
  if(sessionOpens > 0){
    coreState.p.meta.views = (coreState.p.meta.views||0) + sessionOpens;
    sessionOpens = 0;
  }
}
function addSharer(){
  const arr = coreState.p.meta.sharers || [];
  if(!arr.includes(DEVICE_ID)){
    arr.push(DEVICE_ID);
    if(arr.length > 24) arr.splice(0, arr.length - 24);
    coreState.p.meta.sharers = arr;
  }
  coreState.p.meta.lastShareAt = Date.now();
}

// ---------------- Engine core ----------------
function listGames(){
  els.gameSel.innerHTML = '';
  Object.entries(GAMES).forEach(([k,v])=>{
    const o = document.createElement('option');
    o.value = k; o.textContent = v.name; els.gameSel.appendChild(o);
  });
  els.gameSel.value = activeGameKey;
}
function newGame(start='X'){
  const g = GAMES[activeGameKey];
  coreState = { g: activeGameKey, p: g.serialize(g.initState(start)) };
  draw();
}
function setFromURL(){
  const s = readStateFromURL();
  if(!s){ newGame('X'); return; }
  if(!GAMES[s.g]){ activeGameKey = 'ttt'; newGame('X'); return; }
  activeGameKey = s.g; els.gameSel.value = activeGameKey;
  const g = GAMES[s.g];
  coreState = { g: s.g, p: ensurePlayers(ensureMeta(g.deserialize(s.p))) };
  // Init per-turn budget if absent
  if(typeof coreState.p.budgetLeft!=='number'){
    const t = getActiveTwists(coreState.p.meta, coreState.g);
    coreState.p.budgetLeft = t.turnBudget || 1;
  }
  bumpSessionOpens();
  draw();
}

function onMoveGeneric(payload){
  const g = GAMES[coreState.g];
  if(!isMyTurn(coreState.p)) return;
  if(!g.isValidMove(coreState.p, payload)) return;

  const mover = coreState.p.turn;
  let next = g.applyMove(coreState.p, payload); // plugin may toggle turn
  // --- Turn Budget enforcement
  const twists = getActiveTwists(next.meta, coreState.g);
  if(typeof next.budgetLeft!=='number') next.budgetLeft = twists.turnBudget || 1;
  next.budgetLeft -= 1;
  if(!next.winner && !next.loser && next.budgetLeft > 0){
    // keep turn with mover
    next.turn = mover;
  } else {
    // new turn starts: reset budget
    const t2 = getActiveTwists(next.meta, coreState.g);
    next.budgetLeft = t2.turnBudget || 1;
  }

  // History push (compact)
  pushHistoryEntry(next, mover, coreState.g, payload);

  coreState.p = next;

  // On share (move emits a link): flush opens & add sharer; plus optional pixel decay
  flushSessionOpensIntoMeta();
  addSharer();
  if(coreState.g === 'pixel'){
    const tw = getActiveTwists(coreState.p.meta, 'pixel');
    if(tw.pixelDecayOnShare){
      const rnd = seedRand(coreState.p.meta.gameId + ':decay:' + (coreState.p.meta.views||0));
      const n = coreState.p.pixels.length;
      const i = Math.floor(rnd()*n);
      coreState.p.pixels[i] = 0; // black
    }
  }

  publishLinkAndDraw();
}

function publishLinkAndDraw(){
  const g = GAMES[coreState.g];
  const nextStateForURL = { g: coreState.g, p: g.serialize(coreState.p) };
  const link = makeLinkFromState(nextStateForURL);
  els.shareLink.value = link; els.openLink.href = link;
  draw();
}

function updateModePill(){
  const isMine = isMyTurn(coreState.p);
  const seat = mySeat(coreState.p);
  const pillText = els.modePill.querySelector('strong');
  if(coreState.p.winner || coreState.p.loser){
    pillText.textContent = 'Finished';
    return;
  }
  if(isMine){ pillText.textContent = `${seat}`; }
  else { pillText.textContent = 'Spectator'; }
}

function draw(){
  const g = GAMES[coreState.g];
  canAct = isMyTurn(coreState.p);
  els.turnWho.textContent = coreState.p.turn;
  els.budgetLeft.textContent = String(coreState.p.budgetLeft ?? (getActiveTwists(coreState.p.meta, coreState.g).turnBudget||1));
  g.render(els.viewport, coreState.p, onMoveGeneric, canAct);
  els.status.textContent = g.status(coreState.p);

  // Counters
  const seated = ['X','O'].filter(m => !!seatOwnerId(coreState.p, m)).length;
  const sharers = (coreState.p.meta.sharers||[]).length;
  const friendsPlayed = Math.max(0, sharers - seated);
  els.viewsCount.textContent = String(coreState.p.meta.views||0);
  els.sharersCount.textContent = String(sharers);
  els.friendsCount.textContent = String(friendsPlayed);

  // Share link for current state
  const link = makeLinkFromState({ g: coreState.g, p: g.serialize(coreState.p) });
  els.shareLink.value = link; els.openLink.href = link;

  updateModePill();
  renderHistoryRibbon(coreState.p);
}

// ---------------- Seats & alias ----------------
function claimSeat(mark){
  const alias = getSavedAlias();
  const current = seatOwnerId(coreState.p, mark);
  if(current && current !== DEVICE_ID){
    if(!confirm(`Seat ${mark} is bound to another device. Take over?`)) return;
  }
  coreState.p.players[mark].id = DEVICE_ID;
  if(alias) coreState.p.players[mark].alias = alias;
  draw();
}
function releaseMySeat(){
  const seat = mySeat(coreState.p);
  if(!seat) return;
  coreState.p.players[seat].id = null;
  draw();
}

// ---------------- Events ----------------
window.addEventListener('hashchange', setFromURL);
els.newBtn.addEventListener('click', ()=> newGame('X'));
els.swapBtn.addEventListener('click', ()=> newGame(coreState?.p?.start==='X'?'O':'X'));
els.copyBtn.addEventListener('click', async ()=>{
  try { await navigator.clipboard.writeText(els.shareLink.value); els.copyBtn.textContent = 'Copied'; setTimeout(()=> els.copyBtn.textContent='Copy Link', 1000); } catch(e){ alert('Copy failed.'); }
});
els.gameSel.addEventListener('change', ()=>{ activeGameKey = els.gameSel.value; newGame('X'); });
els.aliasInput.value = getSavedAlias();
els.saveAliasBtn.addEventListener('click', ()=>{
  saveAlias(els.aliasInput.value.trim());
  const seat = mySeat(coreState.p);
  if(seat){ coreState.p.players[seat].alias = getSavedAlias() || null; }
  draw();
});
els.claimX.addEventListener('click', ()=> claimSeat('X'));
els.claimO.addEventListener('click', ()=> claimSeat('O'));
els.releaseSeat.addEventListener('click', ()=> releaseMySeat());
els.reshareBtn.addEventListener('click', ()=>{
  flushSessionOpensIntoMeta();
  addSharer();
  // Optional share-time pixel decay already applied on move; keep link emission consistent here
  publishLinkAndDraw();
});

// ---------------- Init ----------------
listGames();
setFromURL();

// Export bits used by games (optional)
export { aliasOf, getSavedAlias, ensureMeta, ensurePlayers, shallowClone };
