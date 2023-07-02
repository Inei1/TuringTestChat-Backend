import { ChatCompletionRequestMessageRoleEnum, OpenAIApi } from "openai";
import { UserMessage } from "src/types";
import { Server as SocketServer } from 'socket.io';
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { ChatSession } from "src/types";
import { randomUUID } from "crypto";
import logger from "jet-logger";
import { getRandomTypingDelay } from "./getRandomTypingDelay";
import { clearInterval, setInterval } from "timers";
import { getRandomPercent } from "./getRandomPercent";

export const sendBotMessage = async (botUser: string,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi, room: ChatSession, id: string) => {
  logger.info(`Attempting to send bot message in room ${id}`);
  logger.info(`Converting messages to a format readable by ChatGPT in room ${id}`);
  const convertedMessages = convertMessages(botUser, room.messages);
  console.log(convertedMessages);
  logger.info(`Successfully converted messages in room ${id}`);
  let completion: any;
  //try {
    logger.info(`Creating chat completion for ChatGPT in room ${id}`);
    const temperatureRandom = Math.random() * 0.3 + 1.0;
    logger.info(`Temperature randomly set to ${temperatureRandom} in room ${id}`);
    completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-0613",
      messages: convertedMessages,
      max_tokens: 1024,
      // Set this randomly. Make it very rare to have extremely high temperature.
      temperature: temperatureRandom,
      frequency_penalty: 1,
      presence_penalty: -1,
    });
    const completionMessage = completion!.data.choices[0].message?.content!.replace(/["]+/g, "");
    logger.info(`Completion message successfully generated in room ${id}`);
    const charactersPerSecond = room.user1.name === "Bot" ? room.user1.charactersPerSecond : room.user2.charactersPerSecond;
    logger.info(`Characters per second is ${charactersPerSecond} in room ${id}`);
    const randomTypingDelay = getRandomTypingDelay();
    logger.info(`Random typing delay for this message is ${randomTypingDelay} in room ${id}`);
    const messageDelay = (completionMessage?.length! / charactersPerSecond) * 1000;
    logger.info(`Message delay is ${messageDelay} in room ${id}`);
    setTimeout(() => {
      logger.info(`Emitting typing response in room ${id}`);
      if (room.endChatTime > Date.now()) {
        io.to(room.id).emit("typingResponse", "Chatter");
      }
    }, randomTypingDelay);
    let timeout: NodeJS.Timeout | null = null;
    const interval = setInterval(() => {
      const pauseTyping = getRandomPercent();
      if (pauseTyping <= 2.5) {
        const typingDelay = 300 + (4700 + 1 - 300) * Math.pow(Math.random(), 0.25);
        console.log("typingDelay " + typingDelay);
        io.to(room.id).emit("typingResponse", "")
        timeout = setTimeout(() => io.to(room.id).emit("typingResponse", "Chatter"), typingDelay);
      }
    }, 1000);
    setTimeout(async () => {
      logger.info(`Emitting message in room ${id}`);
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
      logger.info(`Bot message successfully sent in room ${id}`);
      clearInterval(interval);
      if (timeout) {
        clearTimeout(timeout);
      }
    }, messageDelay);
    
    logger.info(`Bot message successfully scheduled in room ${id}`);
  // } catch (error) {
  //   logger.err(error);
  //   // Remove add points to otherLeft user
  //   io.to(room?.id).emit("otherLeft");
  // }
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