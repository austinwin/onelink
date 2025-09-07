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

    // Create container for the whole game
    const gameContainer = document.createElement('div');
    gameContainer.style.display = 'flex';
    gameContainer.style.flexDirection = 'column';
    gameContainer.style.alignItems = 'center';
    gameContainer.style.width = '100%';
    gameContainer.style.gap = '12px';
    gameContainer.style.padding = '0 0 16px 0';

    // Color palette section
    const palWrap = document.createElement('div');
    palWrap.className = 'row';
    palWrap.style.justifyContent = 'center';
    palWrap.style.flexWrap = 'wrap';
    palWrap.style.marginBottom = '16px';

    const paletteLabel = document.createElement('div');
    paletteLabel.textContent = 'Color palette:';
    paletteLabel.style.width = '100%';
    paletteLabel.style.textAlign = 'center';
    paletteLabel.style.marginBottom = '8px';
    paletteLabel.style.color = 'var(--muted)';
    paletteLabel.style.fontSize = '14px';
    palWrap.appendChild(paletteLabel);

    const limit = twists.paletteLimit ? Math.min(twists.paletteLimit, state.palette.length) : state.palette.length;
    for(let i=0;i<limit;i++){
      const sw = document.createElement('button');
      sw.className = 'cell'; 
      sw.style.width = '36px'; 
      sw.style.height = '36px';
      sw.style.minWidth = '36px';
      sw.style.minHeight = '36px';
      sw.style.borderRadius = '8px';
      sw.style.background = state.palette[i]; 
      sw.style.boxSizing = 'border-box';
      
      // Make selected color more obvious
      if(i === state.paletteIndex) {
        sw.style.boxShadow = '0 0 0 3px var(--accent2)';
        sw.textContent = '✓';
      }
      
      sw.addEventListener('click', ()=>{ 
        if(canAct){
          // Update all color buttons when selecting
          palWrap.querySelectorAll('button').forEach((btn, idx) => {
            btn.textContent = idx === i ? '✓' : '';
            btn.style.boxShadow = idx === i ? '0 0 0 3px var(--accent2)' : 'none';
          });
          state.paletteIndex = i;
        }
      });
      palWrap.appendChild(sw);
    }
    gameContainer.appendChild(palWrap);

    // COMPLETELY REDESIGNED PIXEL GRID
    const gridContainer = document.createElement('div');
    gridContainer.style.width = '100%';
    gridContainer.style.maxWidth = '300px';
    gridContainer.style.margin = '0 auto';
    gridContainer.style.border = '2px solid #3a4466';
    gridContainer.style.borderRadius = '8px';
    gridContainer.style.padding = '10px';
    gridContainer.style.backgroundColor = '#0b0f18';
    gridContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    
    const gridTitle = document.createElement('div');
    gridTitle.textContent = 'Pixel Canvas';
    gridTitle.style.textAlign = 'center';
    gridTitle.style.marginBottom = '10px';
    gridTitle.style.fontWeight = 'bold';
    gridTitle.style.color = 'var(--accent2)';
    gridContainer.appendChild(gridTitle);
    
    // Fixed size pixel grid
    const pixelSize = Math.floor(280 / state.w); // Calculate pixel size based on container width
    
    const pixelGrid = document.createElement('div');
    pixelGrid.style.display = 'grid';
    pixelGrid.style.gridTemplateColumns = `repeat(${state.w}, ${pixelSize}px)`;
    pixelGrid.style.gridTemplateRows = `repeat(${state.h}, ${pixelSize}px)`;
    pixelGrid.style.gap = '1px';
    pixelGrid.style.backgroundColor = '#232a3d';
    pixelGrid.style.padding = '2px';
    pixelGrid.style.borderRadius = '4px';
    pixelGrid.style.margin = '0 auto';
    
    // Create fixed-size pixel cells
    for(let y=0;y<state.h;y++){
      for(let x=0;x<state.w;x++){
        const i = y*state.w + x;
        const b = document.createElement('button');
        b.style.width = `${pixelSize}px`;
        b.style.height = `${pixelSize}px`;
        b.style.padding = '0';
        b.style.margin = '0';
        b.style.backgroundColor = state.palette[state.pixels[i]];
        b.style.border = '1px solid rgba(255,255,255,0.1)';
        b.style.borderRadius = '0';
        b.style.display = 'block';
        b.style.cursor = canAct ? 'pointer' : 'default';
        b.disabled = !canAct;
        
        // Hover effect for better feedback
        if(canAct) {
          b.onmouseover = () => { 
            b.style.boxShadow = '0 0 0 2px var(--accent2) inset';
            b.style.transform = 'scale(1.1)';
            b.style.zIndex = '1';
          };
          b.onmouseout = () => { 
            b.style.boxShadow = 'none';
            b.style.transform = 'scale(1)';
            b.style.zIndex = 'auto';
          };
        }
        
        b.addEventListener('click', ()=> canAct && onMove({i, colorIdx: state.paletteIndex}));
        pixelGrid.appendChild(b);
      }
    }
    
    gridContainer.appendChild(pixelGrid);
    gameContainer.appendChild(gridContainer);

    // Enhanced instructions
    const instructions = document.createElement('div');
    instructions.style.marginTop = '16px';
    instructions.style.textAlign = 'center';
    instructions.style.padding = '10px';
    instructions.style.borderRadius = '8px';
    instructions.style.border = '1px dashed #3a4466';
    instructions.style.backgroundColor = canAct ? 'rgba(123, 211, 137, 0.1)' : 'transparent';
    
    if (canAct) {
      const activeIcon = document.createElement('div');
      activeIcon.innerHTML = '👆';
      activeIcon.style.fontSize = '20px';
      activeIcon.style.marginBottom = '8px';
      instructions.appendChild(activeIcon);
      
      const text = document.createElement('div');
      text.textContent = 'Your turn! Click on any pixel to paint it with the selected color';
      text.style.color = 'var(--accent)';
      text.style.fontWeight = 'bold';
      instructions.appendChild(text);
    } else {
      const waitIcon = document.createElement('div');
      waitIcon.innerHTML = '⏳';
      waitIcon.style.fontSize = '20px';
      waitIcon.style.marginBottom = '8px';
      instructions.appendChild(waitIcon);
      
      const text = document.createElement('div');
      text.textContent = 'Wait for your turn to paint pixels';
      text.style.color = 'var(--muted)';
      instructions.appendChild(text);
    }
    
    gameContainer.appendChild(instructions);

    root.appendChild(gameContainer);
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
