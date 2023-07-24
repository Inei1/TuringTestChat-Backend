import { Controller, Get, Middleware, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import { check, validationResult } from "express-validator";
import logger from "jet-logger";
var quickemailverification = require('quickemailverification');
import bcrypt from "bcrypt";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import * as crypto from "crypto";
import { Base64 } from "js-base64";

@Controller('account')
class AccountController {

  @Post("register")
  @Middleware([
    check("username").isLength({ max: 64 }).notEmpty().withMessage("Username must be between 1 and 64 characters long").escape(),
    check("password").isLength({ min: 6, max: 64 }).withMessage("Password must be between 6 and 64 characters long").escape(),
    check("email").isLength({ max: 254 }).isEmail().withMessage("Invalid email address").escape()
  ])
  private async registerUser(req: Request, res: Response) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid email",
        succeeded: false,
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    try {
      const existingUser = await globalThis.collections.users?.findOne(
        { $or: [{ email: req.body.email }, { username: req.body.username }] }
      );
      if (!existingUser) {
        const updateInfo = await globalThis.collections.users?.updateOne(
          { email: req.body.email, username: req.body.username },
          {
            $setOnInsert: {
              email: req.body.email,
              username: req.body.username,
              password: hashedPassword,
              currentDailyCredits: 9999, //20,
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
            logger.info(`Email ${req.body.email} could not be validated`);
          } else {
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
                        Data: `<html><p>Welcome to Turing Test Chat!, It's time to start <a href="https://www.turingtestchat.com/home">chatting</a>. <br/>If you have any questions, check out the <a href="https://www.turingtestchat.com/faq">FAQ</a> or reply to this email.<br/> <a href={{amazonSESUnsubscribeUrl}}>Click here to unsubscribe</a></p></html>`
                      },
                      Text: {
                        Charset: "UTF-8",
                        Data: "Welcome to Turing Test Chat!\n\n It's time to start chatting. If you have any questions, check out the FAQ or reply to this email.\n\n - TuringTestChat\n{{amazonSESUnsubscribeUrl}}"
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
            logger.info(`Successfully created validated email account for user ${req.body.username}`);
            return res.status(StatusCodes.OK).json({
              message: "Account successfully created! Please log in.",
            });
          }
          logger.info(`Successfully created invalidated email account for user ${req.body.username}`);
          return res.status(StatusCodes.OK).json({
            message: "Account successfully created! Your email could not be validated, but you can still play. Please log in.",
          });
        } else {
          return res.status(StatusCodes.CONFLICT).json({
            message: "Failed to create account.",
          });
        }
      } else {
        logger.info(`Existing user for account is ${existingUser?.username} with email ${existingUser?.email}`);
        return res.status(StatusCodes.CONFLICT).json({
          message: "This username or email is already registered.",
        });
      }
    } catch (error) {
      logger.err(error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "An unknown error occurred.",
      });
    }
  }

  @Get("user/:username")
  private async getUser(req: Request, res: Response) {
    try {
      const user = await globalThis.collections.users?.findOne(
        { username: req.params.username }
      );
      if (user) {
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

  @Post("password/reset/request")
  private async resetPasswordRequest(req: Request, res: Response) {
    try {
      logger.info(`Password reset request has been made for ${req.body.email}`);
      const existingUser = await globalThis.collections.users?.findOne(
        { email: req.body.email }
      );
      if (existingUser) {
        let token = crypto.randomBytes(32).toString("hex");
        const updateInfo = await globalThis.collections.passwordResetTokens?.updateOne(
          { email: req.body.email },
          // one hour
          { $push: { tokens: { value: token, expiration: Date.now() + 3600000 } } },
          { upsert: true }
        );
        if (updateInfo?.modifiedCount! > 0) {
          const b64Email = Base64.encodeURL(req.body.email);
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
                    Data: `<html><p>Your account on turingtestchat.com has received a password reset request.</p>
                    <p>If you did not make this request, no further action is required.</p>
                    <p><a href="https://www.turingtestchat.com/resetpassword?token=${token}&email=${b64Email}">To reset your password, click here</a></p>
                    <p>This password reset request will expire in one hour. If your request expires, <a href="https://www.turingtestchat.com/forgotpassword">you can submit a new one here</a></p>
                    <p>For your information, here are some details:</p>
                    <p>username: ${existingUser?.username}, request timestamp: ${Date.now()}</p>
                    <p>If you have any questions, feel free to reply to this message.</p>
                    <a href={{amazonSESUnsubscribeUrl}}>Click here to unsubscribe</a>
                    </html>`
                  },
                  Text: {
                    Charset: "UTF-8",
                    Data: `Your account on turingtestchat.com has received a password reset request\n.
                    If you did not make this request, no further action is required\n.
                    To reset your password, click here: https://www.turingtestchat.com/resetpassword?token=${token}&email=${b64Email} \n
                    This password reset request will expire in one hour. If your request expires, you can submit a new one at https://www.turingtestchat.com/forgotpassword \n
                    For your information, here are some details: \n
                    username: ${existingUser?.username}, request timestamp: ${Date.now()} \n
                    If you have any questions, feel free to reply to this message. \n
                    {{amazonSESUnsubscribeUrl}}`
                  }
                },
                Subject: {
                  Charset: "UTF-8",
                  Data: "Turing Test Chat Password Reset Request"
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
          logger.info(`Sent password reset email to ${req.body.email}`);
        }
      } else {
        logger.warn(`No existing user for ${req.body.email} found during password reset request`);
      }
      return res.status(StatusCodes.OK).json({
        message: "A password reset email has been sent to the email address, if it exists in the system."
      });
    } catch (err) {
      logger.err(err);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "An unknown error occurred",
      });
    }
  }

  @Post("password/reset")
  private async resetPassword(req: Request, res: Response) {
    const email = Base64.decode(req.body.email);
    const tokens = await globalThis.collections.passwordResetTokens?.findOne(
      { email: email }
    );
    if (tokens && tokens.tokens) {
      let resultCode = StatusCodes.UNAUTHORIZED;
      let resultMessage = "Your password reset was invalid, please make a new request.";
      for (let i = 0; i < tokens.tokens.length; ++i) {
        const token = tokens.tokens[i];
        if (token.value === req.body.token) {
          if (token.expiration >= Date.now()) {
            const hashedPassword = await bcrypt.hash(req.body.password, 10);
            try {
              await globalThis.collections.users?.updateOne(
                { email: email },
                {
                  $set: {
                    password: hashedPassword,
                  }
                },
                { upsert: true });
              logger.info(`${email} successfully updated password`);
              return res.status(StatusCodes.OK).json({
                message: "Password reset successful, please log in with your new password."
              });
            } catch (err) {
              logger.err(`${email} failed to reset password ${hashedPassword} with token ${req.body.token}`);
              return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: "An unknown error occurred when attempting to change password."
              });
            }
          } else {
            logger.info(`${email} attempted to reset an expired password (current time is ${Date.now()}, expiration is ${token.expiration})`);
            resultCode = StatusCodes.UNAUTHORIZED;
            resultMessage = "Your password reset has expired, please make a new request.";
            return res.status(StatusCodes.UNAUTHORIZED).json({
              message: "Your password reset has expired, please make a new request.",
            });
          }
        }
      }
    } else {
      logger.info(`${email} attempted to reset password without making a request`)
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "You need to make a password reset request to reset your password.",
      })
    }
  }
}

export default AccountController;