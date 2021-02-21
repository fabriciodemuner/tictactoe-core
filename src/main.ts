import { Server, Socket } from "socket.io";
import { Player, Role } from "./Player";

const PORT = Number(process.env.PORT) || 5000;
const io = new Server(PORT, {
  cors: { origin: true },
});
export type GameName = "TicTacToe";
type SetupData = { userName: string; game: GameName };

io.on("connection", (socket: Socket) => {
  console.log(
    "New connection id:",
    socket.id.slice(0, 6),
    "Num of players:",
    io.sockets.sockets.size
  );
  const player = new Player(socket.id, io, socket);

  socket.on("setup", (data: SetupData) => {
    const { userName, game } = data;
    player.name = userName;
    player.game = game;
    console.log(player.name, "selected", player.game);
    socket.emit("app-setup", game);
  });

  socket.on("random-room", () => {
    player.joinOption = "random-room";
    player.findRandomRoom();
    player.setupGame();
    if (!player.room.gameState.waitingForOpponent) player.room.startGame();
  });

  socket.on("create-room", (data: string) => {
    console.log(socket.id.slice(0, 6), "wants to create room", data);
    player.createNamedRoom(data);
  });

  socket.on("join-room", (data: string) => {
    console.log(socket.id.slice(0, 6), "wants to join room", data);
    player.joinNamedRoom(data);
  });

  socket.on("message", data => {
    console.log("Message received from", socket.id.slice(0, 6), data);
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

  socket.on("tile-clicked", (data: { id: number; player: Role }) => {
    console.log(
      "Tile clicked:",
      data.id,
      "Player:",
      socket.id.slice(0, 6),
      data.player,
      "Room:",
      player.room.id.slice(0, 6)
    );
    player.room.checkResult(data.id, data.player);
    io.to(player.room.id).emit("game-state", player.room.gameState);
  });

  socket.on("disconnecting", () => {
    if (player.room) player.room.handleDisconnection(player);
  });

  socket.on("disconnect", () => {
    console.log(
      "User disconnected:",
      socket.id.slice(0, 6),
      "Num of players:",
      io.sockets.sockets.size
    );
  });
});
