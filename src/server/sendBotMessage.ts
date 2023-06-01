import { ChatCompletionRequestMessageRoleEnum, OpenAIApi } from "openai";
import { UserMessage } from "src/types";
import { Server as SocketServer } from 'socket.io';
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { ChatSession } from "src/types";
import { randomUUID } from "crypto";
import logger from "jet-logger";
import { getRandomTypingDelay } from "./getRandomTypingDelay";

export const sendBotMessage = async (botUser: string,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi, room: ChatSession, id: string) => {
  const convertedMessages = convertMessages(botUser, room.messages);
  let completion: any;
  try {
    const temperatureRandom = Math.random() * 0.2 + 1.1;
    completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: convertedMessages,
      max_tokens: 1024,
      // Set this randomly. Make it very rare to have extremely high temperature.
      temperature: temperatureRandom,
      frequency_penalty: 1,
      presence_penalty: -1,
    });
    const completionMessage = completion!.data.choices[0].message?.content!.replace(/["]+/g, "");
    const charactersPerSecond = room.user1.name === "Bot" ? room.user1.charactersPerSecond : room.user2.charactersPerSecond;
    setTimeout(() => {
      if (room.endChatTime > Date.now()) {
        io.to(room.id).emit("typingResponse", "Chatter");
      }
    }, getRandomTypingDelay());
    setTimeout(async () => {
      if (room.endChatTime > Date.now()) {
        io.to(room.id).emit("messageResponse", {
          name: botUser,
          text: completionMessage,
          key: randomUUID(),
        });
        io.to(room?.id!).emit("messageWaitingSelf");
        await globalThis.collections.chatSessions?.updateOne(
          { id: id },
          {
            $push: { messages: { name: botUser, message: completionMessage! } },
            $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
          }
        );
      }
      io.to(room?.id!).emit("typingResponse", "");
    }, (completionMessage?.length! / charactersPerSecond) * 1000);
  } catch (error) {
    logger.err(error);
    io.to(room?.id).emit("otherLeft");
  }
}

const convertMessages = (botUser: string, messages: UserMessage[]) => {
  return messages.map((message) => {
    if (message.name === botUser) {
      return { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: message.message };
    } else if (message.name === "System") {
      return { role: ChatCompletionRequestMessageRoleEnum.System, content: message.message };
    } else {
      return { role: ChatCompletionRequestMessageRoleEnum.User, content: message.message };
    }
  });
}