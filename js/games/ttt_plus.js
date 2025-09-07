import { ensureMeta, ensurePlayers, shallowClone, getActiveTwists, aliasOf } from '../core.js';

export default {
  name: 'Tic-Tac-Toe+',
  initState(start='X'){
    return ensurePlayers(ensureMeta({
      board: Array(9).fill(null), start, turn:start, winner:null, moves:0,
      meta: null, players: null, budgetLeft: 1, h:[]
    }));
  },
  serialize(s){ return shallowClone(s); },
  deserialize(p){ return shallowClone(p); },

  render(root, state, onMove, canAct){
    root.innerHTML = '';
    const twists = getActiveTwists(state.meta, 'ttt');
    const grid = document.createElement('div');
    grid.className = 'board';
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    const corners = new Set([0,2,6,8]);
    state.board.forEach((v, i)=>{
      const btn = document.createElement('button');
      btn.className = 'cell';
      btn.textContent = v || '';
      let disabled = !!v || state.winner || !canAct;
      if(!disabled && twists.forbidCellIdx === i) disabled = true;
      if(!disabled && twists.forceCornerEveryN && ((state.moves+1)%twists.forceCornerEveryN===0) && !corners.has(i)) disabled = true;
      btn.disabled = disabled;
      btn.title = (twists.forbidCellIdx===i) ? 'Forbidden cell (popularity twist)' :
                  (twists.forceCornerEveryN && ((state.moves+1)%twists.forceCornerEveryN===0) && !corners.has(i)) ? 'Must play a corner this move' : '';
      btn.addEventListener('click', ()=> (!btn.disabled) && onMove(i));
      grid.appendChild(btn);
    });
    root.appendChild(grid);
  },

  isValidMove(state, idx){
    if(state.winner || state.board[idx]!=null) return false;
    const t = getActiveTwists(state.meta, 'ttt');
    if(t.forbidCellIdx === idx) return false;
    if(t.forceCornerEveryN && ((state.moves+1)%t.forceCornerEveryN===0)) return [0,2,6,8].includes(idx);
    return true;
  },

  applyMove(state, idx){
    const s = shallowClone(state);
    s.board[idx] = s.turn;
    s.moves++;
    const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for(const [a,b,c] of L){
      if(s.board[a] && s.board[a]===s.board[b] && s.board[b]===s.board[c]){ s.winner = s.board[a]; }
    }
    if(!s.winner && s.moves>=9) s.winner = 'draw';
    if(!s.winner) s.turn = (s.turn==='X'?'O':'X');
    return s;
  },

  status(state){
    if(state.winner==="draw") return 'Draw.';
    if(state.winner) return `Winner: ${aliasOf(state, state.winner) || state.winner}`;
    return `Turn: ${aliasOf(state, state.turn) || state.turn}`;
  }
};
