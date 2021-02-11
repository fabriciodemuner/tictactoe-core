import { Server, Socket } from "socket.io";

const PORT = 5000;
const CLIENT = "http://localhost:5001";
const io = new Server(PORT, {
  cors: { origin: CLIENT },
});

type Player = "O" | "X";
type Result = Player | "D";
type GameState = {
  score: {
    O: number;
    X: number;
    D: number;
  };
  players: { O: string; X: string };
  currentPlayer: Player;
  firstPlayer: Player;
  gameOver: boolean;
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
  currentPlayer: "O",
  firstPlayer: "O",
  gameOver: false,
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
let resetRequestedBy: string = "";

const resetGame = () => {
  gameState.tiles = JSON.parse(JSON.stringify(initialGameState.tiles));
  gameState.result = initialGameState.result;
  gameState.gameOver = initialGameState.gameOver;
  const nextPlayer: Player = gameState.firstPlayer === "O" ? "X" : "O";
  gameState.firstPlayer = nextPlayer;
  gameState.currentPlayer = nextPlayer;
  console.log("New game started");
  io.sockets.emit("game-state", gameState);
  while (newGameResponses.length) newGameResponses.pop();
  resetRequestedBy = "";
};

const surrender = (id: string) => {
  const opponent =
    gameState.players.X === id ? gameState.players.O : gameState.players.X;
  const result = gameState.players.X === id ? "O" : "X";
  io.sockets.to(opponent).emit("teste", "1, 2, 3");
  addPoint(result);
  resetGame();
};

const resetAll = () => {
  gameState.score = JSON.parse(JSON.stringify(initialGameState.score));
  resetGame();
};

const startResetRequest = (id: string, event: string) => {
  resetRequestedBy = id;
  const opponent =
    gameState.players.X === id ? gameState.players.O : gameState.players.X;
  io.sockets.to(opponent).emit("reset-start");
};

const cancelResetRequest = () => {
  resetRequestedBy = "";
  io.sockets.emit("reset-cancel");
};

io.on("connection", (socket: Socket) => {
  console.log("New connection id:", socket.id);
  const me: Player = gameState.players.O ? "X" : "O";
  socket.emit("setup", {
    tiles: gameState.tiles,
    currentPlayer: gameState.currentPlayer,
    role: me,
  });
  gameState.players[me] = socket.id;
  console.log("Player assigned:", me, socket.id);
  io.sockets.emit("new-user", `New user connected ${socket.id}`);

  socket.on("message", data => {
    console.log("Message received from", socket.id, data);
    if (data === "new-game" && !newGameResponses.includes(socket.id))
      newGameResponses.push(socket.id);
    if (newGameResponses.length === 2) resetGame();
    // if (newGameResponses.length === 1) alertOpponent(socket.id, data);

    if (data === "surrender") surrender(socket.id);

    if (data === "reset-start") {
      if (!resetRequestedBy) startResetRequest(socket.id, data);
      else if (resetRequestedBy !== socket.id) resetAll();
    }
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
    gameState.players[me] = "";
    io.sockets.emit("user-disconnected", `User disconnected ${socket.id}`);
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
