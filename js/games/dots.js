import { ensureMeta, ensurePlayers, shallowClone, aliasOf } from '../core.js';

export default {
  name: 'Dots & Boxes (2×2)',
  initState(start='X'){
    return ensurePlayers(ensureMeta({
      h: Array(6).fill(null), v: Array(6).fill(null),
      boxes: Array.from({length:2},()=>Array(2).fill(null)),
      score: {X:0,O:0}, start, turn:start, winner:null, moves:0,
      meta:null, players:null, budgetLeft:1, h:[]
    }));
  },
  serialize(s){ return shallowClone(s); },
  deserialize(p){ return shallowClone(p); },

  render(root, state, onMove, canAct){
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'board';
    wrap.style.maxWidth = '280px';
    
    for(let r=0;r<5;r++){
      const row = document.createElement('div');
      row.style.display='flex'; 
      row.style.gap='4px'; 
      row.style.alignItems='center';
      row.style.width='100%';
      
      for(let c=0;c<5;c++){
        const isDot = (r%2===0 && c%2===0);
        if(isDot){
          const dot = document.createElement('div');
          dot.style.width='10px'; 
          dot.style.height='10px'; 
          dot.style.borderRadius='50%'; 
          dot.style.background='#9aa3b2';
          dot.style.flexShrink = '0';
          row.appendChild(dot);
        } else if (r%2===0 && c%2===1){
          const hr = r/2; const hc = (c-1)/2; const idx = hr*2 + hc;
          const btn = document.createElement('button');
          btn.className='cell'; 
          btn.style.width='100%';
          btn.style.height='16px'; 
          btn.style.minHeight = '16px';
          btn.style.borderRadius = '4px';
          btn.textContent = state.h[idx]||'';
          btn.disabled = !!state.h[idx] || !!state.winner || !canAct;
          btn.title = 'Draw edge';
          btn.addEventListener('click', ()=> (!btn.disabled) && onMove({t:'h',i:idx}));
          btn.style.flex = '1';
          row.appendChild(btn);
        } else if (r%2===1 && c%2===0){
          const vr = c/2; const vc = r===1?0:1; const idx = (vr*2) + vc;
          const btn = document.createElement('button');
          btn.className='cell'; 
          btn.style.width='16px'; 
          btn.style.minWidth = '16px';
          btn.style.height='100%'; 
          btn.style.borderRadius = '4px';
          btn.textContent = state.v[idx]||'';
          btn.disabled = !!state.v[idx] || !!state.winner || !canAct;
          btn.title = 'Draw edge';
          btn.addEventListener('click', ()=> (!btn.disabled) && onMove({t:'v',i:idx}));
          btn.style.flexShrink = '0';
          row.appendChild(btn);
        } else {
          if(r%2===1 && c%2===1){
            const br = (r-1)/2, bc = (c-1)/2;
            const b = document.createElement('div');
            b.className='disc'; 
            b.style.flex = '1';
            const owner = state.boxes[br][bc];
            b.textContent = owner ? owner : '';
            if(owner) b.classList.add(owner);
            row.appendChild(b);
          } else {
            row.appendChild(document.createElement('div'));
          }
        }
      }
      wrap.appendChild(row);
    }
    root.appendChild(wrap);
  },

  isValidMove(state, payload){
    if(state.winner) return false;
    if(!payload || (payload.t!=='h' && payload.t!=='v')) return false;
    return payload.t==='h' ? state.h[payload.i]==null : state.v[payload.i]==null;
  },

  applyMove(state, payload){
    const s = shallowClone(state);
    const mark = s.turn;
    if(payload.t==='h'){ s.h[payload.i] = mark; } else { s.v[payload.i] = mark; }
    s.moves++;

    let madeBox = false;
    for(let r=0;r<2;r++){
      for(let c=0;c<2;c++){
        if(!s.boxes[r][c]){
          const top = s.h[r*2 + c], bot = s.h[(r+1)*2 + c];
          const left = s.v[r*2 + c], right = s.v[r*2 + (c+1)];
          if(top && bot && left && right){ s.boxes[r][c] = mark; s.score[mark]++; madeBox = true; }
        }
      }
    }
    const totalEdges = s.h.filter(Boolean).length + s.v.filter(Boolean).length;
    if(totalEdges === 12){
      s.winner = (s.score.X===s.score.O) ? 'draw' : (s.score.X > s.score.O ? 'X':'O');
    } else if (!madeBox){
      s.turn = (s.turn==='X'?'O':'X');
    }
    return s;
  },

  status(state){
    if(state.winner){
      if(state.winner==='draw') return `Draw. ${state.score.X}-${state.score.O}`;
      return `Winner: ${aliasOf(state, state.winner)||state.winner} (${state.score.X}-${state.score.O})`;
    }
    return `Turn: ${aliasOf(state, state.turn)||state.turn} (${state.score.X}-${state.score.O})`;
  }
};
