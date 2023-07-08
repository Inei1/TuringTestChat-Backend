import { Controller, Get, Middleware, Post } from "@overnightjs/core";
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

  // @Get("google")
  // @Middleware(passport.authenticate("google", { scope: ["email"] }))
  // private async loginGoogle(req: Request, res: Response) { }

  // @Get("google/callback")
  // @Middleware(passport.authenticate("google", {
  //   successRedirect: "http://localhost:3000/home",
  //   failureRedirect: "http://localhost:3000/login",
  // }))
  // private async loginGoogleCallback(req: Response, res: Response) { }

}

export default LoginController;