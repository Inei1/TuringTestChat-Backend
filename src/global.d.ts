import { Collection } from "mongodb";
import { ChatSession, PasswordResetTokens, UserElements, WaitingUser, WaitlistElements } from "./types";

// https://stackoverflow.com/questions/42233987/how-to-configure-custom-global-interfaces-d-ts-files-for-typescript/42257742#42257742
export { }

declare global {
  var refreshTokens: string[];
  var collections: {
    users?: Collection<UserElements>,
    waitlist?: Collection<WaitlistElements>,
    chatSessions?: Collection<ChatSession>,
    pastChatSessions?: Collection<ChatSession>,
    passwordResetTokens?: Collection<PasswordResetTokens>,
    waitingUsers: Collection<WaitingUser>,
  };
}