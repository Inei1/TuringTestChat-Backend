import { Socket } from "socket.io";
import { getRoomId } from "./getRoomId"
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';

export const checkActive = async (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,) => {
  const roomId = getRoomId(socket);
  const roomSockets = await io.in(roomId).fetchSockets();
  if (roomSockets.length === 1) {
    const room = await globalThis.collections.chatSessions?.findOne({
      id: roomId,
    });
    if (!room?.user1.bot && !room?.user2.bot) {
      socket.emit("otherLeft");
      logger.warn(`room ${roomId} only has one user. Deleting room.`);
    }
  }
}