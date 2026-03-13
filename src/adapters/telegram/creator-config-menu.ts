import { Menu } from "@grammyjs/menu";
import { GameService } from "../../application/game-service.js";
import { TextService } from "../../application/text-service.js";
import { BotContext } from "./bot-context.js";

const asUserId = (ctx: BotContext): string => String(ctx.from?.id ?? "");
const textsFor = (texts: TextService, ctx: BotContext): TextService => texts.forLocale(ctx.locale);

export const createCreatorConfigMenu = (
  gameService: GameService,
  texts: TextService,
) => {
  const menu = new Menu<BotContext>("creator-config-menu", {
    autoAnswer: false,
  }).dynamic((ctx, range) => {
    const game = gameService.findConfiguringGameByCreator(asUserId(ctx));
    if (!game) {
      return range;
    }

    const localizedTexts = textsFor(texts, ctx);

    range
      .text(`🎲 ${localizedTexts.gameModeButton("NORMAL")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          {
            telegramUserId: asUserId(innerCtx),
            username: innerCtx.from?.username,
            firstName: innerCtx.from?.first_name,
            lastName: innerCtx.from?.last_name,
            languageCode: innerCtx.from?.language_code,
          },
          "mode",
          "NORMAL",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      })
      .text(`🔄 ${localizedTexts.gameModeButton("REVERSE")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          {
            telegramUserId: asUserId(innerCtx),
            username: innerCtx.from?.username,
            firstName: innerCtx.from?.first_name,
            lastName: innerCtx.from?.last_name,
            languageCode: innerCtx.from?.language_code,
          },
          "mode",
          "REVERSE",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      })
      .row()
      .text(`💬 ${localizedTexts.playModeButton("ONLINE")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          {
            telegramUserId: asUserId(innerCtx),
            username: innerCtx.from?.username,
            firstName: innerCtx.from?.first_name,
            lastName: innerCtx.from?.last_name,
            languageCode: innerCtx.from?.language_code,
          },
          "play",
          "ONLINE",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      })
      .text(`🪑 ${localizedTexts.playModeButton("OFFLINE")}`, async (innerCtx) => {
        await gameService.applyConfigStep(
          game.gameId,
          {
            telegramUserId: asUserId(innerCtx),
            username: innerCtx.from?.username,
            firstName: innerCtx.from?.first_name,
            lastName: innerCtx.from?.last_name,
            languageCode: innerCtx.from?.language_code,
          },
          "play",
          "OFFLINE",
        );
        await innerCtx.answerCallbackQuery();
        await innerCtx.menu.update();
      });

    if (game.mode === "NORMAL" || !game.mode) {
      range
        .row()
        .text(`🎯 ${localizedTexts.pairingModeButton("RANDOM")}`, async (innerCtx) => {
          await gameService.applyConfigStep(
            game.gameId,
            {
              telegramUserId: asUserId(innerCtx),
              username: innerCtx.from?.username,
              firstName: innerCtx.from?.first_name,
              lastName: innerCtx.from?.last_name,
              languageCode: innerCtx.from?.language_code,
            },
            "pair",
            "RANDOM",
          );
          await innerCtx.answerCallbackQuery();
          await innerCtx.menu.update();
        })
        .text(`🧩 ${localizedTexts.pairingModeButton("MANUAL")}`, async (innerCtx) => {
          await gameService.applyConfigStep(
            game.gameId,
            {
              telegramUserId: asUserId(innerCtx),
              username: innerCtx.from?.username,
              firstName: innerCtx.from?.first_name,
              lastName: innerCtx.from?.last_name,
              languageCode: innerCtx.from?.language_code,
            },
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
