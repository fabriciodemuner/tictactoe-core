import { Server, Socket } from "socket.io";
import { TicTacToePlayer } from "../types";
import { TicTacToeUser } from "./Player";

export const manageTicTacToe = (io: Server, socket: Socket, name: string) => {
  const player = new TicTacToeUser(io, socket, name);
  console.log(player.name, "selected TicTacToe");
  socket.emit("app-setup", "TicTacToe");

  socket.on("random-room", () => {
    console.log(player.name, "wants to play a random room");
    player.joinOption = "random-room";
    player.findRandomRoom();
    player.setupGame();
    if (!player.room.gameState.waitingForOpponent) player.room.startGame();
  });

  socket.on("create-room", (roomName: string) => {
    console.log(player.name, "wants to create room", roomName);
    player.createNamedRoom(roomName);
  });

  socket.on("join-room", (roomName: string) => {
    console.log(player.name, "wants to join room", roomName);
    player.joinNamedRoom(roomName);
  });

  socket.on("message", data => {
    console.log("Message received from", player.name, data);
    if (
      data === "new-game" &&
      !player.room.newGameResponses.includes(socket.id)
    ) {
      player.room.newGameResponses.push(socket.id);
      player.sendMessage("freeze");
      if (player.room.newGameResponses.length === 2) player.room.resetGame();
    }

    if (data === "surrender") player.room.surrender(socket.id);
    if (data === "surrender-ok") player.room.resetGame();

    if (data === "reset-alert") player.sendMessage("reset-alert");
    if (data === "reset-start") player.room.startResetRequest(socket.id);
    if (data === "reset-confirm") player.room.resetAll();
    if (data === "reset-cancel") player.room.cancelResetRequest();

    if (data === "room-name-taken-ok") player.sendMessage("room-name-taken-ok");
    if (data === "room-not-found-ok") player.sendMessage("room-not-found-ok");
  });

  socket.on("tile-clicked", (data: { id: number; player: TicTacToePlayer }) => {
    console.log(
      "Tile clicked:",
      data.id,
      "Player:",
      player.name,
      data.player,
      "Room:",
      player.room.name || player.room.id.slice(0, 6)
    );
    player.room.checkResult(data.id, data.player);
    io.to(player.room.id).emit("game-state", player.room.gameState);
  });

  socket.on("disconnecting", () => {
    if (player.room) player.room.handleDisconnection(player);
  });
};
