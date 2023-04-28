import { Controller, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { StatusCodes } from "http-status-codes";
import { check, validationResult } from "express-validator";
// import * as AWS from "aws-sdk";
import logger from "jet-logger";
//var quickemailverification = require('quickemailverification');

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
      });
    }

    let verification = "";

    // quickemailverification.client(process.env.QEV_API_KEY).quickemailverification().verify(
    //   req.body.email, (err: any, response: any) => {
    //     console.log(err);
    //     console.log(response);
    //     verification = response.body.result;
    //   });
    // if (verification !== "valid") {
    //   return res.status(StatusCodes.BAD_REQUEST).json({
    //     message: "Email failed verification, please check that it was entered correctly.",
    //     succeeded: false,
    //   })
    // }

    try {
      const updateInfo = await globalThis.collections.waitlist?.updateOne(
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

        // new AWS.SESV2({
        //   apiVersion: "2019-09-27"
        // }).sendEmail({
        //   Destination: {
        //     ToAddresses: [
        //       req.body.email,
        //     ]
        //   },
        //   Content: {
        //     Simple: {
        //       Body: {
        //         Html: {
        //           Charset: "UTF-8",
        //           Data: "<p>Thank you for subscribing to the TuringTestChat waitlist!<br/><br/> You will be receiving updates on the progress of development, and You'll be the first to know when the beta releases. If you have any questions, feel free to reply to this email.<br/><br/> - TuringTestChat<br/>><a href={{amazonSESUnsubscribeUrl}}>Click here to unsubscribe</a></p>"
        //         },
        //       },
        //       Subject: {
        //         Charset: "UTF-8",
        //         Data: "Welcome to the TuringTestChat waitlist"
        //       }
        //     }
        //   },
        //   ListManagementOptions: {
        //     TopicName: "Waitlist",
        //     ContactListName: "TuringTestChat"
        //   },
        //   FeedbackForwardingEmailAddress: "support@turingtestchat.com",
        //   FromEmailAddress: "ttc@turingtestchat.com",
        //   ReplyToAddresses: [
        //     "support@turingtestchat.com"
        //   ]
        // }, (err, data) => logger.info("data: " + data + " " + "err: " + err));
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
      const updateInfo = await globalThis.collections.users?.updateOne(
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
