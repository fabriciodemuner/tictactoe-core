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
  private lastJumpPosition: RowCol;

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

  verifyMove(from: RowCol, to: RowCol): "moved" | "jumped" {
    const isDiagonal =
      Math.abs(to.row - from.row) === Math.abs(to.col - from.col);
    if (!isDiagonal) return;

    const pieceOnTarget = this.room.findPiece(to);
    if (pieceOnTarget) return;

    const piecesCanJump = this.canJump();
    const movingPiece = this.room.findPiece(from);

    const playerMustJump = piecesCanJump.length !== 0;
    if (!playerMustJump) {
      this.lastJumpPosition = undefined;
      return movingPiece.crown
        ? this.moveWithCrown(movingPiece, to)
        : this.moveWithoutCrown(movingPiece, to);
    }

    const pieceCanJump = piecesCanJump.includes(movingPiece);
    if (pieceCanJump) {
      if (this.lastJumpPosition && this.getLastJumpPiece() !== movingPiece) {
        return;
      }
      const result = movingPiece.crown
        ? this.jumpWithCrown(movingPiece, to)
        : this.jumpWithoutCrown(movingPiece, to);
      if (result) this.lastJumpPosition = to;
      return result;
    }
  }

  canJump(): CheckersPiece[] {
    return this.pieces.filter(
      p =>
        p.alive &&
        this.pieceCanJump(p) &&
        (!this.lastJumpPosition || p.id === this.getLastJumpPiece().id)
    );
  }

  pieceCanJump(piece: CheckersPiece): boolean {
    const opponentRole = this.room.findOpponent(this.role as "B" | "W").role;
    const steps = [
      { row: -1, col: -1 },
      { row: -1, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: -1 },
    ];
    if (!piece.crown) {
      return steps.some(step => {
        let row = piece.pos.row + step.row;
        let col = piece.pos.col + step.col;
        const oppPiece = this.room.findPiece(
          { row, col },
          opponentRole as "B" | "W"
        );
        if (!oppPiece) return false;

        row = piece.pos.row + 2 * step.row;
        col = piece.pos.col + 2 * step.col;
        const offBoundaries = this.isOffBoundaries({ row, col });
        if (offBoundaries) return false;

        const nextPiece = this.room.findPiece({ row, col });
        return !nextPiece;
      });
    } else {
      return steps.some(step => {
        let i = 1;
        let offBoundaries = false;
        while (!offBoundaries) {
          let row = piece.pos.row + i * step.row;
          let col = piece.pos.col + i * step.col;
          offBoundaries = this.isOffBoundaries({ row, col });

          const foundPiece = this.room.findPiece({ row, col });
          if (foundPiece && foundPiece.role === piece.role) {
            return false;
          }
          if (foundPiece && foundPiece.role !== piece.role) {
            row = piece.pos.row + (i + 1) * step.row;
            col = piece.pos.col + (i + 1) * step.col;
            offBoundaries = this.isOffBoundaries({ row, col });
            if (offBoundaries) return false;

            const nextPiece = this.room.findPiece({ row, col });
            return !nextPiece;
          }
          i++;
        }
      });
    }
  }

  moveWithoutCrown(piece: CheckersPiece, to: RowCol): "moved" {
    const rows = to.row - piece.pos.row;
    const dist = Math.abs(rows);
    if (dist !== 1) return;
    const isForward =
      (this.role === "W" && rows > 0) || (this.role === "B" && rows < 0);
    if (isForward) return piece.move(to);
  }

  jumpWithoutCrown(piece: CheckersPiece, to: RowCol): "jumped" {
    const rows = to.row - piece.pos.row;
    const dist = Math.abs(rows);

    if (dist !== 2) return;

    const col = (to.col + piece.pos.col) / 2;
    const row = (to.row + piece.pos.row) / 2;
    const opponentRole = this.role === "W" ? "B" : "W";
    const jumpedPiece = this.room.findPiece({ row, col }, opponentRole);
    if (!jumpedPiece) return;

    return piece.jump(to, jumpedPiece);
  }

  moveWithCrown(piece: CheckersPiece, to: RowCol): "moved" {
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

    if (jumpedPieces.length) return;
    return piece.move(to);
  }

  jumpWithCrown(piece: CheckersPiece, to: RowCol): "jumped" {
    const rows = to.row - piece.pos.row;
    const dist = Math.abs(rows);

    if (dist === 1) return;

    const jumpedPieces = [...Array(dist - 1)]
      .map((_, i) => {
        const row = piece.pos.row + (i + 1) * Math.sign(to.row - piece.pos.row);
        const col = piece.pos.col + (i + 1) * Math.sign(to.col - piece.pos.col);
        return this.room.findPiece({ row, col });
      })
      .filter(piece => piece);

    if (jumpedPieces.length !== 1) return;

    const opponentRole = this.role === "W" ? "B" : "W";
    if (jumpedPieces[0].role === opponentRole) {
      return piece.jump(to, jumpedPieces[0]);
    }
  }

  sendMessage(event: string) {
    this.socket.emit(event);
  }

  private isOffBoundaries(pos: RowCol): boolean {
    return Math.max(pos.row, pos.col) > 7 || Math.min(pos.row, pos.col) < 0;
  }

  private getLastJumpPiece(): CheckersPiece {
    return this.lastJumpPosition && this.room.findPiece(this.lastJumpPosition);
  }

  setLastJumpPosition(pos: RowCol) {
    this.lastJumpPosition = pos;
  }
}
