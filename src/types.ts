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