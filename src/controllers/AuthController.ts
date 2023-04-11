import { Controller, Delete, Post } from "@overnightjs/core";
import { CookieOptions, Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import * as bcrypt from "bcrypt";
import console = require("console");
import secureRandom = require("secure-random");
import { createHash } from "crypto";
import { generateToken } from "./generateToken";
import { Collection } from "mongodb";
import { UserElements } from "../types";
import { connectToDatabase } from "./connectToDatabase";
import { authUser } from "./authUser";
import cookie = require('cookie');
import { Constants } from "../Constants";

let collections: { users?: Collection<UserElements> } = {};

@Controller("api/auth")
class UserController {

  @Post('register/:user')
  private async registerUser(req: Request, res: Response) {
    if (Object.keys(collections).length === 0) {
      collections = await connectToDatabase();
    }
    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const updateInfo = await collections.users?.updateOne(
        { $or: [{ user: req.params.user }, { email: req.body.email }] },
        { $setOnInsert: { user: req.params.user, email: req.body.email, password: hashedPassword, editorGames: [] } },
        { upsert: true });
      if (updateInfo?.upsertedCount! > 0) {
        return res.status(StatusCodes.OK).json({
          message: "Created User " + req.params.user,
          succeeded: true,
        });
      } else {
        return res.status(StatusCodes.CONFLICT).json({
          message: "Failed to create user " + req.params.user + " with email " +
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

  @Post('login/:user')
  private async loginUser(req: Request, res: Response) {
    if (Object.keys(collections).length === 0) {
      collections = await connectToDatabase();
    }
    try {
      const userInfo = await collections.users?.findOne(
        { $or: [{ user: req.params.user }, { email: req.params.user }] });
      if (userInfo?.user.length === 0) {
        return res.status(StatusCodes.NOT_FOUND).json({
          message: "Incorrect username, email, or password",
          succeeded: false,
        });
      } else {
        const hashedPassword = userInfo?.password!;
        if (await bcrypt.compare(req.body.password, hashedPassword)) {
          const fingerprintCookie = secureRandom.randomArray(50).toString();
          const fingerprintHash = createHash("sha256").update(fingerprintCookie).digest("hex");
          const accessToken = generateToken({ user: req.params.user, fingerprint: fingerprintHash }, "access");
          const refreshToken = generateToken({ user: req.params.user, fingerprint: fingerprintHash }, "refresh");
          globalThis.refreshTokens.push(refreshToken);
          return res.status(StatusCodes.OK).cookie(Constants.FINGERPRINT_COOKIE, fingerprintCookie, {
            // 15 minutes
            maxAge: 900000,
            httpOnly: true,
            secure: true,
            sameSite: "strict",
          }).cookie(Constants.REFRESH_COOKIE, refreshToken, {
            // 2 hours
            maxAge: 7200000,
            httpOnly: true,
            secure: true,
            sameSite: "strict",
          }).json({
            message: "Login successful",
            succeeded: true,
            user: req.params.user,
            accessToken: accessToken,
          });
        } else {
          return res.status(StatusCodes.NOT_FOUND).json({
            message: "Incorrect username, email, or password",
            succeeded: false,
          })
        }
      }
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "An unknown error occurred.",
        succeeded: false,
      });
    }
  }

  @Post(":user")
  private async checkAuth(req: Request, res: Response) {
    const auth = authUser(req, res);
    if (auth.succeeded) {
      res.status(StatusCodes.OK);
      if (auth.cookies) {
        for (let i = 0; i < auth.cookies!.length; ++i) {
          res.cookie(auth.cookies![i].name, auth.cookies![i].value, auth.cookies![i].options as CookieOptions);
        }
      }
      return res.json({
        accessToken: auth.accessToken,
        message: "User is currently authenticated.",
        succeeded: true,
      })
    } else {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "User is not currently authenticed.",
        succeeded: false,
      });
    }
  }

  @Delete("logout/:user")
  private async logout(req: Request, res: Response) {
    globalThis.refreshTokens = globalThis.refreshTokens.filter((token) =>
      token != cookie.parse(req.headers.cookie!)[Constants.REFRESH_COOKIE]);
    return res.status(StatusCodes.OK).json({
      message: "Successfully logged out.",
      succeeded: true,
    });
  }
}

export default UserController;
