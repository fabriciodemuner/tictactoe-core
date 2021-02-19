import { Server, Socket } from "socket.io";
import { Room } from "./Room";

export type Role = "O" | "X";
type JoinOption = "random-room" | "create-room" | "join-room";

export class Player {
  id: string;
  room: Room;
  role: Role;
  io: Server;
  socket: Socket;
  joinOption: JoinOption;

  constructor(id: string, server: Server, socket: Socket) {
    this.id = id;
    this.io = server;
    this.socket = socket;
  }

  createRoom(name?: string): Room {
    const room = new Room(this.io, name);
    console.log(this.id.slice(0, 6), "room created", room.id.slice(0, 6));
    if (room.name !== room.id) console.log("with name:", room.name);
    room.gameState.waitingForOpponent = true;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "O";
    return room;
  }

  joinRoom(room: Room): Room {
    console.log(this.id.slice(0, 6), "joined room", room.id.slice(0, 6));
    room.gameState.waitingForOpponent = false;
    room.players.push(this);
    this.room = room;
    this.socket.join(room.id);
    this.role = "X";
    room.resetAll();
    return room;
  }
}
