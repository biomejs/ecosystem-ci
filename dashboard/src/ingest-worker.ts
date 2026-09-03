import {
	handleR2Event,
	parseIncomingManifestKey,
	parseRawReport,
	parseRunManifest,
	type R2EventNotification,
	repositorySlugFromReportKey,
} from "./lib/ingest.js";

interface IngestEnv extends CloudflareEnv {
	UPLOAD_TOKEN: string;
}

async function upload(request: Request, env: IngestEnv): Promise<Response> {
	if (!env.UPLOAD_TOKEN) {
		return new Response("Upload is not configured", { status: 503 });
	}
	if (request.headers.get("Authorization") !== `Bearer ${env.UPLOAD_TOKEN}`) {
		return new Response("Unauthorized", {
			status: 401,
			headers: { "WWW-Authenticate": "Bearer" },
		});
	}

	const pathname = new URL(request.url).pathname;
	if (!pathname.startsWith("/upload/")) {
		return new Response("Not found", { status: 404 });
	}
	const key = pathname.slice("/upload/".length);
	const manifestLocation = parseIncomingManifestKey(key);
	const reportMatch = key.match(
		/^runs\/(\d+)\/attempts\/(\d+)\/reports\/[^/]+\/[^/]+\.json$/,
	);

	const bytes = await request.arrayBuffer();
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return new Response("Body must be valid JSON", { status: 400 });
	}

	if (manifestLocation) {
		try {
			const manifest = parseRunManifest(value);
			if (
				manifest.githubRunId !== manifestLocation.githubRunId ||
				manifest.runAttempt !== manifestLocation.runAttempt
			) {
				return new Response("Manifest identity does not match its path", {
					status: 400,
				});
			}
		} catch (error) {
			return new Response(
				error instanceof Error ? error.message : "Invalid manifest",
				{
					status: 400,
				},
			);
		}
	} else if (reportMatch) {
		const prefix = `runs/${reportMatch[1]}/attempts/${reportMatch[2]}/reports/`;
		if (!repositorySlugFromReportKey(prefix, key) || !parseRawReport(value)) {
			return new Response("Invalid report", { status: 400 });
		}
	} else {
		return new Response("Unsupported object key", { status: 404 });
	}

	// Attempt objects are immutable. Publisher retries may reuse them, but not replace them.
	if (
		(await env.REPORTS.head(key)) ||
		(manifestLocation &&
			(await env.REPORTS.head(manifestLocation.canonicalKey)))
	) {
		return new Response(null, { status: 204 });
	}
	const created = await env.REPORTS.put(key, bytes, {
		onlyIf: { etagDoesNotMatch: "*" },
		httpMetadata: { contentType: "application/json" },
	});
	return new Response(null, { status: created ? 201 : 204 });
}

export default {
	async fetch(request, env) {
		if (request.method !== "PUT") {
			return new Response("Not found", { status: 404 });
		}
		return upload(request, env);
	},

	async queue(batch, env) {
		for (const message of batch.messages) {
			try {
				const result = await handleR2Event(message.body, env);
				console.info(
					`Ingestion ${result.status}: ${message.body.object.key} (${result.reportCount} reports)`,
				);
				message.ack();
			} catch (error) {
				console.error(
					`Ingestion failed for message ${message.id}`,
					error instanceof Error ? error.message : error,
				);
				message.retry();
			}
		}
	},
} satisfies ExportedHandler<IngestEnv, R2EventNotification>;
