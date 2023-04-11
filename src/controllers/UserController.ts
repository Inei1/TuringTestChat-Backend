import { Controller, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import * as bcrypt from "bcrypt";
import console = require("console");
import { Collection } from "mongodb";
import { UserElements } from "../types";
import { connectToDatabase } from "./connectToDatabase";
import { Constants } from "../Constants";

let collections: { users?: Collection<UserElements> } = {};

@Controller("api/users")
class UserController {

  @Post(':user')
  private async addUser(req: Request, res: Response) {
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
        message: Constants.UNKNOWN_ERROR_MESSAGE,
        succeeded: false,
      });
    }
  }
}

export default UserController;
