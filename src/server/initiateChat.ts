import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';

const CHAT_TIME = 150000;
const RESULT_TIME = 30000;

export const initiateChat = async (id: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  canSend: boolean, selfGoal: string, otherGoal: string, initiateSelf: boolean,
  selfName: string, otherName: string) => {
  logger.info("Attempting to initialize chat in room: " + id);
  const endChatTime = Date.now() + CHAT_TIME;
  const endResultTime = endChatTime + RESULT_TIME;
  await globalThis.collections.chatSessions?.updateOne(
    { id: id },
    { $set: { endChatTime: endChatTime, endResultTime: endResultTime } }
  );
  if (initiateSelf) {
    logger.info("Initializing chat for both users in room " + id);
    socket.emit("startChat", {
      endChatTime: endChatTime,
      endResultTime: endResultTime,
      canSend: canSend,
      goal: selfGoal,
      name: selfName,
    });
    socket.broadcast.to(id).emit("startChat", {
      endChatTime: endChatTime,
      endResultTime: endResultTime,
      canSend: !canSend,
      goal: otherGoal,
      name: otherName,
    });
  } else {
    logger.info("Initializing chat for " + otherName + " in room " + id);
    io.to(id).emit("startChat", {
      endChatTime: endChatTime,
      endResultTime: endResultTime,
      canSend: !canSend,
      goal: otherGoal,
      name: otherName
    });
  }
  setTimeout(async () => {
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    if (room) {
      logger.info("Ending chat " + id);
      io.to(id).emit("endChat");
      io.to(id).emit("typingResponse", "");
    } else {
      logger.info("room " + id + " already deleted, no chat to end");
    }

  }, CHAT_TIME);
  setTimeout(async () => {
    logger.info("Checking if both users in chat " + id + " selected");
    const newRoom = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    if (newRoom) {
      logger.info("Room " + id + " is calculating result");
      if (newRoom?.user1.result === "" && newRoom?.user1.active) {
        logger.info("User1 in chat " + id + " did not select");
        io.to(newRoom?.user2.socketId).emit("noResult", { otherGoal: newRoom.user1.goal });
        io.to(newRoom?.user1.socketId).emit("selfResult", {
          points: -3,
          other: newRoom?.user2.bot ? "Bot" : "Human",
          result: "",
        });
      } else {
        logger.info("User1 in chat " + id + " selected " + newRoom?.user1.result);
        io.to(newRoom!.user2.socketId).emit("completeChat");
      }
      if (newRoom?.user2.result === "" && newRoom?.user2.active) {
        logger.info("User2 in chat " + id + " did not select");
        io.to(newRoom?.user1.socketId).emit("noResult", { otherGoal: newRoom.user2.goal });
        io.to(newRoom?.user2.socketId).emit("selfResult", {
          points: -3,
          other: newRoom?.user1.bot ? "Bot" : "Human",
          result: "",
        });
      } else {
        logger.info("User2 in chat " + id + " selected " + newRoom?.user2.result);
        io.to(newRoom!.user1.socketId).emit("completeChat");
      }
    } else {
      logger.info("Room " + id + " was already deleted.");
    }
  }, CHAT_TIME + RESULT_TIME);
  setTimeout(async () => {
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    if (room) {
      logger.info("Disconnecting users from chat session " + id);
      io.in(id).disconnectSockets();
    } else {
      logger.info("Users already disconnected from room" + id);
    }
  }, CHAT_TIME + RESULT_TIME + 1000);
  logger.info("Successfully initiated chat for room " + id);
}
