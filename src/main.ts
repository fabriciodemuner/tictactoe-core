import { Player, Role } from "./Player";
import { Room } from "./Room";
import { Server, Socket } from "socket.io";

const PORT = Number(process.env.PORT) || 5000;
const io = new Server(PORT, {
  cors: { origin: true },
});
const rooms: Room[] = [];

const findRandomRoom = (player: Player): Room => {
  const availableRoom = rooms.find(
    r => r.type === "random" && r.players.length !== 2
  );
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

const handleRandomRoomDisconnection = (player: Player) => {
  const roomIdx = rooms.findIndex(r => r.id === player.room.id);
  rooms.splice(roomIdx, 1);
  const opponent = player.room.players.find(p => p.id !== player.socket.id);
  if (opponent) {
    opponent.socket.leave(player.room.id);
    const oppNewRoom = findRandomRoom(opponent);
    setupGame(opponent);
    if (oppNewRoom.players.length === 2) {
      oppNewRoom.gameState.waitingForOpponent = false;
      startGame(oppNewRoom.id);
    }
  }
};

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
    findRandomRoom(player);
    setupGame(player);
    if (!player.room.gameState.waitingForOpponent) startGame(player.room.id);
  });

  socket.on("create-room", (data: string) => {
    console.log(socket.id.slice(0, 6), "wants to create room", data);
    player.joinOption = "create-room";
    const room = player.createRoom(data);
    rooms.push(room);
    setupGame(player);
  });

  socket.on("join-room", (data: string) => {
    console.log(socket.id.slice(0, 6), "wants to join room", data);
    player.joinOption = "join-room";
    const room = rooms.find(r => r.type === "created" && r.name === data);
    player.joinRoom(room);
    setupGame(player);
    startGame(player.room.id);
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
    if (player.room) {
      if (player.joinOption === "random-room") {
        handleRandomRoomDisconnection(player);
      } else {
        player.room.resetAll();
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id.slice(0, 6));
  });
});
