import * as bodyParser from 'body-parser';
import EditorController from '../controllers/EditorController';
import { Server } from '@overnightjs/core';
import logger from 'jet-logger';
import UserController from '../controllers/UserController';
import AuthController from '../controllers/AuthController';
import GamesController from '../controllers/GamesController';
import { connectToDatabase } from '../controllers/connectToDatabase';
var https = require('https');
var http = require('http');
import { readFileSync } from 'fs';

class EditorServer extends Server {

  private readonly DEV_MSG = 'Express Server is running in development mode. ' +
    'No front-end content is being served.';

  constructor() {
    connectToDatabase().then((collections) => globalThis.collections = collections);
    globalThis.refreshTokens = [];
    super(true);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    super.addControllers([new EditorController(), new UserController(), new AuthController(), new GamesController()]);
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
    https.createServer(this.app).listen(port, () => {
      logger.imp("Started https server on port " + port);
    });
  }

  public startHttp(port: number): void {
    http.createServer(this.app).listen(port, () => {
      logger.imp("Started http server on port " + port)
    })
  }
}

export default EditorServer;