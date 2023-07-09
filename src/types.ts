export interface AuthToken {
  accessToken: string;
  kind: string;
}

export interface UserElements {
  username: string;
  password: string;
  email: string;
  detection: number;
  deception: number;
  detectionWins: number;
  detectionLosses: number;
  deceptionWins: number;
  deceptionLosses: number;
  tokens: AuthToken[];
  playFoundSound: boolean;
  currentDailyCredits: number;
  maximumDailyCredits: number;
  permanentCredits: number;
  creationTime: number;
}

export interface WaitlistElements {
  email: string;
  date: number;
}

export interface UserMessage {
  name: string;
  message: string;
}

export interface ChatUser {
  socketId: string;
  goal: "Human" | "Bot";
  name: string;
  username: string;
  bot: boolean;
  result: string | null;
  ready: boolean;
  canSend: boolean;
  active: boolean;
  // only used when bot
  charactersPerSecond: number;
}

export interface ChatSession {
  endChatTime: number;
  endResultTime: number;
  id: string;
  user1: ChatUser;
  user2: ChatUser;
  messages: UserMessage[];
}

export interface Token {
  value: string;
  expiration: number;
}

export interface PasswordResetTokens {
  email: string;
  tokens: Token[];
}
