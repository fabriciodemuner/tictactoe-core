import { Player, Role } from "./Player";
import { Room } from "./Room";
import { Server, Socket } from "socket.io";

const PORT = Number(process.env.PORT) || 5000;
const io = new Server(PORT, {
  cors: { origin: true },
});
const rooms: Room[] = [];

const findRoom = (player: Player): Room => {
  const availableRoom = rooms.find(r => r.players.length !== 2);
  if (availableRoom) return player.joinRoom(availableRoom);

  const newRoom = player.createRoom();
  rooms.push(newRoom);
  return newRoom;
};

const setupGame = (player: Player) => {
  player.socket.emit("setup", {
    tiles: player.room.gameState.tiles,
    currentPlayer: player.room.gameState.currentPlayer,
    role: player.role,
    waitingForOpponent: player.room.gameState.waitingForOpponent,
    joinOption: player.joinOption,
  });
};

const startGame = (roomId: Room["id"]) => io.to(roomId).emit("start-game");

io.on("connection", (socket: Socket) => {
  console.log(
    "New connection id:",
    socket.id.slice(0, 6),
    "Num of players:",
    io.sockets.sockets.size
  );
  const player = new Player(socket.id, io, socket);

  socket.on("random-room", () => {
    player.joinOption = "random-room";
    player.room = findRoom(player);
    socket.join(player.room.id);
    if (player.room.players.length < 2) {
      player.room.gameState.waitingForOpponent = true;
      setupGame(player);
    } else {
      player.room.gameState.waitingForOpponent = false;
      setupGame(player);
      startGame(player.room.id);
    }
  });

  socket.on("message", data => {
    console.log("Message received from", socket.id.slice(0, 6), data);
    if (
      data === "new-game" &&
      !player.room.newGameResponses.includes(socket.id)
    ) {
      player.room.newGameResponses.push(socket.id);
      player.room.messagePlayer(socket.id, "freeze");
      if (player.room.newGameResponses.length === 2) player.room.resetGame();
    }

    if (data === "surrender") player.room.surrender(socket.id);
    if (data === "surrender-ok") player.room.resetGame();

    if (data === "reset-alert")
      player.room.messagePlayer(socket.id, "reset-alert");
    if (data === "reset-start") player.room.startResetRequest(socket.id);
    if (data === "reset-confirm") player.room.resetAll();
    if (data === "reset-cancel") player.room.cancelResetRequest();
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
    const roomIdx = rooms.findIndex(r => r.id === player.room.id);
    rooms.splice(roomIdx, 1);
    const opponent = player.room?.players.find(p => p.id !== socket.id);
    if (opponent) {
      opponent.socket.leave(player.room.id);
      const oppNewRoom = findRoom(opponent);
      opponent.socket.join(oppNewRoom.id);
      opponent.room = oppNewRoom;
      setupGame(opponent);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id.slice(0, 6));
  });
});
