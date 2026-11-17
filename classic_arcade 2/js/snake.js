(() => {
  const canvas = document.getElementById("game");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const gridSize = 24;
  const cellSize = 20;
  const gameKeyPrefix = "classicArcadeSnakeGame:";
  let snake;
  let food;
  let direction;
  let score = 0;
  let timer;
  let pollTimer;
  let running = false;
  let mode = "solo";
  let onlineGameId = null;
  let onlineStateBusy = false;
  let actionQueue = Promise.resolve();

  const onlineMessage = document.getElementById("onlineMessage");
  const playerForm = document.getElementById("playerForm");
  const playerSession = document.getElementById("playerSession");
  const availableGames = document.getElementById("availableGames");

  function showOnlineMessage(message) {
    onlineMessage.textContent = message;
  }

  function savedGameKey(playerId) {
    return gameKeyPrefix + encodeURIComponent(playerId);
  }

  function resumeSavedGame() {
    const p = getPlayer();
    if (!p) return false;
    const key = savedGameKey(p.playerId);
    const saved = localStorage.getItem(key);
    if (!saved) return false;

    try {
      const session = JSON.parse(saved);
      if (session && typeof session.gameId === "string" && typeof session.isHost === "boolean") {
        beginOnlineGame(session.gameId, session.isHost);
        return true;
      }
      localStorage.removeItem(key);
      showOnlineMessage("Saved game details are invalid; looking for your open room.");
    } catch (error) {
      localStorage.removeItem(key);
      showOnlineMessage("Could not read saved game details; looking for your open room.");
    }
    return false;
  }

  function updatePlayerUI() {
    const p = getPlayer();
    playerForm.hidden = Boolean(p);
    playerSession.hidden = !p;
    document.getElementById("playerLabel").textContent = p ? p.name : "";
    document.getElementById("createGame").disabled = !p || Boolean(onlineGameId);
    document.getElementById("startGame").disabled = !p || !onlineGameId;
    const leaveButton = document.getElementById("leaveGame");
    leaveButton.disabled = !p;
    leaveButton.textContent = onlineGameId ? "Leave game" : "Find / leave previous game";
    document.getElementById("start").disabled = Boolean(onlineGameId);

    const gameIdDisplay = document.getElementById("currentGameIdDisplay");
    const gameIdValue = document.getElementById("currentGameIdValue");
    if (onlineGameId) {
      gameIdDisplay.hidden = false;
      gameIdValue.textContent = onlineGameId;
    } else {
      gameIdDisplay.hidden = true;
    }
  }

  function foodPosition() {
    let position;
    do {
      position = {
        x: Math.random() * gridSize | 0,
        y: Math.random() * gridSize | 0
      };
    } while (snake.some(segment => segment.x === position.x && segment.y === position.y));
    return position;
  }

  function draw() {
    context.fillStyle = "#101a2c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#1c2a40";
    for (let i = 0; i <= gridSize; i++) {
      context.beginPath();
      context.moveTo(i * cellSize, 0);
      context.lineTo(i * cellSize, canvas.height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, i * cellSize);
      context.lineTo(canvas.width, i * cellSize);
      context.stroke();
    }
    context.fillStyle = "#ff718c";
    context.fillRect(food.x * cellSize + 4, food.y * cellSize + 4, 12, 12);
    snake.forEach((segment, index) => {
      context.fillStyle = index ? "#51c99b" : "#a4f5d1";
      context.fillRect(segment.x * cellSize + 1, segment.y * cellSize + 1, 18, 18);
    });
  }

  function drawOnlineBoard(board) {
    const rows = board.length;
    const columns = board[0] && board[0].length;
    if (!rows || !columns || board.some(row => !Array.isArray(row) || row.length !== columns)) {
      throw new Error("The server returned an invalid game board.");
    }

    const width = canvas.width / columns;
    const height = canvas.height / rows;
    context.fillStyle = "#101a2c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#1c2a40";

    board.forEach((row, y) => row.forEach((cell, x) => {
      const left = x * width;
      const top = y * height;
      context.strokeRect(left, top, width, height);
      if (cell === "*") {
        context.fillStyle = "#ff718c";
        context.fillRect(left + width * 0.2, top + height * 0.2, width * 0.6, height * 0.6);
      } else if (cell !== ".") {
        const firstPlayer = cell.toLowerCase() === "a";
        context.fillStyle = firstPlayer
          ? (cell === "A" ? "#a4f5d1" : "#51c99b")
          : (cell === cell.toUpperCase() ? "#9bc5ff" : "#568de0");
        context.fillRect(left + 1, top + 1, width - 2, height - 2);
      }
    }));
  }

  function end() {
    clearInterval(timer);
    running = false;
    document.getElementById("message").textContent = "Game over! Final score: " + score;
    const nameSnake = prompt("Enter your name:", getPlayerName() || generateRandomName());
    record("Snake", score, nameSnake || undefined);
  }

  function tick() {
    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y
    };
    if (head.x < 0 || head.y < 0 || head.x >= gridSize || head.y >= gridSize ||
        snake.slice(0, -1).some(segment => segment.x === head.x && segment.y === head.y)) {
      end();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      food = foodPosition();
      document.getElementById("score").textContent = score;
    } else {
      snake.pop();
    }
    draw();
  }

  function startSoloGame() {
    clearInterval(timer);
    mode = "solo";
    snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    direction = { x: 1, y: 0 };
    score = 0;
    food = foodPosition();
    running = true;
    document.getElementById("score").textContent = 0;
    document.getElementById("message").textContent = "Good luck!";
    draw();
    canvas.focus({ preventScroll: true });
    timer = setTimeout(() => {
      if (running && mode === "solo") timer = setInterval(tick, 115);
    }, 700);
  }

  const directions = {
    ArrowUp: { x: 0, y: -1, action: "up" },
    w: { x: 0, y: -1, action: "up" },
    ArrowDown: { x: 0, y: 1, action: "down" },
    s: { x: 0, y: 1, action: "down" },
    ArrowLeft: { x: -1, y: 0, action: "left" },
    a: { x: -1, y: 0, action: "left" },
    ArrowRight: { x: 1, y: 0, action: "right" },
    d: { x: 1, y: 0, action: "right" }
  };

  function queueOnlineAction(action) {
    const qp = getPlayer();
    if (!onlineGameId || !qp) return;
    actionQueue = actionQueue
      .then(async () => {
        await sendSnakeAction(onlineGameId, qp.playerId, action);
        await refreshOnlineState();
      })
      .catch(error => showOnlineMessage("Could not send move: " + error.message));
  }

  function turn(nextDirection) {
    if (mode === "online") {
      queueOnlineAction(nextDirection.action);
      return;
    }
    if (!running) startSoloGame();
    if (nextDirection.x !== -direction.x || nextDirection.y !== -direction.y) {
      direction = nextDirection;
    }
  }

  function matchingOpenGame(games) {
    const p = getPlayer();
    const playerName = p.name.toLocaleLowerCase();
    const matches = games.filter(game =>
      game && typeof game.gameId === "string" &&
      typeof game.playerName === "string" &&
      game.playerName.toLocaleLowerCase() === playerName
    );
    if (matches.length > 1) {
      throw new Error("More than one open room matches this account.");
    }
    return matches[0] || null;
  }

  async function refreshAvailableGames() {
    availableGames.replaceChildren();
    try {
      const games = await getAvailableSnakeGames();
      if (!Array.isArray(games)) throw new Error("Unexpected room list response.");
      const rp2 = getPlayer();
      if (rp2 && !onlineGameId) {
        const previousGame = matchingOpenGame(games);
        if (previousGame) {
          beginOnlineGame(previousGame.gameId, true);
          showOnlineMessage("Reconnected to your open game.");
        }
      }
      if (!games.length) {
        availableGames.textContent = "No open games right now.";
        return;
      }

      games.forEach(game => {
        if (!game || typeof game.gameId !== "string") {
          throw new Error("A game room has an invalid ID.");
        }
        const item = document.createElement("li");
        item.append(document.createTextNode((game.playerName || "Player") + " — "));
        const joinButton = document.createElement("button");
        joinButton.type = "button";
        joinButton.textContent = "Join";
        joinButton.disabled = !getPlayer() || Boolean(onlineGameId);
        joinButton.addEventListener("click", () => joinGame(game.gameId));
        item.append(joinButton);
        availableGames.append(item);
      });
    } catch (error) {
      availableGames.textContent = "Could not load rooms: " + error.message;
    }
  }

  function beginOnlineGame(gameId, isHost) {
    if (typeof gameId !== "string" || !gameId) {
      throw new Error("The server did not return a game ID.");
    }
    clearInterval(timer);
    clearInterval(pollTimer);
    running = false;
    mode = "online";
    onlineGameId = gameId;
    updatePlayerUI();
    canvas.focus({ preventScroll: true });
    showOnlineMessage(isHost
      ? "Room created. Start the game when the other player joins."
      : "Joined the room. Start when both players are ready.");
    try {
      const p = getPlayer();
      localStorage.setItem(savedGameKey(p.playerId), JSON.stringify({ gameId, isHost }));
    } catch (error) {
      showOnlineMessage("Connected, but could not save this game for your next sign-in: " + error.message);
    }
    refreshOnlineState();
    pollTimer = setInterval(refreshOnlineState, 1000);
  }

  async function createGame() {
    const p = getPlayer();
    if (!p) return showOnlineMessage("Sign in before creating a game.");
    try {
      const response = await createSnakeGame(p.playerId);
      beginOnlineGame(response && response.gameId, true);
      await refreshAvailableGames();
    } catch (error) {
      if (/already in a game/i.test(error.message)) {
        await refreshAvailableGames();
        if (!onlineGameId) {
          showOnlineMessage("This account is already in a game on the server, but no open room was listed. Use \"Force Leave Stuck Game\" below to clear your local state, then try creating a new game.");
        }
      } else {
        showOnlineMessage("Could not create game: " + error.message);
      }
    }
  }

  async function joinGame(gameId) {
    const p = getPlayer();
    if (!p) return showOnlineMessage("Sign in before joining a game.");
    try {
      await joinSnakeGame(p.playerId, gameId);
      beginOnlineGame(gameId, false);
      await refreshAvailableGames();
    } catch (error) {
      showOnlineMessage("Could not join game: " + error.message);
    }
  }

  async function startOnlineGame() {
    const p = getPlayer();
    if (!p || !onlineGameId) return;
    try {
      await startSnakeGame(p.playerId, onlineGameId);
      showOnlineMessage("Game started. Use the arrow keys or WASD to move.");
      await refreshOnlineState();
    } catch (error) {
      showOnlineMessage("Could not start game: " + error.message);
    }
  }

  async function leaveOnlineGame() {
    if (!getPlayer()) return;
    if (!onlineGameId) {
      try {
        const games = await getAvailableSnakeGames();
        if (!Array.isArray(games)) throw new Error("Unexpected room list response.");
        const previousGame = matchingOpenGame(games);
        if (!previousGame) {
          showOnlineMessage("No open room was found for this account. Use \"Force Leave Stuck Game\" below to clear your local state, then try creating a new game.");
          return;
        }
        beginOnlineGame(previousGame.gameId, true);
      } catch (error) {
        showOnlineMessage("Could not find your previous game: " + error.message);
        return;
      }
    }
    try {
      const lp = getPlayer();
      await leaveSnakeGame(onlineGameId, lp.playerId);
      clearInterval(pollTimer);
      localStorage.removeItem(savedGameKey(lp.playerId));
      onlineGameId = null;
      mode = "solo";
      updatePlayerUI();
      draw();
      document.getElementById("message").textContent = "Press Start or an arrow key to begin.";
      showOnlineMessage("You left the online game.");
      await refreshAvailableGames();
    } catch (error) {
      showOnlineMessage("Could not leave game: " + error.message);
    }
  }

  async function forceResetGame() {
    if (!getPlayer()) return;
    clearInterval(timer);
    clearInterval(pollTimer);
    const stuckGameId = onlineGameId;
    onlineGameId = null;
    mode = "solo";
    running = false;
    const p = getPlayer();
    try {
      localStorage.removeItem(savedGameKey(p.playerId));
    } catch (e) {}
    updatePlayerUI();
    draw();
    document.getElementById("message").textContent = "Press Start or an arrow key to begin.";
    document.getElementById("forceLeavePanel").hidden = false;
    if (stuckGameId) {
      document.getElementById("forceLeaveGameId").value = stuckGameId;
    }
    showOnlineMessage("Local state cleared. Your Game ID is shown above — click \"Force Leave by Game ID\" to tell the server to release you.");
    await refreshAvailableGames();
  }

  async function forceLeaveById() {
    const gameIdInput = document.getElementById("forceLeaveGameId");
    const gameId = gameIdInput.value.trim();
    if (!gameId) {
      showOnlineMessage("Please enter a Game ID.");
      return;
    }
    const p = getPlayer();
    if (!p) return showOnlineMessage("Sign in first.");
    try {
      await leaveSnakeGame(gameId, p.playerId);
      clearInterval(timer);
      clearInterval(pollTimer);
      onlineGameId = null;
      mode = "solo";
      running = false;
      try {
        localStorage.removeItem(savedGameKey(p.playerId));
      } catch (e) {}
      updatePlayerUI();
      draw();
      document.getElementById("message").textContent = "Press Start or an arrow key to begin.";
      document.getElementById("forceLeavePanel").hidden = true;
      gameIdInput.value = "";
      showOnlineMessage("Server released you from game " + gameId + ". You can now create a new game.");
      await refreshAvailableGames();
    } catch (error) {
      showOnlineMessage("Could not force leave game " + gameId + ": " + error.message);
    }
  }

  async function refreshOnlineState() {
    if (!onlineGameId || onlineStateBusy) return;
    onlineStateBusy = true;
    try {
      const state = await getSnakeState(onlineGameId);
      if (!state || !Array.isArray(state.board)) {
        throw new Error("The server returned an invalid game state.");
      }
      drawOnlineBoard(state.board);
      const rp = getPlayer();
      const ownScore = Array.isArray(state.scores)
        ? state.scores.find(entry => entry.player === rp.playerId)
        : null;
      document.getElementById("score").textContent = ownScore ? ownScore.score : 0;
      showOnlineMessage("Room " + onlineGameId + " · " + (state.state || "connected"));
    } catch (error) {
      showOnlineMessage("Could not update game: " + error.message);
    } finally {
      onlineStateBusy = false;
    }
  }

  async function loadOnlineLeaderboard() {
    const list = document.getElementById("onlineSnakeLeaders");
    const message = document.getElementById("leaderboardMessage");
    try {
      const leaders = await getSnakeLeaderboard();
      if (!Array.isArray(leaders)) throw new Error("Unexpected leaderboard response.");
      list.replaceChildren();
      if (!leaders.length) {
        list.innerHTML = "<li>No multiplayer scores yet</li>";
        message.textContent = "";
        return;
      }
      leaders.slice(0, 10).forEach(entry => {
        if (!entry || !Number.isFinite(Number(entry.highScore))) {
          throw new Error("A leaderboard entry has an invalid score.");
        }
        const item = document.createElement("li");
        item.textContent = (entry.playerName || entry.name || "Player") + " — " +
          Number(entry.highScore).toLocaleString();
        list.append(item);
      });
      message.textContent = "";
    } catch (error) {
      list.replaceChildren();
      message.textContent = "Could not load online scores: " + error.message;
    }
  }

  document.getElementById("start").addEventListener("click", startSoloGame);
  canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
  document.addEventListener("keydown", event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const nextDirection = directions[event.key];
    if (nextDirection) {
      event.preventDefault();
      turn(nextDirection);
    }
  });
  document.querySelectorAll("[data-d]").forEach(button => {
    button.addEventListener("click", () => {
      const nextDirection = {
        up: directions.ArrowUp,
        down: directions.ArrowDown,
        left: directions.ArrowLeft,
        right: directions.ArrowRight
      }[button.dataset.d];
      turn(nextDirection);
    });
  });
  playerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const playerNameInput = document.getElementById("playerName");
    const playerPasswordInput = document.getElementById("playerPassword");
    const onlineMessageEl = document.getElementById("onlineMessage");
    try {
      await authenticate(false, playerNameInput, playerPasswordInput, onlineMessageEl);
      updatePlayerUI();
      resumeSavedGame();
      await refreshAvailableGames();
    } catch (error) {}
  });
  document.getElementById("registerButton").addEventListener("click", async () => {
    const playerNameInput = document.getElementById("playerName");
    const playerPasswordInput = document.getElementById("playerPassword");
    const onlineMessageEl = document.getElementById("onlineMessage");
    try {
      await authenticate(true, playerNameInput, playerPasswordInput, onlineMessageEl);
      updatePlayerUI();
      resumeSavedGame();
      await refreshAvailableGames();
    } catch (error) {}
  });
  document.getElementById("logoutPlayer").addEventListener("click", async () => {
    await leaveOnlineGame();
    if (onlineGameId) return;
    logout();
    updatePlayerUI();
    showOnlineMessage("Signed out.");
    refreshAvailableGames();
  });
  document.getElementById("createGame").addEventListener("click", createGame);
  document.getElementById("refreshGames").addEventListener("click", refreshAvailableGames);
  document.getElementById("startGame").addEventListener("click", startOnlineGame);
  document.getElementById("leaveGame").addEventListener("click", leaveOnlineGame);
  document.getElementById("forceResetGame").addEventListener("click", forceResetGame);
  document.getElementById("forceLeaveById").addEventListener("click", forceLeaveById);
  document.getElementById("copyGameId").addEventListener("click", () => {
    const value = document.getElementById("currentGameIdValue").textContent;
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      showOnlineMessage("Game ID copied: " + value);
    });
  });

  const savedPlayer = loadPlayer();
  if (savedPlayer) showOnlineMessage("Signed in as " + savedPlayer.name + ".");
  snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
  direction = { x: 1, y: 0 };
  food = foodPosition();
  document.getElementById("score").textContent = 0;
  updatePlayerUI();
  const p = getPlayer();
  if (p && !onlineGameId) {
    try {
      const saved = localStorage.getItem(savedGameKey(p.playerId));
      if (saved) {
        const session = JSON.parse(saved);
        if (session && session.gameId) {
          document.getElementById("forceLeaveGameId").value = session.gameId;
          document.getElementById("forceLeavePanel").hidden = false;
        }
      }
    } catch (e) {}
  }
  draw();
  resumeSavedGame();
  refreshAvailableGames();
  loadOnlineLeaderboard();
  setInterval(loadOnlineLeaderboard, 15000);
})();
