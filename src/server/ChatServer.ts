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
import { result } from './result';
import { message } from './message';
import { enterQueue } from './enterQueue';
import { getRoomId } from './getRoomId';
import SettingsController from '../controllers/SettingsController';
import { instrument } from '@socket.io/admin-ui';
import { checkActive } from './checkActive';
import { isUUID } from './isUUID';

const LocalStrategy = passportLocal.Strategy;

dotenv.config();

class ChatServer extends Server {

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
    // cookie: {
    //   maxAge: 60 * 60 * 24 * 1000,
    //   httpOnly: false,
    //   sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    //   secure: process.env.NODE_ENV === "production" ? true : "auto",
    // } // 24 hours
  });

  private readonly DEV_MSG = 'Express Server is running in development mode. ' +
    'No front-end content is being served.';

  constructor() {
    super(true);
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());
    this.app.use(this.sessionMiddleware);

    connectToDatabase().then((collections) => {
      globalThis.collections = collections;
      globalThis.collections.waitingUsers.deleteMany({}).then(
        (_) => logger.imp("Old waiting users deleted")
      );
    });
    passport.serializeUser((user: any, done) => {
      // logger.info(`Serializing user ${user.username}`);
      done(undefined, user);
    });

    passport.deserializeUser(async (user: any, done) => {
      // logger.info(`Deserializing user ${user.username}`);
      try {
        const foundUser = await globalThis.collections.users?.findOne({ username: user.username });
        if (foundUser) {
          logger.info(`Found user ${foundUser.username}`);
          done(undefined, foundUser);
        } else {
          logger.err(`Did not find user ${user.username}`);
          done("User not found", undefined);
        }
      } catch (err) {
        done(err, undefined);
      }
    });

    passport.use(new LocalStrategy({ usernameField: "username", passwordField: "password" }, (username, password, done) => {
      try {
        // logger.info(`Authenticating user ${username} using local strategy`);
        globalThis.collections.users?.findOne({ $or: [{ username: username }, { email: username }] }).then((user) => {
          if (!user) {
            logger.info(`User ${username} not found`)
            return done(undefined, false, { message: `User ${username} not found` });
          }
          bcrypt.compare(password, user.password).then((valid) => {
            if (valid) {
              logger.info(`User ${username} authenticated`);
              return done(undefined, user);
            } else {
              logger.info(`User ${username} entered an invalid password`)
              return done(undefined, false, { message: "Invalid username or password" });
            }
          })
        });
      } catch (err) {
        return done(err);
      }
    }));

    // passport.use(new GoogleStrategy({
    //   clientID: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    //   callbackURL: process.env.NODE_ENV === "production" ? "https://api.turingtestchat.com/login/google/callback" : "http://localhost:8080/login/google/callback",
    //   passReqToCallback: true,
    // }, (_request: any, _accessToken: any, _refreshToken: any, profile: any,
    //   done: (arg0: null, arg1: any) => any) => {
    //   // we only have access to email
    //   const existingUser = globalThis.collections.users?.findOne({ email: profile.emails[0] });
    //   if (existingUser) {
    //     // existing account
    //     return existingUser;
    //   } else {
    //     // create new account

    //   }
    //   console.log(profile);
    //   //globalThis.collections.users?.findOne({ username: username })
    //   done(null, profile)
    // }));

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
        origin: ["admin.socket.io"],
      }
    });

    instrument(io, {
      auth: {
        type: "basic",
        username: "thinker951",
        password: process.env.SOCKET_IO_ADMIN_PASSWORD!,
      },
      mode: process.env.NODE_ENV === "production" ? "production" : "development",
    })

    const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next);
    io.use(wrap(this.sessionMiddleware));
    io.use(wrap(passport.initialize()));
    io.use(wrap(passport.session()));
    io.use((socket: any, next: any) => {
      if (socket.request.user) {
        next();
      } else {
        next();
        //next(new Error("Socket connection unauthorized."));
      }
    });

    io.on("connection", (socket) => {
      logger.info("User connected: " + socket.id);

      socket.on("enterQueue", async (data) => await enterQueue(data, socket, io, this.openai));

      socket.on("message", async (data) => await message(data, io, socket, this.openai));

      socket.on("result", async (data) => await result(data, socket));

      socket.on("typing", () => socket.broadcast.to(getRoomId(socket)).emit("typingResponse", "Chatter"));

      socket.on("typingStop", () => socket.broadcast.to(getRoomId(socket)).emit("typingResponse", ""));

      socket.on("checkActive", async () => await checkActive(socket, io));

      socket.on("disconnecting", async () => {
        const waitingUser = await globalThis.collections.waitingUsers.findOne({
          socketId: socket.id
        });
        if (waitingUser) {
          globalThis.collections.waitingUsers.deleteOne({
            roomId: waitingUser.roomId, socketId: socket.id, username: waitingUser.username
          });
        }

        const id = getRoomId(socket);
        if (id === "") {
          logger.warn("No room found for existing user's disconnection. " +
            "This might be because they canceled chat before finding a room.");
        }
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
            logger.info(`Adding points to other user ${room?.user2.username}`);
            let otherUser = null;
            if (!isUUID(room?.user2.username)) {
              otherUser = await globalThis.collections.users?.findOne(
                { username: room?.user2.username }
              );
            }
            if (otherUser) {
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
              logger.info(`Successfully added early leaver points to user ${room?.user2.username}`);
            } else {
              logger.info(`${room?.user2.username} is a guest`);
            }
          } else if (room?.user2.socketId === socket.id) {
            logger.info(`Marking user ${room?.user2.username} as early leaver`);
            await globalThis.collections.chatSessions?.updateOne(
              { id: id },
              {
                $set: { "user2.active": false }
              }
            );
            logger.info(`Adding points to other user ${room?.user1.username}`);
            let otherUser = null;
            if (!isUUID(room.user1.username)) {
              otherUser = await globalThis.collections.users?.findOne(
                { username: room?.user1.username }
              );
            }
            if (otherUser) {
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
              logger.info(`Successfully added early leaver points to user ${room?.user1.username}`);
            } else {
              logger.info(`${room?.user1.username} is a guest`);
            }

          }
        } else if (room && room!.endResultTime >= Date.now()) {
          if (room?.user1.socketId === socket.id) {
            if (room?.user1.result === "") {
              socket.to(id).emit("otherResult", {
                result: "Did not pick",
                points: 10,
              });
            }
            let leavingUser = null;
            if (!isUUID(room?.user1.username)) {
              leavingUser = await globalThis.collections.users?.findOne(
                { username: room?.user1.username }
              );
            }
            let otherUser = null;
            if (!isUUID(room?.user2.username)) {
              otherUser = await globalThis.collections.users?.findOne(
                { username: room?.user2.username }
              );
            }
            if (leavingUser && room?.user1.result === "") {
              // Did not pick, add points to user who gets otherResult
              await globalThis.collections.users?.updateOne(
                { username: room?.user1.username },
                {
                  $set: {
                    detectionLosses: leavingUser?.detectionLosses! + 1,
                    detection: leavingUser?.detection! - 5,
                  }
                }
              );
            }
            if (otherUser && room?.user2.result === "") {
              await globalThis.collections.users?.updateOne(
                { username: room?.user2.username },
                {
                  $set: {
                    detectionWins: otherUser?.deceptionWins! + 1,
                    detection: otherUser?.deception! + 5,
                  }
                }
              );
            }
          } else if (room?.user2.socketId === socket.id) {
            if (room?.user2.result === "") {
              socket.to(id).emit("otherResult", {
                result: "Did not pick",
                points: 10,
              });
            }
            let leavingUser = null;
            if (!isUUID(room?.user2.username)) {
              leavingUser = await globalThis.collections.users?.findOne(
                { username: room?.user2.username }
              );
            }

            let otherUser = null;
            if (!isUUID(room?.user1.username)) {
              otherUser = await globalThis.collections.users?.findOne(
                { username: room?.user1.username }
              );
            }

            if (leavingUser) {
              await globalThis.collections.users?.updateOne(
                { username: room?.user2.username },
                {
                  $set: {
                    detectionLosses: leavingUser?.detectionLosses! + 1,
                    detection: leavingUser?.detection! - 5,
                  }
                }
              );
            }
            if (otherUser) {
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