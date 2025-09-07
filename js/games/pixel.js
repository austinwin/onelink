import { ensureMeta, ensurePlayers, shallowClone, getActiveTwists, aliasOf } from '../core.js';

export default {
  name: 'PixelChain',
  initState(start='X'){
    return ensurePlayers(ensureMeta({
      w:16,h:16, pixels: Array(16*16).fill(0), paletteIndex:0,
      palette:[ '#000000', '#FFFFFF', '#FF3B30', '#34C759', '#007AFF', '#FFCC00', '#AF52DE', '#FF9500' ],
      start, turn:start, winner:null, moves:0,
      meta:null, players:null, budgetLeft:1, h:[]
    }));
  },
  serialize(s){ return shallowClone(s); },
  deserialize(p){ return shallowClone(p); },

  render(root, state, onMove, canAct){
    root.innerHTML = '';
    const twists = getActiveTwists(state.meta, 'pixel');

    const palWrap = document.createElement('div');
    palWrap.className = 'row';
    palWrap.style.justifyContent = 'center';
    palWrap.style.flexWrap = 'wrap';
    const limit = twists.paletteLimit ? Math.min(twists.paletteLimit, state.palette.length) : state.palette.length;
    for(let i=0;i<limit;i++){
      const sw = document.createElement('button');
      sw.className='cell'; 
      sw.style.width='32px'; 
      sw.style.height='32px';
      sw.style.minWidth = '32px';
      sw.style.borderRadius = '8px';
      sw.style.background = state.palette[i]; 
      sw.textContent = (i===state.paletteIndex)?'✓':'';
      sw.addEventListener('click', ()=>{ if(canAct){ state.paletteIndex = i; /* local change only; not in URL until move */ } });
      palWrap.appendChild(sw);
    }
    root.appendChild(palWrap);

    const container = document.createElement('div');
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.padding = '8px 0';
    container.style.width = '100%';
    
    const g = document.createElement('div');
    g.style.display='grid'; 
    g.style.gridTemplateColumns=`repeat(${state.w}, minmax(18px, 1fr))`;
    g.style.gap='2px';
    g.style.margin = '0 auto';
    g.style.maxWidth = '320px';
    
    for(let y=0;y<state.h;y++){
      for(let x=0;x<state.w;x++){
        const i = y*state.w + x;
        const b = document.createElement('button');
        b.className='cell'; 
        b.style.width='100%';
        b.style.aspectRatio = '1/1';
        b.style.borderRadius='4px';
        b.style.background = state.palette[state.pixels[i]];
        b.style.padding = '0';
        b.disabled = !canAct;
        b.addEventListener('click', ()=> canAct && onMove({i, colorIdx: state.paletteIndex}));
        g.appendChild(b);
      }
    }
    container.appendChild(g);
    root.appendChild(container);
  },

  isValidMove(state, payload){
    if(state.winner) return false;
    if(!payload || typeof payload.i!=='number') return false;
    const idx = payload.i|0; if(idx<0 || idx>=state.pixels.length) return false;
    const twists = getActiveTwists(state.meta, 'pixel');
    const lim = twists.paletteLimit ? Math.min(twists.paletteLimit, state.palette.length) : state.palette.length;
    const ci = Math.min(Math.max(0, payload.colorIdx|0), lim-1);
    return ci >= 0 && ci < lim;
  },

  applyMove(state, payload){
    const s = shallowClone(state);
    const twists = getActiveTwists(s.meta, 'pixel');
    const lim = twists.paletteLimit ? Math.min(twists.paletteLimit, s.palette.length) : s.palette.length;
    const ci = Math.min(Math.max(0, payload.colorIdx|0), lim-1);
    s.pixels[payload.i|0] = ci;
    s.moves++;
    s.turn = (s.turn==='X'?'O':'X');
    return s;
  },

  status(state){
    return `Turn: ${aliasOf(state, state.turn)||state.turn} — paint one pixel`;
  }
};
