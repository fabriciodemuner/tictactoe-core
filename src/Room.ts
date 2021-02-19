import { nanoid } from "nanoid";
import { Server } from "socket.io";
import { Player, Role } from "./Player";

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

export const randomRooms: RandomRoom[] = [];
export const namedRooms: NamedRoom[] = [];

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

abstract class Room {
  readonly id: string;
  readonly name: string;
  readonly type: "random" | "created";
  readonly io: Server;
  players: Player[];
  spectators: Player[];
  gameState: GameState;
  newGameResponses: string[] = [];

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

  handleDisconnection(player: Player) {
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

  addSpectator(player: Player) {
    this.spectators.push(player);
    player.role = "S";
  }

  addPlayer(player: Player) {
    this.players.push(player);
    const opponent = this.players.find(p => p.id !== player.id);
    if (opponent) {
      player.role = opponent.role === "O" ? "X" : "O";
    } else {
      player.role = "X";
    }
    this.gameState.waitingForOpponent = this.players.length !== 2;
    console.log("Player assigned:", player.role, player.id.slice(0, 6));
    console.log("waiting", this.gameState.waitingForOpponent);
  }

  moveSpectatorsQueue() {
    const nextPlayer = this.spectators.shift();
    this.addPlayer(nextPlayer);
    console.log("Player assigned:", nextPlayer.role, nextPlayer.id.slice(0, 6));
    nextPlayer.setupGame();
    this.resetAll();
  }

  handleDisconnection(player: Player) {
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
  }
}
