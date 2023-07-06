import { Controller, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import passport = require("passport");
import logger from "jet-logger";

@Controller('login')
class LoginController {

  @Post("password")
  @Middleware(passport.authenticate("local", { session: true }))
  private async loginPassword(req: Request, res: Response) {
    if (req.user) {
      logger.info(`${req.body.username} logged in successfully`);
      return res.status(200).json({
        user: req.user,
      });
    }
  }

}

export default LoginController;