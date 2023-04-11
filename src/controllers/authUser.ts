import { createHash } from "crypto";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import * as jwt from "jsonwebtoken";
import cookie = require('cookie');
import secureRandom = require("secure-random");
import { generateToken } from "./generateToken";
import { Constants } from "../Constants";

const getFingerprint = (cookieString: string) => {
  return cookie.parse(cookieString)[Constants.FINGERPRINT_COOKIE];
}

const getRefreshToken = (refreshString: string) => {
  return cookie.parse(refreshString)[Constants.REFRESH_COOKIE]
}

export const authUser = (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "production") {
    return ({
      message: "Auth bypassed in development environment",
      succeeded: true,
      code: StatusCodes.OK,
      user: req.params.user,
    })
  }
  if (req.headers.cookie === undefined || req.headers.cookie?.length === 0) {
    return ({
      message: "Fingerprint cookie is required",
      succeeded: false,
      code: StatusCodes.BAD_REQUEST,
    })
  }
  const fingerprint = getFingerprint(req.headers.cookie);
  const fingerprintHash = createHash("sha256").update(fingerprint).digest("hex");
  const authHeader = req.headers["authorization"];
  if (authHeader?.split(" ")[0].toLowerCase() != "bearer") {
    return ({
      message: "Bearer authorization is required.",
      succeeded: false,
      code: StatusCodes.BAD_REQUEST,
    })
  }
  const token = authHeader?.split(" ")[1];
  if (token === null) {
    return ({
      message: "Token not present.",
      succeeded: false,
      code: StatusCodes.BAD_REQUEST,
    });
  }
  try {
    const test = jwt.verify(token!, process.env.ACCESS_TOKEN_SECRET!) as jwt.JwtPayload;
    if (fingerprintHash === test.fingerprintHash) {
      return ({
        message: "Auth successful",
        succeeded: true,
        code: StatusCodes.OK,
        user: test.user,
      });
    } else {
      return ({
        message: "Fingerprint invalid",
        succeeded: false,
        code: StatusCodes.FORBIDDEN,
      });
    }
  } catch (err) {
    const oldRefresh = getRefreshToken(req.headers.cookie);
    if (!globalThis.refreshTokens.includes(oldRefresh)) {
      return ({
        message: "Invalid refresh token.",
        succeeded: false,
        code: StatusCodes.INTERNAL_SERVER_ERROR
      });
    }
    globalThis.refreshTokens = globalThis.refreshTokens.filter((token) => token != oldRefresh);
    const fingerprintCookie = secureRandom.randomArray(50).toString();
    const fingerprintHash = createHash("sha256").update(fingerprintCookie).digest("hex");
    const accessToken = generateToken({ user: req.params.user, fingerprint: fingerprintHash }, "access");
    const refreshToken = generateToken({ user: req.params.user, fingerprint: fingerprintHash }, "refresh");
    globalThis.refreshTokens.push(refreshToken);
    return ({
      message: "Refreshed Token.",
      succeeded: true,
      code: StatusCodes.OK,
      accessToken: accessToken,
      cookies: [{
        name: Constants.FINGERPRINT_COOKIE, value: fingerprintCookie, options: {
          // 15 minutes
          maxAge: 900000,
          httpOnly: true,
          secure: true,
          sameSite: "strict"
        }
      },
      {
        // 2 hours
        name: Constants.REFRESH_COOKIE, value: refreshToken, options: {
          maxAge: 7200000,
          httpOnly: true,
          secure: true,
          sameSite: "strict",
        }
      }],
    });
  }
}
