import { CheckersPlayer, RowCol } from "../types";

export class CheckersPiece {
  id: number;
  role: CheckersPlayer;
  crown: boolean;
  pos: RowCol;
  alive: boolean;

  constructor(id: number, role: CheckersPlayer) {
    this.id = id;
    this.role = role;
    this.crown = false;
    this.pos = this.positionFromId(id);
    this.alive = true;
  }

  move(to: RowCol): boolean {
    console.log(this.role, "piece moved from", this.pos, "to", to);
    this.pos = to;
    if (this.isCrownHead()) this.crown = true;
    return true;
  }

  reset() {
    this.crown = false;
    this.pos = this.positionFromId(this.id);
    this.alive = true;
  }

  remove() {
    this.alive = false;
  }

  private isCrownHead(): boolean {
    if (this.pos.row === 0 && this.role === "B") return true;
    if (this.pos.row === 7 && this.role === "W") return true;
    return false;
  }

  private positionFromId(id: number): RowCol {
    const row = Math.floor((id - 1) / 8);
    const col = id - 8 * row - 1;
    return { row, col };
  }
}
