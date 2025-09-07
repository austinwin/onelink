import { ensureMeta, ensurePlayers, shallowClone, aliasOf } from '../core.js';

// Simple deterministic RNG
function seedRand(seedStr){
  let h = 2166136261 >>> 0;
  for(let i=0;i<seedStr.length;i++){ h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function(){ h ^= h<<13; h ^= h>>>17; h ^= h<<5; return ((h>>>0)/4294967296); };
}

function posToIndex(x, y, w){ return y*w + x; }
function indexToPos(i, w){ return { x: i%w, y: Math.floor(i/w) }; }

function genLevel(meta, difficulty, salt=''){
  const dims = {
    easy:   { w: 9,  h: 9,  boxes: 3, walls: 10 },
    medium: { w: 11, h: 9,  boxes: 4, walls: 16 },
    hard:   { w: 13, h: 11, boxes: 5, walls: 24 }
  }[difficulty] || { w: 9, h: 9, boxes: 3, walls: 10 };
  const { w, h, boxes: boxCount, walls: wallRects } = dims;

  const rnd = seedRand((meta?.gameId||'g') + ':soko:' + (meta?.createdAt||0) + ':' + difficulty + ':' + salt);
  const walls = new Set();

  // Outer border walls
  for(let x=0;x<w;x++){ walls.add(posToIndex(x,0,w)); walls.add(posToIndex(x,h-1,w)); }
  for(let y=0;y<h;y++){ walls.add(posToIndex(0,y,w)); walls.add(posToIndex(w-1,y,w)); }

  // Random internal wall rectangles
  for(let n=0;n<wallRects;n++){
    const rw = 2 + Math.floor(rnd()*3); // 2..4
    const rh = 2 + Math.floor(rnd()*3);
    const x0 = 1 + Math.floor(rnd()*(w-rw-1));
    const y0 = 1 + Math.floor(rnd()*(h-rh-1));
    // Carve hollow rectangles (like corridors) to keep areas connected-ish
    for(let y=y0;y<y0+rh;y++){
      for(let x=x0;x<x0+rw;x++){
        const onEdge = (y===y0||y===y0+rh-1||x===x0||x===x0+rw-1);
        if(onEdge) walls.add(posToIndex(x,y,w));
      }
    }
  }

  // Helper: avoid placing boxes in hard corners (two orthogonal adjacent walls)
  const isCornerLock = (i)=>{
    const {x,y} = indexToPos(i,w);
    const up = walls.has(posToIndex(x,y-1,w));
    const dn = walls.has(posToIndex(x,y+1,w));
    const lf = walls.has(posToIndex(x-1,y,w));
    const rt = walls.has(posToIndex(x+1,y,w));
    return (up&&lf) || (up&&rt) || (dn&&lf) || (dn&&rt);
  };

  // Collect floor cells
  const floors = [];
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const idx = posToIndex(x,y,w);
      if(!walls.has(idx)) floors.push(idx);
    }
  }

  // Pick targets
  const targets = new Set();
  while(targets.size < boxCount && floors.length){
    const i = Math.floor(rnd()*floors.length);
    const idx = floors.splice(i,1)[0];
    targets.add(idx);
  }

  // Pick boxes
  const boxes = new Set();
  while(boxes.size < boxCount && floors.length){
    const i = Math.floor(rnd()*floors.length);
    const idx = floors.splice(i,1)[0];
    if(targets.has(idx)) continue;
    if(isCornerLock(idx)) continue; // reduce impossible starts
    boxes.add(idx);
  }

  // Player start
  let player = null;
  while(player==null && floors.length){
    const i = Math.floor(rnd()*floors.length);
    const idx = floors.splice(i,1)[0];
    if(!targets.has(idx) && !boxes.has(idx)) player = idx;
  }

  return { w, h, walls: Array.from(walls), targets: Array.from(targets), boxes: Array.from(boxes), player, difficulty };
}

function allBoxesOnTargets(state){
  const t = new Set(state.targets);
  for(const b of state.boxes){ if(!t.has(b)) return false; }
  return true;
}

