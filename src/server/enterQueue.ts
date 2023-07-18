import { Socket } from "socket.io";
import { getRandomPercent } from "./getRandomPercent";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
import { randomUUID } from "crypto";
import { generateSystemMessage } from "./generateSystemMessage";
import { getRandomJoinTime } from "./getRandomJoinTime";
import { OpenAIApi } from "openai";
import { getRandomCharactersPerSecond } from "./getRandomCharactersPerSecond";
import { clearInterval } from "timers";
import { sendBotMessage } from "./sendBotMessage";
import { WaitingUser } from "src/types";

const CHAT_TIME = 150000;
const RESULT_TIME = 30000;

// Whether a person joins into a bot or another player is ideally a 50/50 percent chance.
// To be as convincing as possible, there should be a chance that the user instantly queues into a bot.
// To make the chances exactly 50/50, there is a 25% percent chance to instant queue into a bot.
// Because of this, we need to have the chance of queueing into a bot instead of a player when finding
// a game to be 33%. The probability of queueing into a bot is 1/4 + (3/4 * 1/3) = 50%.
// The probability of queueing into a human is (3/4 * 2/3) = 50%.
export const enterQueue = async (data: any,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  logger.info(`${data.username} is entering queue`);
  const botChat = getRandomPercent();

  let botInterval: NodeJS.Timer | null = null;

  const newRoomId = randomUUID();

  // TODO determine how many players are online, and adjust this percentage based on that
  // 25% chance to instantly queue into bot
  if (botChat <= 25) {
    logger.info(`${data.username} joined into a bot instantly`);
    if (botInterval) {
      clearInterval(botInterval);
    }
    await joinBotChat(data.username, newRoomId, socket, io, openai);
  } else if (globalThis.waitingUsers.length > 0) {
    // if there is someone else waiting currently, join them
    if (botInterval) {
      clearInterval(botInterval);
    }
    const waitingUser = globalThis.waitingUsers.pop()!;
    if (!waitingUser) {
      logger.err("Something went horribly wrong when joining a new user!!!");
      globalThis.waitingUsers.push(waitingUser);
    }
    await joinHumanChat(data.username, newRoomId, socket, io, waitingUser);
  } else {
    // If they didn't join instantly,
    // they will be entered into an empty room where they can be joined at any time.
    // To prevent excessive wait times, poll repeatedly and join into a bot based on an increasing percentage.
    const joinInterval = getRandomJoinTime();
    let joinChance = 25;
    botInterval = setInterval(async () => {
      const room = await globalThis.collections.chatSessions?.findOne(
        { id: newRoomId },
      );
      // if we have already found a room, or the user left, don't add a bot.
      if (!room && socket.connected) {
        if (joinChance >= getRandomPercent()) {
          // join a bot
          logger.info(`${data.username} is joining into a bot with joinChance ${joinChance}`)
          if (botInterval) {
            clearInterval(botInterval);
          }
          await joinBotChat(data.username, newRoomId, socket, io, openai);
        } else {
          joinChance += 15;
        }
      } else {
        clearInterval(botInterval!);
      }
    }, joinInterval);

    // Create a new room so users can join into humans
    await createEmptyRoom(data.username, newRoomId, socket);
  }
}

