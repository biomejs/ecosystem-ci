import { describe, expect, test } from "vitest";
import { loadManifest, resolveGitHubToken } from "./import-ci-runs";

describe("resolveGitHubToken", () => {
	test("prefers GITHUB_TOKEN over every other source", async () => {
		const token = await resolveGitHubToken(
			{ GITHUB_TOKEN: "github-token", GH_TOKEN: "gh-token" },
			async () => "cli-token",
		);

		expect(token).toBe("github-token");
	});

	test("uses GH_TOKEN when GITHUB_TOKEN is absent", async () => {
		const token = await resolveGitHubToken(
			{ GH_TOKEN: "gh-token" },
			async () => "cli-token",
		);

		expect(token).toBe("gh-token");
	});

	test("asks the GitHub CLI when environment tokens are absent", async () => {
		const token = await resolveGitHubToken({}, async () => " cli-token\n");

		expect(token).toBe("cli-token");
	});

	test("continues without authentication when the GitHub CLI is unavailable", async () => {
		const token = await resolveGitHubToken({}, async () => {
			throw new Error("not authenticated");
		});

		expect(token).toBeUndefined();
	});
});

describe("loadManifest", () => {
	test("starts empty when the generated manifest is absent", async () => {
		const manifest = await loadManifest("workflow-id", async () => {
			throw Object.assign(new Error("missing"), { code: "ENOENT" });
		});

		expect(manifest).toEqual({ workflow: "workflow-id", runs: [] });
	});

	test("does not hide other read failures", async () => {
		expect(
			loadManifest("workflow-id", async () => {
				throw Object.assign(new Error("denied"), { code: "EACCES" });
			}),
		).rejects.toThrow("denied");
	});
});
