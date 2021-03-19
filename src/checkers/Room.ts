import { nanoid } from "nanoid";
import { Server } from "socket.io";
import { CheckersPlayer, Result, RowCol } from "../types";
import { CheckersPiece } from "./Piece";
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

  togglePlayer() {
    this.gameState.currentPlayer =
      this.gameState.currentPlayer === "W" ? "B" : "W";
  }

  checkResult() {
    const opponent = this.findOpponent(this.gameState.currentPlayer);
    if (opponent.pieces.filter(p => p.alive).length) return this.togglePlayer();

    this.gameState.gameOver = true;
    this.gameState.result = this.gameState.currentPlayer;
    this.addPoint(this.gameState.currentPlayer);
  }

  updateGameState() {
    this.io.to(this.id).emit("game-state", {
      ...this.gameState,
      pieces: this.players
        .reduce((acc, player) => acc.concat(player.pieces), [])
        .filter(p => p.alive),
    });
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
    this.players.forEach(player => player.resetPieces());
    this.gameState.result = initialGameState.result;
    this.gameState.gameOver = initialGameState.gameOver;
    const nextPlayer: CheckersPlayer =
      this.gameState.firstPlayer === "W" ? "B" : "W";
    this.gameState.firstPlayer = nextPlayer;
    this.gameState.currentPlayer = nextPlayer;
    this.gameState.freeze = initialGameState.freeze;
    this.gameState.waitingForOpponent = this.players.length !== 2;
    console.log("New game started", this.name || this.id.slice(0, 6));
    this.updateGameState();
    while (this.newGameResponses.length) this.newGameResponses.pop();
  }

  resetAll() {
    this.gameState.score = JSON.parse(JSON.stringify(initialGameState.score));
    this.resetGame();
  }

  findPiece(pos: RowCol, role?: CheckersPlayer): CheckersPiece {
    const pieces: CheckersPiece[] = this.players.reduce((acc, player) => {
      return role && player.role !== role ? acc : acc.concat(player.pieces);
    }, []);

    return pieces.find(
      p => p.alive && p.pos.row === pos.row && p.pos.col === pos.col
    );
  }

  findOpponent(role: CheckersPlayer): CheckersUser {
    return this.players.find(p => p.role !== role);
  }
}

export class RandomRoom extends Room {
  constructor(player: CheckersUser) {
    super(player.io);
    this.players.push(player);
    this.gameState.waitingForOpponent = true;
    randomRooms.push(this);
  }

  handleDisconnection(player: CheckersUser) {
    const roomIdx = randomRooms.findIndex(r => r.id === this.id);
    randomRooms.splice(roomIdx, 1);
    const opponent = this.players.find(p => p.id !== player.id);
    if (!opponent) return;

    opponent.socket.leave(this.id);
    const oppNewRoom = opponent.findRandomRoom();
    opponent.setupGame();
    if (oppNewRoom.players.length === 2) {
      oppNewRoom.gameState.waitingForOpponent = false;
      oppNewRoom.startGame();
    }
  }
}

export class NamedRoom extends Room {
  constructor(player: CheckersUser, name: string) {
    super(player.io, name);
    this.players.push(player);
    this.gameState.waitingForOpponent = true;
    namedRooms.push(this);
  }

  addSpectator(player: CheckersUser) {
    this.spectators.push(player);
    player.assignRole("S");
    this.updateGameState();
  }

  addPlayer(player: CheckersUser) {
    this.players.push(player);
    const opponent = this.players.find(p => p.id !== player.id);
    if (!opponent) {
      player.assignRole("B");
    } else {
      opponent.role === "W" ? player.assignRole("B") : player.assignRole("W");
    }
    this.gameState.waitingForOpponent = this.players.length !== 2;
    console.log("Player assigned:", player.role, player.name);
  }

  moveSpectatorsQueue() {
    const nextPlayer = this.spectators.shift();
    if (!nextPlayer) return;

    this.addPlayer(nextPlayer);
    nextPlayer.setupGame();
  }

  handleDisconnection(player: CheckersUser) {
    if (player.role === "S") {
      const idx = this.spectators.indexOf(player);
      this.spectators.splice(idx, 1);
      return;
    }

    if (this.players.length === 1) {
      this.deleteRoom();
      return;
    }

    const idx = this.players.indexOf(player);
    this.players.splice(idx, 1);
    this.moveSpectatorsQueue();
    this.resetAll();
  }

  deleteRoom() {
    const idx = namedRooms.indexOf(this);
    namedRooms.splice(idx, 1);
    console.log("Room deleted:", this.name);
  }
}