const joinHumanChat = async (username: string, newRoomId: string,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  waitingUser: WaitingUser) => {
  try {
    const user = await globalThis.collections.users?.findOne(
      { username: username },
    );
    if (user) {
      // logger.info("New room is queuing like normal");
      logger.info(`Username of joining user is ${user.username}`);
      if (socket.connected && io.sockets.sockets.has(waitingUser.socketId)) {
        if (waitingUser && waitingUser.username === username) {
          // Somehow the waiting user is the same as the joining user.
          // We shouldn't add them to the chat, instead ignore the current action.
          logger.warn(`${waitingUser.username} attempted to join a room with themselves.`);
        } else if (!waitingUser) {
          logger.warn(`Waiting user already disconnected, cannot join them.`);
          createEmptyRoom(username, newRoomId, socket);
        } else {
          try {
            const otherUser = await globalThis.collections.users?.findOne(
              { username: waitingUser.username }
            );
            if (user.currentDailyCredits > 0) {
              await globalThis.collections.users?.updateOne(
                { username: user.username },
                {
                  $set: {
                    currentDailyCredits: user?.currentDailyCredits! - 1
                  }
                }
              );
              logger.info(`Removed one daily credit from ${user?.username}`);
            } else if (user.permanentCredits > 0) {
              await globalThis.collections.users?.updateOne(
                { username: user.username },
                {
                  $set: {
                    permanentCredits: user?.permanentCredits! - 1
                  }
                }
              );
              logger.info(`Removed one permanent credit from ${user?.username}`);
            } else {
              logger.err("User somehow has no credits?");
            }
            if (otherUser?.currentDailyCredits! > 0) {
              await globalThis.collections.users?.updateOne(
                { username: otherUser?.username },
                {
                  $set: {
                    currentDailyCredits: otherUser?.currentDailyCredits! - 1
                  }
                }
              );
              logger.info(`Removed one daily credit from ${otherUser?.username}`);
            } else if (otherUser?.permanentCredits! > 0) {
              await globalThis.collections.users?.updateOne(
                { username: otherUser?.username },
                {
                  $set: {
                    permanentCredits: otherUser?.permanentCredits! - 1
                  }
                }
              );
              logger.info(`Removed one permanent credit from ${otherUser?.username}`);
            } else {
              logger.err("User somehow has no credits?");
            }
          } catch (err) {
            logger.err("Failed to remove a credit from both users");
            logger.err(err);
          }
          logger.info(`Successfully sent room found message for room ${waitingUser.roomId}`);
          const user1Start = getRandomPercent() < 50;
          const user1Goal = getRandomPercent() < 50 ? "Human" : "Bot";
          const user2Goal = user1Goal === "Bot" ? "Human" : getRandomPercent() < 50 ? "Human" : "Bot";
          socket.join(waitingUser.roomId);
          globalThis.activeRooms.set(socket.id, waitingUser.roomId);
          globalThis.activeRooms.set(waitingUser.socketId, waitingUser.roomId);
          logger.info(`Room ${waitingUser.roomId} joined`);
          const endChatTime = Date.now() + CHAT_TIME;
          const endResultTime = endChatTime + RESULT_TIME;
          await globalThis.collections.chatSessions?.insertOne(
            {
              endChatTime: endChatTime,
              endResultTime: endResultTime,
              id: waitingUser.roomId,
              messages: [],
              user1: {
                name: "user1",
                bot: false,
                result: null,
                socketId: waitingUser.socketId,
                goal: user1Goal,
                canSend: user1Start,
                active: true,
                charactersPerSecond: 0,
                username: waitingUser.username,
              },
              user2: {
                name: "user2",
                bot: false,
                result: null,
                socketId: socket.id,
                goal: user2Goal,
                canSend: !user1Start,
                active: true,
                charactersPerSecond: 0,
                username: user.username
              }
            }
          );
          logger.info(`Created chat session for room ${waitingUser.roomId}`);
          socket.broadcast.to(waitingUser.roomId).emit("foundChat", {
            endChatTime: endChatTime,
            endResultTime: endResultTime,
            name: "user1",
            canSend: user1Start,
            goal: user2Goal,
          });
          socket.emit("foundChat", {
            endChatTime: endChatTime,
            endResultTime: endResultTime,
            name: "user2",
            canSend: !user1Start,
            goal: user1Goal,
          });
          setTimeout(async () => {
            logger.info(`Ending chat ${waitingUser.roomId} between ${waitingUser.username} and ${user.username}`);
            io.to(waitingUser.roomId).emit("endChat");
            io.to(waitingUser.roomId).emit("typingResponse", "");
          }, CHAT_TIME);
          setTimeout(async () => {
            // logger.info("Checking if both users in chat " + id + " selected");
            const newRoom = await globalThis.collections.chatSessions?.findOne(
              { id: waitingUser.roomId }
            );
            if (newRoom) {
              //logger.info(`Room ${waitingUser.roomId} is calculating result`);
              if (newRoom?.user1.result === "" && newRoom?.user1.active) {
                // logger.info("User1 in chat " + id + " did not select");
                io.to(newRoom?.user2.socketId).emit("noResult", { otherGoal: newRoom.user1.goal });
                io.to(newRoom?.user1.socketId).emit("selfResult", {
                  points: -3,
                  other: newRoom?.user2.bot ? "Bot" : "Human",
                  result: "",
                });
              } else {
                // logger.info(`${newRoom?.user1.username} in chat ${id} selected ${newRoom?.user1.result}`);
                io.to(newRoom!.user2.socketId).emit("completeChat");
              }
              if (newRoom?.user2.result === "" && newRoom?.user2.active) {
                // logger.info("User2 in chat " + id + " did not select");
                io.to(newRoom?.user1.socketId).emit("noResult", { otherGoal: newRoom.user2.goal });
                io.to(newRoom?.user2.socketId).emit("selfResult", {
                  points: -3,
                  other: newRoom?.user1.bot ? "Bot" : "Human",
                  result: "",
                });
              } else {
                // logger.info("User2 in chat " + id + " selected " + newRoom?.user2.result);
                io.to(newRoom!.user1.socketId).emit("completeChat");
              }
            } else {
              logger.warn(`Room ${waitingUser.roomId} was already deleted.`);
            }
            socket.disconnect();
            await globalThis.collections.pastChatSessions?.insertOne(newRoom!);
            await globalThis.collections.chatSessions?.deleteOne(newRoom!);
            globalThis.activeRooms.delete(newRoom?.user1.socketId!);
            globalThis.activeRooms.delete(newRoom?.user2.socketId!);
          }, CHAT_TIME + RESULT_TIME);
        }
      } else if (!socket.connected) {
        logger.warn(`Joining user ${socket.id} already disconnected, cannot join them.`);
        globalThis.waitingUsers.push(waitingUser);
      } else if (!io.sockets.sockets.has(waitingUser.socketId)) {
        logger.warn(`Waiting user ${socket.id} already disconnected, cannot join them.`);
        createEmptyRoom(username, newRoomId, socket);
      } else {
        logger.err("An unknown error occured on when checking for socket connectivity.");
      }
    } else {
      logger.err(`username ${username} not found when attempting to join a game`)
    }
  } catch (err) {
    logger.err("Failed to find new user joining queue into existing user");
    logger.err(err);
  }
}

