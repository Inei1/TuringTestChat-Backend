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

const WAITING_MILLIS = 30000;

// Whether a person joins into a bot or another player is ideally a 50/50 percent chance.
// To be as convincing as possible, there should be a chance that the user instantly queues into a bot.
// To make the chances exactly 50/50, there is a 25% percent chance to instant queue into a bot.
// Because of this, we need to have the chance of queueing into a bot instead of a player when finding
// a game to be 33%. The probability of queueing into a bot is 1/4 + (3/4 * 1/3) = 50%.
// The probability of queueing into a human is (3/4 * 2/3) = 50%.
export const startRoom = async (emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  if (emptyRooms.length > 0) {
    joinRoom(emptyRooms, socket, io, openai);
  } else {
    createNewRoom(emptyRooms, socket, io, openai);
  }
}

const createNewRoom = async (emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  const roomId = randomUUID();
  const botChat = getRandomPercent();
  // 75% chance to queue like normal.
  if (botChat <= 75) {
    const user1Start = getRandomPercent() < 50;
    try {
      await globalThis.collections.chatSessions?.insertOne(
        {
          endChatTime: -1,
          endResultTime: -1,
          id: roomId,
          messages: [],
          user1: { name: "user1", bot: false, result: null, ready: false, socketId: socket.id, goal: getRandomPercent() < 50 ? "Human" : "Bot", canSend: user1Start, active: true, charactersPerSecond: getRandomCharactersPerSecond() },
          user2: { name: "user2", bot: false, result: null, ready: false, socketId: "", goal: getRandomPercent() < 50 ? "Human" : "Bot", canSend: !user1Start, active: true, charactersPerSecond: getRandomCharactersPerSecond() }
        });
    } catch (error) {
      logger.err(error);
    }
    emptyRooms.push(roomId);
    socket.join(roomId);
    logger.info("Room created: " + roomId);
    // 25% chance to immediately queue into a bot instead.
  } else {
    const endTime = Date.now() + WAITING_MILLIS;
    const botStart = getRandomPercent() < 50;
    try {
      await globalThis.collections.chatSessions?.insertOne({
        endChatTime: -1,
        endResultTime: -1,
        id: roomId,
        messages: [{
          name: "System",
          message: generateSystemMessage()
        }],
        user1: { name: "user1", bot: true, result: null, ready: false, socketId: "", goal: getRandomPercent() < 50 ? "Human" : "Bot", canSend: botStart, active: true, charactersPerSecond: getRandomCharactersPerSecond() },
        user2: { name: "user2", bot: false, result: null, ready: false, socketId: socket.id, goal: getRandomPercent() < 50 ? "Human" : "Bot", canSend: !botStart, active: true, charactersPerSecond: getRandomCharactersPerSecond() }
      });
    } catch (error) {
      logger.err(error);
    }
    socket.join(roomId);
    socket.emit("foundChat", { endTime: endTime, name: "user2" });
    logger.info("User instantly joined game with bot " + roomId);
    setTimeout(async () => {
      // user1 is always bot
      await globalThis.collections.chatSessions?.updateOne(
        { id: roomId },
        { $set: { "user1.ready": true } }
      );
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      if (room?.user2.ready) {
        await initiateChat(roomId, io, socket, botStart, room?.user1.goal!, room?.user2.goal!, true, "user1", "user2");
        if (botStart) {
          await sendBotMessage("user1", io, openai, room, roomId);
        }
      }
    }, getRandomJoinTime());
    setTimeout(async () => {
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      // user1 is a bot and always ready by the end
      if (!room?.user2.ready) {
        // remove points from user2
        io.to(roomId).emit("readyExpired");
        io.socketsLeave(roomId);
      }
    }, WAITING_MILLIS);
  }
}

const joinRoom = async (emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  const botChat = getRandomPercent();
  // 66% chance to queue into a human like normal.
  if (botChat <= 66) {
    const roomId = emptyRooms.pop()!
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: roomId }
    );
    await globalThis.collections.chatSessions?.updateOne(
      { id: roomId },
      { $set: { user2: { name: "user2", bot: false, result: null, ready: false, socketId: socket.id, goal: getRandomPercent() < 50 ? "Human" : "Bot", canSend: room?.user2.canSend!, active: true, charactersPerSecond: getRandomCharactersPerSecond() } } }
    );
    socket.join(roomId);
    logger.info("Room joined: " + roomId);
    const endTime = Date.now() + WAITING_MILLIS;
    socket.to(roomId).emit("foundChat", { endTime: endTime, name: "user1" });
    socket.emit("foundChat", { endTime: endTime, name: "user2" });
    setTimeout(async () => {
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      if (!room?.user1.ready) {
        // remove points from user1
        io.to(roomId).emit("readyExpired");
        io.socketsLeave(roomId);
      }
      if (!room?.user2.ready) {
        // remove points from user2
        io.to(roomId).emit("readyExpired");
        io.socketsLeave(roomId);
      }
    }, WAITING_MILLIS);
    // 33% chance to queue into a bot instead.
  } else {
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
            charactersPerSecond: getRandomCharactersPerSecond()
          },
          messages: [{
            name: "System",
            message: generateSystemMessage()
          }]
        }
      }
    );
    io.to(roomId).emit("foundChat", { endTime: endTime, name: "user1" });
    logger.info("Joined into bot " + roomId);
    setTimeout(async () => {
      // user2 is always bot
      await globalThis.collections.chatSessions?.updateOne(
        { id: roomId },
        { $set: { "user2.ready": true } }
      );
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      if (room?.user1.ready) {
        await initiateChat(roomId, io, socket, room.user2.canSend, room?.user2.goal!, room?.user1.goal!, false, "user2", "user1");
        if (room.user2.canSend) {
          await sendBotMessage("user2", io, openai, room, roomId);
        }
      }
    }, getRandomJoinTime());
    setTimeout(async () => {
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: roomId }
      );
      // user2 is a bot and always ready by the end
      if (!room?.user1.ready) {
        // remove points from user1
        io.to(roomId).emit("readyExpired");
        io.socketsLeave(roomId);
      }
    }, WAITING_MILLIS);

    // create a new room for the new user
    createNewRoom(emptyRooms, socket, io, openai);
  }
}
