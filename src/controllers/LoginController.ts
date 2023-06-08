import { Controller, Middleware, Post } from "@overnightjs/core";
import { sign } from "crypto";
import { Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import passport = require("passport");

@Controller('login')
class ChatController {

  @Post("password")
  @Middleware(passport.authenticate("local", { session: true }))
  private async loginPassword(req: Request, res: Response) {
    if (req.user) {
      return res.status(200).json({
        user: req.user,
        succeeded: true,
      });
    } else {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "User authentication failed",
      });
    }
  }

}

export default ChatController;
