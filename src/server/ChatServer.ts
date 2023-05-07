import * as bodyParser from 'body-parser';
import { Server } from '@overnightjs/core';
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
var https = require('https');
var http = require('http');
import { readFileSync } from 'fs';
import cors = require('cors');
import { Configuration, OpenAIApi } from 'openai';
import * as dotenv from 'dotenv';
import { connectToDatabase } from './connectToDatabase';
import * as passport from 'passport';
import * as session from 'express-session';
import LoginController from '../controllers/LoginController';
import AccountController from '../controllers/AccountController';
import * as passportLocal from "passport-local";
import { ObjectId } from "mongodb";
import * as bcrypt from "bcrypt";
import MongoStore = require('connect-mongo');
import { randomUUID } from 'crypto';

const LocalStrategy = passportLocal.Strategy;

dotenv.config();

export interface ChatUser {
  name: string;
  bot: boolean;
  result: string | null;
  ready: boolean;
}

export interface ChatRoom {
  active: boolean;
  user1: ChatUser;
  user2: ChatUser | null;
}

class ChatServer extends Server {

  roomsMap: Map<string, ChatRoom> = new Map<string, ChatRoom>;
  emptyRooms: string[] = [];
  apiKey = process.env.OPENAI_API_KEY;
  config = new Configuration({
    apiKey: this.apiKey,
  });
  openai = new OpenAIApi(this.config);
  // need to optimize this
  messages: any[] = [{ role: "system", content: "You are trying to convince the person on the other side that you are a human." }];
  wordsPerSecond = 20;
  // make between 30-80 wpm (0.5-1.33), weighted more to low numbers

  private readonly DEV_MSG = 'Express Server is running in development mode. ' +
    'No front-end content is being served.';

  convertMessage = (data: any) => {
    this.messages.push({ role: data.name, content: data.text });
    // console.log(data.text);
    // if (data.name === "user1") {
    //   this.messages.push({ role: "user", content: data.text });
    // } else {
    //   this.messages.push({ role: "user1", content: data.text });
    // }
  }

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

      socket.on("startRoom", (username) => {
        if (this.emptyRooms.length > 0) {
          const roomId = this.emptyRooms.pop()!
          const room = this.roomsMap.get(roomId);
          room!.user2 = { name: username, bot: false, result: null, ready: false };
          socket.join(roomId);
          logger.info("Room joined: " + roomId);
          this.roomsMap.set(roomId, room!);
          socket.emit("roomFound", { roomId: roomId });
          io.to(roomId).emit("foundChat");
        } else {
          const roomId = randomUUID();
          this.roomsMap.set(roomId, {
            user1: { name: username, bot: false, result: null, ready: false },
            user2: null,
            active: false
          });
          this.emptyRooms.push(roomId);
          socket.join(roomId);
          socket.emit("roomFound", { roomId: roomId });
          logger.info("Room created: " + roomId);
        }
      });

      socket.on("message", async (data) => {
        io.emit("messageResponse", data);

        // this.convertMessage(data);
        // const completion = await this.openai.createChatCompletion({
        //   model: "gpt-3.5-turbo",
        //   messages: this.messages,
        // });
        // setTimeout(() => io.emit("typingResponse", "user2"), 100);
        // const message = completion.data.choices[0].message?.content;

        // setTimeout(() => io.emit("messageResponse", {
        //   name: "user2",
        //   text: completion.data.choices[0].message?.content
        // }), (message?.length! / this.wordsPerSecond) * 1000);
        // io.emit("typingResponse", "");
      });

      socket.on("result", async (data) => {
        // authenticate user and socket
        console.log(data);
        let otherPoints = 0;
        let selfPoints = 0;
        const room = this.roomsMap.get(data.roomId);
        if (data.name === room?.user1) {
          if (!room?.user2?.bot) {
            if (data.result === "DefinitelyHuman") {
              otherPoints = -3;
              selfPoints = 10;
            } else if (data.result === "PossiblyHuman") {
              otherPoints = -1;
              selfPoints = 4;
            } else if (data.result === "Unknown") {
              otherPoints = 1;
              selfPoints = 0;
            } else if (data.result === "ProbablyBot") {
              otherPoints = 4;
              selfPoints = -1;
            } else {
              otherPoints = 10;
              selfPoints = -3;
            }
          } else {
            if (data.result === "DefinitelyHuman") {
              otherPoints = 10;
              selfPoints = -3;
            } else if (data.result === "PossiblyHuman") {
              otherPoints = 4;
              selfPoints = -1;
            } else if (data.result === "Unknown") {
              otherPoints = 1;
              selfPoints = 0;
            } else if (data.result === "ProbablyBot") {
              otherPoints = -1;
              selfPoints = 4;
            } else {
              otherPoints = -3;
              selfPoints = 10;
            }
          }
          if (room?.user2?.result) {
            io.socketsLeave(data.roomId);
          }
          room!.user1.result = data.result;
        } else {
          if (!room?.user2?.bot) {
            if (data.result === "DefinitelyHuman") {
              otherPoints = -3;
              selfPoints = 10;
            } else if (data.result === "PossiblyHuman") {
              otherPoints = -1;
              selfPoints = 4;
            } else if (data.result === "Unknown") {
              otherPoints = 1;
              selfPoints = 0;
            } else if (data.result === "ProbablyBot") {
              otherPoints = 4;
              selfPoints = -1;
            } else {
              otherPoints = 10;
              selfPoints = -3;
            }
          } else {
            if (data.result === "DefinitelyHuman") {
              otherPoints = 10;
              selfPoints = -3;
            } else if (data.result === "PossiblyHuman") {
              otherPoints = 4;
              selfPoints = -1;
            } else if (data.result === "Unknown") {
              otherPoints = 1;
              selfPoints = 0;
            } else if (data.result === "ProbablyBot") {
              otherPoints = -1;
              selfPoints = 4;
            } else {
              otherPoints = -3;
              selfPoints = 10;
            }
          }
          if (room?.user1?.result) {
            io.socketsLeave(data.roomId);
          }
          room!.user2!.result = data.result;
        }
        socket.emit("selfResult", {
          points: selfPoints
        });
        socket.broadcast.emit("otherResult", {
          result: data.result,
          points: otherPoints
        });
      });
      socket.on("typing", (data) => socket.broadcast.emit("typingResponse", data));

      socket.on("readyChat", (data) => {
        const room = this.roomsMap.get(data.roomId);
        if (room?.user1.name === data.user) {
          room!.user1.ready = true;
        } else if (room?.user2?.name === data.user) {{
          room!.user2!.ready = true;
        }}
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