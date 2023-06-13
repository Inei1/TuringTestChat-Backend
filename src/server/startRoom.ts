import { Socket } from "socket.io";
import { getRandomPercent } from "./getRandomPercent";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
import { randomUUID } from "crypto";
import { generateSystemMessage } from "./generateSystemMessage";
import { getRandomJoinTime } from "./getRandomJoinTime";
import { initiateChat } from "./initiateChat";
import { sendBotMessage } from "./sendBotMessage";
import { OpenAIApi } from "openai";
import { getRandomCharactersPerSecond } from "./getRandomCharactersPerSecond";
import { UserElements } from "src/types";

const WAITING_MILLIS = 30000;

// Whether a person joins into a bot or another player is ideally a 50/50 percent chance.
// To be as convincing as possible, there should be a chance that the user instantly queues into a bot.
// To make the chances exactly 50/50, there is a 25% percent chance to instant queue into a bot.
// Because of this, we need to have the chance of queueing into a bot instead of a player when finding
// a game to be 33%. The probability of queueing into a bot is 1/4 + (3/4 * 1/3) = 50%.
// The probability of queueing into a human is (3/4 * 2/3) = 50%.
export const startRoom = async (data: any, emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  try {
    const user = await globalThis.collections.users?.findOne(
      { username: data.username },
    );
    if (user && user.currentDailyCredits <= 0 && user.permanentCredits <= 0) {
      logger.info("User attempted to join game with no credits remaining");
    } else {
      logger.info("Attempting to start new room");
      if (emptyRooms.length > 0) {
        logger.info("New room found, attempting to join");
        await joinRoom(user!, emptyRooms, socket, io, openai);
      } else {
        logger.info("No new rooms found, creating a new one");
        await createNewRoom(user!, emptyRooms, socket, io, openai);
      }
    }
  } catch (err) {
    logger.err("An unknown error occurred when attempting to start room.");
    logger.err(err);
  }
}

const createNewRoom = async (user: UserElements, emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  logger.info("Creating a new room");
  const roomId = randomUUID();
  const botChat = getRandomPercent();
  // 75% chance to queue normally.
  if (botChat <= 75) {
    logger.info(`Queuing normally for room ${roomId}`);
    const user1Start = getRandomPercent() < 50;
    logger.info(`Is user1 starting? ${user1Start}`);
    logger.info(`username of user1 is ${user.username}`);
    try {
      await globalThis.collections.chatSessions?.insertOne(
        {
          endChatTime: -1,
          endResultTime: -1,
          id: roomId,
          messages: [],
          user1: {
            name: "user1",
            bot: false,
            result: null,
            ready: false,
            socketId: socket.id,
            goal: getRandomPercent() < 50 ? "Human" : "Bot",
            canSend: user1Start,
            active: true,
            charactersPerSecond: getRandomCharactersPerSecond(),
            username: user.username,
          },
          user2: {
            name: "user2",
            bot: false,
            result: null,
            ready: false,
            socketId: "",
            goal: getRandomPercent() < 50 ? "Human" : "Bot",
            canSend: !user1Start,
            active: true,
            charactersPerSecond: getRandomCharactersPerSecond(),
            username: "",
          }
        });
    } catch (error) {
      logger.err(error);
    }
    emptyRooms.push(roomId);
    socket.join(roomId);
    logger.info(`Created new room ${roomId}`);
    // 25% chance to immediately queue into a bot instead.
  } else {
    logger.info("Creating and immediately filling a new room with a bot");
    const endTime = Date.now() + WAITING_MILLIS;
    const botStart = getRandomPercent() < 50;
    logger.info(`End time is ${endTime} for ${roomId}`);
    logger.info(`Is bot starting? ${botStart}`);
    logger.info(`username of user1 is ${user.username}`);
    try {
      await globalThis.collections.chatSessions?.insertOne({
        endChatTime: -1,
        endResultTime: -1,
        id: roomId,
        messages: [{
          name: "System",
          message: generateSystemMessage()
        }],
        user1: {
          name: "user1",
          bot: true,
          result: null,
          ready: false,
          socketId: "",
          goal: getRandomPercent() < 50 ? "Human" : "Bot",
          canSend: botStart,
          active: true,
          charactersPerSecond: getRandomCharactersPerSecond(),
          username: "",
        },
        user2: {
          name: "user2",
          bot: false,
          result: null,
          ready: false,
          socketId: socket.id,
          goal: getRandomPercent() < 50 ? "Human" : "Bot",
          canSend: !botStart,
          active: true,
          charactersPerSecond: getRandomCharactersPerSecond(),
          username: user.username,
        }
      });
    } catch (error) {
      logger.err(error);
    }
    socket.join(roomId);
    socket.emit("foundChat", { endTime: endTime, name: "user2" });
    try {
      if (user.currentDailyCredits > 0) {
        await globalThis.collections.users?.updateOne(
          { username: user.username },
          {
            $set: {
              currentDailyCredits: user?.currentDailyCredits! - 1
            }
          }
        );
        logger.info(`Removed one daily credit from ${user?.username}`);
      } else if (user.permanentCredits > 0) {
        await globalThis.collections.users?.updateOne(
          { username: user.username },
          {
            $set: {
              permanentCredits: user?.permanentCredits! - 1
            }
          }
        );
        logger.info(`Removed one permanent credit from ${user?.username}`);
      } else {
        logger.err("User somehow has no credits?");
      }
    } catch (err) {
      logger.err("Failed to remove a credit from the joining user");
      logger.err(err);
    }
    logger.info(`User instantly joined game with bot ${roomId}`);
    setTimeout(async () => {
      // user1 is always bot
      logger.info(`Bot is joining room ${roomId}`);
      await globalThis.collections.chatSessions?.updateOne(
        { id: roomId },
        { $set: { "user1.ready": true } }
      );
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      // don't reactivate the chat if it's already active
      if (room?.user2.ready && room.endChatTime !== -1) {
        logger.info(`User1 is ready in room ${roomId}`);
        await initiateChat(roomId, io, socket, botStart, room?.user1.goal!, room?.user2.goal!, true, "user1", "user2");
        if (botStart) {
          await sendBotMessage("user1", io, openai, room, roomId);
        }
      } else {
        logger.info(`User is not ready in room ${roomId}`);
      }
    }, getRandomJoinTime());
    setTimeout(async () => {
      logger.info(`Checking if user2 is ready in room ${roomId}`);
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      // user1 is a bot and always ready by the end
      if (!room?.user2.ready) {
        // remove points from user2
        logger.info(`User2 is ready in room ${roomId}`);
        io.to(roomId).emit("readyExpired");
        io.in(roomId).disconnectSockets();
      } else {
        logger.info(`User2 is not ready in room ${roomId}`);
      }
    }, WAITING_MILLIS);
  }
}

