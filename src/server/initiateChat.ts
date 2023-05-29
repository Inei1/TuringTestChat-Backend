import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';

const CHAT_TIME = 150000;
const RESULT_TIME = 30000;

export const initiateChat = async (id: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  canSend: boolean, selfGoal: string, otherGoal: string, initiateSelf: boolean,
  selfName: string, otherName: string) => {
  const endChatTime = Date.now() + CHAT_TIME;
  const endResultTime = Date.now() + CHAT_TIME + RESULT_TIME;
  await globalThis.collections.chatSessions?.updateOne(
    { id: id },
    { $set: { endChatTime: endChatTime, endResultTime: endResultTime } }
  );
  if (initiateSelf) {
    socket.emit("startChat", {
      endChatTime: endChatTime,
      endResultTime: endResultTime,
      canSend: canSend,
      goal: selfGoal,
      name: selfName,
    });
    socket.to(id).emit("startChat", {
      endChatTime: endChatTime,
      endResultTime: endResultTime,
      canSend: !canSend,
      goal: otherGoal,
      name: otherName,
    });
  } else {
    io.to(id).emit("startChat", {
      endChatTime: endChatTime,
      endResultTime: endResultTime,
      canSend: !canSend,
      goal: otherGoal,
      name: otherName
    });
  }
  setTimeout(() => {
    io.to(id).emit("endChat");
    io.to(id).emit("typingResponse", "");
  }, CHAT_TIME);
  setTimeout(async () => {
    const newRoom = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    if (newRoom?.user1.result === "" && newRoom?.user1.active) {
      io.to(newRoom?.user2.socketId).emit("noResult", { otherGoal: newRoom.user1.goal });
      io.to(newRoom?.user1.socketId).emit("selfResult", {
        points: -3,
        other: newRoom?.user2.bot ? "Bot" : "Human",
        result: "",
      });
    } else {
      io.to(newRoom!.user2.socketId).emit("completeChat");
    }
    if (newRoom?.user2.result === "" && newRoom?.user2.active) {
      io.to(newRoom?.user1.socketId).emit("noResult", { otherGoal: newRoom.user2.goal });
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