function canMove(state, dx, dy){
  const { w, h } = state;
  const walls = new Set(state.walls);
  const boxes = new Set(state.boxes);
  const p = state.player;
  const x = p%w, y = Math.floor(p/w);
  const nx = x + dx, ny = y + dy;
  if(nx<0||nx>=w||ny<0||ny>=h) return null;
  const n1 = posToIndex(nx,ny,w);
  if(walls.has(n1)) return null;
  if(boxes.has(n1)){
    const bx = nx + dx, by = ny + dy;
    if(bx<0||bx>=w||by<0||by>=h) return null;
    const n2 = posToIndex(bx,by,w);
    if(walls.has(n2) || boxes.has(n2)) return null;
    return { type:'push', from:n1, to:n2, newPlayer:n1 };
  }
  return { type:'step', to:n1 };
}

// Solver: BFS over push states. Returns boolean solvable.
function isSolvable(level){
  const { w, h } = level;
  const walls = new Set(level.walls);
  const targets = new Set(level.targets);
  const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ];
  const inb = (x,y)=> x>=0 && x<w && y>=0 && y<h;
  const hash = (player, boxesArr)=> boxesArr.slice().sort((a,b)=>a-b).join(',') + '|' + player;
  const asSet = (arr)=>{ const s=new Set(); for(const v of arr) s.add(v); return s; };

  const start = { player: level.player, boxes: level.boxes.slice() };
  const q = [ start ];
  const seen = new Set([ hash(start.player, start.boxes) ]);

  const tStart = Date.now();
  let steps = 0;
  while(q.length){
    if(Date.now() - tStart > 120) return false; // budget safety
    if(++steps > 8000) return false; // node limit
    const s = q.shift();
    // goal?
    let onAll = true; for(const b of s.boxes){ if(!targets.has(b)){ onAll=false; break; } }
    if(onAll) return true;

    // Compute reachable cells for player without pushing
    const boxSet = asSet(s.boxes);
    const canWalk = (i)=> !walls.has(i) && !boxSet.has(i);
    const flood = ()=>{
      const vis = new Set(); const fq=[s.player]; vis.add(s.player);
      while(fq.length){
        const p = fq.shift(); const x=p%w, y=Math.floor(p/w);
        for(const [dx,dy] of dirs){ const nx=x+dx, ny=y+dy; if(!inb(nx,ny)) continue; const ni=ny*w+nx; if(!vis.has(ni) && canWalk(ni)){ vis.add(ni); fq.push(ni); } }
      }
      return vis;
    };
    const reachable = flood();

    // For each box, attempt pushes
    for(const b of s.boxes){
      const bx = b%w, by = Math.floor(b/w);
      for(const [dx,dy] of dirs){
        const px = bx - dx, py = by - dy; // player must stand here
        const tx = bx + dx, ty = by + dy; // box goes here
        if(!inb(px,py) || !inb(tx,ty)) continue;
        const pi = py*w + px, ti = ty*w + tx;
        if(walls.has(pi) || walls.has(ti)) continue;
        if(reachable.has(pi) && !walls.has(ti) && !boxSet.has(ti)){
          const nextBoxes = s.boxes.slice();
          const j = nextBoxes.indexOf(b);
          if(j<0) continue;
          nextBoxes[j] = ti;
          const nextPlayer = b; // player moves into box's old square
          const key = hash(nextPlayer, nextBoxes);
          if(!seen.has(key)){
            seen.add(key); q.push({ player: nextPlayer, boxes: nextBoxes });
          }
        }
      }
    }
  }
  return false;
}

function genSolvableLevel(meta, difficulty, saltBase=''){
  let attempt = 0; let last = null;
  while(attempt < 30){
    const lvl = genLevel(meta, difficulty, saltBase+':'+attempt);
    last = lvl;
    try { if(isSolvable(lvl)) return lvl; } catch(_){ /* ignore */ }
    attempt++;
  }
  return last || genLevel(meta, difficulty, saltBase+':fallback');
}

