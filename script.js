const DROP_SPAWN_INTERVAL = 850;
const BUCKET_SPEED = 12;

const GAME_MODE_OBJECTIVE = "objective";
const GAME_MODE_FREEPLAY = "freeplay";
const FREEPLAY_LOCKED_DIFFICULTY = "medium";

// Difficulty spawn rates are defined from the Easy baseline.
const easySpawnRate = 0.5075;
const mediumSpawnRate = easySpawnRate * 1.5;
const hardSpawnRate = easySpawnRate * 2;

// Hard mode drops move faster than Easy. Easy must stay unchanged.
const fallSpeedByDifficulty = {
  easy: 1,
  medium: 1,
  hard: 1.38,
};

// Objective mode goals by time and difficulty.
const OBJECTIVE_GOAL_TABLE = {
  30: { easy: 100, medium: 120, hard: 140 },
  45: { easy: 150, medium: 180, hard: 210 },
  60: { easy: 200, medium: 240, hard: 280 },
  75: { easy: 250, medium: 300, hard: 350 },
  90: { easy: 300, medium: 360, hard: 420 },
};

const HIGH_SCORE_STORAGE_KEY = "water-drop-rescue-high-score";

const DROP_TIERS = [
  { size: 34, value: 1 },
  { size: 44, value: 5 },
  { size: 56, value: 10 },
  { size: 70, value: 20 },
];

let gameRunning = false;
let gameActive = false;
let dropMaker;
let timerInterval;
let flashTimeout;
let timeLeft = 30;
let currentScore = 0;
let highScore = 0;
let currentGameMode = GAME_MODE_OBJECTIVE;
let currentDifficulty = "easy";
let selectedTimeLimit = 30;
let bucketX = 0;
let bucketVelocity = 0;
let pointerTargetX = null;
let lastFrameTime = performance.now();

const keys = {
  left: false,
  right: false,
};

const bucket = document.getElementById("bucket");
const gameContainer = document.getElementById("game-container");
const scoreDisplay = document.getElementById("score");
const timeDisplay = document.getElementById("time");
const timerPanel = timeDisplay.closest(".timer");
const globalWarningTimer = document.getElementById("global-warning-timer");
const durationSelect = document.getElementById("duration-select");
const modeSelect = document.getElementById("mode-select");
const modeLabel = document.getElementById("mode-label");
const difficultyControl = document.getElementById("difficulty-control");
const difficultySelect = document.getElementById("difficulty-select");
const difficultyLabel = document.getElementById("difficulty-label");
const activeModeDisplay = document.getElementById("active-mode");
const activeDifficultyDisplay = document.getElementById("active-difficulty");
const goalCard = document.getElementById("goal-card");
const remainingCard = document.getElementById("remaining-card");
const hudHighScoreCard = document.getElementById("hud-high-score-card");
const goalDisplay = document.getElementById("goal");
const remainingDisplay = document.getElementById("remaining");
const hudHighScoreDisplay = document.getElementById("hud-high-score");
const startBtn = document.getElementById("start-btn");
const gameOverModal = document.getElementById("game-over-modal");
const modalTitle = document.getElementById("modal-title");
const gameMessage = document.getElementById("game-message");
const finalModeDisplay = document.getElementById("final-mode");
const finalScoreDisplay = document.getElementById("final-score");
const goalScoreLine = document.getElementById("goal-score-line");
const goalScoreDisplay = document.getElementById("goal-score");
const highScoreLine = document.getElementById("high-score-line");
const highScoreDisplay = document.getElementById("high-score");
const finalTimeLimitDisplay = document.getElementById("final-time-limit");
const modalDifficultyLine = document.getElementById("modal-difficulty-line");
const finalDifficultyDisplay = document.getElementById("final-difficulty");
const playAgainBtn = document.getElementById("play-again-btn");

function getSelectedDuration() {
  return Number(durationSelect.value);
}

function getSelectedMode() {
  const value = modeSelect.value;
  return value === GAME_MODE_FREEPLAY ? GAME_MODE_FREEPLAY : GAME_MODE_OBJECTIVE;
}

function getSelectedDifficulty() {
  const value = difficultySelect.value;
  if (value === "medium" || value === "hard") {
    return value;
  }

  return "easy";
}

function getDifficultyLabel(mode) {
  if (mode === "medium") {
    return "Medium";
  }

  if (mode === "hard") {
    return "Hard";
  }

  return "Easy";
}

function getModeLabel(mode) {
  return mode === GAME_MODE_FREEPLAY ? "Freeplay" : "Objective";
}

