import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import logger from 'jet-logger';

export const getRoomId = (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  let id = "";
  socket.rooms.forEach(async (socketRoom) => {
    // Check if the room is a uuid. Sockets always join a room by default, but we don't use it.
    // Attempting to find a room with a socket that isn't a uuid will fail.
    if (socketRoom.match(/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi)) {
      id = socketRoom;
    }
  });
  if (id.length === 0) {
    logger.warn(`getRoomId failed to find a room id (socket id=${socket.id})`);
  }
  return id;
}