export default {
  name: 'Sokoban',

  initState(start='X'){
    // Prepare base state then generate a level (default easy)
    const base = ensurePlayers(ensureMeta({
      start, turn:start, winner:null, moves:0,
      difficulty: 'easy',
      w: 0, h: 0, walls: [], targets: [], boxes: [], player: 0,
      meta:null, players:null, budgetLeft:1, h:[]
    }));
    const level = genSolvableLevel(base.meta, base.difficulty, 'init');
    Object.assign(base, level);
    return base;
  },

  serialize(s){ return shallowClone(s); },
  deserialize(p){ return shallowClone(p); },

  render(root, state, onMove, canAct){
    root.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = `repeat(${state.w}, 28px)`;
    wrap.style.gridTemplateRows = `repeat(${state.h}, 28px)`;
    wrap.style.gap = '2px';
    wrap.style.padding = '8px';
    wrap.style.background = '#cfc39a';
    wrap.style.border = '1px solid #8a835d';
    wrap.style.borderRadius = '12px';
    wrap.style.margin = '0 auto';

    // Controls: difficulty + regenerate
    const controls = document.createElement('div');
    controls.className = 'row';
    controls.style.justifyContent = 'center';
    controls.style.marginBottom = '8px';

    const sel = document.createElement('select');
    ['easy','medium','hard'].forEach(l=>{
      const o = document.createElement('option'); o.value=l; o.textContent=l; sel.appendChild(o);
    });
    sel.value = state.difficulty || 'easy';
    sel.disabled = !canAct || !!state.winner || state.moves>0; // freeze after first move
    sel.title = sel.disabled ? 'Difficulty locked after first move' : 'Select difficulty';
    controls.appendChild(sel);

    const regen = document.createElement('button');
    regen.className = 'ghost';
    regen.textContent = 'New Random';
    regen.disabled = !canAct || !!state.winner;
    regen.addEventListener('click', ()=> (!regen.disabled) && onMove({ t:'regen', level: sel.value }));
    controls.appendChild(regen);

    // Movement buttons (mobile)
    const pad = document.createElement('div');
    pad.style.display = 'grid';
    pad.style.gridTemplateColumns = 'repeat(3, 40px)';
    pad.style.gap = '6px';
    pad.style.margin = '0 auto 8px';
    const mkBtn = (label, d)=>{
      const b = document.createElement('button'); b.textContent = label; b.className='cell'; b.style.minHeight='36px';
      b.disabled = !canAct || !!state.winner; b.addEventListener('click', ()=> (!b.disabled) && onMove({t:'move', d}));
      return b;
    };
    pad.appendChild(document.createElement('div'));
    pad.appendChild(mkBtn('↑','U'));
    pad.appendChild(document.createElement('div'));
    pad.appendChild(mkBtn('←','L'));
    pad.appendChild(mkBtn('↓','D'));
    pad.appendChild(mkBtn('→','R'));

    // Keyboard controls
    root.tabIndex = 0;
    root.onkeydown = (e)=>{
      if(!canAct || state.winner) return;
      const k = e.key;
      if(k==='ArrowUp' || k==='w' || k==='W'){ onMove({t:'move', d:'U'}); e.preventDefault(); }
      else if(k==='ArrowDown' || k==='s' || k==='S'){ onMove({t:'move', d:'D'}); e.preventDefault(); }
      else if(k==='ArrowLeft' || k==='a' || k==='A'){ onMove({t:'move', d:'L'}); e.preventDefault(); }
      else if(k==='ArrowRight' || k==='d' || k==='D'){ onMove({t:'move', d:'R'}); e.preventDefault(); }
    };

    // Precompute sets
    const walls = new Set(state.walls);
    const targets = new Set(state.targets);
    const boxes = new Set(state.boxes);

    // Draw grid
    for(let y=0;y<state.h;y++){
      for(let x=0;x<state.w;x++){
        const i = posToIndex(x,y,state.w);
        const cell = document.createElement('div');
        cell.style.width = '28px';
        cell.style.height = '28px';
        cell.style.borderRadius = '4px';
        cell.style.position = 'relative';

        if(walls.has(i)){
          // Brick wall look
          cell.style.background = 'repeating-linear-gradient(0deg,#8a7b54,#8a7b54 6px,#7a6d49 6px,#7a6d49 12px)';
          cell.style.boxShadow = 'inset 0 0 0 2px #6d623f';
        } else {
          // Sand floor
          cell.style.background = '#e7dbb0';
          cell.style.boxShadow = 'inset 0 2px 0 rgba(0,0,0,.06)';
          if(targets.has(i)){
            const dot = document.createElement('div');
            dot.style.position = 'absolute'; dot.style.left='50%'; dot.style.top='50%';
            dot.style.transform = 'translate(-50%,-50%)';
            dot.style.width='10px'; dot.style.height='10px'; dot.style.borderRadius='50%';
            dot.style.background = '#f59fb0';
            cell.appendChild(dot);
          }
          if(boxes.has(i)){
            const crate = document.createElement('div');
            crate.style.position='absolute'; crate.style.left='3px'; crate.style.top='3px';
            crate.style.right='3px'; crate.style.bottom='3px';
            crate.style.borderRadius='4px';
            crate.style.background='linear-gradient(180deg,#b47a39,#8b5a2b)';
            crate.style.border='2px solid #6d3f19';
            crate.style.boxShadow='inset 0 0 0 2px #a36a2f';
            // decorative X
            const x1 = document.createElement('div');
            x1.style.position='absolute'; x1.style.left='6px'; x1.style.top='6px'; x1.style.right='6px'; x1.style.bottom='6px';
            x1.style.border='2px solid rgba(0,0,0,0.2)'; x1.style.transform='rotate(45deg)'; x1.style.borderRadius='2px';
            crate.appendChild(x1);
            cell.appendChild(crate);
          }
          if(state.player === i){
            const p = document.createElement('div');
            p.style.position='absolute'; p.style.left='50%'; p.style.top='50%';
            p.style.transform='translate(-50%,-60%)';
            p.style.fontSize='18px'; p.textContent='🧑';
            cell.appendChild(p);
          }
        }
        wrap.appendChild(cell);
      }
    }

    // Build UI block: controls + grid + pad
    const container = document.createElement('div');
    container.style.display='flex';
    container.style.flexDirection='column';
    container.style.alignItems='center';
    container.appendChild(controls);
    container.appendChild(wrap);
    container.appendChild(pad);
    root.appendChild(container);

    // Focus for keyboard
    setTimeout(()=>{ try{ root.focus(); }catch(_){} }, 0);
  },

  isValidMove(state, payload){
    if(state.winner) return false;
    if(!payload || typeof payload !== 'object') return false;
    if(payload.t === 'regen'){
      return ['easy','medium','hard'].includes(payload.level);
    }
    if(payload.t === 'move'){
      const dir = payload.d;
      const map = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
      if(!map[dir]) return false;
      return !!canMove(state, map[dir][0], map[dir][1]);
    }
    return false;
  },

  applyMove(state, payload){
    const s = shallowClone(state);
    if(payload.t === 'regen'){
      const lvl = payload.level;
      const level = genSolvableLevel(s.meta, lvl, String(Date.now()));
      Object.assign(s, level);
      s.difficulty = lvl;
      s.moves++;
      s.turn = (s.turn==='X'?'O':'X');
      return s;
    }
    if(payload.t === 'move'){
      const map = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] };
      const [dx,dy] = map[payload.d];
      const mv = canMove(s, dx, dy);
      if(!mv) return s; // no change
      if(mv.type==='step'){
        s.player = mv.to;
      } else if(mv.type==='push'){
        // move box
        const bi = s.boxes.indexOf(mv.from);
        if(bi>=0) s.boxes[bi] = mv.to;
        s.player = mv.newPlayer;
      }
      s.moves++;
      if(allBoxesOnTargets(s)){
        // Current mover wins
        s.winner = s.turn;
      } else {
        s.turn = (s.turn==='X'?'O':'X');
      }
      return s;
    }
    return s;
  },

  status(state){
    if(state.winner) return `Solved by ${aliasOf(state, state.winner)||state.winner}!`;
    return `Turn: ${aliasOf(state, state.turn)||state.turn} — Sokoban ${state.difficulty}`;
  }
};
