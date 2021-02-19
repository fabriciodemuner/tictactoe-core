import { nanoid } from "nanoid";
import { Player, Role } from "./Player";
import { Server } from "socket.io";

type Result = Role | "D";
export type GameState = {
  score: {
    O: number;
    X: number;
    D: number;
  };
  currentPlayer: Role;
  firstPlayer: Role;
  gameOver: boolean;
  freeze: boolean;
  surrender: boolean;
  waitingForOpponent: boolean;
  result: Result;
  tiles: {
    1: Role;
    2: Role;
    3: Role;
    4: Role;
    5: Role;
    6: Role;
    7: Role;
    8: Role;
    9: Role;
  };
};

const initialGameState: GameState = {
  score: {
    O: 0,
    X: 0,
    D: 0,
  },
  currentPlayer: "O",
  firstPlayer: "O",
  gameOver: false,
  freeze: false,
  surrender: false,
  result: undefined,
  waitingForOpponent: true,
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

export class Room {
  id: string;
  name: string;
  type: "random" | "created";
  players: Player[];
  gameState: GameState;
  newGameResponses: string[] = [];
  io: Server;

  static winningPositions: [number, number, number][] = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9],
    [1, 5, 9],
    [3, 5, 7],
  ];

  constructor(server: Server, name?: string) {
    this.id = nanoid();
    this.name = name || this.id;
    this.type = name ? "created" : "random";
    this.players = [];
    this.gameState = JSON.parse(JSON.stringify(initialGameState));
    this.io = server;
  }

  messagePlayer(playerId: string, event: string) {
    this.io.to(playerId).emit(event);
  }

  messageAll(event: string) {
    this.io.to(this.id).emit(event);
  }

  addPoint(p: Result) {
    this.gameState.score[p]++;
  }

  togglePlayer() {
    this.gameState.currentPlayer =
      this.gameState.currentPlayer === "O" ? "X" : "O";
  }

  checkResult(id: number, player: Role) {
    this.gameState.tiles[id] = player;
    const playedArray = Object.keys(this.gameState.tiles)
      .filter(idx => this.gameState.tiles[idx] === player)
      .map(Number);
    let win = false;
    Room.winningPositions.forEach(pos => {
      if (pos.every(elem => playedArray.includes(elem))) {
        win = true;
        console.log("WIN!!! Player", player, this.id.slice(0, 6));
      }
    });
    if (win) {
      this.gameState.gameOver = true;
      this.gameState.result = player;
      this.addPoint(player);
      return;
    }
    if (Object.values(this.gameState.tiles).filter(p => p).length === 9) {
      console.log("DRAW!!", this.id.slice(0, 6));
      this.gameState.gameOver = true;
      this.gameState.result = "D";
      this.addPoint("D");
      return;
    }
    this.togglePlayer();
  }

  surrender(id: string) {
    const opponent = this.players.find(p => p.id !== id);
    const result = opponent.role;
    this.addPoint(result);
    this.gameState.freeze = true;
    this.messagePlayer(id, "freeze");
    this.messagePlayer(opponent.id, "opp-surrender");
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
    const nextPlayer: Role = this.gameState.firstPlayer === "O" ? "X" : "O";
    this.gameState.firstPlayer = nextPlayer;
    this.gameState.currentPlayer = nextPlayer;
    this.gameState.surrender = initialGameState.surrender;
    this.gameState.freeze = initialGameState.freeze;
    console.log("New game started", this.id.slice(0, 6));
    this.io.to(this.id).emit("game-state", this.gameState);
    while (this.newGameResponses.length) this.newGameResponses.pop();
  }

  resetAll() {
    this.gameState.score = JSON.parse(JSON.stringify(initialGameState.score));
    this.resetGame();
  }
}
