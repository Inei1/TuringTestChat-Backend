import { StatusCodes } from 'http-status-codes';
import { Controller, Get, Post, Put } from '@overnightjs/core';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Constants } from '../Constants';
import { performAuth } from './performAuth';

@Controller('api/editor')
class EditorController {

    @Get(":gameId/:user")
    private async getUiElements(req: Request, res: Response) {
        await performAuth(req, res, true, async (extraBody: any) => {
            const row = await globalThis.collections.users?.findOne(
                { "user": req.params.user, "editorGames.id": req.params.gameId });
            const game = row?.editorGames.filter((game) => game.id === req.params.gameId)[0]!
            return {
                json: {
                    ...extraBody,
                    uiElements: JSON.stringify(game.defaultElements),
                    resources: JSON.stringify(game.defaultResources),
                    buildings: JSON.stringify(game.defaultBuildings),
                    clickers: JSON.stringify(game.defaultClickers),
                    success: true,
                    authType: Constants.SUCCESS_AUTH_TYPE,
                },
                statusCode: StatusCodes.OK,
            };
        });
    }

    @Put(':gameId/:user')
    private async updateDefaultState(req: Request, res: Response) {
        await performAuth(req, res, true, async (extraBody: any) => {
            await globalThis.collections.users?.updateOne(
                { $and: [{ "user": req.params.user }, { "editorGames.id": req.params.gameId }] },
                {
                    $set: {
                        "editorGames.$.defaultElements": req.body.defaultElements,
                        "editorGames.$.defaultResources": req.body.defaultResources,
                        "editorGames.$.defaultBuildings": req.body.defaultBuildings,
                        "editorGames.$.defaultClickers": req.body.defaultClickers,
                    }
                });
            return {
                json: {
                    ...extraBody,
                    message: "Inserted into user " + req.params.user +
                        " elements " + JSON.stringify(req.body.uiElements),
                    authType: Constants.SUCCESS_AUTH_TYPE,
                    success: true,
                },
                statusCode: StatusCodes.OK,
            };
        });
    }

    @Post(":game/:user")
    private async addUserGame(req: Request, res: Response) {
        await performAuth(req, res, true, async (extraBody: any) => {
            const id = randomUUID();
            const modified = await globalThis.collections.users?.updateOne(
                { "user": req.params.user, "editorGames": { $not: { $elemMatch: { "name": req.params.game } } } },
                {
                    $push: {
                        "editorGames": {
                            name: req.params.game,
                            id: id,
                            defaultElements: [],
                            defaultBuildings: [],
                            defaultResources: [],
                            defaultClickers: [],
                        }
                    }
                });
            if (modified?.modifiedCount === 0) {
                return {
                    json: {
                        message: "Cannot create a game with a duplicate name.",
                        succeeded: false,
                    },
                    statusCode: StatusCodes.BAD_REQUEST,
                };
            }
            return {
                json: {
                    ...extraBody,
                    message: "Created a new game for " + req.params.user,
                    game: { name: req.params.game, id: id, uiElements: [] },
                    authType: Constants.SUCCESS_AUTH_TYPE,
                    succeeded: true,
                },
                statusCode: StatusCodes.OK,
            };
        });
    }

    @Get(":user")
    private async getUserGames(req: Request, res: Response) {
        await performAuth(req, res, true, async (extraBody: any) => {
            const row = await globalThis.collections.users?.findOne({ "user": req.params.user });
            return {
                json: {
                    ...extraBody,
                    message: JSON.stringify(row?.editorGames),
                    authType: Constants.SUCCESS_AUTH_TYPE,
                    succeeded: true,
                },
                statusCode: StatusCodes.OK,
            };
        }
        );
    }
}

export default EditorController;