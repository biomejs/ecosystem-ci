import { describe, expect, test, vi } from "vitest";
import { githubCollection, resolveGitHubToken } from "./import-ci-runs";

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

test("collects report and metadata artifacts beyond the first GitHub page", async () => {
	const firstPage = Array.from({ length: 100 }, (_, id) => ({ id }));
	const fetchMock = vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(Response.json({ artifacts: firstPage }))
		.mockResolvedValueOnce(Response.json({ artifacts: [{ id: 100 }] }));
	try {
		expect(
			await githubCollection(
				"/repos/biomejs/ecosystem-ci/actions/runs/123/artifacts",
				"artifacts",
			),
		).toHaveLength(101);
		expect(fetchMock.mock.calls[1][0]).toContain("page=2");
	} finally {
		fetchMock.mockRestore();
	}
});
