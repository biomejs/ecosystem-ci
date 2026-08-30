import { describe, expect, test } from "bun:test";
import { resolveGitHubToken } from "./import-ci-runs";

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
