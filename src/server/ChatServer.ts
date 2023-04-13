import * as bodyParser from 'body-parser';
import { Server } from '@overnightjs/core';
import { Server as SocketServer } from 'socket.io';
import logger from 'jet-logger';
import ChatController from '../controllers/ChatController';
var https = require('https');
var http = require('http');
import { readFileSync } from 'fs';
const cors = require('cors');

class ChatServer extends Server {

  chatRoom = '';
  allUsers: any[] = [];

  private readonly DEV_MSG = 'Express Server is running in development mode. ' +
    'No front-end content is being served.';

  constructor() {
    super(true);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(cors());
    super.addControllers([new ChatController()]);
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

      socket.on("message", (data) => {
        io.emit("messageResponse", data);
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