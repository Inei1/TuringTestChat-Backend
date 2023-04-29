import { Controller, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import passport = require("passport");

@Controller('login')
class ChatController {

  @Post("password")
  @Middleware(passport.authenticate("local"))
  private async loginPassword(req: Request, res: Response) {
    if (req.user) {
      return res.status(200).json({
        username: req.user,
        succeeded: true,
      });
    }
  }

}

export default ChatController;