function getDifficultySettings() {
  if (currentDifficulty === "medium") {
    return {
      badSpawnRate: mediumSpawnRate,
      fallSpeed: fallSpeedByDifficulty.medium,
    };
  }

  if (currentDifficulty === "hard") {
    return {
      badSpawnRate: hardSpawnRate,
      fallSpeed: fallSpeedByDifficulty.hard,
    };
  }

  return {
    badSpawnRate: easySpawnRate,
    fallSpeed: fallSpeedByDifficulty.easy,
  };
}

// Objective mode helper: calculates score target from timer + difficulty.
function getObjectiveGoal(timeLimit, difficulty) {
  const safeTime = OBJECTIVE_GOAL_TABLE[timeLimit] ? timeLimit : 30;
  const row = OBJECTIVE_GOAL_TABLE[safeTime];
  return row[difficulty] ?? row.easy;
}

function getCurrentObjectiveGoal() {
  return getObjectiveGoal(selectedTimeLimit, currentDifficulty);
}

// Freeplay locks difficulty to Medium before gameplay starts.
function applyModeSelectionRules() {
  if (currentGameMode === GAME_MODE_FREEPLAY) {
    currentDifficulty = FREEPLAY_LOCKED_DIFFICULTY;
    difficultySelect.value = FREEPLAY_LOCKED_DIFFICULTY;
    difficultySelect.disabled = true;
  } else {
    currentDifficulty = getSelectedDifficulty();
    difficultySelect.value = currentDifficulty;
    difficultySelect.disabled = gameRunning;
  }
}

function updateDifficultyDisplays() {
  const label = getDifficultyLabel(currentDifficulty);
  difficultyLabel.textContent = label;
  if (activeDifficultyDisplay) {
    activeDifficultyDisplay.textContent = label;
  }
}

function updateModeDisplays() {
  const label = getModeLabel(currentGameMode);
  modeLabel.textContent = label;
  if (activeModeDisplay) {
    activeModeDisplay.textContent = label;
  }
}

function updateModeSpecificVisibility() {
  const isFreeplay = currentGameMode === GAME_MODE_FREEPLAY;

  if (difficultyControl) {
    difficultyControl.style.display = isFreeplay ? "none" : "";
  }
}

// Local device high score persistence.
function loadHighScore() {
  try {
    const rawHighScore = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    const parsed = Number(rawHighScore);
    highScore = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    highScore = 0;
  }
}

function saveHighScore() {
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(highScore));
  } catch {
    // Ignore storage failures so gameplay remains functional.
  }
}

function updateHighScoreIfNeeded() {
  // Objective mode must not store high scores.
  if (currentGameMode !== GAME_MODE_FREEPLAY) {
    return;
  }

  if (currentScore > highScore) {
    highScore = currentScore;
    saveHighScore();
  }
}

startBtn.addEventListener("click", startGame);
playAgainBtn.addEventListener("click", resetGame);
durationSelect.addEventListener("change", () => {
  if (!gameRunning) {
    selectedTimeLimit = getSelectedDuration();
    timeLeft = getSelectedDuration();
    updateHud();
  }
});
modeSelect.addEventListener("change", () => {
  if (!gameRunning) {
    currentGameMode = getSelectedMode();
    applyModeSelectionRules();
    updateHud();
  }
});
difficultySelect.addEventListener("change", () => {
  if (!gameRunning && currentGameMode === GAME_MODE_OBJECTIVE) {
    currentDifficulty = getSelectedDifficulty();
    updateHud();
  }
});
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);
gameContainer.addEventListener("pointerdown", handlePointerMove);
gameContainer.addEventListener("pointermove", handlePointerMove);
gameContainer.addEventListener("pointerup", clearPointerTarget);
gameContainer.addEventListener("pointercancel", clearPointerTarget);
window.addEventListener("resize", handleResize);

function startGame() {
  if (gameRunning) {
    return;
  }

  currentGameMode = getSelectedMode();
  selectedTimeLimit = getSelectedDuration();
  applyModeSelectionRules();
  updateModeDisplays();
  updateDifficultyDisplays();
  durationSelect.disabled = true;
  modeSelect.disabled = true;
  difficultySelect.disabled = true;
  resetBoard();
  gameRunning = true;
  gameActive = true;
  setStartButtonState(true);
  spawnDropsByDifficulty();
  dropMaker = setInterval(spawnDropsByDifficulty, DROP_SPAWN_INTERVAL);
  timerInterval = setInterval(updateTimer, 1000);
}

function resetGame() {
  stopGame();
  startGame();
}

