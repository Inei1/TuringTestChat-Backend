import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import { OpenAIApi } from "openai";
import { randomUUID } from "crypto";
import { getRoomId } from "./getRoomId";
import { sendBotMessage } from "./sendBotMessage";

export const message = async (data: any,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  const id = getRoomId(socket);
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );
  const sendingUser = room?.user1.name === data.name ? room?.user1 : room?.user2;
  data.key = randomUUID();
  if (room!.endChatTime >= Date.now() && sendingUser?.canSend) {
    if ((room?.user1.name === data.name && room?.user2.bot) || (room?.user2.name === data.name && room?.user1.bot)) {
      io.to(room?.id!).emit("messageResponse", data);
      socket.emit("messageWaitingOther");
      const newMessages = room.messages;
      newMessages.push({ name: data.name, message: data.text });
      await globalThis.collections.chatSessions?.updateOne(
        { id: id },
        {
          $push: { messages: { name: data.name, message: data.text } },
          $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
        }
      );
      const newRoom = await globalThis.collections.chatSessions?.findOne(
        { id: id }
      );
      sendBotMessage(io, openai, newRoom!, id);
    } else {
      io.to(room?.id!).emit("messageResponse", data);
      socket.emit("messageWaitingOther");
      socket.broadcast.to(room?.id!).emit("messageWaitingSelf");
      await globalThis.collections.chatSessions?.updateOne(
        { id: id },
        {
          $push: { messages: { name: data.name, message: data.text } },
          $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
        }
      );
      io.to(room?.id!).emit("typingResponse", "");
    }
  }
}
