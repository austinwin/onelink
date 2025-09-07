import { ensureMeta, ensurePlayers, shallowClone, aliasOf } from '../core.js';

export default {
  name: 'Connect Four',

  initState(start='X'){
    const w = 7, h = 6;
    return ensurePlayers(ensureMeta({
      w, h,
      // board as flat array length w*h, row-major from top to bottom
      board: Array(w*h).fill(null),
      start, turn:start, winner:null, moves:0,
      meta:null, players:null, budgetLeft:1, h:[]
    }));
  },

  serialize(s){ return shallowClone(s); },
  deserialize(p){ return shallowClone(p); },

  render(root, state, onMove, canAct){
    root.innerHTML = '';

    // Container styled by existing CSS in index.html (.c4, .tops, .row, .disc)
    const wrap = document.createElement('div');
    wrap.className = 'c4';

    // Top buttons to drop discs
    const tops = document.createElement('div');
    tops.className = 'tops';
    for(let c=0;c<state.w;c++){
      const btn = document.createElement('button');
      btn.className = 'cell';
      btn.textContent = '↓';
      const full = state.board[c] !== null; // top cell occupied means column full
      btn.disabled = !!state.winner || !canAct || full;
      btn.title = full ? 'Column full' : 'Drop disc';
      btn.addEventListener('click', ()=> (!btn.disabled) && onMove({c}));
      tops.appendChild(btn);
    }
    wrap.appendChild(tops);

    // Grid of discs
    for(let r=0;r<state.h;r++){
      const row = document.createElement('div');
      row.className = 'row';
      for(let c=0;c<state.w;c++){
        const i = r*state.w + c;
        const cell = document.createElement('div');
        cell.className = 'disc';
        const v = state.board[i];
        if(v){ cell.classList.add(v); cell.textContent = v; }
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    }
    root.appendChild(wrap);
  },

  isValidMove(state, payload){
    if(state.winner) return false;
    if(!payload || typeof payload.c !== 'number') return false;
    const c = payload.c|0;
    if(c<0 || c>=state.w) return false;
    // Column is full if top cell is occupied
    return state.board[c] === null;
  },

  applyMove(state, payload){
    const s = shallowClone(state);
    const c = (payload.c|0);
    const mark = s.turn;
    // Find drop row: from bottom up
    for(let r=s.h-1; r>=0; r--){
      const i = r*s.w + c;
      if(s.board[i] == null){ s.board[i] = mark; break; }
    }
    s.moves++;

    // Check winner (4 in a row)
    const W = s.w, H = s.h, B = s.board;
    const won = ()=>{
      const dirs = [ [1,0], [0,1], [1,1], [1,-1] ];
      for(let r=0;r<H;r++){
        for(let c=0;c<W;c++){
          const v = B[r*W+c]; if(!v) continue;
          for(const [dx,dy] of dirs){
            let ok = true;
            for(let k=1;k<4;k++){
              const nx = c + dx*k, ny = r + dy*k;
              if(nx<0||nx>=W||ny<0||ny>=H){ ok=false; break; }
              if(B[ny*W+nx] !== v){ ok=false; break; }
            }
            if(ok) return v;
          }
        }
      }
      return null;
    };
    const w = won();
    if(w){ s.winner = w; }
    else if (s.moves >= s.w*s.h){ s.winner = 'draw'; }
    else { s.turn = (s.turn==='X'?'O':'X'); }
    return s;
  },

  status(state){
    if(state.winner === 'draw') return 'Draw.';
    if(state.winner) return `Winner: ${aliasOf(state, state.winner)||state.winner}`;
    return `Turn: ${aliasOf(state, state.turn)||state.turn}`;
  }
};

