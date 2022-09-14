import { ActivityType, Client, GatewayIntentBits } from "discord.js";

import path from "path";

import * as mysql from "mysql";
import YAML from 'yaml'
import { colors, error, info, warn, wrap } from "discord_bots_common";

import dotenv from 'dotenv'; // evironment vars
import fs from 'fs';
import { updateAllRanks } from "./role_utils";
import { DKRCommands } from "dkrcommands";
import { getServerStatus } from "./status_utils";

dotenv.config();

export let tableName: string;
export let getAllQuery: string;
export let chatActivityRatio: number;
export let gameActivityRatio: number;
export let dbConnection: mysql.Connection;
export let minecraftServerUrl = process.env.LOOKUP_SERVER || "";
minecraftServerUrl = minecraftServerUrl.replace("http://", "");
minecraftServerUrl = minecraftServerUrl.replace("https://", "");

const client = new Client({
    rest: {
        timeout: 60000,
        retries: 3
    },
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

client.on("ready", () => {

    if (!process.env.TEST_SERVERS) {
        warn(`${wrap("TEST_SERVERS", colors.LIGHT_YELLOW)} environment variable is not set, can't proceed`);
        process.exit(1);
    }

    new DKRCommands(client, {
        commandsDir: path.join(__dirname, 'commands'),
        typeScript: true,
        botOwners: process.env.OWNERS?.split(","),
        testServers: process.env.TEST_SERVERS?.split(",")
    });
    
    info(`${wrap("💁 Client ready", colors.LIGHT_YELLOW)}`);

    if (!fs.existsSync(process.env.CONFIG_PATH || "")) {
        error(`invalid config path!`);
        process.exit(1);
    }

    if (!minecraftServerUrl) {
        warn(`${wrap("LOOKUP_SERVER", colors.LIGHT_YELLOW)} environment variable is not set, will not display server player count`);
    }

    const data = YAML.parse(fs.readFileSync(process.env.CONFIG_PATH!).toString());
    chatActivityRatio = data.chatActivityRatio || 0;
    gameActivityRatio = data.gameActivityRatio || 0;

    if (!data.db.host || !data.db.port || !data.db.dbName || !data.db.login || !data.db.password || !data.tableName) {
        error(`invalid database config!`);
        process.exit(1);
    }

    tableName = data.tableName;
    getAllQuery = `SELECT ds_id, group_concat(nickname separator ', ') as nickname, SUM(chat_activity) as chat_activity, SUM(game_activity) as game_activity FROM ${tableName} WHERE ds_id IS NOT null GROUP BY ds_id`;

    dbConnection = mysql.createConnection({
        host: data.db.host,
        port: parseInt(data.db.port),
        database: data.db.dbName,
        user: data.db.login,
        password: data.db.password
    });

    info(`🔶 Connecting to the MySQL db ${wrap(data.db.dbName, colors.LIGHTER_BLUE)}`);
    dbConnection.connect(function (err) {
        if (err) {
            error(err);
            process.exit(2);
        }
        info(`🟩 Connected to the MySQL db ${wrap(data.db.dbName, colors.LIGHTER_BLUE)} on ${wrap(data.db.host, colors.LIGHT_GREEN)}`);
    });

    // every 10 minutes
    setInterval(async function () {

        info(wrap("Updating presence", colors.PURPLE));

        let status = await getServerStatus();
        if(status) {
            client.user?.setPresence({
                status: 'online',
                activities: [{
                    name: `${status.players.online}/${status.players.max} players online`,
                    url: `https://${minecraftServerUrl}`
                }]
            });
        }      

        // update ranks
        updateAllRanks(client);
    }, parseInt(process.env.RANK_UPDATE_INTERVAL_MINUTES || "10") * 60 * 1000);
});

client.login(process.env.TOKEN);
