import fs from "node:fs";
import { DISCORD_MESSAGE_MAX_LENGTH } from "./aggregate-outcomes.ts";
import { sendDiscordMessage } from "./discord-webhook.ts";

const messagesPath = process.argv[2];
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!messagesPath) {
	throw new Error("Usage: send-discord-messages.ts <messages.json>");
}

if (!webhookUrl) {
	throw new Error("DISCORD_WEBHOOK_URL is required");
}

const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8")) as unknown;

if (
	!Array.isArray(messages) ||
	messages.length === 0 ||
	!messages.every(
		(message) =>
			typeof message === "string" &&
			message.length > 0 &&
			message.length <= DISCORD_MESSAGE_MAX_LENGTH,
	)
) {
	throw new Error(
		`Expected a non-empty JSON array of messages no longer than ${DISCORD_MESSAGE_MAX_LENGTH} characters`,
	);
}

for (const content of messages) {
	await sendDiscordMessage(webhookUrl, content);
}
