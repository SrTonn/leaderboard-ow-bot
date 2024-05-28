import 'dotenv/config'
import { Context, Telegraf } from 'telegraf'
import { create, getData, remove } from './src/database/index'
import TelegramBot from 'node-telegram-bot-api';
import { Context as ContextAws, APIGatewayEvent, Callback } from 'aws-lambda';
import { callbackQuery } from "telegraf/filters"

const { BOT_TOKEN, GROUP_OVERWATCH_BR_ID: groupId } = process.env;

if (!BOT_TOKEN) throw new Error('"BOT_TOKEN" env var is required!');
if (!groupId) throw new Error('"groupId" env var is required!');

const bot = new Telegraf(BOT_TOKEN)

const checkIfIsMember = async (ctx: Context) => {
  const userId = ctx.chat?.id!
  const output = await bot.telegram.getChatMember(groupId, userId);
  const isMember = !output.status.includes("left" || "kicked");
  return isMember;
}

const startMessage =
`
Hey {userName}
Adicione seu nick no leaderboard de overwatch do grupo {groupName}, para isso use o comando /add, caso queira remover use /remove.
Ambos comandos devem ser seguidos da sua battletag no formato "nick" + "#" + "numero"

Exemplo de battletag: SrTonn#11540

Exemplo de comando para adicionar battletag à lista:
/add SrTonn#11540

Exemplo de comando para remover a sua battletag da lista:
/remove SuaBattleTag#0000

Todos jogadores tem battletag, no PC os jogadores recebem ao criar a conta, nos consoles, devem vincular através da battlenet.

Informações importantes;
 - caso seu nick contenha letras maiusculas, você deve fornecer sua battletag exatamente como criou, informando letras maiusculas e minusculas!
 - battletag não contém espaço
 - apenas perfis públicos tem dados disponíveis para que o bot consiga fazer a coleta.
 - ao informar sua battletag o bot irá informar o link da sua página no site do overwatch de onde coletamos todas informações(se tiver informação está tudo certo, o bot irá te adicionar ao leaderboard)
 - só aparecerão no leaderboard jogadores que tenham jogado competitivo de fila fechada.
`

bot.use(async (ctx, next) => {
  const isMember = await checkIfIsMember(ctx)
  if(!isMember) return ctx.reply("Eu interajo apenas com membros do grupo @overwatch2BR, caso realmente queira falar comigo, torne-se membro do grupo.")

  next()
})

bot.start(async (ctx, next)  => {
  const firstName = ctx.message.from.first_name;
  const chat = await bot.telegram.getChat(groupId) as TelegramBot.Chat

  await ctx.reply(startMessage.replace("{userName}", firstName).replace("{groupName}", chat.title!));
  next()
});

const checkBattleTagFormat = (battleTag: string) => {
  const regex = /([a-z]|\d)+#\d{3,}/gmi;
  return regex.test(battleTag);
}

bot.command('add', async (ctx, next) => {
  const userId = ctx.chat?.id
  const battleTag = ctx.message.text.split(" ")[1];
  const isBattleTagCorrectFormat = checkBattleTagFormat(battleTag);

  if(!isBattleTagCorrectFormat) {
    await ctx.reply(`O formato da battletag me parece incorreto, eu deveria ter recebido algo no formato "nick#1234", porém recebi "${battleTag}"`);
    return;
  }

  const userData = [{
    name: battleTag.split("#")[0],
    battle_tag: battleTag,
    telegram_profile_id: userId,
    error: null
  }]

  let allBattleTagsByUserId
  try {
    allBattleTagsByUserId = await getData(userId)
  } catch (error) {
    ctx.reply("Ops, tivemos algum problema aqui, tente novamente mais tarde.")
    return;
  }

  const userExists = allBattleTagsByUserId.data?.findIndex((obj) => obj.battle_tag === battleTag) !== -1;
  if(userExists) return ctx.reply('A battletag informada já consta em nossa base de dados, caso queira remover use o comando /remove')

  const accountsLimit = (allBattleTagsByUserId.data?.length ?? 0) >= 3
  if(accountsLimit) return ctx.reply('Número limite de contas registradas atingido!')
  
  const response = await create(userData)
  if(response.status != 201) return ctx.reply('Ops, acho que não consigo fazer isso no momento, tente mais tarde.')
  
  const link = 'https://overwatch.blizzard.com/en-us/career/' + battleTag.replace('#', '-')
  ctx.reply(`A battletag ${battleTag} foi adicionada. Segue o link de onde extraíremos os dados. link ${link}`)
  next()
})

bot.command('remove', async (ctx, next) => {
  const userId = ctx.chat?.id
  const battleTag = ctx.message.text.split(" ")[1];

  const {data, error} = await getData(userId);
  if((data?.length ?? 0) < 1) {
    console.error("Conta não encontrada:", error);
    return ctx.reply("Você não tem conta registrada!");
  }

  const isCorrectBattletag = data?.indexOf((obj: any) => obj.battle_tag === battleTag) !== -1;
  if(battleTag && isCorrectBattletag) {
    await remove(battleTag, userId);
    ctx.reply("A conta foi deletada!")
    return;
  }

  await ctx.reply("Selecione a conta ao qual deseja remover.", {
    reply_markup: {
    inline_keyboard: [
      data!.map(({battle_tag: battleTag}: {battle_tag: string}) => ({text: battleTag, callback_data: `delete_${battleTag}`}))
    ]
  }})

  next()
})

bot.on(callbackQuery("data"), async ctx => {
  const chatId = ctx.chat?.id;
  const fromUserId = ctx.callbackQuery.from.id;
  const callbackData = ctx.callbackQuery.data;

  if(chatId !== fromUserId) ctx.reply("Aparentemente essa conta não é sua")

  const battleTag = callbackData.split("_")[1]

  // @ts-ignore
  const inline_keyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard[0]!
  console.log(inline_keyboard)

  try {
    await remove(battleTag, fromUserId);
    ctx.answerCbQuery("Conta removida!")
    ctx.editMessageReplyMarkup({
      inline_keyboard: [ inline_keyboard?.filter((obj: any) => obj.text !== battleTag) ]
    });
  } catch (error) {
    ctx.answerCbQuery("Ops")
    ctx.reply("Algum erro aconteceu, tenta novamente mais tarde!")
  }
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))


if(process.env.DEVELOPMENT === 'dev') bot.launch();


export const handler = async (event: APIGatewayEvent, context: ContextAws, callback: Callback) => {
  const tmp = JSON.parse(event.body!); // get data passed to us
  await bot.handleUpdate(tmp) // make Telegraf process that data
  return callback(null, { // return something for webhook, so it doesn't try to send same stuff again
    statusCode: 200,
    body: '',
  })
};