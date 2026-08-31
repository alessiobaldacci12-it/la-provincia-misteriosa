// Recupero elenco province da window
const provinceList = window.provinceList || [];

const MAX_ATTEMPTS = 6;
const DEFAULT_GRID_COLUMNS = 6;

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
];

// Normalizzazione: rimuove accenti, apostrofi e spazi. Mantiene il trattino (-)
function normalizeName(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

const normalizedList = [];
const normalizedToOriginalMap = new Map();

provinceList.forEach(item => {
  const norm = normalizeName(item);
  normalizedList.push(norm);
  normalizedToOriginalMap.set(norm, item);
});

// Stato del gioco
let mode = 'daily';
let targetProvinceNorm = '';
let targetProvinceOriginal = '';
let currentAttempt = 0;
let currentGuess = '';
let submittedGuesses = []; // Memorizza i tentativi inviati con i loro esiti
let isGameOver = false;
let keyStates = {};

// Elementi DOM
const boardEl = document.getElementById('game-board');
const keyboardEl = document.getElementById('keyboard');
const modalRules = document.getElementById('modal-rules');
const modalStats = document.getElementById('modal-stats');
const toastContainer = document.getElementById('toast-container');
const btnDaily = document.getElementById('btn-daily');
const btnInfinite = document.getElementById('btn-infinite');
const gameOverBox = document.getElementById('game-over-box');
const gameOverMsg = document.getElementById('game-over-msg');
const btnNewGame = document.getElementById('btn-new-game');

// --- STATISTICHE LOCALSTORAGE ---
function getStats() {
  const defaultStats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0 };
  const saved = localStorage.getItem('provincia_misteriosa_stats');
  return saved ? JSON.parse(saved) : defaultStats;
}

function saveStats(won) {
  const stats = getStats();
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.maxStreak) {
      stats.maxStreak = stats.currentStreak;
    }
  } else {
    stats.currentStreak = 0;
  }
  localStorage.setItem('provincia_misteriosa_stats', JSON.stringify(stats));
  updateStatsUI();
}

function updateStatsUI() {
  const stats = getStats();
  document.getElementById('stat-played').textContent = stats.played;
  const winrate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  document.getElementById('stat-winrate').textContent = `${winrate}%`;
  document.getElementById('stat-streak').textContent = stats.currentStreak;
  document.getElementById('stat-max-streak').textContent = stats.maxStreak;
}

// --- SELEZIONE PROVINCIA ---
function getDailyProvince() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % normalizedList.length;
  return normalizedList[index];
}

function getRandomProvince() {
  const index = Math.floor(Math.random() * normalizedList.length);
  return normalizedList[index];
}

// --- INIZIALIZZAZIONE PARTITA ---
function initGame() {
  if (mode === 'daily') {
    targetProvinceNorm = getDailyProvince();
  } else {
    targetProvinceNorm = getRandomProvince();
  }

  targetProvinceOriginal = normalizedToOriginalMap.get(targetProvinceNorm);
  currentAttempt = 0;
  currentGuess = '';
  submittedGuesses = [];
  isGameOver = false;
  keyStates = {};

  gameOverBox.classList.add('hidden');

  renderBoard();
  buildKeyboard();
}

// --- RENDERING DELLA GRIGLIA (6x6 Default, Dinamica al tipo) ---
function renderBoard() {
  boardEl.innerHTML = '';

  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'board-row';
    rowEl.id = `row-${r}`;

    if (r < currentAttempt) {
      // Tentativi già inviati
      const guessData = submittedGuesses[r];
      guessData.word.split('').forEach((char, i) => {
        const tile = document.createElement('div');
        tile.className = `tile ${guessData.evaluation[i]}`;
        tile.textContent = char;
        rowEl.appendChild(tile);
      });
    } else if (r === currentAttempt) {
      // Riga corrente in corso di digitazione: mostra almeno 6 caselle o di più se necessario
      const tilesCount = Math.max(DEFAULT_GRID_COLUMNS, currentGuess.length);
      for (let c = 0; c < tilesCount; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        if (c < currentGuess.length) {
          tile.textContent = currentGuess[c];
          tile.classList.add('filled');
        }
        rowEl.appendChild(tile);
      }
    } else {
      // Righe future: default 6 caselle vuote
      for (let c = 0; c < DEFAULT_GRID_COLUMNS; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        rowEl.appendChild(tile);
      }
    }

    boardEl.appendChild(rowEl);
  }
}

// --- GENERAZIONE TASTIERA ---
function buildKeyboard() {
  keyboardEl.innerHTML = '';

  KEYBOARD_ROWS.forEach(rowKeys => {
    const rowEl = document.createElement('div');
    rowEl.className = 'keyboard-row';

    rowKeys.forEach(key => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key-btn';
      btn.dataset.key = key;

      if (key === 'ENTER') {
        btn.textContent = 'INVIO';
        btn.classList.add('wide-key');
      } else if (key === 'BACKSPACE') {
        btn.textContent = '⌫';
        btn.classList.add('wide-key');
      } else {
        btn.textContent = key;
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleKeyPress(key);
      });

      rowEl.appendChild(btn);
    });

    keyboardEl.appendChild(rowEl);
  });
}

// --- GESTIONE INPUT ---
function handleKeyPress(key) {
  if (isGameOver) return;

  if (key === 'ENTER') {
    submitGuess();
  } else if (key === 'BACKSPACE') {
    removeLetter();
  } else if (/^[A-Z\-]$/.test(key)) {
    addLetter(key);
  }
}

