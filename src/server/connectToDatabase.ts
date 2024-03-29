import { Collection, Db, MongoClient } from "mongodb";
import { ChatSession, PasswordResetTokens, UserElements, WaitingUser, WaitlistElements } from "src/types";
import * as dotenv from "dotenv";
import logger from "jet-logger";

export async function connectToDatabase() {
  dotenv.config();
  const client: MongoClient = new MongoClient(process.env.DB_CONN_STRING!);
  await client.connect();
  const db: Db = client.db(process.env.NODE_ENV === "production" ? process.env.PROD_DB_NAME : process.env.TEST_DB_NAME);
  const usersCollection: Collection<UserElements> =
    db.collection<UserElements>(process.env.USERS_COLLECTION_NAME!);
  const waitlistCollection: Collection<WaitlistElements> =
    db.collection<WaitlistElements>(process.env.WAITLIST_COLLECTION_NAME!);
  const chatSessionsCollection: Collection<ChatSession> =
    db.collection<ChatSession>(process.env.CHAT_SESSION_COLLECTION_NAME!);
  const pastChatSessionsCollection: Collection<ChatSession> =
    db.collection<ChatSession>(process.env.PAST_CHAT_SESSION_COLLECTION_NAME!);
  logger.imp(`Successfully connected to database ${db.databaseName}`);
  const passwordResetTokensCollection: Collection<PasswordResetTokens> =
    db.collection<PasswordResetTokens>(process.env.PASSWORD_RESET_TOKENS_COLLECTION_NAME!);
  const waitingUsersCollection: Collection<WaitingUser> =
    db.collection<WaitingUser>(process.env.WAITING_USERS_COLLECTION_NAME!);
  return {
    users: usersCollection,
    waitlist: waitlistCollection,
    chatSessions: chatSessionsCollection,
    pastChatSessions: pastChatSessionsCollection,
    passwordResetTokens: passwordResetTokensCollection,
    waitingUsers: waitingUsersCollection,
  };
}
