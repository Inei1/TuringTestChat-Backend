import * as bodyParser from 'body-parser';
import { Server } from '@overnightjs/core';
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
var http = require('http');
import { readFileSync } from 'fs';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
import { connectToDatabase } from './connectToDatabase';
import passport from 'passport';
import session from 'express-session';
import LoginController from '../controllers/LoginController';
import AccountController from '../controllers/AccountController';
import passportLocal from "passport-local";
import bcrypt from "bcrypt";
import MongoStore = require('connect-mongo');
import { readyChat } from './readyChat';
import { result } from './result';
import { message } from './message';
import { startRoom } from './startRoom';
import { getRoomId } from './getRoomId';
import SettingsController from '../controllers/SettingsController';

const LocalStrategy = passportLocal.Strategy;

dotenv.config();

class ChatServer extends Server {

  emptyRooms: string[] = [];
  apiKey = process.env.OPENAI_API_KEY;
  config = new Configuration({
    apiKey: this.apiKey,
  });
  openai = new OpenAIApi(this.config);
  sessionMiddleware = session({
    store: MongoStore.create({ mongoUrl: process.env.DB_CONN_STRING }),
    secret: process.env.EXPRESS_SESSION_SECRET!,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 60 * 60 * 24 * 1000,
      httpOnly: false,
      sameSite: "lax",// process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: false,// process.env.NODE_ENV === "production" ? true : "auto",
    } // 24 hours
  });

  private readonly DEV_MSG = 'Express Server is running in development mode. ' +
    'No front-end content is being served.';

  constructor() {
    super(true);
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());
    this.app.use(this.sessionMiddleware);
  
    connectToDatabase().then((collections) => globalThis.collections = collections);
    passport.serializeUser((user: any, done) => {
      logger.info(`Serializing user ${user.username}`);
      done(undefined, user);
    });

    passport.deserializeUser(async (user: any, done) => {
      logger.info(`Deserializing user ${user.username}`);
      try {
        const foundUser = await globalThis.collections.users?.findOne({ username: user.username });
        if (foundUser) {
          logger.info(`Found user ${foundUser.username}`);
          done(undefined, foundUser);
        } else {
          logger.info(`Did not find user ${user.username}`);
          done("User not found", undefined);
        }
      } catch (err) {
        done(err, undefined);
      }
    });

    passport.use(new LocalStrategy({ usernameField: "username", passwordField: "password" }, (username, password, done) => {
      try {
        logger.info(`Authenticating user ${username} using local strategy`);
        globalThis.collections.users?.findOne({ username: username.toLowerCase() }).then((user) => {
          if (!user) {
            return done(undefined, false, { message: `User ${username} not found` });
          }
          bcrypt.compare(password, user.password).then((valid) => {
            if (valid) {
              return done(undefined, user);
            } else {
              return done(undefined, false, { message: "Invalid username or password" });
            }
          })
        });
      } catch (err) {
        return done(err);
      }
    }));

    this.app.use(passport.initialize());
    this.app.use(passport.session());

    super.addControllers([new LoginController(), new AccountController(), new SettingsController()]);
    if (process.env.NODE_ENV === 'test') {
      logger.info('Starting server in development mode');
      const msg = this.DEV_MSG + process.env.EXPRESS_PORT;
      this.app.get('*', (req, res) => res.send(msg));
    }
  }

  httpsOptions = {
    key: readFileSync("key.pem", { encoding: "utf8" }),
    cert: readFileSync("certificate.pem", { encoding: "utf8" }),
  }

  public startHttp(): void {
    const httpServer = http.createServer(this.app);
    const io = new SocketServer(httpServer, {
      cors: {
        origin: "https://www.turingtestchat.com",
        methods: ["GET", "POST"],
      }
    });

    const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next);
    io.use(wrap(this.sessionMiddleware));
    io.use(wrap(passport.initialize()));
    io.use(wrap(passport.session()));
    io.use((socket: any, next: any) => {
      if (socket.request.user) {
        next();
      } else {
        next(new Error('unauthorized'))
      }
    });

    io.on("connection", (socket) => {
      logger.info("User connected: " + socket.id);

      socket.on("startRoom", async (data) => await startRoom(data, this.emptyRooms, socket, io, this.openai));

      socket.on("message", async (data) => await message(data, io, socket, this.openai));

      socket.on("result", async (data) => await result(data, socket));

      socket.on("typing", () => socket.broadcast.to(getRoomId(socket)).emit("typingResponse", "Chatter"));

      socket.on("typingStop", () => socket.broadcast.to(getRoomId(socket)).emit("typingResponse", ""));

      socket.on("readyChat", async (data) => await readyChat(data, io, socket, this.openai));

      socket.on("disconnecting", async () => {
        const id = getRoomId(socket);
        const room = await globalThis.collections.chatSessions?.findOne(
          { id: id }
        );
        if (room && room.endChatTime >= Date.now()) {
          // Remove points from leaving user, add points to otherLeft user
          socket.to(id).emit("otherLeft");
      
          if (room?.user1.socketId === socket.id) {
            logger.info(`Marking user ${room?.user1.username} as early leaver`);
            await globalThis.collections.chatSessions?.updateOne(
              { id: id },
              {
                $set: { "user1.active": false }
              }
            );
            logger.info(`Deducting early leaver points from user ${room?.user1.username}, and adding to user ${room?.user2.username}`);
            const leavingUser = await globalThis.collections.users?.findOne(
              { username: room?.user1.username }
            );
            const otherUser = await globalThis.collections.users?.findOne(
              { username: room?.user2.username }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user1.username },
              {
                $set: {
                  deceptionLosses: leavingUser?.deceptionLosses! + 1,
                  detectionLosses: leavingUser?.detectionLosses! + 1,
                  detection: leavingUser?.detection! - 4,
                  deception: leavingUser?.deception! - 2,
                }
              }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user2.username },
              {
                $set: {
                  deceptionWins: otherUser?.deceptionWins! + 1,
                  detectionWins: otherUser?.detectionWins! + 1,
                  detection: otherUser?.detection! + 4,
                  deception: otherUser?.deception! + 2,
                }
              }
            );
            logger.info(`Successfully deducted early leaver points from user ${room?.user1.username}, and added to user ${room?.user2.username}`);
          } else if (room?.user2.socketId === socket.id) {
            logger.info(`Marking user ${room?.user2.username} as early leaver`);
            await globalThis.collections.chatSessions?.updateOne(
              { id: id },
              {
                $set: { "user2.active": false }
              }
            );
            logger.info(`Deducting early leaver points from user ${room?.user2.username}, and adding to user ${room?.user2.username}`);
            const leavingUser = await globalThis.collections.users?.findOne(
              { username: room?.user2.username }
            );
            const otherUser = await globalThis.collections.users?.findOne(
              { username: room?.user1.username }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user2.username },
              {
                $set: {
                  deceptionLosses: leavingUser?.deceptionLosses! + 1,
                  detectionLosses: leavingUser?.detectionLosses! + 1,
                  detection: leavingUser?.detection! - 4,
                  deception: leavingUser?.deception! - 2,
                }
              }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user1.username },
              {
                $set: {
                  deceptionWins: otherUser?.deceptionWins! + 1,
                  detectionWins: otherUser?.detectionWins! + 1,
                  detection: otherUser?.detection! + 4,
                  deception: otherUser?.deception! + 2,
                }
              }
            );
            logger.info(`Successfully deducted early leaver points from user ${room?.user2.username}, and added to user ${room?.user1.username}`);
          }
        } else if (room && room!.endResultTime >= Date.now()) {
          // Did not pick, add points to user who gets otherResult
          socket.to(id).emit("otherResult", {
          
            result: "Did not pick",
            points: 10,
          });
          if (room?.user1.socketId === socket.id) {
            const leavingUser = await globalThis.collections.users?.findOne(
              { username: room?.user1.username }
            );
            const otherUser = await globalThis.collections.users?.findOne(
              { username: room?.user2.username }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user1.username },
              {
                $set: {
                  detectionLosses: leavingUser?.detectionLosses! + 1,
                  detection: leavingUser?.detection! - 5,
                }
              }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user2.username },
              {
                $set: {
                  detectionWins: otherUser?.deceptionWins! + 1,
                  detection: otherUser?.deception! + 5,
                }
              }
            );
          } else if (room?.user2.socketId === socket.id) {
            const leavingUser = await globalThis.collections.users?.findOne(
              { username: room?.user2.username }
            );
            const otherUser = await globalThis.collections.users?.findOne(
              { username: room?.user1.username }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user2.username },
              {
                $set: {
                  detectionLosses: leavingUser?.detectionLosses! + 1,
                  detection: leavingUser?.detection! - 5,
                }
              }
            );
            await globalThis.collections.users?.updateOne(
              { username: room?.user1.username },
              {
                $set: {
                  detectionWins: otherUser?.deceptionWins! + 1,
                  detection: otherUser?.deception! + 5,
                }
              }
            );
          }
        }
        if (room?.endChatTime === -1) {
          // One user did not accept
          logger.info("User didn't accept: " + socket.id);
          socket.broadcast.to(id).emit("otherWaitingLeft");
          if (room?.user1.socketId === socket.id) {
            const leavingUser = await globalThis.collections.users?.findOne(
              { username: room?.user1.username }
            );
            const otherUser = await globalThis.collections.users?.findOne(
              { username: room?.user2.username }
            );
            await globalThis.collections.users?.updateOne(
              { username: leavingUser?.username },
              {
                $set: {
                  deceptionLosses: leavingUser?.deceptionLosses! + 1,
                  detectionLosses: leavingUser?.detectionLosses! + 1,
                  detection: leavingUser?.detection! - 2,
                  deception: leavingUser?.deception! - 1,
                }
              }
            );
            // Add a credit back to the other user
            await globalThis.collections.users?.updateOne(
              { username: otherUser?.username },
              {
                $set: {
                  permanentCredits: otherUser?.permanentCredits! + 1
                }
              }
            );
          }
        } else if (room?.user2.socketId === socket.id) {
          const leavingUser = await globalThis.collections.users?.findOne(
            { username: room?.user2.username }
          );
          const otherUser = await globalThis.collections.users?.findOne(
            { username: room?.user1.username }
          );
          await globalThis.collections.users?.updateOne(
            { username: leavingUser?.username },
            {
              $set: {
                deceptionLosses: leavingUser?.deceptionLosses! + 1,
                detectionLosses: leavingUser?.detectionLosses! + 1,
                detection: leavingUser?.detection! - 2,
                deception: leavingUser?.deception! - 1,
              }
            }
          );
          // Add a credit back to the other user
          await globalThis.collections.users?.updateOne(
            { username: otherUser?.username },
            {
              $set: {
                permanentCredits: otherUser?.permanentCredits! + 1
              }
            }
          );
        }
        this.emptyRooms = this.emptyRooms.filter((room) => {
          return room !== id;
        });
        logger.info(`room ${id} deleted, moving to past chat sessions`);
        try {
          const newRoom = await globalThis.collections.chatSessions?.findOne(
            { id: id }
          );
          if (newRoom) {
            await globalThis.collections.pastChatSessions?.insertOne(newRoom!);
            await globalThis.collections.chatSessions?.deleteOne(newRoom!);
          } else {
            logger.info(`room ${id} is already deleted, it may have been deleted previously or there is a bug.`);
          }
        } catch (err) {
          logger.err(`An error occurred when attempting to move room ${id} to past chat sessions`);
          logger.err(err);
        }
      });

      socket.on("disconnect", () => {
        logger.info("User disconnected: " + socket.id);
        socket.disconnect();
      });
    });

    httpServer.listen(process.env.PORT, () => {
      logger.imp("Started http server on port " + process.env.PORT);
    });
  }
}

export default ChatServer;