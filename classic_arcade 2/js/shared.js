const KEY = "classicArcadeScores";
const NAME_KEY = "classicArcadePlayerName";

const ADJECTIVES = ["Speedy", "Neon", "Cyber", "Retro", "Mega", "Ultra", "Hyper", "Wild", "Cool", "Fast", "Bold", "Epic", "Prime", "Alpha", "Omega", "Nova", "Star", "Pixel", "Flash", "Super"];
const NOUNS = ["Cobra", "Puma", "Tiger", "Shark", "Wolf", "Fox", "Bear", "Eagle", "Hawk", "Lion", "Panther", "Viper", "Dragon", "Ninja", "Samurai", "Knight", "Wizard", "Hunter", "Ranger", "Ace"];

function allScores() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch (e) {
    return []
  }
}

function record(game, score, name) {
  let a = allScores();
  a.push({
    game,
    score: Number(score) || 0,
    name: name || getPlayerName() || "Player",
    date: Date.now()
  });
  localStorage.setItem(KEY, JSON.stringify(a))
}

function getPlayerName() {
  try {
    return localStorage.getItem(NAME_KEY) || null
  } catch (e) {
    return null
  }
}

function setPlayerName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch (e) {}
  return name
}

function generateRandomName() {
  const adj = ADJECTIVES[Math.random() * ADJECTIVES.length | 0]
  const noun = NOUNS[Math.random() * NOUNS.length | 0]
  return adj + noun
}

// ---------- Shared player authentication ----------

const PLAYER_KEY = "classicArcadePlayer";
let sharedPlayer = null;

function getPlayer() {
  return sharedPlayer;
}

function setPlayer(p) {
  sharedPlayer = p;
}

function loadPlayer() {
  const saved = localStorage.getItem(PLAYER_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed.playerId === "string" && typeof parsed.name === "string") {
      sharedPlayer = parsed;
      return parsed;
    }
  } catch (e) {}
  return null;
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

async function authenticate(createAccount, nameEl, passwordEl, messageEl) {
  const name = nameEl.value.trim();
  const password = passwordEl.value;
  if (!name || !password) {
    messageEl.textContent = "Enter both a player name and password.";
    return;
  }
  const form = nameEl.form;
  const buttons = form ? form.querySelectorAll("button") : [];
  buttons.forEach(button => { button.disabled = true; });
  messageEl.textContent = createAccount ? "Creating account…" : "Signing in…";
  try {
    const response = createAccount
      ? await registerPlayer(name, password)
      : await loginPlayer(name, password);
    sharedPlayer = playerIdFrom(response, name);
    localStorage.setItem(PLAYER_KEY, JSON.stringify(sharedPlayer));
    passwordEl.value = "";
    messageEl.textContent = "Signed in as " + sharedPlayer.name + ".";
    return sharedPlayer;
  } catch (error) {
    messageEl.textContent = (createAccount ? "Could not create account: " : "Could not sign in: ") + error.message;
    throw error;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function logout() {
  sharedPlayer = null;
  localStorage.removeItem(PLAYER_KEY);
}

document.addEventListener("DOMContentLoaded", () => {
  let t = document.getElementById("theme");
  if (localStorage.getItem("arcadeTheme") === "light") document.body.classList.add("light");
  if (t) t.onclick = () => {
    document.body.classList.toggle("light");
    localStorage.setItem("arcadeTheme", document.body.classList.contains("light") ? "light" : "dark")
  }
});
