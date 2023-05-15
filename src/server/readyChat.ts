import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Server as SocketServer } from 'socket.io';

const CHAT_TIME = 150000;
const RESULT_TIME = 30000;

export const readyChat = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: data.roomId }
  );
  if (room?.user1.name === data.user) {
    await globalThis.collections.chatSessions?.updateOne(
      { id: data.roomId },
      { $set: { user1: { name: room!.user1.name, result: "", bot: room!.user1.bot, ready: true, socketId: room!.user1.socketId } } }
    );
    if (room!.user2!.ready) {
      initiateChat(data, io);
    }
  } else if (room?.user2?.name === data.user) {
    await globalThis.collections.chatSessions?.updateOne(
      { id: data.roomId },
      { $set: { user2: { name: room!.user2!.name, result: "", bot: room!.user2!.bot, ready: true, socketId: room!.user2.socketId } } }
    );
    if (room!.user1.ready) {
      initiateChat(data, io);
    }
  }
}

const initiateChat = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const endChatTime = Date.now() + CHAT_TIME;
  const endResultTime = Date.now() + CHAT_TIME + RESULT_TIME;
  await globalThis.collections.chatSessions?.updateOne(
    { id: data.roomId },
    { $set: { endChatTime: endChatTime, endResultTime: endResultTime } }
  );
  io.to(data.roomId).emit("startChat", { endChatTime: endChatTime, endResultTime: endResultTime });
  setTimeout(() => io.to(data.roomId).emit("endChat"), CHAT_TIME);
  setTimeout(async () => {
    const newRoom = await globalThis.collections.chatSessions?.findOne(
      { id: data.roomId }
    );
    if (newRoom?.user1.result === "") {
      io.to(newRoom?.user2.socketId).emit("noResult");
      io.to(newRoom?.user1.socketId).emit("selfResult", {
        points: -3,
        other: newRoom?.user2.bot ? "Bot" : "Human",
        result: "",
      });
    } else {
      io.to(newRoom!.user2.socketId).emit("completeChat");
    }
    if (newRoom?.user2.result === "") {
      io.to(newRoom?.user1.socketId).emit("noResult");
      io.to(newRoom?.user2.socketId).emit("selfResult", {
        points: -3,
        other: newRoom?.user1.bot ? "Bot" : "Human",
        result: "",
      });
    } else {
      io.to(newRoom!.user1.socketId).emit("completeChat");
    }
  }, CHAT_TIME + RESULT_TIME);
  setTimeout(() => io.socketsLeave(data.roomId), CHAT_TIME + RESULT_TIME + 1000);
}
