export interface TokenSlipItem {
  name: string;
  quantity: number;
  priceRupees: number;
}

export interface TokenSlipData {
  stallName: string;
  tokenNo: number | string;
  items: TokenSlipItem[];
  totalRupees: number;
  paymentMethod?: string;
  timestamp?: string;
}

export interface EscPosCommands {
  INIT: number[];
  ALIGN_LEFT: number[];
  ALIGN_CENTER: number[];
  ALIGN_RIGHT: number[];
  BOLD_ON: number[];
  BOLD_OFF: number[];
  DOUBLE_SIZE: number[];
  NORMAL_SIZE: number[];
  FEED_3_LINES: number[];
  FEED_5_LINES: number[];
  PARTIAL_CUT: number[];
}

export declare class EscPosGenerator {
  static generateTokenSlip(slipData: TokenSlipData): Uint8Array;
  static format32Columns(left: string, right: string, totalCols?: number): string;
  static getCommands(): EscPosCommands;
}

export declare function format32Columns(leftStr: string, rightStr: string, totalCols?: number): string;
export declare function stringToBytes(str: string): number[];
export declare const COMMANDS: EscPosCommands;

export default EscPosGenerator;
