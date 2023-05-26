import { ChatCompletionRequestMessageRoleEnum, OpenAIApi } from "openai";
import { UserMessage } from "src/types";
import { Server as SocketServer } from 'socket.io';
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { ChatSession } from "src/types";
import { randomUUID } from "crypto";
import logger from "jet-logger";

export const sendBotMessage = async (io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi, room: ChatSession, id: string) => {
  const convertedMessages = convertMessages(room.messages);
  let completion: any;
  try {
    const temperatureRandom = Math.random() * 0.2 + 1.1;
    const frequencyRandom = Math.random();
    const presenceRandom = Math.random() - 1;
    completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: convertedMessages,
      max_tokens: 1024,
      // Set this randomly. Make it very rare to have extremely high temperature.
      temperature: temperatureRandom,
      frequency_penalty: frequencyRandom,
      presence_penalty: presenceRandom,
    });
    const completionMessage = completion!.data.choices[0].message?.content!;
    const wordsPerSecond = 10000;//room.user1.name === "Bot" ? room.user1.wordsPerSecond : room.user2.wordsPerSecond;
    setTimeout(() => io.to(room.id).emit("typingResponse", "Chatter"), 100);
    setTimeout(async () => {
      if (room.endChatTime > Date.now()) {
        io.to(room.id).emit("messageResponse", {
          name: "Bot",
          text: completionMessage,
          key: randomUUID(),
        });
        io.to(room?.id!).emit("messageWaitingSelf");
        await globalThis.collections.chatSessions?.updateOne(
          { id: id },
          {
            $push: { messages: { name: "Bot", message: completionMessage! } },
            $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
          }
        );
      }
      io.to(room?.id!).emit("typingResponse", "");
    }, (completionMessage?.length! / wordsPerSecond) * 1000);
  } catch (error) {
    logger.err(error);
    io.to(room?.id).emit("otherLeft");
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