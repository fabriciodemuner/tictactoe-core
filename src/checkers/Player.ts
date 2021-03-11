import { Server, Socket } from "socket.io";
import { GameName, JoinOption, Role, CheckersPlayer, RowCol } from "../types";
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

  moveIsAllowed(from: RowCol, to: RowCol) {
    console.log(from, to);
    const fromId = this.idFromPosition(from);
    const toId = this.idFromPosition(to);
    if (![7, 9].includes(Math.abs(fromId - toId))) return false;

    return true;
  }

  movePiece(from: RowCol, to: RowCol) {
    console.log(from, to);
    this.room.gameState.tiles[this.idFromPosition(from)] = undefined;
    this.room.gameState.tiles[this.idFromPosition(to)] = this.role;
    console.log(this.room.gameState.tiles);
  }

  private idFromPosition(position: RowCol) {
    return position.row * 8 + position.col + 1;
  }

  sendMessage(event: string) {
    this.socket.emit(event);
  }
}
