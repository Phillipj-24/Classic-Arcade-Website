
var API_BASE = "https://cmsc106.net/games";

async function apiRequest(path, method, data) {
    var options = {
        method: method || "GET",
        headers: {
            "Accept": "application/json"
        }
    };

    if (data !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
    }

    var response = await fetch(API_BASE + path, options);
    var text = await response.text();
    var result = text ? JSON.parse(text) : null;

    if (!response.ok) {
        var message = result && result.detail
            ? result.detail
            : "Server error: " + response.status;
        throw new Error(message);
    }

    return result;
}

// PLAYER ACCOUNTS

async function registerPlayer(name, password) {
    return apiRequest("/players", "POST", {
        name: name,
        password: password
    });
}

async function loginPlayer(name, password) {
    return apiRequest("/players/login", "POST", {
        name: name,
        password: password
    });
}

// MULTIPLAYER SNAKE

async function createSnakeGame(playerId) {
    return apiRequest("/snake/create", "POST", {
        playerId: playerId
    });
}

async function getAvailableSnakeGames() {
    return apiRequest("/snake/available", "GET");
}

async function joinSnakeGame(playerId, gameId) {
    return apiRequest("/snake/join", "POST", {
        playerId: playerId,
        gameId: gameId
    });
}

async function startSnakeGame(playerId, gameId) {
    return apiRequest("/snake/start", "POST", {
        playerId: playerId,
        gameId: gameId
    });
}

async function getSnakeState(gameId) {
    return apiRequest(
        "/snake/" + encodeURIComponent(gameId) + "/state",
        "GET"
    );
}

async function sendSnakeAction(gameId, playerId, action) {
    return apiRequest(
        "/snake/" + encodeURIComponent(gameId) + "/action",
        "POST",
        {
            playerId: playerId,
            action: action
        }
    );
}

async function leaveSnakeGame(gameId, playerId) {
    return apiRequest(
        "/snake/" + encodeURIComponent(gameId) + "/leave",
        "POST",
        {
            playerId: playerId
        }
    );
}

// LEADERBOARD

async function getSnakeLeaderboard() {
    return apiRequest("/snake/leaders", "GET");
}
