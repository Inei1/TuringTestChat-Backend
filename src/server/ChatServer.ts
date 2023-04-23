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

const LocalStrategy = passportLocal.Strategy;

dotenv.config();

class ChatServer extends Server {

  chatRoom = '';
  allUsers: any[] = [];
  apiKey = process.env.OPENAI_API_KEY;
  config = new Configuration({
    apiKey: this.apiKey,
  });
  openai = new OpenAIApi(this.config);
  // need to optimize this
  messages: any[] = [{ role: "system", content: "You are trying to convince the person on the other side that you are a human." }];
  isBot = true;
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
    this.app.use(cors());

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

      socket.on("message", async (data) => {
        io.emit("messageResponse", data);

        this.convertMessage(data);
        const completion = await this.openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: this.messages,
        });
        setTimeout(() => io.emit("typingResponse", "user2"), 100);
        const message = completion.data.choices[0].message?.content;

        setTimeout(() => io.emit("messageResponse", {
          name: "user2",
          text: completion.data.choices[0].message?.content
        }), (message?.length! / this.wordsPerSecond) * 1000);
        io.emit("typingResponse", "");
      });

      socket.on("typing", (data) => socket.broadcast.emit("typingResponse", data));

      socket.on("newUser", (data) => {
        this.allUsers.push(data);
        io.emit("newUserResponse", this.allUsers);
      });

      socket.on("disconnect", () => {
        this.allUsers = this.allUsers.filter((user: any) => user.socketId !== socket.id);
        io.emit("newUserResponse", this.allUsers);
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