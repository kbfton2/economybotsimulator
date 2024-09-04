require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, EmbedBuilder, REST, Routes, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Failed to connect to MongoDB', err));

const companySchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    amount: { type: Number, required: true }
});

const Company = mongoose.model('Company', companySchema);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageTyping
    ]
});

const ADMIN_ROLE_NAME = 'Stock Management Staff';
let gdp = 1748515000;
let realtimeInterval = null;
let lastRealtimeMessageId = null;

const sendStartupMessages = async () => {
    const channels = client.channels.cache.filter(channel => channel.isTextBased());
    if (channels.size === 0) {
        console.error('No text channels found');
        return;
    }
    const channel = channels.first();
    await channel.send('Bot has started and is ready to use!');
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    registerCommands();
    sendStartupMessages();
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        const { commandName, options } = interaction;
        const hasRole = interaction.member.roles.cache.some(role => role.name === ADMIN_ROLE_NAME);

        if (!hasRole) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            switch (commandName) {
                case 'stockmarket':
                    await sendStockMarketMessage(interaction);
                    break;
                case 'addcompany':
                    await addCompany(interaction, options);
                    break;
                case 'removecompany':
                    await removeCompany(interaction, options);
                    break;
                case 'adjuststock':
                    await adjustStock(interaction, options);
                    break;
                case 'collapse':
                    await collapseMarket(interaction);
                    break;
                case 'restore':
                    await restoreMarket(interaction);
                    break;
                case 'editamount':
                    await editCompanyAmount(interaction, options);
                    break;
                case 'companyinfo':
                    await companyInfo(interaction, options);
                    break;
                case 'setgdp':
                    await setGDP(interaction, options);
                    break;
                case 'realtime':
                    await startRealTimeStockMarket(interaction);
                    break;
                default:
                    await interaction.editReply({ content: 'Unknown command.', ephemeral: true });
                    break;
            }
        } catch (error) {
            console.error('Error processing command:', error);
            await interaction.editReply({ content: 'An error occurred while processing the command.', ephemeral: true });
        }
    } else if (interaction.isButton()) {
        try {
            await interaction.deferUpdate();

            switch (interaction.customId) {
                case 'view_status':
                    await sendStatusEmbed(interaction);
                    break;
                case 'collapse_market':
                    await collapseMarket(interaction);
                    break;
                case 'restore_market':
                    await restoreMarket(interaction);
                    break;
                default:
                    console.log(`Unhandled button: ${interaction.customId}`);
                    break;
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
        }
    }
});

const registerCommands = async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    const commands = [
        { name: 'stockmarket', description: 'View stock market overview' },
        { 
            name: 'addcompany', 
            description: 'Add a new company to the stock market', 
            options: [
                { type: 3, name: 'name', description: 'Company name', required: true },
                { type: 4, name: 'price', description: 'Naeryla Stock Price', required: true },
                { type: 4, name: 'amount', description: 'Naeryla Percentage Ownership', required: true }
            ] 
        },
        { 
            name: 'removecompany', 
            description: 'Remove a company from the stock market', 
            options: [{ type: 3, name: 'name', description: 'Company name', required: true }] 
        },
        { 
            name: 'adjuststock', 
            description: 'Adjust the Naeryla Stock Price of a company', 
            options: [
                { type: 3, name: 'name', description: 'Company name', required: true },
                { type: 4, name: 'adjustment', description: 'Amount to adjust', required: true }
            ] 
        },
        { name: 'collapse', description: 'Collapse the market' },
        { name: 'restore', description: 'Restore the market' },
        { 
            name: 'editamount', 
            description: 'Edit the Naeryla Percentage Ownership of a company', 
            options: [
                { type: 3, name: 'name', description: 'Company name', required: true },
                { type: 4, name: 'amount', description: 'New Naeryla Percentage Ownership', required: true }
            ] 
        },
        { 
            name: 'companyinfo', 
            description: 'Get detailed information about a company', 
            options: [{ type: 3, name: 'name', description: 'Company name', required: true }] 
        },
        { 
            name: 'setgdp', 
            description: 'Set the GDP value', 
            options: [{ type: 4, name: 'value', description: 'New GDP value', required: true }] 
        },
        { name: 'realtime', description: 'Start real-time stock market updates' }
    ];

    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Slash commands registered');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
};

