import * as bodyParser from 'body-parser';
import { Server } from '@overnightjs/core';
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
var https = require('https');
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
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import MongoStore = require('connect-mongo');
import { readyChat } from './readyChat';
import { result } from './result';
import { message } from './message';
import { startRoom } from './startRoom';
import { getRoomId } from './getRoomId';

const LocalStrategy = passportLocal.Strategy;

dotenv.config();

class ChatServer extends Server {

  emptyRooms: string[] = [];
  apiKey = process.env.OPENAI_API_KEY;
  config = new Configuration({
    apiKey: this.apiKey,
  });
  openai = new OpenAIApi(this.config);

  private readonly DEV_MSG = 'Express Server is running in development mode. ' +
    'No front-end content is being served.';

  constructor() {
    super(true);
    this.app.use(session({
      store: MongoStore.create({ mongoUrl: process.env.DB_CONN_STRING }),
      secret: process.env.EXPRESS_SESSION_SECRET!,
      resave: false,
      saveUninitialized: true,
      cookie: { maxAge: 60 * 15 * 1000, secure: false } // 15 minutes
    }));
    connectToDatabase().then((collections) => globalThis.collections = collections);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    passport.serializeUser((user, done) => {
      done(undefined, user);
    });

    passport.deserializeUser((id: ObjectId, done) => {
      try {
        globalThis.collections.users?.findOne({ _id: id }).then((user) => {
          done(undefined, user);
        });
      } catch (err) {
        done(err, undefined);
      }
    });

    passport.use(new LocalStrategy({ usernameField: "username", passwordField: "password" }, (username, password, done) => {
      try {
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

    super.addControllers([new LoginController(), new AccountController()]);
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

  public startHttps(port: number): void {
    const httpsServer = https.createServer(this.app).listen(port, () => {
      logger.imp("Started https server on port " + port);
    });
  }

  public startHttp(port: number): void {
    const httpServer = http.createServer(this.app);
    const io = new SocketServer(httpServer, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
      }
    });

    io.on("connection", (socket) => {
      logger.info("User connected: " + socket.id);

      socket.on("startRoom", async () => await startRoom(this.emptyRooms, socket, io, this.openai));

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
          // Remove points from user
          socket.broadcast.to(id).emit("otherLeft");
          if (room?.user1.socketId === socket.id) {
            await globalThis.collections.chatSessions?.updateOne(
              { id: id },
              {
                $set: { "user1.active": false }
              }
            );
          } else if (room?.user2.socketId === socket.id) {
            await globalThis.collections.chatSessions?.updateOne(
              { id: id },
              {
                $set: { "user2.active": false }
              }
            );
          }
        } else if (room && room!.endResultTime >= Date.now()) {
          // Did not pick
          socket.broadcast.to(id).emit("otherResult", {
            result: "Did not pick",
            points: 10,
          });
        }
        if (room?.endChatTime === -1) {
          // One user did not accept
          logger.info("User didn't accept: " + socket.id);
          socket.broadcast.to(id).emit("otherWaitingLeft");
        }
        this.emptyRooms = this.emptyRooms.filter((room) => {
          return room !== id;
        });
        logger.info("Room deleted: " + id);
      });

      socket.on("disconnect", () => {
        logger.info("User disconnected: " + socket.id);
        socket.disconnect();
      });
    });

    httpServer.listen(port, () => {
      logger.imp("Started http server on port " + port);
    });
  }
}

export default ChatServer;