import { Controller, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
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
                    Data: "<html><p>Thank you for subscribing to the TuringTestChat waitlist!<br/><br/> You'll be the first to know when the beta releases. You will receive weekly updates, and you can use the link at the bottom of this email to manage subscriptions. If you have any questions, feel free to reply to this email.<br/><br/> - TuringTestChat<br/><a href={{amazonSESUnsubscribeUrl}}>Click here to unsubscribe</a></p></html>"
                  },
                  Text: {
                    Charset: "UTF-8",
                    Data: "Thank you for subscribing to the TuringTestChat waitlist!\n\n You'll be the first to know when the beta releases. You will receive weekly updates, and you can use the link at the bottom of this email to manage subscriptions. If you have any questions, feel free to reply to this email.\n\n - TuringTestChat\n{{amazonSESUnsubscribeUrl}}"
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
          logger.info(result.MessageId);
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

  // @Post("beta")
  // @Middleware([check("email").isEmail().withMessage("Invalid email address").escape()])
  // private async addToBeta(req: Request, res: Response) {
  //   const result = validationResult(req);
  //   if (!result.isEmpty()) {
  //     return res.status(StatusCodes.BAD_REQUEST).json({
  //       message: "Invalid email",
  //       succeeded: false,
  //     });
  //   }

  //   const verification = await new Promise((resolve) => {
  //     quickemailverification.client(process.env.QEV_API_KEY).quickemailverification().verify(
  //       req.body.email, (err: any, response: any) => {
  //         if (err) {
  //           logger.err(err);
  //         }
  //         resolve(response.body.result);
  //       });
  //   });

  //   if (verification !== "valid") {
  //     return res.status(StatusCodes.BAD_REQUEST).json({
  //       message: "Email failed verification, please check that it was entered correctly.",
  //       succeeded: false,
  //     });
  //   }

  //   try {
  //     const updateInfo = await globalThis.collections.beta?.updateOne(
  //       { email: req.body.email },
  //       {
  //         $setOnInsert: {
  //           email: req.body.email,
  //           timestamp: Date.now(),
  //         }
  //       },
  //       { upsert: true });
  //     if (updateInfo?.upsertedCount! > 0) {
  //       return res.status(StatusCodes.OK).json({
  //         message: "Subscribed to beta",
  //         succeeded: true,
  //       });
  //     } else {
  //       return res.status(StatusCodes.CONFLICT).json({
  //         message: "This email is already added to the beta",
  //         succeeded: false,
  //       });
  //     }
  //   } catch (error) {
  //     console.error(error);
  //     return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
  //       message: "An unknown error occurred",
  //       succeeded: false,
  //     });
  //   }
  // }

}

export default AccountController;