import { getRoomId } from "./getRoomId";

const MAJOR_WRONG_POINTS = -3;
const MINOR_WRONG_POINTS = -1;
const UNKNOWN_SELF_POINTS = 0;
const UNKNOWN_OTHER_POINTS = 2;
const MINOR_CORRECT_POINTS = 4;
const MAJOR_CORRECT_POINTS = 10;

export const result = async (data: any, socket: any) => {
  const id = getRoomId(socket);
  const endTime = await globalThis.collections.chatSessions?.findOne(
    { id: id }
  );
  // add another second to send response
  if (endTime!.endResultTime + 1000 >= Date.now()) {
    // TODO: authenticate user and socket
    let otherPoints = 0;
    let selfPoints = 0;
    let other = "";
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: id }
    );
    const receiver = data.name === room?.user1.name ? room?.user2 : room?.user1;

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
    if (data.name === room?.user1.name) {
      await globalThis.collections.chatSessions?.updateOne(
        { id: id },
        { $set: { "user1.result": data.result } }
      );
    } else if (data.name === room?.user2.name) {
      await globalThis.collections.chatSessions?.updateOne(
        { id: id },
        { $set: { "user2.result": data.result } }
      );
    }

    socket.to(room?.id).emit("otherResult", {
      result: data.result,
      points: otherPoints
    });

    socket.emit("selfResult", {
      result: data.result,
      points: selfPoints,
      other: other,
      otherGoal: receiver?.goal
    });
  }
}