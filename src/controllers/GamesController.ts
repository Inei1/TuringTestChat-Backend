import { Controller, Delete, Get, Post, Put } from "@overnightjs/core";
import { Request, Response } from 'express';
import { StatusCodes } from "http-status-codes";
import { Constants } from "../Constants";
import { performAuth } from "./performAuth";

@Controller('api/games')
class GamesController {

  @Get(":game")
  private async getGameElements(req: Request, res: Response) {
    await performAuth(req, res, false, async (extraBody: any) => {
      const row = await globalThis.collections.users?.findOne(
        { "editorGames.id": req.params.game }
      );
      const result = row?.editorGames.filter(game => game.id === req.params.game)[0]!;
      return {
        json: {
          ...extraBody,
          user: row?.user,
          defaultElements: JSON.stringify(result.defaultElements),
          defaultResources: JSON.stringify(result.defaultResources),
          defaultBuildings: JSON.stringify(result.defaultBuildings),
          defaultClickers: JSON.stringify(result.defaultClickers),
          succeeded: true,
          authType: Constants.SUCCESS_AUTH_TYPE,
        },
        statusCode: StatusCodes.OK,
      };
    });
  }

  @Get(':game/:user')
  private async getUserGameData(req: Request, res: Response) {
    await performAuth(req, res, true, async (extraBody: any) => {
      const row = await globalThis.collections.users?.findOne({ "user": req.params.user });
      const result = row?.playedGames.filter(game => game.game.id === req.params.game)[0]!;
      return {
        json: {
          ...extraBody,
          user: row?.user,
          resources: JSON.stringify(result.resources),
          buildings: JSON.stringify(result.buildings),
          clickers: JSON.stringify(result.clickers),
          succeeded: true,
          authType: Constants.SUCCESS_AUTH_TYPE,
        },
        statusCode: StatusCodes.OK,
      };
    });
  }

  @Post(":gameId/:user")
  private async addPlayedGame(req: Request, res: Response) {
    await performAuth(req, res, true, async (extraBody: any) => {
      await globalThis.collections.users?.updateOne(
        { "user": req.params.user, "playedGames": { $not: { $elemMatch: { "game.id": req.params.gameId } } } },
        {
          $push: {
            "playedGames": {
              game: {
                name: req.params.gameId,
                id: req.params.gameId,
                defaultElements: req.body.defaultElements,
                defaultResources: req.body.defaultResources,
                defaultBuildings: req.body.defaultBuildings,
                defaultClickers: req.body.defaultClickers,
              },
              resources: [],
              buildings: [],
              clickers: [],
            }
          }
        });
      return {
        json: {
          ...extraBody,
          message: "Created a new game for " + req.params.user,
          authType: Constants.SUCCESS_AUTH_TYPE,
          succeeded: true,
        },
        statusCode: StatusCodes.OK,
      };
    });
  }

  @Put(":gameId/:user")
  private async updateUserGameData(req: Request, res: Response) {
    await performAuth(req, res, true, async (extraBody: any) => {
      await globalThis.collections.users?.updateOne(
        { "user": req.params.user, "playedGames.game.id": req.params.gameId },
        {
          $set: {
            "playedGames.$.resources": req.body.resources,
            "playedGames.$.buildings": req.body.buildings,
            "playedGames.$.clickers": req.body.clickers,
          }
        });
      return {
        json: {
          ...extraBody,
          message: "Successfully updated played game.",
          authType: Constants.SUCCESS_AUTH_TYPE,
          succeeded: true,
        },
        statusCode: StatusCodes.OK,
      };
    });
  }

  @Delete(":game/:user")
  private async deleteUserGame(req: Request, res: Response) {
    await performAuth(req, res, true, async (extraBody: any) => {
      await globalThis.collections.users?.updateOne(
        { "user": req.params.user },
        { $pull: { "editorGames": { id: req.params.game } } });
      return {
        json: {
          ...extraBody,
          message: "Removed editor game for " + req.params.user,
          authType: Constants.SUCCESS_AUTH_TYPE,
          succeeded: true,
        },
        statusCode: StatusCodes.OK,
      };
    });
  }
}

export default GamesController;
