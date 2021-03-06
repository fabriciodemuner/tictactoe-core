import { Server, Socket } from "socket.io";
import { RowCol } from "../types";
import { CheckersUser } from "./Player";

export const manageCheckers = (io: Server, socket: Socket, name: string) => {
  const player = new CheckersUser(io, socket, name);
  console.log(player.name, "selected Checkers");
  socket.emit("app-setup", "Checkers");

  socket.on("random-room", () => {
    console.log(player.name, "wants to play a random room");
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

    if (data === "draw-start") player.room.startDrawRequest(socket.id);
    if (data === "draw-confirm") player.room.finishDrawRequest();
    if (data === "draw-cancel") player.room.messageAll("draw-cancel");

    if (data === "reset-alert") player.sendMessage("reset-alert");
    if (data === "reset-start") player.room.startResetRequest(socket.id);
    if (data === "reset-confirm") player.room.resetAll();
    if (data === "reset-cancel") player.room.cancelResetRequest();

    if (data === "room-name-taken-ok") player.sendMessage("room-name-taken-ok");
    if (data === "room-not-found-ok") player.sendMessage("room-not-found-ok");
  });

  socket.on("piece-moved", (data: { moveFrom: RowCol; moveTo: RowCol }) => {
    console.log("verify move", data.moveFrom, data.moveTo);
    const result = player.verifyMove(data.moveFrom, data.moveTo);

    if (result === "moved") {
      player.room.checkResult();
      player.room.updateGameState();
    }

    if (result === "jumped") {
      const playerCanJump = player.canJump().length !== 0;
      if (!playerCanJump) {
        player.setLastJumpPosition(undefined);
        player.room.checkResult();
      }
      player.room.updateGameState();
    }
  });

  socket.on("disconnecting", () => {
    if (player.room) player.room.handleDisconnection(player);
  });
};
