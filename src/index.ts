require('dotenv').config()
import { Context, Telegraf } from 'telegraf'
import { create, getData, remove } from './database/index'

// default to port 3000 if PORT is not set
const port = Number(process.env.PORT) || 3000;
const groupId = process.env.GROUP_OVERWATCH_BR_ID!;

// assert and refuse to start bot if token or webhookDomain is not passed
if (!process.env.BOT_TOKEN) throw new Error('"BOT_TOKEN" env var is required!');
if (!process.env.WEBHOOK_DOMAIN) throw new Error('"WEBHOOK_DOMAIN" env var is required!');

const bot = new Telegraf(process.env.BOT_TOKEN)

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
/remove SrTonn#11540

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
  if(!isMember) return;

  next()
})

bot.start(async (ctx, next)  => {
  await ctx.reply(startMessage);
});

const checkBattleTagFormat = (battleTag: string) => {
  const regex = /([a-z]|\d)+#\d{3,}/gmi;
  return regex.test(battleTag);
}

bot.command('add', async (ctx) => {
  const userId = ctx.chat?.id!
  const battleTag = ctx.message.text.split(" ")[1];
  const isBattleTagCorrectFormat = checkBattleTagFormat(battleTag);

  if(!isBattleTagCorrectFormat) {
    await ctx.reply(`O formato da battletag me parece incorreto, eu deveria ter recebido algo no formato "nick#1234", porém recebi ${battleTag}`);
    return;
  }

  const userData = [{
    name: battleTag.split("#")[0],
    battle_tag: battleTag,
    telegram_profile_id: userId,
    error: null
  }]

  const userExists = await getData(battleTag, userId)
  console.log(userExists)
  if(userExists.data?.length! > 0) return ctx.reply('A battletag informada já consta em nossa base de dados, caso queira remover use o comando /remove')

  const response = await create(userData)
  console.log(response)



  if(response.status != 201) return ctx.reply('Ops, acho que não consigo fazer isso no momento, tente mais tarde.')
  const link = 'https://overwatch.blizzard.com/en-us/career/' + battleTag.replace('#', '-')
  ctx.reply(`A battletag ${battleTag} foi adicionada. Segue o link de onde extraíremos os dados. link ${link}`)

})
bot.command('remove', async (ctx) => {
  const userId = ctx.chat?.id!
  const battleTag = ctx.message.text.split(" ")[1];

  const response = await remove(battleTag, userId);
  console.log('resposta: ', response)
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))