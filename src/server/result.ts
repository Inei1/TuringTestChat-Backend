const MAJOR_WRONG_POINTS = -3;
const MINOR_WRONG_POINTS = -1;
const UNKNOWN_SELF_POINTS = 0;
const UNKNOWN_OTHER_POINTS = 2;
const MINOR_CORRECT_POINTS = 4;
const MAJOR_CORRECT_POINTS = 10;

export const result = async (data: any, socket: any) => {
  const endTime = await globalThis.collections.chatSessions?.findOne(
    { id: data.roomId }
  );
  // add another second to send response
  if (endTime!.endChatTime <= Date.now() && endTime!.endResultTime + 1000 >= Date.now()) {
    // authenticate user and socket
    let otherPoints = 0;
    let selfPoints = 0;
    let other = "";
    const room = await globalThis.collections.chatSessions?.findOne(
      { id: data.roomId }
    );
    if (data.name === room?.user1.name) {
      if (!room?.user2?.bot) {
        other = "Human";
        if (data.result === "Definitely a human") {
          otherPoints = MAJOR_WRONG_POINTS;
          selfPoints = MAJOR_CORRECT_POINTS;
        } else if (data.result === "Possibly a human") {
          otherPoints = MINOR_WRONG_POINTS;
          selfPoints = MINOR_CORRECT_POINTS;
        } else if (data.result === "Unknown") {
          otherPoints = UNKNOWN_OTHER_POINTS;
          selfPoints = UNKNOWN_SELF_POINTS;
        } else if (data.result === "Possibly a bot") {
          otherPoints = MINOR_CORRECT_POINTS;
          selfPoints = MINOR_WRONG_POINTS;
        } else if (data.result === "Definitely a bot") {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        } else {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        }
      } else {
        other = "Bot";
        if (data.result === "Definitely a human") {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        } else if (data.result === "Possibly a human") {
          otherPoints = MINOR_CORRECT_POINTS;
          selfPoints = MINOR_WRONG_POINTS;
        } else if (data.result === "Unknown") {
          otherPoints = UNKNOWN_OTHER_POINTS;
          selfPoints = UNKNOWN_SELF_POINTS;
        } else if (data.result === "Possibly a bot") {
          otherPoints = MINOR_WRONG_POINTS;
          selfPoints = MINOR_CORRECT_POINTS;
        } else if (data.result === "Definitely a bot") {
          otherPoints = MAJOR_WRONG_POINTS;
          selfPoints = MAJOR_CORRECT_POINTS;
        } else {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        }
      }
      await globalThis.collections.chatSessions?.updateOne(
        { id: data.roomId },
        { $set: { user1: { name: room!.user1.name, result: data.result, bot: room!.user1.bot, ready: true, socketId: room!.user1.socketId, goal: room!.user1.goal, canSend: room!.user1.canSend } } }
      );
    } else if (data.name === room?.user2.name) {
      if (!room?.user1?.bot) {
        other = "Human";
        if (data.result === "Definitely a human") {
          otherPoints = MAJOR_WRONG_POINTS;
          selfPoints = MAJOR_CORRECT_POINTS;
        } else if (data.result === "Possibly a human") {
          otherPoints = MINOR_WRONG_POINTS;
          selfPoints = MINOR_CORRECT_POINTS;
        } else if (data.result === "Unknown") {
          otherPoints = UNKNOWN_OTHER_POINTS;
          selfPoints = UNKNOWN_SELF_POINTS;
        } else if (data.result === "Possibly a bot") {
          otherPoints = MINOR_CORRECT_POINTS;
          selfPoints = MINOR_WRONG_POINTS;
        } else if (data.result === "Definitely a bot") {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        } else {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        }
      } else {
        other = "Bot";
        if (data.result === "Definitely a human") {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        } else if (data.result === "Possibly a human") {
          otherPoints = MINOR_CORRECT_POINTS;
          selfPoints = MINOR_WRONG_POINTS;
        } else if (data.result === "Unknown") {
          otherPoints = UNKNOWN_OTHER_POINTS;
          selfPoints = UNKNOWN_SELF_POINTS;
        } else if (data.result === "Possibly a bot") {
          otherPoints = MINOR_WRONG_POINTS;
          selfPoints = MINOR_CORRECT_POINTS;
        } else if (data.result === "Definitely a bot") {
          otherPoints = MAJOR_WRONG_POINTS;
          selfPoints = MAJOR_CORRECT_POINTS;
        } else {
          otherPoints = MAJOR_CORRECT_POINTS;
          selfPoints = MAJOR_WRONG_POINTS;
        }
      }
      await globalThis.collections.chatSessions?.updateOne(
        { id: data.roomId },
        { $set: { user2: { name: room!.user2!.name, result: data.result, bot: room!.user2!.bot, ready: true, socketId: room!.user2.socketId, goal: room!.user2.goal, canSend: room!.user2.canSend } } }
      );
    }

    socket.broadcast.emit("otherResult", {
      result: data.result,
      points: otherPoints
    });

    socket.emit("selfResult", {
      result: data.result,
      points: selfPoints,
      other: other
    });
  }
}