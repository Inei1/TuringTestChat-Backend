import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import logger from 'jet-logger';
import { isUUID } from "./isUUID";

export const getRoomId = (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  let id = "";
  // Note: if a user attempts to join multiple rooms, this won't cause a bug.
  // Each new room is joined with a new socket, so the old rooms won't show.
  socket.rooms.forEach((socketRoom) => {
    // Check if the room is a uuid. Sockets always join a room by default, but we don't use it.
    // Attempting to find a room with a socket that isn't a uuid will fail.
    if (isUUID(socketRoom)) {
      id = socketRoom;
    }
  });
  if (id.length === 0) {
    logger.warn(`getRoomId failed to find a room id (socket id=${socket.id})`);
  }
  return id;
}