import { Controller, Get, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import { check, validationResult } from "express-validator";
import logger from "jet-logger";
var quickemailverification = require('quickemailverification');
import bcrypt from "bcrypt";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

@Controller('account')
class AccountController {

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
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    try {
      const existingUser = await globalThis.collections.users?.findOne(
        { $or: [{ email: req.body.email }, { username: req.body.username }] }
      );
      logger.info(`Existing user for account is ${existingUser?.username} with email ${existingUser?.email}`);
      if (!existingUser) {
        const updateInfo = await globalThis.collections.users?.updateOne(
          { email: req.body.email, username: req.body.username },
          {
            $setOnInsert: {
              email: req.body.email,
              username: req.body.username,
              password: hashedPassword,
              currentDailyCredits: 20,
              maximumDailyCredits: 20,
              permanentCredits: 0,
              deception: 0,
              detection: 0,
              deceptionWins: 0,
              detectionWins: 0,
              deceptionLosses: 0,
              detectionLosses: 0,
              creationTime: Date.now(),
              playFoundSound: false,
            }
          },
          { upsert: true });
        if (updateInfo?.upsertedCount! > 0) {
          try {
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
                      Data: `<html><p>Welcome to Turing Test Chat! Turing Test Chat is free for everyone to use until July 9, so it's time to start <a href="https://www.turingtestchat.com/home">chatting</a>. <br/>If you have any questions, check out the <a href="https://www.turingtestchat.com/faq">FAQ</a> or reply to this email.<br/> <a href={{amazonSESUnsubscribeUrl}}>Click here to unsubscribe</a></p></html>`
                    },
                    Text: {
                      Charset: "UTF-8",
                      Data: "Welcome to Turing Test Chat!\n\n Turing Test Chat is free for everyone to use until July 9, so it's time to start chatting. If you have any questions, check out the FAQ or reply to this email.\n\n - TuringTestChat\n{{amazonSESUnsubscribeUrl}}"
                    }
                  },
                  Subject: {
                    Charset: "UTF-8",
                    Data: "Welcome to Turing Test Chat!"
                  }
                }
              },
              ListManagementOptions: {
                TopicName: "Account",
                ContactListName: "TuringTestChat"
              },
              FeedbackForwardingEmailAddress: "support@turingtestchat.com",
              FromEmailAddress: "ttc@turingtestchat.com",
              ReplyToAddresses: [
                "support@turingtestchat.com"
              ]
            }));
            logger.info(`Message ID is ${result.MessageId}`);
            logger.info(`Sent registration email to ${req.body.email}`);
          } catch (err) {
            logger.err(err);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
              message: "An unknown error occurred.",
              succeeded: false,
            });
          }
          logger.info(`Successfully created account for user ${req.body.user}`);
          return res.status(StatusCodes.OK).json({
            message: "Account successfully created! Please log in.",
            succeeded: true,
          });
        } else {
          return res.status(StatusCodes.CONFLICT).json({
            message: "Failed to create account.",
            succeeded: false,
          });
        }
      } else {
        return res.status(StatusCodes.CONFLICT).json({
          message: "This username or email is already registered.",
          succeeded: false,
        });
      }
    } catch (error) {
      logger.err(error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "An unknown error occurred.",
        succeeded: false,
      });
    }
  }

  @Get("user/:username")
  private async getUser(req: Request, res: Response) {
    try {
      logger.info("Attempting to get user on homepage");
      const user = await globalThis.collections.users?.findOne(
        { username: req.params.username }
      );
      if (user) {
        logger.info(`User ${user?.username} accessed the home page`);
        return res.status(StatusCodes.OK).json({
          username: user?.username!,
          currentDailyCredits: user?.currentDailyCredits!,
          permanentCredits: user?.permanentCredits!,
          detection: user?.detection!,
          deception: user?.deception!,
          detectionWins: user?.detectionWins!,
          detectionLosses: user?.detectionLosses!,
          deceptionWins: user?.deceptionWins!,
          deceptionLosses: user?.deceptionLosses!,
          playFoundSound: user?.playFoundSound!
        });
      } else {
        return res.status(StatusCodes.NOT_FOUND);
      }
    } catch (err) {
      logger.err(`Failed to get user ${req.params.username}`);
      logger.err(err);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  // @Post("forgotpassword")
  // private async forgotPassword(req: Request, res: Response) {
  //   try {
  //     logger.info(`Email ${req.body.email} is resetting password`);
  //   } catch (err) {
  //     logger.err(err);
  //   }
  // }

}

export default AccountController;
