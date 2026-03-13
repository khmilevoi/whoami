import { Menu } from "@grammyjs/menu";
import { Context } from "grammy";
import { GameService } from "../../application/game-service.js";
import { TextService } from "../../application/text-service.js";

const asUserId = (ctx: Context): string => String(ctx.from?.id ?? "");

export const createCreatorConfigMenu = (
  gameService: GameService,
  texts: TextService,
) => {
  const menu = new Menu<Context>("creator-config-menu", {
    autoAnswer: false,
  }).dynamic((ctx, range) => {
    const game = gameService.findConfiguringGameByCreator(asUserId(ctx));
    if (!game) {
      return range;
    }

    range
      .text(`🎲 ${texts.gameModeButton("NORMAL")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          asUserId(innerCtx),
          "mode",
          "NORMAL",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      })
      .text(`🔄 ${texts.gameModeButton("REVERSE")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          asUserId(innerCtx),
          "mode",
          "REVERSE",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      })
      .row()
      .text(`💬 ${texts.playModeButton("ONLINE")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          asUserId(innerCtx),
          "play",
          "ONLINE",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      })
      .text(`🪑 ${texts.playModeButton("OFFLINE")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          asUserId(innerCtx),
          "play",
          "OFFLINE",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      });

    if (game.mode === "NORMAL" || game.mode === null) {
      range
        .row()
        .text(`🎯 ${texts.pairingModeButton("RANDOM")}`, async (innerCtx) => {
          await gameService.applyConfigStep(
            game.gameId,
            asUserId(innerCtx),
            "pair",
            "RANDOM",
          );
          await innerCtx.answerCallbackQuery();
          await innerCtx.menu.update();
        })
        .text(`🧩 ${texts.pairingModeButton("MANUAL")}`, async (innerCtx) => {
          await gameService.applyConfigStep(
            game.gameId,
            asUserId(innerCtx),
            "pair",
            "MANUAL",
          );
          await innerCtx.answerCallbackQuery();
          await innerCtx.menu.update();
        });
    }

    return range;
  });

  return menu;
};
