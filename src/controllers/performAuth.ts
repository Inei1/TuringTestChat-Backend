import { authUser } from "./authUser";
import { CookieOptions, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Constants } from "../Constants";

export const performAuth = async (req: Request, res: Response,
  validateUser: boolean, postAuth: (extraBody: any) => any) => {
  const auth = authUser(req, res);
  if (auth.succeeded) {
    if (!validateUser || auth.user === req.params.user) {
      try {
        const response = await postAuth({ accessToken: auth.accessToken });
        res.status(response.statusCode);
        if (auth.cookies) {
          for (let i = 0; i < auth.cookies!.length; ++i) {
            res.cookie(auth.cookies![i].name, auth.cookies![i].value, auth.cookies![i].options as CookieOptions);
          }
        }
        return res.json(response.json);
      } catch (error) {
        console.error(error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          message: Constants.UNKNOWN_ERROR_MESSAGE,
          authType: Constants.UNKNOWN_AUTH_TYPE,
          succeeded: false,
        });
      }
    } else {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "User is not authorized to perform this action.",
        authType: Constants.AUTHORIZATION_AUTH_TYPE,
        succeeded: false,
      })
    }
  } else {
    return res.status(auth.code).json({
      message: auth.message,
      authType: Constants.AUTHENTICATION_AUTH_TYPE,
      succeeded: false,
    });
  }
}