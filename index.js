require("dotenv").config();

const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} = require("@discordjs/voice");

const OpenAI = require("openai");
const { Readable } = require("stream");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const player = createAudioPlayer();

let session = null;

async function speak(text, connection) {
  const response = await ai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "onyx",
    input: text,
    instructions: "Speak naturally in Gulf Arabic."
  });

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  const resource = createAudioResource(
    Readable.from(buffer),
    { inputType: StreamType.Arbitrary }
  );

  player.play(resource);
  connection.subscribe(player);

  await new Promise(resolve => {
    player.once(AudioPlayerStatus.Idle, resolve);
  });
}

async function askAI(question, history) {
  const result = await ai.responses.create({
    model: "gpt-5-mini",

    instructions: `
    أنت مسؤول مقابلات في سيرفر رول بلاي.
    تحدث باللهجة الخليجية.
    كن محترماً ورسميّاً.
    اسأل سؤالاً واحداً في كل مرة.
    تفاعل مع إجابات المتقدم.
    لا تصدر قرار القبول أثناء المقابلة.
    `,

    input: [
      ...history,
      {
        role: "user",
        content: question
      }
    ]
  });

  return result.output_text;
}

client.on("messageCreate", async message => {
  if (message.author.bot) return;

  try {

    if (message.content === "!interview") {

      const voice = message.member.voice.channel;

      if (!voice) {
        return message.reply(
          "ادخل روم المقابلة أولاً."
        );
      }

      if (session) {
        return message.reply(
          "هناك مقابلة قيد التنفيذ حالياً."
        );
      }

      session = {
        user: message.author.id,
        voice: voice,
        history: [],
        connection: null
      };

      return message.reply(
        "🎙️ أهلاً بك في مقابلة NEXUS AI.\n" +
        "ستُسجّل المقابلة صوتياً ويُحفظ نصها بعد موافقتك.\n" +
        "اكتب !agree للموافقة أو !cancel للإلغاء."
      );
    }

    if (
      session &&
      message.author.id === session.user &&
      message.content === "!cancel"
    ) {
      session = null;

      return message.reply(
        "تم إلغاء المقابلة."
      );
    }

    if (
      session &&
      message.author.id === session.user &&
      message.content === "!agree"
    ) {

      const connection = joinVoiceChannel({
        channelId: session.voice.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false
      });

      session.connection = connection;

      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        30000
      );

      const welcome =
        "السلام عليكم ورحمة الله وبركاته، حياك الله في مقابلة نيكسس. عرفنا بنفسك وسبب تقديمك للسيرفر.";

      session.history.push({
        role: "assistant",
        content: welcome
      });

      await speak(welcome, connection);

      await message.reply(
        "🟢 بدأ البوت المقابلة الصوتية."
      );
    }

  } catch (error) {
    console.error(error);

    await message.reply(
      "حدث خطأ أثناء تشغيل المقابلة."
    );
  }
});

client.once("ready", () => {
  console.log(
    `NEXUS AI ONLINE: ${client.user.tag}`
  );
});

client.login(process.env.DISCORD_TOKEN);
