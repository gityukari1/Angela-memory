const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YouTubePlugin } = require('@distube/youtube');
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();
client.prefixes = new Map();
const DEFAULT_PREFIX = "angela^";

// Initialize DisTube with plugins
client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  plugins: [
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new YouTubePlugin(),
  ]
});

// 🔁 Load Prefixes
const loadPrefixes = async () => {
  const prefixPath = path.join(__dirname, "prefixes.json");
  try {
    const raw = fs.readFileSync(prefixPath, "utf8");
    const data = JSON.parse(raw);
    for (const [guildId, prefix] of Object.entries(data)) {
      client.prefixes.set(guildId, prefix);
    }
    console.log("✅ Loaded prefixes from prefixes.json");
  } catch {
    console.log("⚠️ No prefixes file found. Using default prefix.");
  }
};

// 🔁 Load all commands
const loadCommands = async () => {
  const commandsPath = path.join(__dirname, "commands");
  const slashCommands = [];

  let validCount = 0;
  let invalidCount = 0;

  const folders = fs.readdirSync(commandsPath);
  for (const folder of folders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(folderPath).filter(file => file.endsWith(".js"));
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);

      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        slashCommands.push(command.data.toJSON());
        console.log(`👾 Loaded command: ${file} [🚀 Slash & Prefix]`);
        validCount++;
      } else if (command.execute) {
        const name = file.replace(".js", "");
        client.commands.set(name, command);
        console.log(`👾 Loaded command: ${file} [🧃 Prefix Only]`);
      } else {
        console.warn(`⚠️ Command file ${file} is missing 'data' or 'execute'`);
        invalidCount++;
      }
    }
  }

  console.log(`\n👑 Registered ${validCount} valid slash commands`);
  if (invalidCount > 0) {
    console.warn(`⚠️ Skipped ${invalidCount} invalid command(s)`);
  }

  return slashCommands;
};

// 🔁 Register slash commands
const registerCommands = async (slashCommands) => {
  try {
    await client.application.commands.set(slashCommands);
    console.log("✅ Slash commands registered globally");
  } catch (error) {
    console.error("❌ Failed to register slash commands:", error);
  }
};

// 🔁 Message commands
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  const prefix = client.prefixes.get(message.guild.id) || DEFAULT_PREFIX;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);

  if (!command) return;

  try {
    if (command.prefixExecute) {
      await command.prefixExecute(message, args);
    } else {
      await message.reply({ content: "❌ This command has no prefix support." });
    }
  } catch (error) {
    console.error(`❌ Error in prefix command '${commandName}':`, error);
    await message.reply({ content: "❌ An error occurred executing the command." });
  }
});

// 🔁 Slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    // Handle the play command directly here
    if (interaction.commandName === "play") {
      const song = interaction.options.getString("query");
      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply('❌ You need to join a voice channel first!');
      }

      if (!song) {
        return interaction.reply('❌ Please provide a song name or URL to play.');
      }

      try {
        // Defer the reply immediately if it will take time to process
        await interaction.deferReply();

        // Play the song in the voice channel using DisTube
        const queue = await client.distube.play(voiceChannel, song, {
          textChannel: interaction.channel,
          member: interaction.member,
        });

        // Check if the song was successfully added to the queue
        if (queue) {
          return interaction.followUp(`🔄 Searching for your song: **${song}**`);
        } else {
          return interaction.followUp('❌ Failed to find the song.');
        }
      } catch (error) {
        console.error('Error in play command:', error);
        return interaction.followUp('❌ An error occurred while trying to play your song.');
      }
    } else {
      await command.execute(interaction);
    }
  } catch (error) {
    console.error("❌ Error in slash command:", error);
    await interaction.reply({ content: "❌ Failed to process your command.", ephemeral: true });
  }
});

// 🔁 Ready
client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await loadPrefixes();
  const slashCommands = await loadCommands();
  await registerCommands(slashCommands);
});

client.login(process.env.TOKEN).catch((err) => {
  console.error("❌ Failed to login:", err);
});
