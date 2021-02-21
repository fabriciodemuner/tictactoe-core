import { Server, Socket } from "socket.io";
import { GameName } from "./main";
import { NamedRoom, namedRooms, RandomRoom, randomRooms } from "./Room";

export type Role = "O" | "X" | "S";
type JoinOption = "random-room" | "create-room" | "join-room";

export class Player {
  id: string;
  name: string;
  game: GameName;
  room: NamedRoom | RandomRoom;
  role: Role;
  io: Server;
  socket: Socket;
  joinOption: JoinOption;

  constructor(id: string, server: Server, socket: Socket) {
    this.id = id;
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
    console.log(this.id.slice(0, 6), "create random room", room.id.slice(0, 6));
    room.gameState.waitingForOpponent = true;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "O";
    randomRooms.push(room);
    return room;
  }

  joinRandomRoom(room: RandomRoom): RandomRoom {
    console.log(this.id.slice(0, 6), "joined random room", room.id.slice(0, 6));
    room.gameState.waitingForOpponent = false;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "X";
    room.resetAll();
    return room;
  }

  findRandomRoom(): RandomRoom {
    const room = randomRooms.find(r => r.players.length !== 2);
    return room ? this.joinRandomRoom(room) : this.createRandomRoom();
  }

  createNamedRoom(name: string): NamedRoom {
    const existingRoom = namedRooms.find(r => r.name === name);
    if (existingRoom) {
      this.socket.emit("room-name-taken");
      return;
    }

    this.joinOption = "create-room";
    const room = new NamedRoom(this.io, name);
    console.log(this.id.slice(0, 6), "created named room", room.name);
    room.gameState.waitingForOpponent = true;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "O";
    namedRooms.push(room);
    this.setupGame();
    return room;
  }

  joinNamedRoom(name: string): NamedRoom {
    const room = namedRooms.find(r => r.name === name);
    if (!room) {
      this.socket.emit("room-not-found");
      return;
    }

    console.log(this.id.slice(0, 6), "joined named room", room.name);
    this.joinOption = "join-room";
    this.room = room;
    this.socket.join(room.id);
    room.players.length === 2 ? room.addSpectator(this) : room.addPlayer(this);
    if (this.role !== "S") room.resetAll();
    this.setupGame();
    return room;
  }

  sendMessage(event: string) {
    this.socket.emit(event);
  }
}
