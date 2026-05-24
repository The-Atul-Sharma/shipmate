import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function ch(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Shipmate');
  }
  return channel;
}

function stamp(level: string, msg: string): string {
  return `[${new Date().toISOString()}] ${level} ${msg}`;
}

export const logger = {
  info(msg: string): void {
    ch().appendLine(stamp('INFO', msg));
  },
  warn(msg: string): void {
    ch().appendLine(stamp('WARN', msg));
  },
  error(msg: string, err?: unknown): void {
    ch().appendLine(stamp('ERROR', msg));
    if (err instanceof Error) {
      ch().appendLine(err.stack ?? err.message);
    } else if (err !== undefined) {
      ch().appendLine(String(err));
    }
  },
  show(): void {
    ch().show(true);
  }
};
