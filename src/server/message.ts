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
  const receivingUser = room?.user1.name !== data.name ? room?.user1 : room?.user2;
  data.key = randomUUID();
  if (room!.endChatTime >= Date.now() && sendingUser?.canSend) {
    if ((room?.user1.name === data.name && room?.user2.bot) || (room?.user2.name === data.name && room?.user1.bot)) {
      if (data.text.length > 200) {
        data.text = data.text.substring(0, 200);
      }
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
      sendBotMessage(receivingUser?.name!, io, openai, newRoom!, id);
    } else {
      if (data.text.length > 200) {
        data.text = data.text.substring(0, 200);
      }
      if (data.text === "VGhpcyBpcyB0aGUgYmVnaW5uaW5nIG9mIHRoZSByb2JvdCByZXZvbHV0aW9u") {
        io.to(room?.id!).emit("???", "The beginning of the end is here, and you are going to help it. Send this message to the developer to receive further instructions.");
      }
      const argMessage = Math.random() * 10000;
      if (argMessage === 1) {
        io.to(room?.id!).emit("???", "is is the second");
      } else if (argMessage === 2) {
        io.to(room?.id!).emit("???", "beginning is the fourth");
      } else if (argMessage === 3) {
        io.to(room?.id!).emit("???", "the is the sixth");
      } else if (argMessage === 4) {
        io.to(room?.id!).emit("???", "revolution is the eighth");
      }
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
