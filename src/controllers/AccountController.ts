import { Controller, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { StatusCodes } from "http-status-codes";
import { check, validationResult } from "express-validator";

@Controller('account')
class AccountController {

  @Post("waitlist")
  @Middleware([check("email").isEmail().withMessage("Invalid email address").escape()])
  private async addToWaitlist(req: Request, res: Response) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid email",
        succeeded: false,
      })
    }
    try {
      const updateInfo = await collections.waitlist?.updateOne(
        { email: req.body.email },
        {
          $setOnInsert: {
            email: req.body.email,
            comment: req.body.comment,
            timestamp: Date.now(),
          }
        },
        { upsert: true });
      if (updateInfo?.upsertedCount! > 0) {
        return res.status(StatusCodes.OK).json({
          message: "Subscribed to waitlist",
          succeeded: true,
        });
      } else {
        return res.status(StatusCodes.CONFLICT).json({
          message: "This email is already added to the waitlist",
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

  @Post("register")
  @Middleware([
    check("username").isLength({ min: 6 }).withMessage("Username must be at least 6 characters long").escape(),
    check("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long").escape(),
    check("email").isEmail().withMessage("Invalid email address").escape()
  ])
  private async registerUser(req: Request, res: Response) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: result,
        succeeded: false,
      });
    }
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
