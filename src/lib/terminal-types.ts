export type WorkspaceFile = {
  name: string;
  path?: string;
  content?: string;
  language?: string;
  isFolder?: boolean;
};

export type TerminalAttachPayload = {
  token: string;
  roomId: string;
  terminalId: string;
  cols?: number;
  rows?: number;
  files?: WorkspaceFile[];
  userId?: string;
};

export type TerminalOutputPayload = {
  roomId: string;
  terminalId: string;
  data: string;
};

export type TerminalInputPayload = {
  roomId: string;
  terminalId: string;
  data: string;
};

export type TerminalResizePayload = {
  roomId: string;
  terminalId: string;
  cols: number;
  rows: number;
};

export type TerminalAttachResult = {
  ok: boolean;
  error?: string;
  roomId?: string;
  terminalId?: string;
  dockerReady?: boolean;
};

export type TerminalTab = {
  id: string;
  title: string;
  terminalId: string;
  attached: boolean;
  cwd: string;
};
