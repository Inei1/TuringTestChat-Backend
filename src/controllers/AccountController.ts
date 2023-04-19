import { Controller, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { StatusCodes } from "http-status-codes";

@Controller('account')
class AccountController {

  @Post("register")
  private async registerUser(req: Request, res: Response) {
    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const updateInfo = await collections.users?.updateOne(
        { $or: [{ username: req.body.username }, { email: req.body.email }] },
        {
          $setOnInsert: {
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword,
            points: 0,
          }
        },
        { upsert: true });
      if (updateInfo?.upsertedCount! > 0) {
        return res.status(StatusCodes.OK).json({
          message: "Created User " + req.body.username,
          succeeded: true,
        });
      } else {
        return res.status(StatusCodes.CONFLICT).json({
          message: "Failed to create user " + req.body.username + " with email " +
            req.body.email + " (user or email already exists).",
          succeeded: false,
        });
      }
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "An unknown error occurred",
        succeeded: false,
      });
    }
  }

}

export default AccountController;
