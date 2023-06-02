import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import { OpenAIApi } from "openai";
import { randomUUID } from "crypto";
import { getRoomId } from "./getRoomId";
import { sendBotMessage } from "./sendBotMessage";
import logger from "jet-logger";

export const message = async (data: any,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  logger.info("Attempting to send message");
  const id = getRoomId(socket);
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );
  const sendingUser = room?.user1.name === data.name ? room?.user1 : room?.user2;
  const receivingUser = room?.user1.name !== data.name ? room?.user1 : room?.user2;
  logger.info(`Attempting to send a message from ${sendingUser!.name} to ${receivingUser!.name} in room ${id}`)
  data.key = randomUUID();
  if (room!.endChatTime >= Date.now() && sendingUser?.canSend) {
    logger.info(`Sending a message in room ${id}`);
    if ((room?.user1.name === data.name && room?.user2.bot) || (room?.user2.name === data.name && room?.user1.bot)) {
      logger.info(`User is sending message to bot in ${id}`);
      if (data.text.length > 200) {
        logger.warn(`Message had too much length, truncating to 200`);
        data.text = data.text.substring(0, 200);
      }
      io.to(room?.id!).emit("messageResponse", data);
      socket.emit("messageWaitingOther");
      const newMessages = room.messages;
      newMessages.push({ name: data.name, message: data.text });
      logger.info(`Updating user's message in backend`);
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
      await sendBotMessage(receivingUser?.name!, io, openai, newRoom!, id);
    } else {
      logger.info(`${data.name} is sending message to another human in room ${id}`);
      if (data.text.length > 200) {
        logger.warn(`Message had too much length, truncating to 200`);
        data.text = data.text.substring(0, 200);
      }
      if (data.text === "VGhpcyBpcyB0aGUgYmVnaW5uaW5nIG9mIHRoZSByb2JvdCByZXZvbHV0aW9u") {
        logger.imp("Someone found the secret!");
        io.to(room?.id!).emit("???", "The beginning of the end is here, and you are going to help it. Send this message to the developer to receive further instructions.");
      }
      const argMessage = Math.random() * 10000;
      if (argMessage === 1) {
        logger.imp("Someone found the second");
        io.to(room?.id!).emit("???", "is is the second");
      } else if (argMessage === 2) {
        logger.imp("Someone found the fourth");
        io.to(room?.id!).emit("???", "beginning is the fourth");
      } else if (argMessage === 3) {
        logger.imp("Someone found the sixth");
        io.to(room?.id!).emit("???", "the is the sixth");
      } else if (argMessage === 4) {
        logger.imp("Someone found the eighth");
        io.to(room?.id!).emit("???", "revolution is the eighth");
      }
      io.to(room?.id!).emit("messageResponse", data);
      socket.emit("messageWaitingOther");
      socket.broadcast.to(room?.id!).emit("messageWaitingSelf");
      io.to(room?.id!).emit("typingResponse", "");
      logger.info(`Message sent to other person in room ${id}`);
      await globalThis.collections.chatSessions?.updateOne(
        { id: id },
        {
          $push: { messages: { name: data.name, message: data.text } },
          $set: { "user1.canSend": !room!.user1.canSend, "user2.canSend": !room!.user2.canSend }
        }
      );
      logger.info(`Successfully sent message in room ${id}`);
    }
  } else {
    logger.warn(`Unable to send message due to time limit or canSend is false (${sendingUser?.canSend}) in ${id}`);
  }
}
