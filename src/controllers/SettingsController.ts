import { Controller, Get, Post } from "@overnightjs/core";
import { Request, Response } from 'express';
import logger from "jet-logger";
import { StatusCodes } from "http-status-codes";

@Controller("settings")
class ChatController {

  @Post("notifications/waiting")
  private async updateFoundNotification(req: Request, res: Response) {
    if (req.user) {
      try {
        const updateInfo = await globalThis.collections.users?.updateOne(
          { username: req.body.username },
          {
            $set: {
              playFoundSound: req.body.playFoundSound,
            }
          });
          console.log(updateInfo);
        if (updateInfo?.upsertedCount! > 0) {
          logger.info("Successfully updated notification sound playback");
        }
        return res.status(StatusCodes.OK).json({
          message: "Successfully updated notification sound playback.",
          succeeded: true,
        });
      } catch (err) {
        logger.err("failed to set found notification\n" + err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          message: "An unknown error occurred",
        });
      }
    } else {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "User authentication failed",
      });
    }
  }

}

export default ChatController;
