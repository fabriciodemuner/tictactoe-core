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

  assignRole(role: Role) {
    this.role = role;
    console.log(
      `${this.id.slice(0, 6)} ${role} room ${this.room.id.slice(0, 6)}`
    );
  }

  createRoom(): Room {
    const room = new Room(this.io);
    console.log(this.id.slice(0, 6), "room created", room.id.slice(0, 6));
    this.room = room;
    room.players.push(this);
    this.assignRole("O");
    return room;
  }

  joinRoom(room: Room): Room {
    console.log(this.id.slice(0, 6), "joined room", room.id.slice(0, 6));
    this.room = room;
    room.players.push(this);
    this.assignRole("X");
    room.resetAll();
    return room;
  }
}
