export interface AuthToken {
  accessToken: string;
  kind: string;
}

export interface UserElements {
  user: string;
  profileImage: string;
  password: string;
  email: string;
  points: number;
  tokens: AuthToken[];
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
  bot: boolean;
  result: string | null;
  ready: boolean;
  canSend: boolean;
  active: boolean;
}

export interface ChatSession {
  endChatTime: number;
  endResultTime: number;
  id: string;
  user1: ChatUser;
  user2: ChatUser;
  messages: UserMessage[];
}
