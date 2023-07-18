import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import logger from 'jet-logger';

export const getRoomId = (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const id = globalThis.activeRooms.get(socket.id);
  if (!id) {
    logger.warn(`Cannot find id for socket id ${socket.id}`);
    return "";
  } else {
    return id;
  }
  
}