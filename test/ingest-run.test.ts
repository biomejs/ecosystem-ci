import { describe, expect, test } from "vitest";
import ingestWorker from "../dashboard/src/ingest-worker";
import {
	handleR2Event,
	ingestManifestObject,
	parseIncomingManifestKey,
	parseRawReport,
	parseRunManifest,
	repositorySlugFromReportKey,
	summarizeReport,
} from "../dashboard/src/lib/ingest";

const manifest = {
	schemaVersion: 1,
	githubRunId: 123,
	runAttempt: 2,
	biomeBranch: "main",
	biomeCommitSha: "a".repeat(40),
	status: "completed",
	startedAt: "2026-09-03T10:00:00.000Z",
	completedAt: "2026-09-03T10:05:00.000Z",
	targets: {
		"withastro/astro": {
			repositoryCommitSha: "b".repeat(40),
			jobStartedAt: "2026-09-03T10:01:00.000Z",
			jobCompletedAt: "2026-09-03T10:02:00.000Z",
			migrationOutcome: "succeeded_no_changes",
			executionStatus: "completed",
		},
	},
} as const;

const rawReport = {
	summary: {
		duration: 300,
		scannerDuration: 200,
		errors: 1,
		warnings: 0,
	},
	diagnostics: [
		{ category: "lint/style/useConst", severity: "error" },
		{ category: "lint/style/useConst", severity: "error" },
		{ category: "parse", severity: "error" },
	],
};

describe("run manifest ingestion", () => {
	test("accepts only authenticated, valid attempt uploads", async () => {
		const objects = new Map<string, ArrayBuffer>();
		const bucket = {
			async head(key: string) {
				return objects.has(key) ? { key } : null;
			},
			async put(key: string, value: ArrayBuffer) {
				objects.set(key, value);
				return { key };
			},
		};
		const env = {
			UPLOAD_TOKEN: "test-token",
			REPORTS: bucket as unknown as R2Bucket,
			DB: {} as D1Database,
		};
		const key = "runs/123/attempts/2/reports/withastro/astro.json";
		const unauthorized = await ingestWorker.fetch(
			new Request(`https://example.com/upload/${key}`, {
				method: "PUT",
				body: JSON.stringify(rawReport),
			}),
			env,
		);
		expect(unauthorized.status).toBe(401);

		const accepted = await ingestWorker.fetch(
			new Request(`https://example.com/upload/${key}`, {
				method: "PUT",
				headers: { Authorization: "Bearer test-token" },
				body: JSON.stringify(rawReport),
			}),
			env,
		);
		expect(accepted.status).toBe(201);
		expect(objects.has(key)).toBe(true);

		const retry = await ingestWorker.fetch(
			new Request(`https://example.com/upload/${key}`, {
				method: "PUT",
				headers: { Authorization: "Bearer test-token" },
				body: JSON.stringify(rawReport),
			}),
			env,
		);
		expect(retry.status).toBe(204);
	});

	test("parses manifests keyed by full repository slug", () => {
		expect(parseRunManifest(manifest)).toEqual(manifest);
		expect(() =>
			parseRunManifest({ ...manifest, targets: { astro: {} } }),
		).toThrow("not a repository slug");
	});

	test("derives run locations and repository slugs from R2 keys", () => {
		const location = parseIncomingManifestKey(
			"incoming/runs/123/attempts/2/manifest.json",
		);
		expect(location).toEqual({
			githubRunId: 123,
			runAttempt: 2,
			canonicalKey: "runs/123/attempts/2/manifest.json",
			reportsPrefix: "runs/123/attempts/2/reports/",
		});
		expect(
			repositorySlugFromReportKey(
				location?.reportsPrefix ?? "",
				"runs/123/attempts/2/reports/withastro/astro.json",
			),
		).toBe("withastro/astro");
	});

	test("summarizes valid reports and ignores error placeholders", () => {
		const parsedManifest = parseRunManifest(manifest);
		const report = parseRawReport(rawReport);
		if (!report) {
			throw new Error("Expected the report fixture to be valid");
		}
		const summary = summarizeReport(
			"withastro/astro",
			parsedManifest.targets["withastro/astro"],
			report,
			"runs/123/attempts/2/reports/withastro/astro.json",
		);
		expect(summary.report).toMatchObject({
			checkOutcome: "failed",
			jobDurationMs: 60_000,
			checkDurationNs: 300,
		});
		expect(summary.diagnostics).toEqual([
			{
				repositorySlug: "withastro/astro",
				kind: "rule",
				severity: "error",
				category: "lint/style/useConst",
				count: 2,
			},
			{
				repositorySlug: "withastro/astro",
				kind: "parse",
				severity: "error",
				category: "parse",
				count: 1,
			},
		]);
		expect(parseRawReport({ error: true })).toBeNull();
	});

	test("writes D1, promotes the manifest, and removes the incoming copy", async () => {
		const incomingKey = "incoming/runs/123/attempts/2/manifest.json";
		const reportKey = "runs/123/attempts/2/reports/withastro/astro.json";
		const objects = new Map<string, string>([
			[incomingKey, JSON.stringify(manifest)],
			[reportKey, JSON.stringify(rawReport)],
		]);
		const batches: unknown[][] = [];
		const bucket = {
			async get(key: string) {
				const text = objects.get(key);
				if (text === undefined) return null;
				return {
					key,
					httpMetadata: { contentType: "application/json" },
					customMetadata: {},
					async text() {
						return text;
					},
					async arrayBuffer() {
						return new TextEncoder().encode(text).buffer;
					},
				};
			},
			async head(key: string) {
				return objects.has(key) ? { key } : null;
			},
			async list({ prefix }: { prefix: string }) {
				return {
					objects: [...objects.keys()]
						.filter((key) => key.startsWith(prefix))
						.map((key) => ({ key })),
					delimitedPrefixes: [],
					truncated: false,
				};
			},
			async put(key: string, value: ArrayBuffer) {
				objects.set(key, new TextDecoder().decode(value));
				return { key };
			},
			async delete(key: string) {
				objects.delete(key);
			},
		};
		const db = {
			prepare(query: string) {
				return {
					bind(...values: unknown[]) {
						return { query, values };
					},
				};
			},
			async batch(statements: unknown[]) {
				batches.push(statements);
				return statements.map(() => ({ success: true }));
			},
		};
		const env = {
			DB: db as unknown as D1Database,
			REPORTS: bucket as unknown as R2Bucket,
		};

		await expect(ingestManifestObject(incomingKey, env)).resolves.toEqual({
			status: "ingested",
			reportCount: 1,
		});
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(4);
		expect(objects.has(incomingKey)).toBe(false);
		expect(objects.get("runs/123/attempts/2/manifest.json")).toBe(
			JSON.stringify(manifest),
		);
	});

	test("ignores unrelated R2 events", async () => {
		const env = {} as CloudflareEnv;
		await expect(
			handleR2Event(
				{
					action: "DeleteObject",
					bucket: "biome-ecosystem-ci-reports",
					object: { key: "anything" },
					eventTime: "2026-09-03T10:00:00.000Z",
				},
				env,
			),
		).resolves.toEqual({ status: "ignored", reportCount: 0 });
	});
});