const joinRoom = async (user: UserElements, emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  const botChat = getRandomPercent();
  // 66% chance to queue into a human like normal.
  if (botChat <= 66) {
    logger.info("New room is queuing like normal");
    logger.info(`Username of joining user is ${user.username}`);
    const roomId = emptyRooms.pop()!
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: roomId }
    );
    await globalThis.collections.chatSessions?.updateOne(
      { id: roomId },
      {
        $set: {
          user2: {
            name: "user2",
            bot: false,
            result: null,
            ready: false,
            socketId: socket.id,
            goal: getRandomPercent() < 50 ? "Human" : "Bot",
            canSend: room?.user2.canSend!,
            active: true,
            charactersPerSecond: getRandomCharactersPerSecond(),
            username: user.username
          }
        }
      }
    );
    logger.info(`Created chat session for room ${roomId}`);
    socket.join(roomId);
    logger.info(`Room ${roomId} joined`);
    const endTime = Date.now() + WAITING_MILLIS;
    logger.info(`End waiting time for ${roomId} is ${endTime}`);
    socket.broadcast.to(roomId).emit("foundChat", { endTime: endTime, name: "user1" });
    socket.emit("foundChat", { endTime: endTime, name: "user2" });
    try {
      const otherUser = await globalThis.collections.users?.findOne(
        {username: room?.user1.username}
      );
      if (user.currentDailyCredits > 0) {
        await globalThis.collections.users?.updateOne(
          { username: user.username },
          {
            $set: {
              currentDailyCredits: user?.currentDailyCredits! - 1
            }
          }
        );
        logger.info(`Removed one daily credit from ${user?.username}`);
      } else if (user.permanentCredits > 0) {
        await globalThis.collections.users?.updateOne(
          { username: user.username },
          {
            $set: {
              permanentCredits: user?.permanentCredits! - 1
            }
          }
        );
        logger.info(`Removed one permanent credit from ${user?.username}`);
      } else {
        logger.err("User somehow has no credits?");
      }
      if (otherUser?.currentDailyCredits! > 0) {
        await globalThis.collections.users?.updateOne(
          { username: otherUser?.username },
          {
            $set: {
              currentDailyCredits: otherUser?.currentDailyCredits! - 1
            }
          }
        );
        logger.info(`Removed one daily credit from ${user?.username}`);
      } else if (otherUser?.permanentCredits! > 0) {
        await globalThis.collections.users?.updateOne(
          { username: otherUser?.username },
          {
            $set: {
              permanentCredits: otherUser?.permanentCredits! - 1
            }
          }
        );
        logger.info(`Removed one permanent credit from ${otherUser?.username}`);
      } else {
        logger.err("User somehow has no credits?");
      }
    } catch (err) {
      logger.err("Failed to remove a credit from both usera");
      logger.err(err);
    }
    setTimeout(async () => {
      logger.info(`Checking that both users accepted in room ${roomId}`);
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      if (!room?.user1.ready) {
        // remove points from user1
        logger.info(`User1 did not accept in ${roomId}`);
        io.to(roomId).emit("readyExpired");
        io.in(roomId).disconnectSockets();
      }
      if (!room?.user2.ready) {
        // remove points from user2
        logger.info(`User2 did not accept in ${roomId}`);
        io.to(roomId).emit("readyExpired");
        io.in(roomId).disconnectSockets();
      }
    }, WAITING_MILLIS);
    logger.info(`Successfully sent room found message for room ${roomId}`);
    // 33% chance to queue into a bot instead.
  } else {
    logger.info("Previously existing room is queuing into a bot");
    const endTime = Date.now() + WAITING_MILLIS;
    const roomId = emptyRooms.pop()!;
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: roomId }
    );
    await globalThis.collections.chatSessions?.updateOne(
      { id: roomId },
      {
        $set: {
          user2: {
            name: "user2",
            bot: true,
            result: null,
            ready: false,
            socketId: "",
            goal: getRandomPercent() < 50 ? "Human" : "Bot",
            canSend: room?.user2.canSend!,
            active: true,
            charactersPerSecond: getRandomCharactersPerSecond(),
            username: "",
          },
          messages: [{
            name: "System",
            message: generateSystemMessage()
          }]
        }
      }
    );
    logger.info(`Created chat session for room ${roomId}`);
    io.to(roomId).emit("foundChat", { endTime: endTime, name: "user1" });
    try {
      const user = await globalThis.collections.users?.findOne(
        {username: room?.user1.username}
      );
      if (user?.currentDailyCredits! > 0) {
        await globalThis.collections.users?.updateOne(
          { username: user?.username },
          {
            $set: {
              currentDailyCredits: user?.currentDailyCredits! - 1
            }
          }
        );
      } else if (user?.permanentCredits! > 0) {
        await globalThis.collections.users?.updateOne(
          { username: user?.username },
          {
            $set: {
              permanentCredits: user?.permanentCredits! - 1
            }
          }
        );
      } else {
        logger.err("User somehow has no credits?");
      }
      logger.info(`Removed one credit from ${user?.username}`);
    } catch (err) {
      logger.err("Failed to remove a credit from the joining user");
      logger.err(err);
    }
    logger.info(`Joined into bot in ${roomId}`);
    const joinTime = getRandomJoinTime();
    logger.info(`Bot will join in ${joinTime} millis for room ${roomId}`);
    setTimeout(async () => {
      logger.info(`Bot is joining ${roomId}`);
      // user2 is always bot
      await globalThis.collections.chatSessions?.updateOne(
        { id: roomId },
        { $set: { "user2.ready": true } }
      );
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      if (room?.user1.ready && room.endChatTime !== -1) {
        logger.info(`User is ready, initiating chat for ${roomId}`);
        await initiateChat(roomId, io, socket, room.user2.canSend, room?.user2.goal!, room?.user1.goal!, false, "user2", "user1");
        if (room.user2.canSend) {
          logger.info(`Sending first bot message in ${roomId}`);
          await sendBotMessage("user2", io, openai, room, roomId);
        }
      } else {
        logger.info(`User is not ready yet, waiting for them to accept in room ${roomId}`);
      }
    }, joinTime);
    setTimeout(async () => {
      logger.info(`Checking if user is ready in ${roomId}`);
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      // user2 is a bot and always ready by the end
      if (!room?.user1.ready) {
        // remove points from user1
        logger.info(`User in room ${roomId} is not ready`);
        io.to(roomId).emit("readyExpired");
        io.in(roomId).disconnectSockets();
      }
    }, WAITING_MILLIS);

    logger.info(`Creating a new room for the user who would have joined this room`);
    // create a new room for the new user
    await createNewRoom(user, emptyRooms, socket, io, openai);
  }
}
