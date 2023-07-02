import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Socket, Server as SocketServer } from 'socket.io';
import { getRoomId } from "./getRoomId";
import { initiateChat } from "./initiateChat";
import { sendBotMessage } from "./sendBotMessage";
import { OpenAIApi } from "openai";
import logger from 'jet-logger';

export const readyChat = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  logger.info(`Attempting to mark ${data.username} as ready`);
  const id = getRoomId(socket);
  const room = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );
  logger.info(`Found room ${id} for ${data.username}`);
  if (room?.user1.username === data.username) {
    logger.info(`Marking user1 as ready for room ${id}`);
    const otherReady = room!.user2.ready;
    const canSend = room?.user1.canSend!;
    await globalThis.collections.chatSessions?.updateOne(
      { id: id },
      {
        $set: {
          user1: {
            name: room!.user1.name,
            result: "",
            bot: room!.user1.bot,
            ready: true,
            socketId: room!.user1.socketId,
            goal: room!.user1.goal,
            canSend: canSend,
            active: true,
            charactersPerSecond: room?.user1.charactersPerSecond!,
            username: room?.user1.username!,
          }
        }
      }
    );
    logger.info(`Successfully marked user1 as ready with otherReady=${otherReady}, canSend=${canSend}, room=${id}`);
    if (otherReady) {
      logger.info(`User2 in room ${id} is ready, initiating chat`);
      await initiateChat(id, io, socket, canSend, room!.user1.goal, room!.user2.goal, true, "user1", "user2");
      if (room?.user2.bot && room?.user2.canSend) {
        logger.info(`User2 in room ${id} is a bot and sends first, sending initial message`);
        const newRoom = await globalThis.collections.chatSessions?.findOne(
          { id: id }
        );
        await sendBotMessage("user2", io, openai, newRoom!, id);
      }
    } else {
      logger.info(`User2 in room ${id} is not ready yet`);
    }
  } else if (room?.user2?.username === data.username) {
    logger.info(`Marking user2 as ready for room ${id}`);
    const otherReady = room!.user1.ready;
    const canSend = room?.user2.canSend!;
    await globalThis.collections.chatSessions?.updateOne(
      { id: id },
      {
        $set: {
          user2: {
            name: room!.user2.name,
            result: "",
            bot: room!.user2.bot,
            ready: true,
            socketId: room!.user2.socketId,
            goal: room!.user2.goal,
            canSend: canSend,
            active: true,
            charactersPerSecond: room?.user2.charactersPerSecond!,
            username: room?.user2.username!,
          }
        }
      }
    );
    logger.info(`Successfully marked user2 as ready with otherReady=${otherReady}, canSend=${canSend}, room=${id}`);
    if (otherReady) {
      logger.info(`User1 in room ${id} is ready, initiating chat`);
      await initiateChat(id, io, socket, canSend, room!.user2.goal, room!.user1.goal, true, "user2", "user1");
      if (room?.user1.bot && room?.user1.canSend) {
        logger.info(`User1 in room ${id} is a bot and sends first, sending initial message`);
        const newRoom = await globalThis.collections.chatSessions?.findOne(
          { id: id }
        );
        await sendBotMessage("user1", io, openai, newRoom!, id);
      }
    } else {
      logger.info(`User1 in room ${id} is not ready yet`);
    }
  }
}
