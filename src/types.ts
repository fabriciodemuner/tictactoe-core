export type GameName = "TicTacToe" | "Checkers";
export type JoinOption = "random-room" | "create-room" | "join-room";
export type Result<T> = T | "D";
export type Role<T> = T | "S";
export type SetupData = { userName: string; game: GameName };

export type CheckersPlayer = "W" | "B";
export type TicTacToePlayer = "O" | "X";

export type RowCol = { row: number; col: number };
