import { Server, Socket } from "socket.io";
import { manageCheckers } from "./checkers/checkers";
import { manageTicTacToe } from "./tictactoe/tictactoe";
import { SetupData } from "./types";

const PORT = Number(process.env.PORT) || 5000;
const io = new Server(PORT, {
  cors: { origin: true },
});

io.on("connection", (socket: Socket) => {
  console.log(
    "New connection id:",
    socket.id.slice(0, 6),
    "Num of players:",
    io.sockets.sockets.size
  );

  socket.on("setup", (data: SetupData) => {
    const { userName, game } = data;
    if (game === "TicTacToe") manageTicTacToe(io, socket, userName);
    if (game === "Checkers") manageCheckers(io, socket, userName);
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
