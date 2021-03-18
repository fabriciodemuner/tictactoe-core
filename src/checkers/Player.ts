import { Server, Socket } from "socket.io";
import { CheckersPlayer, GameName, JoinOption, Role, RowCol } from "../types";
import { CheckersPiece } from "./Piece";
import { NamedRoom, namedRooms, RandomRoom, randomRooms } from "./Room";

export class CheckersUser {
  readonly id: string;
  readonly name: string;
  readonly game: GameName = "Checkers";
  readonly io: Server;
  readonly socket: Socket;
  room: NamedRoom | RandomRoom;
  role: Role<CheckersPlayer>;
  joinOption: JoinOption;
  pieces: CheckersPiece[];

  constructor(server: Server, socket: Socket, name: string) {
    this.id = socket.id;
    this.io = server;
    this.socket = socket;
    this.name = name;
    this.pieces = [];
  }

  private readonly pieceIds: Record<CheckersPlayer, number[]> = {
    W: [1, 3, 5, 7, 10, 12, 14, 16, 17, 19, 21, 23],
    B: [42, 44, 46, 48, 49, 51, 53, 55, 58, 60, 62, 64],
  };

  setupGame() {
    this.socket.emit("setup", {
      pieces: this.pieces,
      currentPlayer: this.room.gameState.currentPlayer,
      role: this.role,
      waitingForOpponent: this.room.gameState.waitingForOpponent,
      joinOption: this.joinOption,
    });
  }

  assignRole(role: Role<CheckersPlayer>) {
    this.role = role;
    if (role === "S") return;

    this.createPieces();
  }

  createPieces() {
    this.pieceIds[this.role].forEach(id =>
      this.pieces.push(new CheckersPiece(id, this.role as "B" | "W"))
    );
  }

  resetPieces() {
    this.pieces.forEach(p => p.reset());
  }

  createRandomRoom(): RandomRoom {
    const room = new RandomRoom(this);
    console.log(this.name, "created random room", room.id.slice(0, 6));
    this.room = room;
    this.socket.join(room.id);
    this.assignRole("W");
    return room;
  }

  joinRandomRoom(room: RandomRoom): RandomRoom {
    console.log(this.name, "joined random room", room.id.slice(0, 6));
    room.gameState.waitingForOpponent = false;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.assignRole("B");
    room.resetAll();
    return room;
  }

  findRandomRoom(): RandomRoom {
    this.joinOption = "random-room";
    const room = randomRooms.find(r => r.players.length !== 2);
    return room ? this.joinRandomRoom(room) : this.createRandomRoom();
  }

  createNamedRoom(roomName: string): NamedRoom {
    const existingRoom = namedRooms.find(r => r.name === roomName);
    if (existingRoom) {
      this.socket.emit("room-name-taken");
      return;
    }

    this.joinOption = "create-room";
    const room = new NamedRoom(this, roomName);
    console.log(this.name, "created named room", room.name);
    this.room = room;
    this.socket.join(room.id);
    this.assignRole("W");
    this.setupGame();
    return room;
  }

  joinNamedRoom(roomName: string): NamedRoom {
    const room = namedRooms.find(r => r.name === roomName);
    if (!room) {
      this.socket.emit("room-not-found");
      return;
    }

    console.log(this.name, "joined named room", room.name);
    this.joinOption = "join-room";
    this.room = room;
    this.socket.join(room.id);
    room.players.length === 2 ? room.addSpectator(this) : room.addPlayer(this);
    if (this.role !== "S") room.resetAll();
    this.setupGame();
    return room;
  }

  verifyMove(from: RowCol, to: RowCol): boolean {
    const isDiagonal =
      Math.abs(to.row - from.row) === Math.abs(to.col - from.col);
    if (!isDiagonal) return false;

    const pieceOnTarget = this.room.findPiece(to);
    if (pieceOnTarget) return false;

    const movingPiece = this.room.findPiece(from);
    return movingPiece.crown
      ? this.moveWithCrown(movingPiece, to)
      : this.moveWithoutCrown(movingPiece, to);
  }

  moveWithoutCrown(piece: CheckersPiece, to: RowCol): boolean {
    const rows = to.row - piece.pos.row;
    const dist = Math.abs(rows);
    if (dist === 1) {
      const isForward =
        (this.role === "W" && rows > 0) || (this.role === "B" && rows < 0);
      return isForward ? piece.move(to) : false;
    }

    if (dist === 2) {
      const col = (to.col + piece.pos.col) / 2;
      const row = (to.row + piece.pos.row) / 2;
      const opponentRole = this.role === "W" ? "B" : "W";
      const jumpedPiece = this.room.findPiece({ row, col }, opponentRole);
      if (!jumpedPiece) return false;

      jumpedPiece.remove();
      return piece.move(to);
    }

    return false;
  }

  moveWithCrown(piece: CheckersPiece, to: RowCol): boolean {
    const rows = to.row - piece.pos.row;
    const dist = Math.abs(rows);

    if (dist === 1) return piece.move(to);

    const jumpedPieces = [...Array(dist - 1)]
      .map((_, i) => {
        const row = piece.pos.row + (i + 1) * Math.sign(to.row - piece.pos.row);
        const col = piece.pos.col + (i + 1) * Math.sign(to.col - piece.pos.col);
        return this.room.findPiece({ row, col });
      })
      .filter(piece => piece);

    if (jumpedPieces.length === 0) return piece.move(to);
    if (jumpedPieces.length === 1) {
      const opponentRole = this.role === "W" ? "B" : "W";
      if (jumpedPieces[0].role === opponentRole) {
        jumpedPieces[0].remove();
        return piece.move(to);
      }
    }
    return false;
  }

  sendMessage(event: string) {
    this.socket.emit(event);
  }
}