const sendStockMarketMessage = async (interaction) => {
    const row = new ActionRowBuilder()
        .addComponents(
            // Can you put 3 of those things in? Or does node.js don't have that func?
            new ButtonBuilder()
                .setCustomId('view_status')
                .setLabel('View Market Status')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('collapse_market')
                .setLabel('Collapse Market')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('restore_market')
                .setLabel('Restore Market')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('📈 Naerylan Stock Market Overview')
        .setDescription('Welcome to the Naerylan Stock Market! Use the buttons below to interact with the market.')
        .setColor('#1E90FF')
        .setThumbnail('https://example.com/stock-market-thumbnail.png') // Replace some of those icons as they're not found
        .setFooter({ text: 'Official Naeryla Stockmarket Bot', iconURL: 'https://example.com/bot-icon.png' }) // This one also.
        .setTimestamp(); // Need to know what this function do

    await interaction.editReply({ embeds: [embed], components: [row] });
};

const sendStatusEmbed = async (interaction) => {
    const embed = new EmbedBuilder()
        .setTitle('📊 Naerylan Economic Status')
        .setDescription(`**Current GDP:** $${gdp.toFixed(2)}\n\nCompany Overview:`)
        .setColor('#32CD32')
        .setFooter({ text: 'Official Naeryla Stockmarket Bot', iconURL: 'https://example.com/bot-icon.png' })
        .setTimestamp();

    const companies = await Company.find({});
    if (companies.length === 0) {
        embed.addFields({
            name: 'No Companies',
            value: 'There are currently no companies listed in the stock market.',
        });
    } else {
        companies.forEach(company => {
            const naerylaPercentageOwnership = company.amount;
            const naerylaStockPrice = company.price;
            const naerylaGroupings = Math.round((naerylaPercentageOwnership / 100) * (gdp / naerylaStockPrice));
            const totalEconomicAmount = (naerylaStockPrice * (naerylaPercentageOwnership / 100)).toFixed(2);

            embed.addFields({
                name: company.name,
                value: `Naeryla Stock Price: $${naerylaStockPrice.toFixed(2)}\nNaeryla Percentage Ownership: ${naerylaPercentageOwnership}%\nNaeryla Groupings: ${naerylaGroupings}\nTotal Economic Amount: $${totalEconomicAmount}`,
                /* on fucking god dawg pls break your fucking line in code 
                bc my eyes are bleeding rn
                */
            });
        });
    }

    await interaction.followUp({ embeds: [embed] });
};

const addCompany = async (interaction, options) => {
    const name = options.getString('name');
    const price = options.getInteger('price');
    const amount = options.getInteger('amount');

    if (price <= 0 || amount <= 0 || amount > 100) {
        return interaction.editReply({ content: 'Invalid price or amount. Please ensure the price and amount are positive numbers and the amount does not exceed 100%.', ephemeral: true });
    }

    const totalWorth = await calculateTotalWorth();
    const companyTotalWorth = amount * price;
    if (totalWorth + companyTotalWorth > gdp) {
        return interaction.editReply({ content: 'Adding this company would exceed the world GDP. Please adjust the values.', ephemeral: true });
    }

    const company = new Company({ name, price, amount });
    await company.save();
    await interaction.editReply({ content: `Company **${name}** has been added to the stock market.`, ephemeral: true });
};

const removeCompany = async (interaction, options) => {
    const name = options.getString('name');
    const company = await Company.findOne({ name });
    if (!company) {
        return interaction.editReply({ content: `Company **${name}** does not exist.`, ephemeral: true });
    }
    await company.remove();
    await interaction.editReply({ content: `Company **${name}** has been removed from the stock market.`, ephemeral: true });
};

const adjustStock = async (interaction, options) => {
    const name = options.getString('name');
    const adjustment = options.getInteger('adjustment');

    const company = await Company.findOne({ name });
    if (!company) {
        return interaction.editReply({ content: `Company **${name}** does not exist.`, ephemeral: true });
    }

    company.price += adjustment;
    await company.save();
    await interaction.editReply({ content: `The stock price of **${name}** has been adjusted by ${adjustment}. New price: $${company.price}.`, ephemeral: true });
};

const collapseMarket = async (interaction) => {
    const companies = await Company.find({});
    companies.forEach(async company => {
        company.price *= 0.5;
        await company.save();
    });
    await interaction.editReply({ content: 'The market has collapsed. All stock prices have been halved.', ephemeral: true });
};

const restoreMarket = async (interaction) => {
    const companies = await Company.find({});
    companies.forEach(async company => {
        company.price *= 2;
        await company.save();
    });
    await interaction.editReply({ content: 'The market has been restored. All stock prices have been doubled.', ephemeral: true });
};

const editCompanyAmount = async (interaction, options) => {
    const name = options.getString('name');
    const amount = options.getInteger('amount');

    const company = await Company.findOne({ name });
    if (!company) {
        return interaction.editReply({ content: `Company **${name}** does not exist.`, ephemeral: true });
    }

    const totalWorth = await calculateTotalWorth();
    const companyTotalWorth = amount * company.price;
    if (totalWorth - company.amount * company.price + companyTotalWorth > gdp) {
        return interaction.editReply({ content: 'Updating this company would exceed the world GDP. Please adjust the values.', ephemeral: true });
    }

    company.amount = amount;
    await company.save();
    await interaction.editReply({ content: `The Naeryla Percentage Ownership of **${name}** has been updated to ${amount}%.`, ephemeral: true });
};

const companyInfo = async (interaction, options) => {
    const name = options.getString('name');
    const company = await Company.findOne({ name });
    if (!company) {
        return interaction.editReply({ content: `Company **${name}** does not exist.`, ephemeral: true });
    }

    const naerylaGroupings = Math.round((company.amount / 100) * (gdp / company.price));
    const totalEconomicAmount = (company.price * (company.amount / 100)).toFixed(2);

    await interaction.editReply({
        content: `**${company.name}**\n\nNaeryla Stock Price: $${company.price.toFixed(2)}\nNaeryla Percentage Ownership: ${company.amount}%\nNaeryla Groupings: ${naerylaGroupings}\nTotal Economic Amount: $${totalEconomicAmount}`,
        ephemeral: true
    });
};

const setGDP = async (interaction, options) => {
    const value = options.getInteger('value');
    gdp = value;
    await interaction.editReply({ content: `GDP has been updated to $${gdp}.`, ephemeral: true });
};

const startRealTimeStockMarket = async (interaction) => {
    if (realtimeInterval) {
        clearInterval(realtimeInterval);
        realtimeInterval = null;
    }

    realtimeInterval = setInterval(async () => {
        const channel = interaction.channel;
        const embed = new EmbedBuilder()
            .setTitle('📊 Naerylan Global Stock Status')
            .setDescription(`Current GDP: $${gdp.toFixed(2)}\n\nCompany Updates:`)
            .setColor('#FFD700')
            .setFooter({ text: 'Official Naeryla Stockmarket Bot', iconURL: 'https://example.com/bot-icon.png' })
            .setTimestamp();

        const companies = await Company.find({});
        companies.forEach(company => {
            const slightChange = 1 + ((Math.random() - 0.5) / 10000);
            company.price *= slightChange;
            company.save();

            const naerylaGroupings = Math.round((company.amount / 100) * (gdp / company.price));
            const totalEconomicAmount = (company.price * (company.amount / 100)).toFixed(2);

            embed.addFields({
                name: company.name,
                value: `Naeryla Stock Price: $${company.price.toFixed(5)}\nNaeryla Percentage Ownership: ${company.amount}%\nNaeryla Groupings: ${naerylaGroupings}\nTotal Economic Amount: $${totalEconomicAmount}`,
            });
        });

        if (lastRealtimeMessageId) {
            const lastMessage = await channel.messages.fetch(lastRealtimeMessageId);
            if (lastMessage) await lastMessage.delete();
        }

        const message = await channel.send({ embeds: [embed] });
        lastRealtimeMessageId = message.id;
    }, 5000);

    await interaction.editReply({ content: 'Real-time stock market updates have started.', ephemeral: true });
};

const calculateTotalWorth = async () => {
    const companies = await Company.find({});
    let totalWorth = 0;
    companies.forEach(company => {
        totalWorth += company.price * company.amount;
    });
    return totalWorth;
};

client.login(process.env.BOT_TOKEN);
