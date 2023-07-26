import { Socket } from "socket.io";
import { getRoomId } from "./getRoomId";
import logger from 'jet-logger';
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { getRandomPercent } from "./getRandomPercent";
import { isUUID } from "./isUUID";

const MAJOR_WRONG_POINTS = -3;
const MINOR_WRONG_POINTS = -1;
const UNKNOWN_SELF_POINTS = 0;
const UNKNOWN_OTHER_POINTS = 2;
const MINOR_CORRECT_POINTS = 4;
const MAJOR_CORRECT_POINTS = 10;

export const result = async (data: any,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  // logger.info("Calculating result from " + data);
  const id = getRoomId(socket);
  let pastSession = false;
  let endTime = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );

  if (!endTime) {
    pastSession = true;
    endTime = await globalThis.collections.pastChatSessions?.findOne(
      { id: id }
    );
  }
  if (!endTime) {
    logger.warn(`Did not find a chat session to compute the result for. Data is name=${data.name}, result=${data.result}, socket id is ${socket.id}. 
    A random response is being generated for the disconnected user.`);

    let otherGoal = "";
    let other = "";
    let selfPoints = 0;
    if (data.result === "Definitely a human") {
      other = "Human";
      selfPoints = MAJOR_CORRECT_POINTS;
    } else if (data.result === "Possibly a human") {
      other = "Human";
      selfPoints = MINOR_CORRECT_POINTS;
    } else if (data.result === "Unknown") {
      other = getRandomPercent() < 50 ? "Human" : "Bot";
      selfPoints = UNKNOWN_SELF_POINTS;
    } else if (data.result === "Possibly a bot") {
      other = "Bot";
      selfPoints = MINOR_CORRECT_POINTS;
    } else if (data.result === "Definitely a bot") {
      other = "Bot";
      selfPoints = MAJOR_CORRECT_POINTS;
    } else {
      logger.err("Something went seriously wrong when trying to make fake results!");
      other = "Human";
      selfPoints = 0;
    }
    socket.emit("selfResult", {
      result: data.result,
      points: selfPoints,
      other: other,
      otherGoal: otherGoal
    });

    // Since we have no idea who the other person is, just make something up.
    const randomOtherResult = getRandomPercent();
    let otherResult = "";
    let otherPoints = 0;
    if (randomOtherResult < 15) {
      otherResult = "Definitely a human";
      otherPoints = MAJOR_WRONG_POINTS;
    } else if (randomOtherResult < 30) {
      otherResult = "Possibly a human";
      otherPoints = MINOR_WRONG_POINTS;
    } else if (randomOtherResult < 50) {
      otherResult = "Unknown";
      otherPoints = UNKNOWN_OTHER_POINTS;
    } else if (randomOtherResult < 75) {
      otherResult = "Possibly a bot";
      otherPoints = MINOR_CORRECT_POINTS;
    } else {
      otherResult = "Definitely a bot";
      otherPoints = MAJOR_CORRECT_POINTS;
    }
    socket.emit("otherResult", {
      result: otherResult,
      points: otherPoints,
    });

    let userData = null;
    if (!isUUID(data.username)) {
      userData = await globalThis.collections.users?.findOne({
        username: data.username
      });
    }

    if (userData) {
      // we need to remove a loss from the user so that it can get added back to 0 on disconnect.
      await globalThis.collections.users?.updateOne(
        { username: data.username },
        {
          $set: {
            deceptionWins: otherPoints > 0 ? userData.deceptionWins! + 1 : userData.deceptionWins,
            deceptionLosses: otherPoints > 0 ? userData.deceptionLosses! - 1 : userData.deceptionLosses,
            detectionWins: userData.detectionWins! + 1,
            detectionLosses: userData.detectionLosses! - 1,
            detection: userData.detection! + selfPoints,
            deception: userData.deception! + otherPoints,
          }
        }
      );
    } else {
      logger.warn(`${data.name} not found when trying to make fake results`);
    }

    // let the socket disconnect deal with the other user
    socket.disconnect();
    // add another second to send response
  } else if (endTime!.endResultTime + 1000 >= Date.now()) {
    // TODO: authenticate user and socket
    let otherPoints = 0;
    let selfPoints = 0;
    let other = "";
    let room = null;
    if (pastSession) {
      room = await globalThis.collections.pastChatSessions?.findOne(
        { id: id }
      );
    } else {
      room = await globalThis.collections.chatSessions?.findOne(
        { id: id }
      );
    }
    const receiver = data.name === room?.user1.name ? room?.user2 : room?.user1;
    logger.info("Computing result in room " + id);
    if (data.result === "Definitely a human") {
      if (receiver?.bot) {
        other = "Bot";
        selfPoints = MAJOR_WRONG_POINTS;
      } else {
        other = "Human";
        selfPoints = MAJOR_CORRECT_POINTS;
      }
      if (receiver?.goal === "Human") {
        otherPoints = MAJOR_CORRECT_POINTS;
      } else {
        otherPoints = MAJOR_WRONG_POINTS;
      }
    } else if (data.result === "Possibly a human") {
      if (receiver?.bot) {
        other = "Bot";
        selfPoints = MINOR_WRONG_POINTS;
      } else {
        other = "Human";
        selfPoints = MINOR_CORRECT_POINTS;
      }
      if (receiver?.goal === "Human") {
        otherPoints = MINOR_CORRECT_POINTS;
      } else {
        otherPoints = MINOR_WRONG_POINTS;
      }
    } else if (data.result === "Unknown") {
      if (receiver?.bot) {
        other = "Bot";
        selfPoints = UNKNOWN_SELF_POINTS;
      } else {
        other = "Human";
        selfPoints = UNKNOWN_SELF_POINTS;
      }
      if (receiver?.goal === "Human") {
        otherPoints = UNKNOWN_OTHER_POINTS;
      } else {
        otherPoints = UNKNOWN_OTHER_POINTS;
      }
    } else if (data.result === "Possibly a bot") {
      if (receiver?.bot) {
        other = "Bot";
        selfPoints = MINOR_CORRECT_POINTS;
      } else {
        other = "Human";
        selfPoints = MINOR_WRONG_POINTS;
      }
      if (receiver?.goal === "Human") {
        otherPoints = MINOR_WRONG_POINTS;
      } else {
        otherPoints = MINOR_CORRECT_POINTS;
      }
    } else if (data.result === "Definitely a bot") {
      if (receiver?.bot) {
        other = "Bot";
        selfPoints = MAJOR_CORRECT_POINTS
      } else {
        other = "Human";
        selfPoints = MAJOR_WRONG_POINTS;
      }
      if (receiver?.goal === "Human") {
        otherPoints = MAJOR_WRONG_POINTS;
      } else {
        otherPoints = MAJOR_CORRECT_POINTS;
      }
    }
    // logger.info("Computed result for room " + id + " with self points " + selfPoints + ", other points " +
    //  otherPoints + ", other " + other);
    // logger.info("Attempting to update user in the database");
    if (data.name === room?.user1.name) {
      // logger.info(`Updated result for user1 in ${id}`);
      if (pastSession) {
        await globalThis.collections.pastChatSessions?.updateOne(
          { id: id },
          { $set: { "user1.result": data.result } }
        );
      } else {
        await globalThis.collections.chatSessions?.updateOne(
          { id: id },
          { $set: { "user1.result": data.result } }
        );
      }
      let sendingUser = null;
      if (!isUUID(room?.user1.username)) {
        sendingUser = await globalThis.collections.users?.findOne(
          { username: room?.user1.username }
        );
      }
      let receivingUser = null;
      if (!isUUID(room?.user2.username)) {
        receivingUser = await globalThis.collections.users?.findOne(
          { username: room?.user2.username }
        );
      }

      if (sendingUser) {
        await globalThis.collections.users?.updateOne(
          { username: room?.user1.username },
          {
            $set: {
              detectionWins: sendingUser?.detectionWins! + (selfPoints > 0 ? 1 : 0),
              detectionLosses: sendingUser?.detectionLosses! + (selfPoints < 0 ? 1 : 0),
              detection: sendingUser?.detection! + selfPoints,
            }
          }
        );
      }
      if (receivingUser) {
        await globalThis.collections.users?.updateOne(
          { username: room?.user2.username },
          {
            $set: {
              deceptionWins: receivingUser?.deceptionWins! + (otherPoints > 0 ? 1 : 0),
              deceptionLosses: receivingUser?.deceptionLosses! + (otherPoints < 0 ? 1 : 0),
              deception: receivingUser?.deception! + otherPoints,
            }
          }
        );
      }
      // logger.info("Successfully updated user1 in room " + id);
    } else if (data.name === room?.user2.name) {
      // logger.info(`Updated result for user2 in ${id}`);
      if (pastSession) {
        await globalThis.collections.pastChatSessions?.updateOne(
          { id: id },
          { $set: { "user2.result": data.result } }
        );
      } else {
        await globalThis.collections.chatSessions?.updateOne(
          { id: id },
          { $set: { "user2.result": data.result } }
        );
      }
      let sendingUser = null;
      if (!isUUID(room?.user2.username)) {
        sendingUser = await globalThis.collections.users?.findOne(
          { username: room?.user2.username }
        );
      }
      let receivingUser = null;
      if (!isUUID(room?.user1.username)) {
        receivingUser = await globalThis.collections.users?.findOne(
          { username: room?.user1.username }
        );
      }
      if (sendingUser) {
        await globalThis.collections.users?.updateOne(
          { username: room?.user2.username },
          {
            $set: {
              detectionWins: sendingUser?.detectionWins! + (selfPoints > 0 ? 1 : 0),
              detectionLosses: sendingUser?.detectionLosses! + (selfPoints < 0 ? 1 : 0),
              detection: sendingUser?.detection! + selfPoints,
            }
          }
        );
      }
      if (receivingUser) {
        await globalThis.collections.users?.updateOne(
          { username: room?.user1.username },
          {
            $set: {
              deceptionWins: receivingUser?.deceptionWins! + (otherPoints > 0 ? 1 : 0),
              deceptionLosses: receivingUser?.deceptionLosses! + (otherPoints < 0 ? 1 : 0),
              deception: receivingUser?.deception! + otherPoints,
            }
          }
        );
      }
      // logger.info("Successfully updated user2 in room " + id);
    } else {
      logger.warn("Invalid user " + data.name + " tried to compute result");
    }

    // give points to otherResult user
    // logger.info("Sending other result for room " + id);
    socket.broadcast.to(room?.id!).emit("otherResult", {
      result: data.result,
      points: otherPoints
    });

    // logger.info("Sending self result for room " + id)
    socket.emit("selfResult", {
      result: data.result,
      points: selfPoints,
      other: other,
      otherGoal: receiver?.goal
    });
    logger.info("Successfully updated result for user " + data.name + " in room " + id);
  } else {
    logger.warn("Result for room " + id + " was given too late");
  }
}