function stopGame() {
  gameRunning = false;
  gameActive = false;
  clearInterval(dropMaker);
  clearInterval(timerInterval);
  dropMaker = undefined;
  timerInterval = undefined;
  keys.left = false;
  keys.right = false;
  bucketVelocity = 0;
  pointerTargetX = null;
}

function resetBoard() {
  clearDrops();
  clearFeedback();
  clearDangerFlash();
  currentScore = 0;
  timeLeft = selectedTimeLimit;
  gameOverModal.classList.add("hidden");
  updateHud();
  updateLowTimeWarning();
  centerBucket();
}

function updateEndModal(result) {
  const isObjective = currentGameMode === GAME_MODE_OBJECTIVE;
  const isWin = result === "win";

  modalTitle.textContent = isObjective
    ? (isWin ? "RESCUE COMPLETE" : "GAME OVER")
    : "FREEPLAY COMPLETE";
  gameMessage.textContent = isObjective
    ? (isWin
      ? "Amazing work! You reached the objective goal."
      : "Time ran out before reaching the goal.")
    : "Timer ended. Great run!";
  playAgainBtn.textContent = "PLAY AGAIN";
  finalModeDisplay.textContent = getModeLabel(currentGameMode);
  finalScoreDisplay.textContent = String(currentScore);
  goalScoreLine.style.display = isObjective ? "" : "none";
  highScoreLine.style.display = isObjective ? "none" : "";
  if (isObjective) {
    goalScoreDisplay.textContent = String(getCurrentObjectiveGoal());
  } else {
    highScoreDisplay.textContent = String(highScore);
  }
  finalTimeLimitDisplay.textContent = `${selectedTimeLimit}s`;
  finalDifficultyDisplay.textContent = getDifficultyLabel(currentDifficulty);
  if (modalDifficultyLine) {
    modalDifficultyLine.style.display = isObjective ? "" : "none";
  }
}

function endGame(result) {
  if (!gameActive) {
    return;
  }

  updateHighScoreIfNeeded();
  updateEndModal(result);
  stopGame();
  clearDrops();
  updateLowTimeWarning();
  durationSelect.disabled = false;
  modeSelect.disabled = false;
  applyModeSelectionRules();
  setStartButtonState(false);
  gameOverModal.classList.remove("hidden");
}

function updateTimer() {
  timeLeft -= 1;
  updateHud();
  updateLowTimeWarning();

  if (timeLeft <= 0) {
    endGame(currentGameMode === GAME_MODE_OBJECTIVE ? "loss" : "freeplay");
  }
}

// Easy mode keeps the original drop behavior. Medium and Hard add extra bad drops.
function spawnDropsByDifficulty() {
  if (!gameActive) {
    return;
  }

  createDrop();

  const settings = getDifficultySettings();
  const extraBadChance = Math.max(0, settings.badSpawnRate - easySpawnRate);

  if (Math.random() < extraBadChance) {
    createDrop(true);
  }
}

function createDrop(forceBad = false) {
  if (!gameActive) {
    return;
  }

  const settings = getDifficultySettings();
  const isBad = forceBad || Math.random() < easySpawnRate;
  const tier = DROP_TIERS[Math.floor(Math.random() * DROP_TIERS.length)];
  const value = isBad ? tier.value * 2 : tier.value;
  const drop = document.createElement("div");
  const gameWidth = gameContainer.clientWidth;
  const xPosition = Math.random() * Math.max(1, gameWidth - tier.size);
  const baseFallDuration = Math.random() * 1.3 + 2.7;
  const fallDuration = baseFallDuration / settings.fallSpeed;
  const fallDistance = gameContainer.clientHeight + tier.size + 30;

  drop.className = `water-drop ${isBad ? "bad-drop" : "good-drop"}`;
  drop.textContent = "💧";
  drop.style.width = `${tier.size}px`;
  drop.style.height = `${tier.size}px`;
  drop.style.fontSize = `${tier.size}px`;
  drop.style.left = `${xPosition}px`;
  drop.style.animationDuration = `${fallDuration}s`;
  drop.style.setProperty("--fall-distance", `${fallDistance}px`);
  drop.dataset.isBad = String(isBad);
  drop.dataset.value = String(value);
  drop.setAttribute("role", "img");
  drop.setAttribute("aria-label", isBad ? "Polluted water drop" : "Clean water drop");

  gameContainer.appendChild(drop);

  drop.addEventListener("animationend", () => {
    if (drop.parentElement) {
      drop.remove();
    }
  });
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();

  if (key === "arrowleft" || key === "a") {
    keys.left = true;
    event.preventDefault();
  }

  if (key === "arrowright" || key === "d") {
    keys.right = true;
    event.preventDefault();
  }
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();

  if (key === "arrowleft" || key === "a") {
    keys.left = false;
  }

  if (key === "arrowright" || key === "d") {
    keys.right = false;
  }
}

