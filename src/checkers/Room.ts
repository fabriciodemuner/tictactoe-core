import { nanoid } from "nanoid";
import { Server } from "socket.io";
import { CheckersPlayer, Result } from "../types";
import { CheckersUser } from "./Player";

type GameState = {
  score: {
    W: number;
    B: number;
    D: number;
  };
  currentPlayer: CheckersPlayer;
  firstPlayer: CheckersPlayer;
  gameOver: boolean;
  freeze: boolean;
  waitingForOpponent: boolean;
  result: Result<CheckersPlayer>;
  crowns: number[];
  tiles: {
    1: CheckersPlayer;
    2: CheckersPlayer;
    3: CheckersPlayer;
    4: CheckersPlayer;
    5: CheckersPlayer;
    6: CheckersPlayer;
    7: CheckersPlayer;
    8: CheckersPlayer;
    9: CheckersPlayer;
    10: CheckersPlayer;
    11: CheckersPlayer;
    12: CheckersPlayer;
    13: CheckersPlayer;
    14: CheckersPlayer;
    15: CheckersPlayer;
    16: CheckersPlayer;
    17: CheckersPlayer;
    18: CheckersPlayer;
    19: CheckersPlayer;
    20: CheckersPlayer;
    21: CheckersPlayer;
    22: CheckersPlayer;
    23: CheckersPlayer;
    24: CheckersPlayer;
    25: CheckersPlayer;
    26: CheckersPlayer;
    27: CheckersPlayer;
    28: CheckersPlayer;
    29: CheckersPlayer;
    30: CheckersPlayer;
    31: CheckersPlayer;
    32: CheckersPlayer;
    33: CheckersPlayer;
    34: CheckersPlayer;
    35: CheckersPlayer;
    36: CheckersPlayer;
    37: CheckersPlayer;
    38: CheckersPlayer;
    39: CheckersPlayer;
    40: CheckersPlayer;
    41: CheckersPlayer;
    42: CheckersPlayer;
    43: CheckersPlayer;
    44: CheckersPlayer;
    45: CheckersPlayer;
    46: CheckersPlayer;
    47: CheckersPlayer;
    48: CheckersPlayer;
    49: CheckersPlayer;
    50: CheckersPlayer;
    51: CheckersPlayer;
    52: CheckersPlayer;
    53: CheckersPlayer;
    54: CheckersPlayer;
    55: CheckersPlayer;
    56: CheckersPlayer;
    57: CheckersPlayer;
    58: CheckersPlayer;
    59: CheckersPlayer;
    60: CheckersPlayer;
    61: CheckersPlayer;
    62: CheckersPlayer;
    63: CheckersPlayer;
    64: CheckersPlayer;
  };
};

export const randomRooms: RandomRoom[] = [];
export const namedRooms: NamedRoom[] = [];

const initialGameState: GameState = {
  score: {
    W: 0,
    B: 0,
    D: 0,
  },
  currentPlayer: "W",
  firstPlayer: "W",
  gameOver: false,
  freeze: false,
  result: undefined,
  waitingForOpponent: true,
  crowns: [],
  tiles: {
    1: "W",
    2: undefined,
    3: "W",
    4: undefined,
    5: "W",
    6: undefined,
    7: "W",
    8: undefined,
    9: undefined,
    10: "W",
    11: undefined,
    12: "W",
    13: undefined,
    14: "W",
    15: undefined,
    16: "W",
    17: "W",
    18: undefined,
    19: "W",
    20: undefined,
    21: "W",
    22: undefined,
    23: "W",
    24: undefined,
    25: undefined,
    26: undefined,
    27: undefined,
    28: undefined,
    29: undefined,
    30: undefined,
    31: undefined,
    32: undefined,
    33: undefined,
    34: undefined,
    35: undefined,
    36: undefined,
    37: undefined,
    38: undefined,
    39: undefined,
    40: undefined,
    41: undefined,
    42: "B",
    43: undefined,
    44: "B",
    45: undefined,
    46: "B",
    47: undefined,
    48: "B",
    49: "B",
    50: undefined,
    51: "B",
    52: undefined,
    53: "B",
    54: undefined,
    55: "B",
    56: undefined,
    57: undefined,
    58: "B",
    59: undefined,
    60: "B",
    61: undefined,
    62: "B",
    63: undefined,
    64: "B",
  },
};

abstract class Room {
  readonly id: string;
  readonly name: string;
  readonly type: "random" | "created";
  readonly io: Server;
  players: CheckersUser[];
  spectators: CheckersUser[];
  gameState: GameState;
  newGameResponses: string[] = [];

  constructor(server: Server, name?: string) {
    this.id = nanoid();
    this.type = name ? "created" : "random";
    this.io = server;
    this.players = [];
    this.gameState = JSON.parse(JSON.stringify(initialGameState));
    if (name) {
      this.name = name;
      this.spectators = [];
    }
  }

