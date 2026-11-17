(() => {
  const canvas = document.getElementById("game");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const gridSize = 24;
  const cellSize = 20;
  const playerKey = "classicArcadePlayer";
  const gameKeyPrefix = "classicArcadeSnakeGame:";
  let snake;
  let food;
  let direction;
  let score = 0;
  let timer;
  let pollTimer;
  let running = false;
  let mode = "solo";
  let player = null;
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

  function loadPlayer() {
    const saved = localStorage.getItem(playerKey);
    if (!saved) return null;

    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.playerId === "string" && typeof parsed.name === "string") {
        return parsed;
      }
      showOnlineMessage("Saved player details are invalid. Please sign in again.");
    } catch (error) {
      showOnlineMessage("Could not read saved player details. Please sign in again.");
    }
    return null;
  }

  function savedGameKey(playerId) {
    return gameKeyPrefix + encodeURIComponent(playerId);
  }

  function resumeSavedGame() {
    if (!player) return false;
    const key = savedGameKey(player.playerId);
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
    playerForm.hidden = Boolean(player);
    playerSession.hidden = !player;
    document.getElementById("playerLabel").textContent = player ? player.name : "";
    document.getElementById("createGame").disabled = !player || Boolean(onlineGameId);
    document.getElementById("startGame").disabled = !player || !onlineGameId;
    const leaveButton = document.getElementById("leaveGame");
    leaveButton.disabled = !player;
    leaveButton.textContent = onlineGameId ? "Leave game" : "Find / leave previous game";
    document.getElementById("start").disabled = Boolean(onlineGameId);
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
    record("Snake", score);
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
    if (!onlineGameId || !player) return;
    actionQueue = actionQueue
      .then(async () => {
        await sendSnakeAction(onlineGameId, player.playerId, action);
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

  function playerIdFrom(response, name) {
    const playerId = response && (
      response.playerId ||
      response.id ||
      (response.player && (response.player.playerId || response.player.id))
    );
    if (typeof playerId !== "string" || !playerId) {
      throw new Error("The server did not return a player ID.");
    }
    const returnedName = response.name || response.playerName ||
      (response.player && (response.player.name || response.player.playerName));
    return { playerId, name: typeof returnedName === "string" ? returnedName : name };
  }

  function matchingOpenGame(games) {
    const playerName = player.name.toLocaleLowerCase();
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

  async function authenticate(createAccount) {
    const name = document.getElementById("playerName").value.trim();
    const passwordInput = document.getElementById("playerPassword");
    const password = passwordInput.value;
    if (!name || !password) {
      showOnlineMessage("Enter both a player name and password.");
      return;
    }

    const buttons = playerForm.querySelectorAll("button");
    buttons.forEach(button => { button.disabled = true; });
    showOnlineMessage(createAccount ? "Creating account…" : "Signing in…");
    try {
      const response = createAccount
        ? await registerPlayer(name, password)
        : await loginPlayer(name, password);
      player = playerIdFrom(response, name);
      localStorage.setItem(playerKey, JSON.stringify(player));
      passwordInput.value = "";
      updatePlayerUI();
      showOnlineMessage("Signed in as " + player.name + ".");
      resumeSavedGame();
      await refreshAvailableGames();
    } catch (error) {
      showOnlineMessage((createAccount ? "Could not create account: " : "Could not sign in: ") + error.message);
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  async function refreshAvailableGames() {
    availableGames.replaceChildren();
    try {
      const games = await getAvailableSnakeGames();
      if (!Array.isArray(games)) throw new Error("Unexpected room list response.");
      if (player && !onlineGameId) {
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
        joinButton.disabled = !player || Boolean(onlineGameId);
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
      localStorage.setItem(savedGameKey(player.playerId), JSON.stringify({ gameId, isHost }));
    } catch (error) {
      showOnlineMessage("Connected, but could not save this game for your next sign-in: " + error.message);
    }
    refreshOnlineState();
    pollTimer = setInterval(refreshOnlineState, 1000);
  }

  async function createGame() {
    if (!player) return showOnlineMessage("Sign in before creating a game.");
    try {
      const response = await createSnakeGame(player.playerId);
      beginOnlineGame(response && response.gameId, true);
      await refreshAvailableGames();
    } catch (error) {
      if (/already in a game/i.test(error.message)) {
        await refreshAvailableGames();
        if (!onlineGameId) {
          showOnlineMessage("This account is already in a game, but the service did not list an open room to reconnect to. The API cannot look up an already-running game.");
        }
      } else {
        showOnlineMessage("Could not create game: " + error.message);
      }
    }
  }

  async function joinGame(gameId) {
    if (!player) return showOnlineMessage("Sign in before joining a game.");
    try {
      await joinSnakeGame(player.playerId, gameId);
      beginOnlineGame(gameId, false);
      await refreshAvailableGames();
    } catch (error) {
      showOnlineMessage("Could not join game: " + error.message);
    }
  }

  async function startOnlineGame() {
    if (!player || !onlineGameId) return;
    try {
      await startSnakeGame(player.playerId, onlineGameId);
      showOnlineMessage("Game started. Use the arrow keys or WASD to move.");
      await refreshOnlineState();
    } catch (error) {
      showOnlineMessage("Could not start game: " + error.message);
    }
  }

  async function leaveOnlineGame() {
    if (!player) return;
    if (!onlineGameId) {
      try {
        const games = await getAvailableSnakeGames();
        if (!Array.isArray(games)) throw new Error("Unexpected room list response.");
        const previousGame = matchingOpenGame(games);
        if (!previousGame) {
          showOnlineMessage("No open room was found for this account. Refresh rooms or contact the game service if a running game is still assigned to you.");
          return;
        }
        beginOnlineGame(previousGame.gameId, true);
      } catch (error) {
        showOnlineMessage("Could not find your previous game: " + error.message);
        return;
      }
    }
    try {
      await leaveSnakeGame(onlineGameId, player.playerId);
      clearInterval(pollTimer);
      localStorage.removeItem(savedGameKey(player.playerId));
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

  async function refreshOnlineState() {
    if (!onlineGameId || onlineStateBusy) return;
    onlineStateBusy = true;
    try {
      const state = await getSnakeState(onlineGameId);
      if (!state || !Array.isArray(state.board)) {
        throw new Error("The server returned an invalid game state.");
      }
      drawOnlineBoard(state.board);
      const ownScore = Array.isArray(state.scores)
        ? state.scores.find(entry => entry.player === player.playerId)
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
  playerForm.addEventListener("submit", event => {
    event.preventDefault();
    authenticate(false);
  });
  document.getElementById("registerButton").addEventListener("click", () => authenticate(true));
  document.getElementById("logoutPlayer").addEventListener("click", async () => {
    await leaveOnlineGame();
    if (onlineGameId) return;
    player = null;
    localStorage.removeItem(playerKey);
    updatePlayerUI();
    showOnlineMessage("Signed out.");
    refreshAvailableGames();
  });
  document.getElementById("createGame").addEventListener("click", createGame);
  document.getElementById("refreshGames").addEventListener("click", refreshAvailableGames);
  document.getElementById("startGame").addEventListener("click", startOnlineGame);
  document.getElementById("leaveGame").addEventListener("click", leaveOnlineGame);

  player = loadPlayer();
  if (player) showOnlineMessage("Signed in as " + player.name + ".");
  snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
  direction = { x: 1, y: 0 };
  food = foodPosition();
  document.getElementById("score").textContent = 0;
  updatePlayerUI();
  draw();
  resumeSavedGame();
  refreshAvailableGames();
  loadOnlineLeaderboard();
  setInterval(loadOnlineLeaderboard, 15000);
})();