function handlePointerMove(event) {
  if (!gameActive) {
    return;
  }

  if (event.type === "pointermove" && event.pointerType !== "touch" && event.buttons !== 1) {
    return;
  }

  const containerRect = gameContainer.getBoundingClientRect();
  const bucketWidth = bucket.offsetWidth;
  const relativeX = event.clientX - containerRect.left;
  const maxX = gameContainer.clientWidth - bucketWidth;

  pointerTargetX = clamp(relativeX - bucketWidth / 2, 0, maxX);

  if (event.type === "pointerdown") {
    bucketX = pointerTargetX;
    bucketVelocity = 0;
    updateBucketPosition();
  }
}

function clearPointerTarget(event) {
  if (event.pointerType !== "touch") {
    pointerTargetX = null;
  }
}

function handleResize() {
  centerBucket();
}

function centerBucket() {
  const maxX = Math.max(0, gameContainer.clientWidth - bucket.offsetWidth);
  bucketX = maxX / 2;
  updateBucketPosition();
}

function updateBucketPosition() {
  const maxX = Math.max(0, gameContainer.clientWidth - bucket.offsetWidth);
  bucketX = clamp(bucketX, 0, maxX);
  bucket.style.left = `${bucketX}px`;
}

function updateHud() {
  const isObjective = currentGameMode === GAME_MODE_OBJECTIVE;

  scoreDisplay.textContent = String(currentScore);
  timeDisplay.textContent = String(timeLeft);
  updateModeDisplays();
  updateModeSpecificVisibility();
  updateDifficultyDisplays();

  if (goalCard) {
    goalCard.style.display = isObjective ? "" : "none";
  }

  if (remainingCard) {
    remainingCard.style.display = isObjective ? "" : "none";
  }

  if (hudHighScoreCard) {
    hudHighScoreCard.style.display = isObjective ? "none" : "";
  }

  if (isObjective) {
    const goal = getCurrentObjectiveGoal();
    if (goalDisplay) {
      goalDisplay.textContent = String(goal);
    }

    if (remainingDisplay) {
      remainingDisplay.textContent = String(Math.max(0, goal - currentScore));
    }
  } else if (hudHighScoreDisplay) {
    hudHighScoreDisplay.textContent = String(highScore);
  }
}

function updateLowTimeWarning() {
  const isLowTime = gameActive && timeLeft <= 5;

  document.body.classList.toggle("time-warning-global", isLowTime);
  timerPanel.classList.toggle("low-time", isLowTime);

  if (globalWarningTimer) {
    globalWarningTimer.textContent = String(Math.max(0, timeLeft));
  }
}

function clearDrops() {
  gameContainer.querySelectorAll(".water-drop").forEach((drop) => drop.remove());
}

function clearFeedback() {
  gameContainer.querySelectorAll(".feedback-text").forEach((feedback) => feedback.remove());
}

function clearDangerFlash() {
  clearTimeout(flashTimeout);
  gameContainer.classList.remove("danger-flash");
}

