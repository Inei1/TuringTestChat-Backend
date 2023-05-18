import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import { getRandomPercent } from "./getRandomPercent";

// const CHAT_TIME = 150000;
const CHAT_TIME = 15000;
// const RESULT_TIME = 30000;
const RESULT_TIME = 3000;

export const readyChat = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: data.roomId }
  );
  if (room?.user1.name === data.user) {
    const otherReady = room!.user2.ready;
    const canSend = getRandomPercent() < 50;
    await globalThis.collections.chatSessions?.updateOne(
      { id: data.roomId },
      { $set: { user1: { name: room!.user1.name, result: "", bot: room!.user1.bot, ready: true, socketId: room!.user1.socketId, goal: room!.user1.goal, canSend: otherReady ? !room?.user2.canSend : canSend } } }
    );
    if (otherReady) {
      initiateChat(data, io, socket, canSend, room!.user1.goal, room!.user2.goal);
    }
  } else if (room?.user2?.name === data.user) {
    const otherReady = room!.user1.ready;
    const canSend = getRandomPercent() < 50;
    await globalThis.collections.chatSessions?.updateOne(
      { id: data.roomId },
      { $set: { user2: { name: room!.user2.name, result: "", bot: room!.user2.bot, ready: true, socketId: room!.user2.socketId, goal: room!.user2.goal, canSend: otherReady ? !room?.user1.canSend : canSend } } }
    );
    if (otherReady) {
      initiateChat(data, io, socket, canSend, room!.user1.goal, room!.user2.goal);
    }
  }
}

const initiateChat = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  canSend: boolean, selfGoal: string, otherGoal: string) => {
  const endChatTime = Date.now() + CHAT_TIME;
  const endResultTime = Date.now() + CHAT_TIME + RESULT_TIME;
  await globalThis.collections.chatSessions?.updateOne(
    { id: data.roomId },
    { $set: { endChatTime: endChatTime, endResultTime: endResultTime } }
  );
  socket.emit("startChat", { endChatTime: endChatTime, endResultTime: endResultTime, canSend: canSend, goal: selfGoal });
  socket.to(data.roomId).emit("startChat", { endChatTime: endChatTime, endResultTime: endResultTime, canSend: !canSend, goal: otherGoal });
  setTimeout(() => {
    io.to(data.roomId).emit("endChat");
    io.to(data.roomId).emit("typingResponse", "");
  }, CHAT_TIME);
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
  setTimeout(async () => {
    io.socketsLeave(data.roomId);
    const newRoom = await globalThis.collections.chatSessions?.findOne(
      { id: data.roomId }
    );
    await globalThis.collections.pastChatSessions?.insertOne(newRoom!);
    await globalThis.collections.chatSessions?.deleteOne(newRoom!);
  }, CHAT_TIME + RESULT_TIME + 1000);
}