// Event Listener da tastiera fisica
window.addEventListener('keydown', (e) => {
  if (isGameOver) return;
  
  // Evita intercettazione se l'utente è su un modale aperto
  if (modalRules.classList.contains('open') || modalStats.classList.contains('open')) return;

  const key = e.key.toUpperCase();

  if (key === 'ENTER') {
    handleKeyPress('ENTER');
  } else if (key === 'BACKSPACE') {
    handleKeyPress('BACKSPACE');
  } else if (/^[A-Z\-]$/.test(key)) {
    handleKeyPress(key);
  }
});

function addLetter(letter) {
  currentGuess += letter;
  renderBoard();
  
  // Effetto animazione pop sulla nuova lettera inserita
  const activeRow = document.getElementById(`row-${currentAttempt}`);
  if (activeRow) {
    const targetTile = activeRow.children[currentGuess.length - 1];
    if (targetTile) {
      targetTile.classList.add('pop');
    }
  }
}

function removeLetter() {
  if (currentGuess.length > 0) {
    currentGuess = currentGuess.slice(0, -1);
    renderBoard();
  }
}

// --- VALIDAZIONE E VALUTAZIONE ---
function submitGuess() {
  if (currentGuess.length === 0) {
    showToast('Inserisci prima una provincia!');
    return;
  }

  // Verifica se la provincia esiste nel database
  if (!normalizedList.includes(currentGuess)) {
    showToast('Provincia non presente nella lista!');
    return;
  }

  evaluateGuess(currentGuess);
}

function evaluateGuess(guess) {
  const targetArr = targetProvinceNorm.split('');
  const guessArr = guess.split('');
  const evaluation = Array(guess.length).fill('absent');

  // Mappa frequenze per gestione doppie
  const targetCounts = {};
  targetArr.forEach(char => {
    targetCounts[char] = (targetCounts[char] || 0) + 1;
  });

  // Passaggio 1: Corrette (VERDE)
  guessArr.forEach((char, i) => {
    if (i < targetArr.length && char === targetArr[i]) {
      evaluation[i] = 'correct';
      targetCounts[char] -= 1;
    }
  });

  // Passaggio 2: Presenti ma errate (GIALLO)
  guessArr.forEach((char, i) => {
    if (evaluation[i] !== 'correct' && targetCounts[char] > 0) {
      evaluation[i] = 'present';
      targetCounts[char] -= 1;
    }
  });

  // Salvataggio del tentativo
  submittedGuesses.push({
    word: guess,
    evaluation: evaluation
  });

  // Animazione riga
  const activeRow = document.getElementById(`row-${currentAttempt}`);
  if (activeRow) {
    const tiles = activeRow.children;
    guessArr.forEach((char, i) => {
      setTimeout(() => {
        if (tiles[i]) {
          tiles[i].classList.add('flip');
          tiles[i].classList.add(evaluation[i]);
        }
        updateKeyState(char, evaluation[i]);
      }, i * 150);
    });
  }

  const isWin = guess === targetProvinceNorm;

  setTimeout(() => {
    if (isWin) {
      endGame(true, `Complimenti! Hai indovinato: ${targetProvinceOriginal} 🎉`);
    } else if (currentAttempt + 1 >= MAX_ATTEMPTS) {
      endGame(false, `Peccato! La provincia era: ${targetProvinceOriginal} 😔`);
    } else {
      currentAttempt++;
      currentGuess = '';
      renderBoard();
    }
  }, guess.length * 150 + 200);
}

function updateKeyState(key, state) {
  const priority = { correct: 3, present: 2, absent: 1 };
  const currentState = keyStates[key];

  if (!currentState || priority[state] > priority[currentState]) {
    keyStates[key] = state;
    const btn = keyboardEl.querySelector(`[data-key="${key}"]`);
    if (btn) {
      btn.className = `key-btn ${state} ${key.length > 1 ? 'wide-key' : ''}`;
    }
  }
}

// --- FINE PARTITA ---
function endGame(won, message) {
  isGameOver = true;
  saveStats(won);

  gameOverMsg.textContent = message;
  gameOverBox.classList.remove('hidden');

  setTimeout(() => {
    modalStats.classList.add('open');
  }, 800);
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// --- EVENT LISTENERS E MODALI ---
document.getElementById('btn-help').addEventListener('click', () => {
  modalRules.classList.add('open');
});

document.getElementById('close-rules').addEventListener('click', () => {
  modalRules.classList.remove('open');
});

document.getElementById('btn-start').addEventListener('click', () => {
  modalRules.classList.remove('open');
});

document.getElementById('btn-stats').addEventListener('click', () => {
  updateStatsUI();
  modalStats.classList.add('open');
});

document.getElementById('close-stats').addEventListener('click', () => {
  modalStats.classList.remove('open');
});

// Chiusura modali cliccando sullo sfondo
[modalRules, modalStats].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });
});

document.getElementById('btn-surrender').addEventListener('click', () => {
  if (isGameOver) return;
  if (confirm("Sei sicuro di volerti arrendere? Rivelerà la provincia di questa partita.")) {
    endGame(false, `Ti sei arreso! La provincia era: ${targetProvinceOriginal}`);
  }
});

btnDaily.addEventListener('click', () => {
  if (mode !== 'daily') {
    mode = 'daily';
    btnDaily.classList.add('active');
    btnInfinite.classList.remove('active');
    initGame();
  }
});

btnInfinite.addEventListener('click', () => {
  if (mode !== 'infinite') {
    mode = 'infinite';
    btnInfinite.classList.add('active');
    btnDaily.classList.remove('active');
    initGame();
  }
});

btnNewGame.addEventListener('click', () => {
  modalStats.classList.remove('open');
  initGame();
});

// Avvio
window.addEventListener('load', () => {
  updateStatsUI();
  initGame();
});