function setStartButtonState(isRunning) {
  startBtn.disabled = isRunning;
  startBtn.textContent = isRunning ? "Rescue Active" : "Start Rescue";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isColliding(firstRect, secondRect) {
  return (
    firstRect.left < secondRect.right &&
    firstRect.right > secondRect.left &&
    firstRect.top < secondRect.bottom &&
    firstRect.bottom > secondRect.top
  );
}

function moveBucket(deltaTime) {
  if (!gameActive) {
    return;
  }

  const maxSpeed = BUCKET_SPEED * 60;
  const acceleration = 2600;
  const deceleration = 3200;
  let direction = 0;

  if (keys.left) {
    direction -= 1;
  }

  if (keys.right) {
    direction += 1;
  }

  if (pointerTargetX !== null && direction === 0) {
    const distance = pointerTargetX - bucketX;

    if (Math.abs(distance) < 0.5) {
      bucketX = pointerTargetX;
      bucketVelocity = 0;
    } else {
      bucketVelocity = distance * 12;
      bucketX += distance * Math.min(1, deltaTime * 12);
    }
  } else {
    if (direction !== 0) {
      pointerTargetX = null;
      bucketVelocity += direction * acceleration * deltaTime;
      bucketVelocity = clamp(bucketVelocity, -maxSpeed, maxSpeed);
    } else if (bucketVelocity !== 0) {
      const decelerationStep = deceleration * deltaTime;

      if (Math.abs(bucketVelocity) <= decelerationStep) {
        bucketVelocity = 0;
      } else {
        bucketVelocity -= Math.sign(bucketVelocity) * decelerationStep;
      }
    }

    bucketX += bucketVelocity * deltaTime;
  }

  updateBucketPosition();
  checkCollisions();
}

function checkCollisions() {
  if (!gameActive) {
    return;
  }

  const bucketRect = bucket.getBoundingClientRect();
  const catchZone = getBucketCatchZone(bucketRect);
  const drops = gameContainer.querySelectorAll(".water-drop");

  drops.forEach((drop) => {
    if (drop.dataset.collected === "true") {
      return;
    }

    const dropRect = drop.getBoundingClientRect();
    const enteringBucket = isDropEnteringBucket(dropRect, catchZone);

    drop.classList.toggle("in-bucket", enteringBucket);

    if (isDropInsideCatchZone(dropRect, catchZone)) {
      collectDrop(drop);
    }
  });
}

function getBucketCatchZone(bucketRect) {
  const wallInset = bucketRect.width * 0.18;
  const openingDepth = bucketRect.height * 0.72;

  return {
    left: bucketRect.left + wallInset,
    right: bucketRect.right - wallInset,
    top: bucketRect.top + 4,
    bottom: bucketRect.top + openingDepth,
  };
}

function isDropCenteredOverOpening(dropRect, catchZone) {
  const dropCenterX = dropRect.left + dropRect.width / 2;
  return dropCenterX >= catchZone.left && dropCenterX <= catchZone.right;
}

function isDropEnteringBucket(dropRect, catchZone) {
  return (
    isDropCenteredOverOpening(dropRect, catchZone) &&
    dropRect.bottom >= catchZone.top &&
    dropRect.top <= catchZone.bottom
  );
}

function isDropInsideCatchZone(dropRect, catchZone) {
  const entryDepth = catchZone.top + dropRect.height / 3;

  return (
    isDropCenteredOverOpening(dropRect, catchZone) &&
    dropRect.bottom >= entryDepth &&
    dropRect.top <= catchZone.bottom
  );
}

function collectDrop(drop) {
  if (drop.dataset.collected === "true") {
    return;
  }

  drop.dataset.collected = "true";
  const isBad = drop.dataset.isBad === "true";
  const value = Number(drop.dataset.value);

  if (isBad) {
    currentScore = Math.max(0, currentScore - value);
    drop.classList.add("hit");
    showFeedback(`AVOID! -${value}.`, "#7a3b1d");
    triggerDangerFlash();
  } else {
    currentScore += value;
    drop.classList.add("pop");
    showFeedback(`+${value} POINTS!`, "#0b6e4f");
  }

  updateHighScoreIfNeeded();
  updateHud();

  // Objective mode wins immediately once target score is reached.
  if (currentGameMode === GAME_MODE_OBJECTIVE && gameActive && currentScore >= getCurrentObjectiveGoal()) {
    endGame("win");
  }

  setTimeout(() => {
    if (drop.parentElement) {
      drop.remove();
    }
  }, 220);
}

function showFeedback(text, color) {
  const feedback = document.createElement("div");
  const feedbackLeft = bucketX + bucket.offsetWidth / 2;
  const feedbackTop = gameContainer.clientHeight - bucket.offsetHeight - 54;

  feedback.className = "feedback-text";
  feedback.textContent = text;
  feedback.style.left = `${feedbackLeft}px`;
  feedback.style.top = `${feedbackTop}px`;
  feedback.style.color = color;
  gameContainer.appendChild(feedback);

  setTimeout(() => {
    feedback.remove();
  }, 900);
}

function triggerDangerFlash() {
  gameContainer.classList.add("danger-flash");
  clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => {
    gameContainer.classList.remove("danger-flash");
  }, 180);
}

function gameLoop(timestamp) {
  const deltaTime = Math.min((timestamp - lastFrameTime) / 1000, 0.032);

  lastFrameTime = timestamp;
  moveBucket(deltaTime);
  requestAnimationFrame(gameLoop);
}

loadHighScore();
setStartButtonState(false);
currentGameMode = getSelectedMode();
selectedTimeLimit = getSelectedDuration();
applyModeSelectionRules();
updateModeDisplays();
resetBoard();
requestAnimationFrame(gameLoop);
