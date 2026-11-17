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
document.addEventListener("DOMContentLoaded", () => {
  let t = document.getElementById("theme");
  if (localStorage.getItem("arcadeTheme") === "light") document.body.classList.add("light");
  if (t) t.onclick = () => {
    document.body.classList.toggle("light");
    localStorage.setItem("arcadeTheme", document.body.classList.contains("light") ? "light" : "dark")
  }
});
