import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import { getRoomId } from "./getRoomId";

const CHAT_TIME = 1500;
const RESULT_TIME = 30000;

export const readyChat = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const id = getRoomId(socket);
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );
  if (room?.user1.name === data.user) {
    const otherReady = room!.user2.ready;
    const canSend = room?.user1.canSend!;
    await globalThis.collections.chatSessions?.updateOne(
      { id: id },
      { $set: { user1: { name: room!.user1.name, result: "", bot: room!.user1.bot, ready: true, socketId: room!.user1.socketId, goal: room!.user1.goal, canSend: canSend, active: true } } }
    );
    if (otherReady) {
      initiateChat(id, io, socket, canSend, room!.user1.goal, room!.user2.goal);
    }
  } else if (room?.user2?.name === data.user) {
    const otherReady = room!.user1.ready;
    const canSend = room?.user2.canSend!;
    await globalThis.collections.chatSessions?.updateOne(
      { id: id },
      { $set: { user2: { name: room!.user2.name, result: "", bot: room!.user2.bot, ready: true, socketId: room!.user2.socketId, goal: room!.user2.goal, canSend: canSend, active: true } } }
    );
    if (otherReady) {
      initiateChat(id, io, socket, canSend, room!.user2.goal, room!.user1.goal);
    }
  }
}

const initiateChat = async (id: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  canSend: boolean, selfGoal: string, otherGoal: string) => {
  const endChatTime = Date.now() + CHAT_TIME;
  const endResultTime = Date.now() + CHAT_TIME + RESULT_TIME;
  await globalThis.collections.chatSessions?.updateOne(
    { id: id },
    { $set: { endChatTime: endChatTime, endResultTime: endResultTime } }
  );
  socket.emit("startChat", { endChatTime: endChatTime, endResultTime: endResultTime, canSend: canSend, goal: selfGoal });
  socket.to(id).emit("startChat", { endChatTime: endChatTime, endResultTime: endResultTime, canSend: !canSend, goal: otherGoal });
  setTimeout(() => {
    io.to(id).emit("endChat");
    io.to(id).emit("typingResponse", "");
  }, CHAT_TIME);
  setTimeout(async () => {
    const newRoom = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    if (newRoom?.user1.result === "" && newRoom?.user1.active) {
      io.to(newRoom?.user2.socketId).emit("noResult");
      io.to(newRoom?.user1.socketId).emit("selfResult", {
        points: -3,
        other: newRoom?.user2.bot ? "Bot" : "Human",
        result: "",
      });
    } else {
      io.to(newRoom!.user2.socketId).emit("completeChat");
    }
    if (newRoom?.user2.result === "" && newRoom?.user2.active) {
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
    io.socketsLeave(id);
    const newRoom = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    await globalThis.collections.pastChatSessions?.insertOne(newRoom!);
    await globalThis.collections.chatSessions?.deleteOne(newRoom!);
  }, CHAT_TIME + RESULT_TIME + 1000);
}
