import { Socket } from "socket.io";
import { getRandomPercent } from "./getRandomPercent";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
import { randomUUID } from "crypto";
import { generateSystemMessage } from "./generateSystemMessage";

const WAITING_MILLIS = 30000;

export const startRoom = async (username: any, emptyRooms: string[],
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  if (emptyRooms.length > 0) {
    const botChat = getRandomPercent();
    // 66% chance to queue into a human like normal.
    // if (botChat >= 33) {
    if (true) {
      const roomId = emptyRooms.pop()!
      await globalThis.collections.chatSessions?.updateOne(
        { id: roomId },
        { $set: { user2: { name: username, bot: false, result: null, ready: false, socketId: socket.id } } }
      );
      socket.join(roomId);
      logger.info("Room joined: " + roomId);
      socket.emit("roomFound", { roomId: roomId });
      const endTime = Date.now() + WAITING_MILLIS;
      io.to(roomId).emit("foundChat", { endTime: endTime });
      setTimeout(async () => {
        const room = await globalThis.collections.chatSessions?.findOne(
          { id: roomId }
        );
        if (!room?.user1.ready) {
          io.to(roomId).emit("readyExpired");
          io.socketsLeave(roomId);
        }
        if (!room?.user2.ready) {
          io.to(roomId).emit("readyExpired");
          io.socketsLeave(roomId);
        }
      }, WAITING_MILLIS);
      // 33% chance to queue into a bot instead.
    } else {

    }
  } else {
    const roomId = randomUUID();
    const botChat = getRandomPercent();
    // 75% chance to queue like normal.
    //if (botChat >= 25) {
    if (false) {
      try {
        await globalThis.collections.chatSessions?.insertOne(
          {
            endChatTime: -1,
            endResultTime: -1,
            id: roomId,
            messages: [],
            user1: { name: username, bot: false, result: null, ready: false, socketId: socket.id },
            user2: { name: "", bot: false, result: null, ready: false, socketId: "" }
          });
      } catch (error) {
        logger.err(error);
      }
      emptyRooms.push(roomId);
      socket.join(roomId);
      socket.emit("roomFound", { roomId: roomId });
      logger.info("Room created: " + roomId);
      // 25% chance to immediately queue into a bot instead.
    } else {
      const endTime = Date.now() + WAITING_MILLIS;
      console.log(roomId);
      try {
        await globalThis.collections.chatSessions?.insertOne({
          endChatTime: -1,
          endResultTime: -1,
          id: roomId,
          messages: [{ name: "System",
          message: generateSystemMessage() }],
          user1: { name: "Bot", bot: true, result: null, ready: true, socketId: "" },
          user2: { name: username, bot: false, result: null, ready: false, socketId: socket.id }
        });
      } catch (error) {
        logger.err(error);
      }
      socket.join(roomId);
      socket.emit("roomFound", { roomId: roomId });
      socket.emit("foundChat", { endTime: endTime });
      logger.info("User instantly joined game with bot " + roomId);
      setTimeout(async () => {
        const room = await globalThis.collections.chatSessions?.findOne(
          { id: roomId }
        );
        // user1 is a bot and always ready
        if (!room?.user2.ready) {
          io.to(roomId).emit("readyExpired");
          io.socketsLeave(roomId);
        }
      }, WAITING_MILLIS);
    }
  }
}