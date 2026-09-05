import { afterEach, describe, expect, test, vi } from "vitest";
import ingestWorker from "../ingest/src";
import {
	handleR2Event,
	ingestManifestObject,
	parseIncomingManifestKey,
	parseR2EventNotification,
	parseRawReport,
	parseReportObjectKey,
	parseRunManifest,
	repositorySlugFromReportKey,
	summarizeReport,
	timingSamplesFor,
} from "../ingest/src/ingest";

const timingSamples = [
	{ ordinal: 1, checkDurationNs: 320, scannerDurationNs: 210 },
	{ ordinal: 2, checkDurationNs: 300, scannerDurationNs: 200 },
] as const;

const manifest = {
	schemaVersion: 2,
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
			timingSamples,
		},
	},
} as const;

const legacyManifest = {
	...manifest,
	schemaVersion: 1,
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
	afterEach(() => {
		vi.restoreAllMocks();
	});

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
		expect(parseRunManifest(legacyManifest)).toEqual(legacyManifest);
		expect(() =>
			parseRunManifest({
				...manifest,
				targets: {
					"withastro/astro": {
						...manifest.targets["withastro/astro"],
						timingSamples: [timingSamples[0], timingSamples[0]],
					},
				},
			}),
		).toThrow("Timing sample ordinals must be unique");
		expect(() =>
			parseRunManifest({ ...manifest, targets: { astro: {} } }),
		).toThrow();
		expect(() =>
			parseRunManifest({
				...manifest,
				completedAt: "2026-09-03T09:59:00.000Z",
			}),
		).toThrow("Run completed before it started");
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
		expect(
			parseReportObjectKey("runs/123/attempts/2/reports/withastro/astro.json"),
		).toEqual({
			githubRunId: 123,
			runAttempt: 2,
			repositorySlug: "withastro/astro",
			reportsPrefix: "runs/123/attempts/2/reports/",
		});
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
		});
		expect(summary.report).not.toHaveProperty("checkDurationNs");
		expect(summary.samples).toEqual([
			{
				repositorySlug: "withastro/astro",
				ordinal: 1,
				checkDurationNs: 320,
				scannerDurationNs: 210,
			},
			{
				repositorySlug: "withastro/astro",
				ordinal: 2,
				checkDurationNs: 300,
				scannerDurationNs: 200,
			},
		]);
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
		expect(
			parseRawReport({
				...rawReport,
				summary: { ...rawReport.summary, errors: -1 },
			}),
		).toBeNull();
	});

	test("uses the report summary as the single sample without manifest samples", () => {
		const report = parseRawReport(rawReport);
		if (!report) throw new Error("Expected the report fixture to be valid");
		const target = parseRunManifest(legacyManifest).targets["withastro/astro"];
		expect(timingSamplesFor("withastro/astro", target, report)).toEqual([
			{ ordinal: 1, checkDurationNs: 300, scannerDurationNs: 200 },
		]);
		expect(
			timingSamplesFor(
				"withastro/astro",
				{ ...target, timingSamples: [] },
				report,
			),
		).toEqual([{ ordinal: 1, checkDurationNs: 300, scannerDurationNs: 200 }]);
	});

	test("orders manifest samples by ordinal and warns when the report is not among them", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const report = parseRawReport(rawReport);
		if (!report) throw new Error("Expected the report fixture to be valid");
		const target = parseRunManifest(manifest).targets["withastro/astro"];
		expect(
			timingSamplesFor(
				"withastro/astro",
				{ ...target, timingSamples: [timingSamples[1], timingSamples[0]] },
				report,
			).map((sample) => sample.ordinal),
		).toEqual([1, 2]);
		expect(warn).not.toHaveBeenCalled();

		timingSamplesFor(
			"withastro/astro",
			{
				...target,
				timingSamples: [
					{ ordinal: 1, checkDurationNs: 999, scannerDurationNs: 999 },
				],
			},
			report,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("withastro/astro"),
		);
	});

	test("validates R2 event notification bodies", () => {
		expect(
			parseR2EventNotification({
				account: "account-id",
				action: "PutObject",
				bucket: "biome-ecosystem-ci-reports",
				object: { key: "incoming/runs/123/attempts/2/manifest.json" },
				eventTime: "2026-09-03T10:05:00.000Z",
			}),
		).toMatchObject({ action: "PutObject" });
		expect(() => parseR2EventNotification({ action: "PutObject" })).toThrow();
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
		expect(batches[0]).toHaveLength(5);
		const [, , insertResults, insertSamples] = batches[0] as Array<{
			query: string;
			values: unknown[];
		}>;
		expect(insertResults.query).not.toContain("check_duration_ns");
		expect(insertSamples.query).toContain("INSERT INTO check_samples");
		expect(JSON.parse(insertSamples.values[0] as string)).toHaveLength(2);
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
					account: "account-id",
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
