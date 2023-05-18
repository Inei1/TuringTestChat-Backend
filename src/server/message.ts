import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import { ChatCompletionRequestMessageRoleEnum, OpenAIApi } from "openai";
import { UserMessage } from "../types";
import { randomUUID } from "crypto";

export const message = async (data: any,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi, wordsPerSecond: number) => {
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: data.roomId }
  );
  const sendingUser = room?.user1.name === data.name ? room?.user1 : room?.user2;
  data.id = randomUUID();
  if (room!.endChatTime >= Date.now() && sendingUser?.canSend) {
    if ((room?.user1.name === data.name && room?.user2.bot) || (room?.user2.name === data.name && room?.user1.bot)) {
      io.to(room?.id!).emit("messageResponse", data);
      const newMessages = room.messages;
      newMessages.push({ name: data.name, message: data.text });
      globalThis.collections.chatSessions?.updateOne(
        { id: data.roomId },
        {
          $push: { messages: { name: data.name, message: data.text } },
          $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
        }
      );
      const convertedMessages = convertMessages(room.messages);
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: convertedMessages,
      });
      setTimeout(() => io.to(room.id).emit("typingResponse", "Chatter"), 100);
      const message = completion.data.choices[0].message?.content;

      setTimeout(() => {
        if (room.endChatTime > Date.now()) {
          io.to(room.id).emit("messageResponse", {
            name: "Bot",
            text: completion.data.choices[0].message?.content
          });
          globalThis.collections.chatSessions?.updateOne(
            { id: data.roomId },
            { $push: { messages: { name: "Bot", message: message! } } }
          );
        }
        io.to(room?.id!).emit("typingResponse", "");
      }, (message?.length! / wordsPerSecond) * 1000);
    } else {
      io.to(room?.id!).emit("messageResponse", data);
      socket.emit("messageWaitingOther");
      socket.broadcast.to(room?.id!).emit("messageWaitingSelf");
      globalThis.collections.chatSessions?.updateOne(
        { id: data.roomId },
        {
          $push: { messages: { name: data.name, message: data.text } },
          $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
        }
      );
      io.to(room?.id!).emit("typingResponse", "");
    }
  }
}

const convertMessages = (messages: UserMessage[]) => {
  return messages.map((message) => {
    if (message.name === "Bot") {
      return { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: message.message };
    } else if (message.name === "System") {
      return { role: ChatCompletionRequestMessageRoleEnum.System, content: message.message };
    } else {
      return { role: ChatCompletionRequestMessageRoleEnum.User, content: message.message };
    }
  });
}