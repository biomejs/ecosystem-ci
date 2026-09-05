import axe from "axe-core";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { summarizeSamples } from "$lib/timing";
import "../../app.css";
import Compare from "./+page.svelte";
import type { PageData } from "./$types";

const location = vi.hoisted(() => ({
	url: new URL("https://example.test/compare?base=1&head=2&view=ranges"),
}));
vi.mock("$app/state", () => ({ page: location }));

const runs = [1, 2].map((id) => ({
	githubRunId: id,
	biomeBranch: id === 1 ? "main" : "feature",
	biomeCommitSha: String(id).repeat(40),
	startedAt: "2026-08-25T10:00:00Z",
	results: 1,
}));
const observation = {
	check: summarizeSamples([10, 20, 30]),
	scanner: summarizeSamples([1, 2, 3]),
	errors: 5,
	warnings: 2,
	infos: 0,
	parseDiagnostics: 1,
	panics: 0,
};
const data: PageData = {
	runs,
	base: runs[0],
	head: runs[1],
	comparisons: [
		{
			repositorySlug: "biomejs/biome",
			base: observation,
			head: { ...observation, check: summarizeSamples([20, 30, 40]) },
		},
	],
};

afterEach(() => {
	delete document.documentElement.dataset.theme;
});

test("both timing views retain accessible charts and labelled metrics in both themes", async () => {
	for (const view of ["ranges", "shift"]) {
		location.url = new URL(
			`https://example.test/compare?base=1&head=2&view=${view}`,
		);
		for (const theme of ["light", "dark"]) {
			document.documentElement.dataset.theme = theme;
			for (const width of [320, 1440]) {
				await page.viewport(width, 1000);
				const screen = await render(Compare, { data });
				await expect
					.element(
						screen.getByRole("heading", { name: "Compare runs", exact: true }),
					)
					.toBeVisible();
				const main = screen.getByRole("main").element();
				expect(main.querySelector('input[name="view"]')).toHaveValue(view);
				expect(main.querySelectorAll("svg")).toHaveLength(2);
				expect(main.querySelectorAll("dt")).toHaveLength(5);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
					window.innerWidth,
				);
				expect((await axe.run(main)).violations).toEqual([]);
				const switcher = screen.getByRole("navigation", {
					name: "Timing chart",
				});
				for (const link of switcher.element().querySelectorAll("a")) {
					const url = new URL(link.href);
					expect(url.searchParams.get("base")).toBe("1");
					expect(url.searchParams.get("head")).toBe("2");
				}
				await screen.unmount();
			}
		}
	}
}, 15_000);

test("missing timings stay unavailable while diagnostics remain comparable", async () => {
	const screen = await render(Compare, {
		data: {
			...data,
			comparisons: [
				{
					...data.comparisons[0],
					head: { ...observation, check: null, scanner: null },
				},
			],
		},
	});
	expect(
		screen.getByRole("main").element().querySelectorAll("svg"),
	).toHaveLength(0);
	expect(
		screen.getByRole("region", { name: "Repository comparison" }).element()
			.textContent,
	).toContain("Not reported");
});
