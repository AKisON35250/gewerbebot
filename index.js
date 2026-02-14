require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

const { REST } = require("@discordjs/rest");
const express = require("express");
const fs = require("fs");

// ==========================
// EXPRESS SERVER (WICHTIG FÜR RENDER)
// ==========================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot läuft!");
});

app.listen(3000, () => {
  console.log("Webserver läuft auf Port 3000");
});

// ==========================
// ENV VARIABLEN
// ==========================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const CREATE_CHANNEL = process.env.CREATE_CHANNEL;
const CONTROL_CHANNEL = process.env.CONTROL_CHANNEL;
const STATUS_CHANNEL = process.env.STATUS_CHANNEL;

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ==========================
// DATEN LADEN
// ==========================

let data = {};

if (fs.existsSync("./data.json")) {
  data = JSON.parse(fs.readFileSync("./data.json"));
}

function saveData() {
  fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));
}

// ==========================
// EMBEDS
// ==========================

function createStatusEmbed() {
  let desc = "";

  for (let name in data) {
    const status = data[name].open ? "🟢 Offen" : "🔴 Geschlossen";
    desc += `**${name}** – ${status} (<@${data[name].owner}>)\n`;
  }

  if (!desc) desc = "Keine Gewerbe vorhanden.";

  return new EmbedBuilder()
    .setTitle("📋 Gewerbe Status")
    .setColor("Red")
    .setDescription(desc);
}

function createControlEmbed(name) {
  const status = data[name].open ? "🟢 Offen" : "🔴 Geschlossen";

  return new EmbedBuilder()
    .setTitle(`🏢 ${name}`)
    .setDescription(`Status: ${status}`)
    .setColor(data[name].open ? "Green" : "Red");
}

function createButtons(name) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_${name}`)
      .setLabel("🟢 Öffnen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`close_${name}`)
      .setLabel("🔴 Schließen")
      .setStyle(ButtonStyle.Danger)
  );
}

// ==========================
// STATUS MESSAGE UPDATE
// ==========================

async function updateStatusMessage() {
  const channel = await client.channels.fetch(STATUS_CHANNEL);
  const messages = await channel.messages.fetch({ limit: 10 });
  const botMsg = messages.find(m => m.author.id === client.user.id);

  if (botMsg) {
    await botMsg.edit({ embeds: [createStatusEmbed()] });
  } else {
    await channel.send({ embeds: [createStatusEmbed()] });
  }
}

// ==========================
// BOT READY
// ==========================

client.once("ready", async () => {
  console.log(`Bot online als ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("gewerbe_erstellen")
      .setDescription("Erstellt ein Gewerbe")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(opt =>
        opt.setName("name")
          .setDescription("Name des Gewerbes")
          .setRequired(true))
      .addUserOption(opt =>
        opt.setName("besitzer")
          .setDescription("Besitzer")
          .setRequired(true))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  await updateStatusMessage();
});

// ==========================
// INTERACTIONS
// ==========================

client.on("interactionCreate", async interaction => {

  // ==================
  // SLASH COMMAND
  // ==================

  if (interaction.isChatInputCommand()) {

    if (interaction.channel.id !== CREATE_CHANNEL)
      return interaction.reply({
        content: "Nur im Erstellen-Channel nutzbar!",
        ephemeral: true
      });

    const name = interaction.options.getString("name");
    const owner = interaction.options.getUser("besitzer");

    // Prüfen ob User schon ein Gewerbe besitzt
    const alreadyOwns = Object.values(data).find(g => g.owner === owner.id);

    if (alreadyOwns)
      return interaction.reply({
        content: "Dieser User besitzt bereits ein Gewerbe!",
        ephemeral: true
      });

    data[name] = {
      owner: owner.id,
      open: false
    };

    saveData();

    const controlChannel = await client.channels.fetch(CONTROL_CHANNEL);

    await controlChannel.send({
      content: `<@${owner.id}>`,
      embeds: [createControlEmbed(name)],
      components: [createButtons(name)]
    });

    await updateStatusMessage();

    return interaction.reply({
      content: `Gewerbe ${name} wurde erstellt!`,
      ephemeral: true
    });
  }

  // ==================
  // BUTTONS
  // ==================

  if (interaction.isButton()) {

    const [action, name] = interaction.customId.split("_");

    if (!data[name]) return;

    if (interaction.user.id !== data[name].owner)
      return interaction.reply({
        content: "Du bist nicht der Besitzer dieses Gewerbes!",
        ephemeral: true
      });

    if (action === "open") data[name].open = true;
    if (action === "close") data[name].open = false;

    saveData();

    await interaction.update({
      embeds: [createControlEmbed(name)],
      components: [createButtons(name)]
    });

    await updateStatusMessage();
  }
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);
