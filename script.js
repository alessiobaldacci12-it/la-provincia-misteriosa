const provinceList = window.provinceList || [];

const MAX_ATTEMPTS = 6;
const DEFAULT_GRID_COLUMNS = 6;

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ' ', 'BACKSPACE']
];

function normalizeName(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .toUpperCase();
}

const normalizedList = [];
const normalizedToOriginalMap = new Map();

provinceList.forEach(item => {
  const norm = normalizeName(item);
  normalizedList.push(norm);
  normalizedToOriginalMap.set(norm, item);
});

let mode = 'daily';
let targetProvinceNorm = '';
let targetProvinceOriginal = '';
let currentAttempt = 0;
let currentGuess = '';
let submittedGuesses = [];
let isGameOver = false;
let keyStates = {};

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
const inGameActionBox = document.getElementById('in-game-action-box');
const btnQuickNewGame = document.getElementById('btn-quick-new-game');

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

function getDailyKey() {
  const today = new Date();
  return `provincia_daily_${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function saveDailyState() {
  if (mode !== 'daily') return;
  const state = {
    isGameOver,
    submittedGuesses,
    currentAttempt,
    targetProvinceNorm,
    keyStates
  };
  localStorage.setItem(getDailyKey(), JSON.stringify(state));
}

function loadDailyState() {
  const saved = localStorage.getItem(getDailyKey());
  return saved ? JSON.parse(saved) : null;
}

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

function initGame() {
  currentAttempt = 0;
  currentGuess = '';
  submittedGuesses = [];
  isGameOver = false;
  keyStates = {};

  gameOverBox.classList.add('hidden');
  inGameActionBox.classList.add('hidden');

  if (mode === 'daily') {
    targetProvinceNorm = getDailyProvince();
    targetProvinceOriginal = normalizedToOriginalMap.get(targetProvinceNorm);
    
    const savedDaily = loadDailyState();
    if (savedDaily && savedDaily.targetProvinceNorm === targetProvinceNorm) {
      isGameOver = savedDaily.isGameOver;
      submittedGuesses = savedDaily.submittedGuesses || [];
      currentAttempt = savedDaily.currentAttempt || 0;
      keyStates = savedDaily.keyStates || {};

      if (isGameOver) {
        const won = submittedGuesses.length > 0 && submittedGuesses[submittedGuesses.length - 1].word === targetProvinceNorm;
        gameOverMsg.textContent = won 
          ? `Hai già completato la sfida di oggi! Provincia: ${targetProvinceOriginal} 🎉` 
          : `Sfida di oggi completata! La provincia era: ${targetProvinceOriginal}`;
        gameOverBox.classList.remove('hidden');
        btnNewGame.classList.add('hidden');
      }
    }
  } else {
    let newTarget = getRandomProvince();
    if (normalizedList.length > 1 && newTarget === targetProvinceNorm) {
      newTarget = getRandomProvince();
    }
    targetProvinceNorm = newTarget;
    targetProvinceOriginal = normalizedToOriginalMap.get(targetProvinceNorm);
    btnNewGame.classList.remove('hidden');
  }

  renderBoard();
  buildKeyboard();
  reapplyKeyStates();
}

function reapplyKeyStates() {
  Object.keys(keyStates).forEach(key => {
    const btn = keyboardEl.querySelector(`[data-key="${key}"]`);
    if (btn) {
      btn.className = `key-btn ${keyStates[key]} ${key === 'ENTER' || key === 'BACKSPACE' ? 'wide-key' : ''} ${key === ' ' ? 'space-key' : ''}`;
    }
  });
}

function renderBoard() {
  boardEl.innerHTML = '';

  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'board-row';
    rowEl.id = `row-${r}`;

    if (r < currentAttempt) {
      const guessData = submittedGuesses[r];
      guessData.word.split('').forEach((char, i) => {
        const tile = document.createElement('div');
        tile.className = `tile ${guessData.evaluation[i]}`;
        tile.textContent = char === ' ' ? '␣' : char;
        if (char === ' ') tile.classList.add('space-tile');
        rowEl.appendChild(tile);
      });
    } else if (r === currentAttempt && !isGameOver) {
      const tilesCount = Math.max(DEFAULT_GRID_COLUMNS, currentGuess.length);
      for (let c = 0; c < tilesCount; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        if (c < currentGuess.length) {
          const char = currentGuess[c];
          tile.textContent = char === ' ' ? '␣' : char;
          tile.classList.add('filled');
          if (char === ' ') tile.classList.add('space-tile');
        }
        rowEl.appendChild(tile);
      }
    } else {
      for (let c = 0; c < DEFAULT_GRID_COLUMNS; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        rowEl.appendChild(tile);
      }
    }

    boardEl.appendChild(rowEl);
  }
}

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
      } else if (key === ' ') {
        btn.textContent = 'SPAZIO';
        btn.classList.add('space-key');
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

function handleKeyPress(key) {
  if (isGameOver) return;

  if (key === 'ENTER') {
    submitGuess();
  } else if (key === 'BACKSPACE') {
    removeLetter();
  } else if (key === ' ' || key === 'SPACE') {
    addLetter(' ');
  } else if (/^[A-Z\-]$/.test(key)) {
    addLetter(key);
  }
}

window.addEventListener('keydown', (e) => {
  if (isGameOver) return;
  if (modalRules.classList.contains('open') || modalStats.classList.contains('open')) return;

  if (e.key === 'Enter') {
    handleKeyPress('ENTER');
  } else if (e.key === 'Backspace') {
    handleKeyPress('BACKSPACE');
  } else if (e.key === ' ') {
    e.preventDefault();
    handleKeyPress(' ');
  } else {
    const key = e.key.toUpperCase();
    if (/^[A-Z\-]$/.test(key)) {
      handleKeyPress(key);
    }
  }
});

function addLetter(letter) {
  currentGuess += letter;
  renderBoard();
  
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

function submitGuess() {
  if (currentGuess.length === 0) {
    showToast('Inserisci prima una provincia!');
    return;
  }

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

  const targetCounts = {};
  targetArr.forEach(char => {
    targetCounts[char] = (targetCounts[char] || 0) + 1;
  });

  guessArr.forEach((char, i) => {
    if (i < targetArr.length && char === targetArr[i]) {
      evaluation[i] = 'correct';
      targetCounts[char] -= 1;
    }
  });

  guessArr.forEach((char, i) => {
    if (evaluation[i] !== 'correct' && targetCounts[char] > 0) {
      evaluation[i] = 'present';
      targetCounts[char] -= 1;
    }
  });

  submittedGuesses.push({
    word: guess,
    evaluation: evaluation
  });

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
      if (mode === 'daily') saveDailyState();
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
      btn.className = `key-btn ${state} ${key === 'ENTER' || key === 'BACKSPACE' ? 'wide-key' : ''} ${key === ' ' ? 'space-key' : ''}`;
    }
  }
}

function endGame(won, message) {
  isGameOver = true;
  if (mode === 'daily') saveDailyState();
  saveStats(won);

  gameOverMsg.textContent = message;
  gameOverBox.classList.remove('hidden');

  if (mode === 'infinite') {
    btnNewGame.classList.remove('hidden');
    inGameActionBox.classList.remove('hidden');
  } else {
    btnNewGame.classList.add('hidden');
    inGameActionBox.classList.add('hidden');
  }

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

btnQuickNewGame.addEventListener('click', () => {
  initGame();
});

window.addEventListener('load', () => {
  updateStatsUI();
  initGame();
});