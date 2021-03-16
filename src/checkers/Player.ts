import { Server, Socket } from "socket.io";
import { CheckersPlayer, GameName, JoinOption, Role, RowCol } from "../types";
import { NamedRoom, namedRooms, RandomRoom, randomRooms } from "./Room";

export class CheckersUser {
  id: string;
  name: string;
  game: GameName;
  room: NamedRoom | RandomRoom;
  role: Role<CheckersPlayer>;
  io: Server;
  socket: Socket;
  joinOption: JoinOption;

  constructor(server: Server, socket: Socket) {
    this.id = socket.id;
    this.io = server;
    this.socket = socket;
  }

  setupGame() {
    this.socket.emit("setup", {
      tiles: this.room.gameState.tiles,
      currentPlayer: this.room.gameState.currentPlayer,
      role: this.role,
      waitingForOpponent: this.room.gameState.waitingForOpponent,
      joinOption: this.joinOption,
    });
  }

  createRandomRoom(): RandomRoom {
    const room = new RandomRoom(this.io);
    console.log(this.name, "created random room", room.id.slice(0, 6));
    room.gameState.waitingForOpponent = true;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "W";
    randomRooms.push(room);
    return room;
  }

  joinRandomRoom(room: RandomRoom): RandomRoom {
    console.log(this.name, "joined random room", room.id.slice(0, 6));
    room.gameState.waitingForOpponent = false;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "B";
    room.resetAll();
    return room;
  }

  findRandomRoom(): RandomRoom {
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
    const room = new NamedRoom(this.io, roomName);
    console.log(this.name, "created named room", room.name);
    room.gameState.waitingForOpponent = true;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "W";
    namedRooms.push(room);
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

  verifyMove(from: RowCol, to: RowCol) {
    const rows = to.row - from.row;
    const cols = to.col - from.col;
    const isDiagonal = Math.abs(cols) === Math.abs(rows);
    if (!isDiagonal) return;

    const fromId = this.idFromPosition(from);
    const toId = this.idFromPosition(to);
    const isEmptyTile = !this.room.gameState.tiles[toId];
    if (!isEmptyTile) return;

    const distance = Math.abs(rows);
    const hasCrown = this.room.gameState.crowns.includes(fromId);
    const isForward =
      (this.role === "W" && rows > 0) || (this.role === "B" && rows < 0);

    if (distance === 1 && (isForward || hasCrown)) {
      this.movePiece(from, to);
      return;
    }

    const oppRole = this.role === "B" ? "W" : "B";
    if (hasCrown) {
      const step = (toId - fromId) / distance;
      const skippedIds = [...Array(distance - 1)].map(
        (_, i) => fromId + step * (i + 1)
      );
      const pieces = skippedIds
        .map<CheckersPlayer>(id => this.room.gameState.tiles[id])
        .filter(role => role);
      if (!pieces.length) {
        this.movePiece(from, to);
        return;
      }
      if (pieces.length === 1 && pieces[0] === oppRole) {
        this.room.removePiece(skippedIds[0]);
        this.movePiece(from, to);
        return;
      }
    }

    if (!hasCrown && distance === 2) {
      if (!isEmptyTile) return;

      const col = (to.col + from.col) / 2;
      const row = (to.row + from.row) / 2;
      const id = this.idFromPosition({ col, row });
      if (this.room.gameState.tiles[id] === oppRole) {
        this.room.gameState.tiles[id] = undefined;
        this.movePiece(from, to);
        return;
      }
    }
  }

  movePiece(from: RowCol, to: RowCol) {
    const fromId = this.idFromPosition(from);
    const toId = this.idFromPosition(to);
    this.room.gameState.tiles[fromId] = undefined;
    this.room.gameState.tiles[toId] = this.role;
    console.log(
      "Piece moved from",
      fromId,
      "to",
      toId,
      "Player:",
      this.name,
      "Room:",
      this.room.name || this.room.id.slice(0, 6)
    );
    if (this.room.gameState.crowns.includes(fromId)) {
      const idx = this.room.gameState.crowns.findIndex(el => el === fromId);
      this.room.gameState.crowns.splice(idx, 1, toId);
    } else if (
      (to.row === 0 && this.role === "B") ||
      (to.row === 7 && this.role === "W")
    ) {
      this.room.gameState.crowns.push(toId);
    }
    this.room.checkResult();
  }

  private idFromPosition(position: RowCol): number {
    return position.row * 8 + position.col + 1;
  }

  sendMessage(event: string) {
    this.socket.emit(event);
  }
}
