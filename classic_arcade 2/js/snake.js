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
  let soloTurnPending = false;
  let onlineState = "waiting";
  let onlineReady = false;
  let onlineHead = null;
  let onlineDirectionKnown = false;
  let pendingOnlineTurn = null;

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
    document.getElementById("startGame").disabled = !p || !onlineGameId || onlineState !== "waiting" || onlineReady;
    document.getElementById("forceResetGame").disabled = !p;
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
      gameIdValue.textContent = "";
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
    soloTurnPending = false;
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
    if (onlineGameId) return;
    clearInterval(timer);
    mode = "solo";
    snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    direction = { x: 1, y: 0 };
    score = 0;
    food = foodPosition();
    running = true;
    soloTurnPending = false;
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

  function turn(nextDirection) {
    if (mode === "online") {
      const p = getPlayer();
      if (!p || !onlineGameId || onlineState !== "running" ||
          !onlineDirectionKnown || pendingOnlineTurn) return;
      const dot = direction.x * nextDirection.x + direction.y * nextDirection.y;
      const cross = direction.x * nextDirection.y - direction.y * nextDirection.x;
      if (dot !== 0) return;

      const action = cross > 0 ? "right" : "left";
      const gameId = onlineGameId;
      const requestedTurn = { x: nextDirection.x, y: nextDirection.y, head: onlineHead };
      pendingOnlineTurn = requestedTurn;
      sendSnakeAction(gameId, p.playerId, action).catch(error => {
        if (onlineGameId === gameId && pendingOnlineTurn === requestedTurn) {
          pendingOnlineTurn = null;
          showOnlineMessage("Could not send move: " + error.message);
        }
      });
      return;
    }

    if (!running) startSoloGame();
    if (!soloTurnPending && direction.x * nextDirection.x + direction.y * nextDirection.y === 0) {
      direction = nextDirection;
      soloTurnPending = true;
    }
  }

  function updateOnlineDirection(board, scores) {
    const p = getPlayer();
    const seat = scores.findIndex(entry => entry.player === p.playerId);
    if (seat < 0) {
      onlineDirectionKnown = false;
      return;
    }
    const headToken = seat === 0 ? "A" : "B";
    const bodyToken = headToken.toLowerCase();
    let head = null;
    board.forEach((row, y) => row.forEach((cell, x) => {
      if (cell === headToken) head = { x, y };
    }));
    if (!head) {
      onlineDirectionKnown = false;
      return;
    }

    const moved = !onlineHead || head.x !== onlineHead.x || head.y !== onlineHead.y;
    if (onlineState === "waiting") {
      direction = seat === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      onlineDirectionKnown = true;
    } else if (moved) {
      const dx = onlineHead ? head.x - onlineHead.x : 0;
      const dy = onlineHead ? head.y - onlineHead.y : 0;
      if (onlineHead && Math.abs(dx) + Math.abs(dy) === 1) {
        direction = { x: dx, y: dy };
        onlineDirectionKnown = true;
      } else {
        const neighbours = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
          .filter(offset => (board[head.y + offset.y] || [])[head.x + offset.x] === bodyToken);
        onlineDirectionKnown = neighbours.length === 1;
        if (onlineDirectionKnown) direction = { x: -neighbours[0].x, y: -neighbours[0].y };
      }
    }
    onlineHead = head;
    if (pendingOnlineTurn && onlineDirectionKnown &&
        (head.x !== pendingOnlineTurn.head.x || head.y !== pendingOnlineTurn.head.y) &&
        direction.x === pendingOnlineTurn.x && direction.y === pendingOnlineTurn.y) {
      pendingOnlineTurn = null;
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

  async function refreshAvailableGames(reconnect = true) {
    availableGames.replaceChildren();
    try {
      const games = await getAvailableSnakeGames();
      if (!Array.isArray(games)) throw new Error("Unexpected room list response.");
      const rp2 = getPlayer();
      if (reconnect && rp2 && !onlineGameId) {
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
    onlineState = "waiting";
    onlineReady = false;
    onlineHead = null;
    onlineDirectionKnown = false;
    pendingOnlineTurn = null;
    direction = isHost ? { x: 1, y: 0 } : { x: -1, y: 0 };
    updatePlayerUI();
    draw();
    canvas.focus({ preventScroll: true });
    showOnlineMessage(isHost
      ? "Room created. Both players must click Ready / Start."
      : "Joined the room. Both players must click Ready / Start.");
    try {
      const p = getPlayer();
      localStorage.setItem(savedGameKey(p.playerId), JSON.stringify({ gameId, isHost }));
    } catch (error) {
      showOnlineMessage("Connected, but could not save this game for your next sign-in: " + error.message);
    }
    pollTimer = setInterval(refreshOnlineState, 200);
    refreshOnlineState();
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
          showOnlineMessage("This account is already in a game on the server, but no open room was listed. Use \"Recover previous game\" to enter its Game ID and leave it.");
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
    const gameId = onlineGameId;
    try {
      const result = await startSnakeGame(p.playerId, gameId);
      if (onlineGameId !== gameId) return;
      onlineReady = true;
      updatePlayerUI();
      showOnlineMessage(result.state === "running"
        ? "Game started. Use the arrow keys or WASD to move."
        : "You are ready. Waiting for the other player to join and click Ready / Start.");
      await refreshOnlineState();
    } catch (error) {
      showOnlineMessage("Could not start game: " + error.message);
    }
  }

  function clearOnlineGame() {
    clearInterval(pollTimer);
    clearInterval(timer);
    const p = getPlayer();
    if (p) localStorage.removeItem(savedGameKey(p.playerId));
    onlineGameId = null;
    onlineState = "waiting";
    onlineReady = false;
    onlineHead = null;
    onlineDirectionKnown = false;
    pendingOnlineTurn = null;
    mode = "solo";
    running = false;
    updatePlayerUI();
    draw();
    document.getElementById("score").textContent = score;
    document.getElementById("message").textContent = "Press Start or an arrow key to begin.";
    document.getElementById("forceLeavePanel").hidden = true;
    document.getElementById("forceLeaveGameId").value = "";
  }

  async function leaveGameById(gameId) {
    const p = getPlayer();
    let alreadyGone = false;
    try {
      await leaveSnakeGame(gameId, p.playerId);
    } catch (error) {
      if (error.status !== 404) throw error;
      alreadyGone = true;
    }
    if (!onlineGameId || onlineGameId === gameId) clearOnlineGame();
    document.getElementById("forceLeavePanel").hidden = true;
    document.getElementById("forceLeaveGameId").value = "";
    showOnlineMessage(alreadyGone ? "That game no longer exists." : "You left the online game.");
    await refreshAvailableGames(false);
  }

  async function leaveOnlineGame() {
    if (!getPlayer()) return;
    if (!onlineGameId) {
      try {
        const games = await getAvailableSnakeGames();
        if (!Array.isArray(games)) throw new Error("Unexpected room list response.");
        const previousGame = matchingOpenGame(games);
        if (!previousGame) {
          showOnlineMessage("No open room was found for this account. Use \"Recover previous game\" if you know the Game ID of a previous game.");
          return;
        }
        beginOnlineGame(previousGame.gameId, true);
      } catch (error) {
        showOnlineMessage("Could not find your previous game: " + error.message);
        return;
      }
    }
    try {
      await leaveGameById(onlineGameId);
    } catch (error) {
      showOnlineMessage("Could not leave game: " + error.message);
    }
  }

  function showGameRecovery() {
    if (!getPlayer()) return;
    document.getElementById("forceLeavePanel").hidden = false;
    if (onlineGameId) {
      document.getElementById("forceLeaveGameId").value = onlineGameId;
    }
    showOnlineMessage("Enter the previous Game ID, then click Leave this game. Your saved connection stays in place until the server confirms you left.");
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
      await leaveGameById(gameId);
    } catch (error) {
      showOnlineMessage("Could not leave game " + gameId + ": " + error.message);
    }
  }

  async function refreshOnlineState() {
    if (!onlineGameId || onlineStateBusy) return;
    onlineStateBusy = true;
    const gameId = onlineGameId;
    try {
      const state = await getSnakeState(gameId);
      if (onlineGameId !== gameId || !getPlayer()) return;
      if (!state || !Array.isArray(state.board) || !Array.isArray(state.scores) ||
          !["waiting", "running", "ended"].includes(state.state)) {
        throw new Error("The server returned an invalid game state.");
      }
      const previousState = onlineState;
      onlineState = state.state;
      drawOnlineBoard(state.board);
      updateOnlineDirection(state.board, state.scores);
      const rp = getPlayer();
      const ownScore = Array.isArray(state.scores)
        ? state.scores.find(entry => entry.player === rp.playerId)
        : null;
      document.getElementById("score").textContent = ownScore ? ownScore.score : 0;
      const seat = state.scores.findIndex(entry => entry.player === rp.playerId);
      const colour = seat === 0 ? "green" : "blue";
      document.getElementById("message").textContent = "Online Snake: you control the " + colour + " snake.";
      if (onlineState === "waiting") {
        showOnlineMessage(onlineReady
          ? "You are ready. Waiting for the other player to join and click Ready / Start."
          : "Waiting. Both players must click Ready / Start.");
      } else if (onlineState === "running") {
        showOnlineMessage(onlineDirectionKnown ? "Game running. Use the arrow keys or WASD." : "Game running. Synchronizing controls…");
      } else {
        pendingOnlineTurn = null;
        clearInterval(pollTimer);
        document.getElementById("message").textContent = "Game over! Final score: " + (ownScore ? ownScore.score : 0);
        showOnlineMessage("Game ended. Click Leave game before creating or joining another room.");
        if (previousState !== "ended") loadOnlineLeaderboard();
      }
      updatePlayerUI();
    } catch (error) {
      if (onlineGameId !== gameId) return;
      if (error.status === 404) {
        clearOnlineGame();
        showOnlineMessage("This room no longer exists. You can create or join another game.");
        refreshAvailableGames(false);
      } else {
        showOnlineMessage("Could not update game: " + error.message);
      }
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
  document.getElementById("forceResetGame").addEventListener("click", showGameRecovery);
  document.getElementById("forceLeaveById").addEventListener("click", forceLeaveById);

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
          document.getElementById("currentGameIdValue").textContent = session.gameId;
          document.getElementById("currentGameIdDisplay").hidden = false;
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
