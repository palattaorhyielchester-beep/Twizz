require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  SlashCommandBuilder, 
  REST, 
  Routes 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

const entrantsMap = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway')
    .addStringOption(option => 
      option.setName('prize')
        .setDescription('Prize name')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('winners')
        .setDescription('Number of winners')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('requirements')
        .setDescription('Giveaway requirements')
        .setRequired(false))
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') {
    const prize = interaction.options.getString('prize');
    const durationMinutes = interaction.options.getInteger('duration');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const requirements = interaction.options.getString('requirements') || 'None';

    const endTimeUnix = Math.floor((Date.now() + durationMinutes * 60 * 1000) / 1000);

    const buildEmbed = (entries = 0) => {
      return new EmbedBuilder()
        .setTitle(`🎉 ${prize.toUpperCase()}`)
        .setDescription(
          `🏆 **Winners**\n${winnerCount}\n` +
          `🙋 **Entries**\n${entries}\n` +
          `👤 **Hosted By**\n${interaction.user}\n` +
          `⏳ **Ends**\n<t:${endTimeUnix}:R>\n` +
          `📋 **Requirements**\n• ${requirements}`
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setColor('#2B2D31')
        .setFooter({ text: `TWIZZ | Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` });
    };

    const enterButton = new ButtonBuilder()
      .setCustomId('enter_giveaway')
      .setLabel('Enter Giveaway')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success);

    const viewButton = new ButtonBuilder()
      .setCustomId('view_entrants')
      .setLabel('View Entrants')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(enterButton, viewButton);

    const message = await interaction.reply({
      embeds: [buildEmbed(0)],
      components: [row],
      fetchReply: true,
    });

    entrantsMap.set(message.id, new Set());

    setTimeout(async () => {
      const entrants = Array.from(entrantsMap.get(message.id) || []);
      entrantsMap.delete(message.id);

      let winnerText = 'No valid entrants.';
      if (entrants.length > 0) {
        const shuffled = entrants.sort(() => 0.5 - Math.random());
        const winners = shuffled.slice(0, Math.min(winnerCount, shuffled.length));
        winnerText = winners.map(id => `<@${id}>`).join(', ');
      }

      const endedEmbed = new EmbedBuilder()
        .setTitle(`🎉 ${prize.toUpperCase()}`)
        .setDescription(
          `🏆 **Winners**\n${winnerText}\n` +
          `🙋 **Entries**\n${entrants.length}\n` +
          `👤 **Hosted By**\n${interaction.user}\n` +
          `⏳ **Ends**\nEnded`
        )
        .setColor('#ED4245')
        .setFooter({ text: `TWIZZ | Ended` });

      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(enterButton).setDisabled(true),
        ButtonBuilder.from(viewButton).setDisabled(true)
      );

      await interaction.editReply({
        embeds: [endedEmbed],
        components: [disabledRow],
      });

      if (entrants.length > 0) {
        await interaction.followUp(`Congratulations ${winnerText}! You won **${prize}**! 🎉`);
      }
    }, durationMinutes * 60 * 1000);
  }

  if (interaction.isButton()) {
    const messageId = interaction.message.id;
    const entrants = entrantsMap.get(messageId);

    if (interaction.customId === 'view_entrants') {
      if (!entrants || entrants.size === 0) {
        return interaction.reply({ content: 'There are currently no entrants.', ephemeral: true });
      }
      const list = Array.from(entrants).map(id => `<@${id}>`).join(', ');
      return interaction.reply({ content: `**Current Entrants (${entrants.size}):**\n${list}`, ephemeral: true });
    }

    if (interaction.customId === 'enter_giveaway') {
      if (!entrants) {
        return interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true });
      }

      if (entrants.has(interaction.user.id)) {
        entrants.delete(interaction.user.id);
        await interaction.reply({ content: 'You left the giveaway!', ephemeral: true });
      } else {
        entrants.add(interaction.user.id);
        await interaction.reply({ content: 'You successfully entered the giveaway! 🎉', ephemeral: true });
      }

      const originalDescription = interaction.message.embeds[0].description;
      const updatedDescription = originalDescription.replace(/🙋 \*\*Entries\*\*\n\d+/, `🙋 **Entries**\n${entrants.size}`);

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(updatedDescription);

      await interaction.message.edit({ embeds: [updatedEmbed] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
