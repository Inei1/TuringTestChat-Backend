import { getRoomId } from "./getRoomId";
import logger from 'jet-logger';

const MAJOR_WRONG_POINTS = -3;
const MINOR_WRONG_POINTS = -1;
const UNKNOWN_SELF_POINTS = 0;
const UNKNOWN_OTHER_POINTS = 2;
const MINOR_CORRECT_POINTS = 4;
const MAJOR_CORRECT_POINTS = 10;

export const result = async (data: any, socket: any) => {
  // logger.info("Calculating result from " + data);
  const id = getRoomId(socket);
  let pastSession = false;
  let endTime = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );
  // TODO: check if this is really necessary
  if (!endTime) {
    pastSession = true;
    endTime = await globalThis.collections.pastChatSessions?.findOne(
      { id: id }
    );
  }
  // logger.info("Room " + id + " found for result");
  // add another second to send response
  if (endTime!.endResultTime + 1000 >= Date.now()) {
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
    logger.info("Computing result in room " + id + " with data " + data);
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
    logger.info("Computed result for room " + id + " with self points " + selfPoints + ", other points " +
      otherPoints + ", other " + other);
    logger.info("Attempting to update user in the database");
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
      const sendingUser = await globalThis.collections.users?.findOne(
        { username: room?.user1.username }
      );
      const receivingUser = await globalThis.collections.users?.findOne(
        { username: room?.user2.username }
      );
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
      logger.info("Successfully updated user1 in room " + id);
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
      const sendingUser = await globalThis.collections.users?.findOne(
        { username: room?.user2.username }
      );
      const receivingUser = await globalThis.collections.users?.findOne(
        { username: room?.user1.username }
      );
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
      logger.info("Successfully updated user2 in room " + id);
    } else {
      logger.warn("Invalid user " + data.name + " tried to compute result");
    }

    // give points to otherResult user
    logger.info("Sending other result for room " + id);
    socket.broadcast.to(room?.id).emit("otherResult", {
      result: data.result,
      points: otherPoints
    });

    logger.info("Sending self result for room " + id)
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