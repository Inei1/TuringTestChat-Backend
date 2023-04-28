import { Controller, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { StatusCodes } from "http-status-codes";
import { check, validationResult } from "express-validator";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import logger from "jet-logger";
var quickemailverification = require('quickemailverification');

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

    const verification = await new Promise((resolve) => {
      quickemailverification.client(process.env.QEV_API_KEY).quickemailverification().verify(
        req.body.email, (err: any, response: any) => {
          if (err) {
            logger.err(err);
          }
          resolve(response.body.result);
        });
    });

    if (verification !== "valid") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Email failed verification, please check that it was entered correctly.",
        succeeded: false,
      });
    }

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

        try {
          logger.info("email start");
          const result = await new SESv2Client({
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY!,
              secretAccessKey: process.env.AWS_SECRET_KEY!,
            },
            apiVersion: "2019-09-27",
            region: "us-east-1"
          }).send(new SendEmailCommand({
            Destination: {
              ToAddresses: [
                req.body.email,
              ]
            },
            Content: {
              Simple: {
                Body: {
                  Html: {
                    Charset: "UTF-8",
                    Data: "<html><p>Thank you for subscribing to the TuringTestChat waitlist!<br/><br/> You'll be the first to know when the beta releases. If you wish to receive weekly updates, you can use the link at the bottom of this email to subscribe. If you have any questions, feel free to reply to this email.<br/><br/> - TuringTestChat<br/><a href={{amazonSESUnsubscribeUrl}}>Click here to manage subscriptions</a></p></html>"
                  },
                  Text: {
                    Charset: "UTF-8",
                    Data: "Thank you for subscribing to the TuringTestChat waitlist!\n\n You'll be the first to know when the beta releases. If you wish to receive weekly updates, you can use the link at the bottom of this email to subscribe. If you have any questions, feel free to reply to this email.\n\n - TuringTestChat\n{{amazonSESUnsubscribeUrl}}"
                  }
                },
                Subject: {
                  Charset: "UTF-8",
                  Data: "Welcome to the TuringTestChat waitlist"
                }
              }
            },
            ListManagementOptions: {
              TopicName: "Waitlist",
              ContactListName: "TuringTestChat"
            },
            FeedbackForwardingEmailAddress: "support@turingtestchat.com",
            FromEmailAddress: "ttc@turingtestchat.com",
            ReplyToAddresses: [
              "support@turingtestchat.com"
            ]
          }));
          logger.info(result);
        } catch (err) {
          logger.err(err);
        }
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
