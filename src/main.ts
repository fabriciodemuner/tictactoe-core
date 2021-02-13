import { Server, Socket } from "socket.io";

const PORT = Number(process.env.PORT) || 5000;
const io = new Server(PORT, {
  cors: { origin: true },
});

type Player = "O" | "X";
type Role = Player | "S";
type Result = Player | "D";
type GameState = {
  score: {
    O: number;
    X: number;
    D: number;
  };
  players: { O: string; X: string };
  spectators: string[];
  currentPlayer: Player;
  firstPlayer: Player;
  gameOver: boolean;
  freeze: boolean;
  surrender: boolean;
  result: Result;
  tiles: {
    1: Player;
    2: Player;
    3: Player;
    4: Player;
    5: Player;
    6: Player;
    7: Player;
    8: Player;
    9: Player;
  };
};

const initialGameState: GameState = {
  score: {
    O: 0,
    X: 0,
    D: 0,
  },
  players: { O: "", X: "" },
  spectators: [],
  currentPlayer: "O",
  firstPlayer: "O",
  gameOver: false,
  freeze: false,
  surrender: false,
  result: undefined,
  tiles: {
    1: undefined,
    2: undefined,
    3: undefined,
    4: undefined,
    5: undefined,
    6: undefined,
    7: undefined,
    8: undefined,
    9: undefined,
  },
};

const gameState: GameState = JSON.parse(JSON.stringify(initialGameState));
const newGameResponses: string[] = [];

const resetGame = () => {
  gameState.tiles = JSON.parse(JSON.stringify(initialGameState.tiles));
  gameState.result = initialGameState.result;
  gameState.gameOver = initialGameState.gameOver;
  const nextPlayer: Player = gameState.firstPlayer === "O" ? "X" : "O";
  gameState.firstPlayer = nextPlayer;
  gameState.currentPlayer = nextPlayer;
  gameState.surrender = initialGameState.surrender;
  gameState.freeze = initialGameState.freeze;
  console.log("New game started");
  io.sockets.emit("game-state", gameState);
  while (newGameResponses.length) newGameResponses.pop();
};

const messagePlayer = (id: string, event: string) => {
  io.sockets.to(id).emit(event);
};
const messageAll = (event: string) => io.sockets.emit(event);

const surrender = (id: string) => {
  const opponent =
    gameState.players.X === id ? gameState.players.O : gameState.players.X;
  const result = gameState.players.X === id ? "O" : "X";
  addPoint(result);
  gameState.freeze = true;
  messagePlayer(id, "freeze");
  messagePlayer(opponent, "opp-surrender");
};

const resetAll = () => {
  gameState.score = JSON.parse(JSON.stringify(initialGameState.score));
  resetGame();
};

const startResetRequest = (id: string) => {
  const opponent =
    gameState.players.X === id ? gameState.players.O : gameState.players.X;
  messagePlayer(id, "freeze");
  messagePlayer(opponent, "reset-start");
};

const cancelResetRequest = () => {
  messageAll("reset-cancel");
};

const moveSpectatorsQueue = (disconnected: string) => {
  const nextPlayer = gameState.spectators.shift();
  const role: Player = gameState.players.O === disconnected ? "O" : "X";
  gameState.players[role] = nextPlayer;
  console.log("Player assigned:", role, nextPlayer);
  io.to(nextPlayer).emit("setup", {
    tiles: gameState.tiles,
    currentPlayer: gameState.currentPlayer,
    role,
  });
};

io.on("connection", (socket: Socket) => {
  console.log("New connection id:", socket.id);
  const role: Role = gameState.players.O
    ? gameState.players.X
      ? "S"
      : "X"
    : "O";
  socket.emit("setup", {
    tiles: gameState.tiles,
    currentPlayer: gameState.currentPlayer,
    role,
  });
  if (role !== "S") {
    gameState.players[role] = socket.id;
    console.log("Player assigned:", role, socket.id);
  } else {
    gameState.spectators.push(socket.id);
    console.log("New spectator:", role, socket.id);
  }

  socket.on("message", data => {
    console.log("Message received from", socket.id, data);
    if (data === "new-game" && !newGameResponses.includes(socket.id)) {
      newGameResponses.push(socket.id);
      messagePlayer(socket.id, "freeze");
    }
    if (newGameResponses.length === 2) resetGame();

    if (data === "surrender") surrender(socket.id);
    if (data === "surrender-ok") resetGame();

    if (data === "reset-alert") messagePlayer(socket.id, "reset-alert");
    if (data === "reset-start") startResetRequest(socket.id);
    if (data === "reset-confirm") resetAll();
    if (data === "reset-cancel") cancelResetRequest();
  });

  socket.on("tile-clicked", (data: { id: number; player: Player }) => {
    console.log("Tile clicked:", data.id, "Player:", data.player);
    checkResult(data.id, data.player);
    io.sockets.emit("game-state", gameState);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (gameState.spectators.includes(socket.id)) {
      const idx = gameState.spectators.indexOf(socket.id);
      gameState.spectators.splice(idx, 1);
    } else if (gameState.spectators.length) {
      moveSpectatorsQueue(socket.id);
      resetAll();
    } else {
      const myRole: Player = gameState.players.O === socket.id ? "O" : "X";
      gameState.players[myRole] = "";
      resetAll();
    }
  });
});

const winningPositions: [number, number, number][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
  [1, 5, 9],
  [3, 5, 7],
];

const addPoint = (p: Result) => {
  gameState.score[p]++;
};

const togglePlayer = () => {
  gameState.currentPlayer = gameState.currentPlayer === "O" ? "X" : "O";
};

const checkResult = (id: number, player: Player) => {
  gameState.tiles[id] = player;
  const playedArray = Object.keys(gameState.tiles)
    .filter(idx => gameState.tiles[idx] === player)
    .map(Number);
  let win = false;
  winningPositions.forEach(pos => {
    if (pos.every(elem => playedArray.includes(elem))) {
      win = true;
      console.log("WIN!!! Player", player);
    }
  });
  if (win) {
    gameState.gameOver = true;
    gameState.result = player;
    addPoint(player);
    return;
  }
  if (Object.values(gameState.tiles).filter(p => p).length === 9) {
    console.log("DRAW!!");
    gameState.gameOver = true;
    gameState.result = "D";
    addPoint("D");
    return;
  }
  togglePlayer();
};