  startGame = () => this.io.to(this.id).emit("start-game");

  messagePlayer(playerId: string, event: string) {
    this.io.to(playerId).emit(event);
  }

  messageAll(event: string) {
    this.io.to(this.id).emit(event);
  }

  addPoint(p: Result<CheckersPlayer>) {
    this.gameState.score[p]++;
  }

  removePiece(id: number) {
    this.gameState.tiles[id] = undefined;
    if (this.gameState.crowns.includes(id)) {
      const idx = this.gameState.crowns.findIndex(el => el === id);
      this.gameState.crowns.splice(idx, 1);
    }
  }

  togglePlayer() {
    this.gameState.currentPlayer =
      this.gameState.currentPlayer === "W" ? "B" : "W";
  }

  checkResult() {
    const black = Object.values(this.gameState.tiles).filter(r => r === "B");
    const white = Object.values(this.gameState.tiles).filter(r => r === "W");

    const winner: CheckersPlayer = !black.length
      ? "W"
      : !white.length
      ? "B"
      : undefined;

    if (winner) {
      this.gameState.gameOver = true;
      this.gameState.result = winner;
      this.addPoint(winner);
      return;
    }

    this.togglePlayer();
  }

  startDrawRequest(id: string) {
    const opponent = this.players.find(p => p.id !== id);
    this.messagePlayer(id, "freeze");
    this.messagePlayer(opponent.id, "draw-start");
  }

  finishDrawRequest() {
    this.addPoint("D");
    this.messageAll("draw-cancel");
    this.resetGame();
  }

  startResetRequest(id: string) {
    const opponent = this.players.find(p => p.id !== id);
    this.messagePlayer(id, "freeze");
    this.messagePlayer(opponent.id, "reset-start");
  }

  cancelResetRequest() {
    this.messageAll("reset-cancel");
  }

  resetGame() {
    this.gameState.tiles = JSON.parse(JSON.stringify(initialGameState.tiles));
    this.gameState.result = initialGameState.result;
    this.gameState.gameOver = initialGameState.gameOver;
    const nextPlayer: CheckersPlayer =
      this.gameState.firstPlayer === "W" ? "B" : "W";
    this.gameState.firstPlayer = nextPlayer;
    this.gameState.currentPlayer = nextPlayer;
    this.gameState.freeze = initialGameState.freeze;
    this.gameState.waitingForOpponent = this.players.length !== 2;
    console.log("New game started", this.name || this.id.slice(0, 6));
    this.io.to(this.id).emit("game-state", this.gameState);
    while (this.newGameResponses.length) this.newGameResponses.pop();
  }

  resetAll() {
    this.gameState.score = JSON.parse(JSON.stringify(initialGameState.score));
    this.resetGame();
  }
}

export class RandomRoom extends Room {
  constructor(server: Server) {
    super(server);
  }

  handleDisconnection(player: CheckersUser) {
    const roomIdx = randomRooms.findIndex(r => r.id === player.room.id);
    randomRooms.splice(roomIdx, 1);
    const opponent = player.room.players.find(p => p.id !== player.id);
    if (!opponent) return;

    opponent.socket.leave(player.room.id);
    const oppNewRoom = opponent.findRandomRoom();
    opponent.setupGame();
    if (oppNewRoom.players.length === 2) {
      oppNewRoom.gameState.waitingForOpponent = false;
      oppNewRoom.startGame();
    }
  }
}

export class NamedRoom extends Room {
  constructor(server: Server, name: string) {
    super(server, name);
  }

  addSpectator(player: CheckersUser) {
    this.spectators.push(player);
    player.role = "S";
  }

  addPlayer(player: CheckersUser) {
    this.players.push(player);
    const opponent = this.players.find(p => p.id !== player.id);
    if (opponent) {
      player.role = opponent.role === "W" ? "B" : "W";
    } else {
      player.role = "B";
    }
    this.gameState.waitingForOpponent = this.players.length !== 2;
    console.log("Player assigned:", player.role, player.name);
  }

  moveSpectatorsQueue() {
    const nextPlayer = this.spectators.shift();
    this.addPlayer(nextPlayer);
    console.log("Player assigned:", nextPlayer.role, nextPlayer.name);
    nextPlayer.setupGame();
    this.resetAll();
  }

  handleDisconnection(player: CheckersUser) {
    if (this.spectators.includes(player)) {
      const idx = this.spectators.indexOf(player);
      this.spectators.splice(idx, 1);
      return;
    }

    const idx = this.players.indexOf(player);
    this.players.splice(idx, 1);
    if (!this.players.length) {
      this.deleteRoom();
      return;
    }

    this.spectators.length ? this.moveSpectatorsQueue() : this.resetAll();
  }

  deleteRoom() {
    const idx = namedRooms.indexOf(this);
    namedRooms.splice(idx, 1);
    console.log("Room deleted:", this.name);
  }
}
