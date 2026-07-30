export const DISCORD_WEBHOOK_MAX_ATTEMPTS = 10;
export const DISCORD_WEBHOOK_INITIAL_RETRY_DELAY_MS = 60_000;

type SendDiscordMessageOptions = {
	fetchImpl?: typeof fetch;
	sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function sendDiscordMessage(
	webhookUrl: string,
	content: string,
	{
		fetchImpl = fetch,
		sleep = defaultSleep,
	}: SendDiscordMessageOptions = {},
): Promise<void> {
	let lastError: unknown;

	for (
		let attempt = 1;
		attempt <= DISCORD_WEBHOOK_MAX_ATTEMPTS;
		attempt++
	) {
		try {
			const response = await fetchImpl(webhookUrl, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ content }),
			});

			if (response.ok) {
				return;
			}

			lastError = new Error(
				`Discord webhook returned ${response.status}: ${await response.text()}`,
			);
		} catch (error) {
			lastError = error;
		}

		if (attempt < DISCORD_WEBHOOK_MAX_ATTEMPTS) {
			const retryDelay =
				DISCORD_WEBHOOK_INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
			console.warn(
				`Discord webhook attempt ${attempt} failed; retrying in ${retryDelay / 1000}s`,
			);
			await sleep(retryDelay);
		}
	}

	throw new Error(
		`Discord webhook failed after ${DISCORD_WEBHOOK_MAX_ATTEMPTS} attempts`,
		{ cause: lastError },
	);
}