const joinBotChat = async (username: string, newRoomId: string,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  openai: OpenAIApi) => {
  logger.info(`${username} is joining a new room into a bot`);
  globalThis.waitingUsers.filter((user) => {
    return user.roomId !== newRoomId;
  });
  // logger.info(`Removed ${newRoomId} from empty rooms`);
  const user = await globalThis.collections.users?.findOne(
    { username: username },
  );

  if (io.sockets.sockets.has(socket.id)) {
    if (user) {
      try {
        if (user.currentDailyCredits > 0) {
          await globalThis.collections.users?.updateOne(
            { username: user.username },
            {
              $set: {
                currentDailyCredits: user?.currentDailyCredits! - 1
              }
            }
          );
          // logger.info(`Removed one daily credit from ${user?.username}`);
        } else if (user.permanentCredits > 0) {
          await globalThis.collections.users?.updateOne(
            { username: user.username },
            {
              $set: {
                permanentCredits: user?.permanentCredits! - 1
              }
            }
          );
          // logger.info(`Removed one permanent credit from ${user?.username}`);
        } else {
          logger.err("User somehow has no credits?");
        }
      } catch (err) {
        logger.err("Failed to remove a credit from the joining user");
        logger.err(err);
      }

      const botStart = getRandomPercent() < 50;
      const user2Goal = getRandomPercent() < 50 ? "Human" : "Bot";
      const botGoal = user2Goal === "Bot" ? "Human" : (getRandomPercent() < 50 ? "Human" : "Bot")
      // logger.info(`Is bot starting? ${botStart}`);
      // logger.info(`username of user1 is ${username}`);
      const endChatTime = Date.now() + CHAT_TIME;
      const endResultTime = endChatTime + RESULT_TIME;
      try {
        await globalThis.collections.chatSessions?.insertOne({
          endChatTime: endChatTime,
          endResultTime: endResultTime,
          id: newRoomId,
          messages: [{
            name: "System",
            message: generateSystemMessage(botGoal),
          }],
          user1: {
            name: "user1",
            bot: true,
            result: null,
            socketId: "",
            goal: botGoal,
            canSend: botStart,
            active: true,
            charactersPerSecond: getRandomCharactersPerSecond(),
            username: "",
          },
          user2: {
            name: "user2",
            bot: false,
            result: null,
            socketId: socket.id,
            goal: user2Goal,
            canSend: !botStart,
            active: true,
            charactersPerSecond: 0,
            username: username,
          }
        });
      } catch (error) {
        logger.err(error);
      }
      socket.join(newRoomId);
      globalThis.activeRooms.set(socket.id, newRoomId);
      socket.emit("foundChat", {
        endChatTime: endChatTime,
        endResultTime: endResultTime,
        name: "user2",
        canSend: !botStart,
        goal: user2Goal,
      });
      logger.info(`User joined game with bot in ${newRoomId}`);
      if (botStart) {
        const room = await globalThis.collections.chatSessions?.findOne({
          id: newRoomId,
        });
        if (room) {
          await sendBotMessage("user1", io, openai, room!, newRoomId);
        }
      }

      setTimeout(async () => {
        const room = await globalThis.collections.chatSessions?.findOne(
          { id: newRoomId }
        );
        if (room) {
          logger.info(`Ending chat ${newRoomId} between ${room.user2.name} and bot`);
          socket.emit("endChat");
          socket.emit("typingResponse", "");
        } else {
          logger.info(`room ${newRoomId} already deleted, no chat to end`);
        }
      }, CHAT_TIME);

      setTimeout(async () => {
        const newRoom = await globalThis.collections.chatSessions?.findOne(
          { id: newRoomId }
        );
        if (newRoom) {
          if (newRoom?.user2.result === "" && newRoom?.user2.active) {
            // logger.info("User2 in chat " + id + " did not select");
            socket.emit("selfResult", {
              points: -3,
              other: newRoom?.user1.bot ? "Bot" : "Human",
              result: "",
            });
          } else {
            // logger.info("User2 in chat " + id + " selected " + newRoom?.user2.result);
            socket.emit("completeChat");
          }
        } else {
          logger.info(`Room ${newRoomId} was already deleted.`);
        }
        socket.disconnect();
        await globalThis.collections.pastChatSessions?.insertOne(newRoom!);
        await globalThis.collections.chatSessions?.deleteOne(newRoom!);
        globalThis.activeRooms.delete(socket.id);
      }, CHAT_TIME + RESULT_TIME);
    } else {
      logger.err(`User ${username} not found when trying to join bot chat.`);
    }
  } else {
    logger.warn(`User ${username} already left before bot chat could start.`);
  }
}

const createEmptyRoom = async (username: string, newRoomId: string,
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  logger.info(`Creating a new room for user ${username}`);
  globalThis.waitingUsers.push({ roomId: newRoomId, username: username, socketId: socket.id });
  globalThis.activeRooms.set(socket.id, newRoomId);
  socket.join(newRoomId);
  logger.info(`Created new empty room ${newRoomId}`);
}
