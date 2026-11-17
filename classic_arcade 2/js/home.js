document.addEventListener("DOMContentLoaded", () => {
  let a = allScores();
  [
    ["2048", "b2048"],
    ["Snake", "bSnakeLocal"],
    ["Tetris", "bTetris"]
  ].forEach(([g, id]) => {
    let el = document.getElementById(id),
      s = a.filter(x => x.game === g).sort((x, y) => y.score - x.score).slice(0, 5);
    el.innerHTML = s.length ? s.map(x => "<li>" + (x.name || "Player") + " <b>" + x.score.toLocaleString() + "</b></li>").join("") : "<li>No scores yet</li>"
  });
  document.getElementById("played").textContent = a.length;
  document.getElementById("saved").textContent = a.length;
  document.getElementById("top").textContent = a.length ? Math.max(...a.map(x => x.score)).toLocaleString() : 0;
  loadSnakeLeaderboard();

  const playerForm = document.getElementById("playerForm");
  const playerSession = document.getElementById("playerSession");
  const playerLabel = document.getElementById("playerLabel");
  const signinMessage = document.getElementById("signinMessage");
  const loginButton = document.getElementById("loginButton");
  const registerButton = document.getElementById("registerButton");
  const logoutPlayer = document.getElementById("logoutPlayer");
  const playerName = document.getElementById("playerName");
  const playerPassword = document.getElementById("playerPassword");

  function updateSigninUI() {
    const p = getPlayer();
    playerForm.hidden = Boolean(p);
    playerSession.hidden = !p;
    if (p) playerLabel.textContent = p.name;
  }

  playerForm.addEventListener("submit", event => {
    event.preventDefault();
    authenticate(false, playerName, playerPassword, signinMessage).then(() => {
      updateSigninUI();
    });
  });

  registerButton.addEventListener("click", () => {
    authenticate(true, playerName, playerPassword, signinMessage).then(() => {
      updateSigninUI();
    });
  });

  logoutPlayer.addEventListener("click", () => {
    logout();
    updateSigninUI();
    signinMessage.textContent = "Signed out.";
  });

  const savedPlayer = loadPlayer();
  if (savedPlayer) {
    signinMessage.textContent = "Signed in as " + savedPlayer.name + ".";
  }
  updateSigninUI();
});

async function loadSnakeLeaderboard() {
  const list = document.getElementById("bSnake");
  const message = document.getElementById("snakeLeaderboardMessage");

  try {
    const leaders = await getSnakeLeaderboard();
    if (!Array.isArray(leaders)) throw new Error("Unexpected leaderboard response.");
    list.replaceChildren();

    if (!leaders.length) {
      list.innerHTML = "<li>No multiplayer scores yet</li>";
      return;
    }

    leaders.slice(0, 5).forEach(entry => {
      if (!entry || !Number.isFinite(Number(entry.highScore))) {
        throw new Error("A leaderboard entry has an invalid score.");
      }
      const item = document.createElement("li");
      const name = document.createElement("span");
      const score = document.createElement("b");
      name.textContent = entry.playerName || entry.name || "Player";
      score.textContent = Number(entry.highScore).toLocaleString();
      item.append(name, " ", score);
      list.append(item);
    });
    message.textContent = "";
  } catch (error) {
    message.textContent = "Could not load online scores: " + error.message;
    list.replaceChildren();
  }
}
