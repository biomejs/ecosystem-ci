import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { hover } from "$lib/trends/hover.svelte";
import "../app.css";
import Dashboard from "./+page.svelte";
import type { PageData } from "./$types";

const runs: PageData["runs"] = [0, 1, 2].map((index) => ({
	githubRunId: index + 1,
	runAttempt: 1,
	biomeBranch: "main",
	biomeCommitSha: String(index + 1).repeat(40),
	startedAt: `2026-08-${10 + index}T05:00:00Z`,
	completedAt: null,
	status: "completed",
	results: 2,
	passed: 2,
	failed: 0,
}));

const data: PageData = {
	branch: "main",
	branches: ["main"],
	runs: runs.toReversed(),
	history: runs.flatMap((run, index) =>
		["biomejs/biome", "withastro/astro"].flatMap(
			(repositorySlug, repoIndex) => {
				// Include a missing report and values with different formatted widths.
				if (index === 1 && repoIndex === 1) return [];
				const duration = [1234, 12, 1][index] * (repoIndex + 1);
				return [
					{
						githubRunId: run.githubRunId,
						repositorySlug,
						timingSamples: [0.8, 1, 1.2].map((factor, sample) => ({
							ordinal: sample + 1,
							checkDurationNs: duration * factor * 1e6,
							scannerDurationNs: duration * factor * 1e5,
						})),
						errors: 1000,
						warnings: 20,
						infos: 3,
						parseDiagnostics: 10,
						ruleDiagnostics: 1013,
						ruleErrors: 990,
						ruleWarnings: 20,
						ruleInfos: 3,
						panics: 0,
					},
				];
			},
		),
	),
};

afterEach(() => {
	hover.index = null;
});

async function settleLayout() {
	await document.fonts.ready;
	// Allow Svelte updates and ResizeObserver-driven chart sizing to reach paint.
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

test("hovering a chart does not shift the dashboard layout", async () => {
	const charts = [
		"Check time across repositories for 2 repositories over 3 runs, linear scale",
		"Check time for biomejs/biome over 3 runs",
		"Diagnostics by severity for biomejs/biome over 3 runs",
	];
	for (const width of [1440, 1024, 390]) {
		await page.viewport(width, 1000);
		const screen = await render(Dashboard, { data });
		const main = screen.getByRole("main").element();
		const heading = screen.getByRole("heading", {
			name: "Ecosystem CI trends",
		});

		const elements = Array.from(
			main.querySelectorAll(
				"header, section, [aria-live], section[aria-label] > div > div, svg",
			),
		);
		expect(elements.length).toBeGreaterThan(20);
		const measure = () =>
			elements.map((element) => {
				const rect = element.getBoundingClientRect();
				return {
					x: rect.x + window.scrollX,
					y: rect.y + window.scrollY,
					width: rect.width,
					height: rect.height,
				};
			});
		for (const name of charts) {
			const chart = screen.getByRole("img", { name, exact: true });
			// Scroll before measuring so Playwright's hover doesn't change the baseline.
			chart.element().scrollIntoView({ block: "center", inline: "center" });
			await settleLayout();
			const before = measure();
			const chartWidth = chart.element().getBoundingClientRect().width;
			for (const [index, x] of [1, chartWidth / 2, chartWidth - 1].entries()) {
				await chart.hover({ position: { x, y: 40 } });
				await expect.poll(() => hover.index).toBe(index);
				await expect
					.element(
						page
							.getByText(String(index + 1).repeat(7), { exact: true })
							.first(),
					)
					.toBeVisible();
				await settleLayout();
				expect(measure(), `${name} at ${width}px, run ${index + 1}`).toEqual(
					before,
				);
			}
			await heading.hover();
			await expect.poll(() => hover.index).toBeNull();
			await settleLayout();
			expect(measure(), `${name} at ${width}px after leaving`).toEqual(before);
		}
		await screen.unmount();
	}
}, 15_000);

test("overview lines highlight the hovered repository and clear away from lines", async () => {
	const screen = await render(Dashboard, { data });
	await settleLayout();
	for (const metric of ["Check", "Scanner"]) {
		const chart = screen.getByRole("img", {
			name: `${metric} time across repositories for 2 repositories over 3 runs, linear scale`,
			exact: true,
		});
		const svg = chart.element() as unknown as SVGSVGElement;
		const section = svg.closest("section");
		if (!section) throw new Error("Missing chart section");
		const line = Array.from(svg.querySelectorAll("path")).find(
			(path) =>
				path.getAttribute("fill") === "none" &&
				path.textContent?.trim() === "biomejs/biome",
		);
		if (!line) throw new Error("Missing repository line");
		for (const mode of [null, "Log scale", "Relative to first"]) {
			if (mode) {
				const label = Array.from(section.querySelectorAll("label")).find(
					(label) => label.textContent?.trim() === mode,
				);
				const input = label?.querySelector("input");
				if (!input) throw new Error(`Missing ${mode} control`);
				input.click();
				await settleLayout();
			}
			// Hover halfway along a segment, not just at a run's marker.
			const point = line.getPointAtLength(line.getTotalLength() / 4);
			const rect = svg.getBoundingClientRect();
			svg.dispatchEvent(
				new PointerEvent("pointermove", {
					bubbles: true,
					clientX: rect.left + point.x,
					clientY: rect.top + point.y,
				}),
			);
			await expect
				.element(screen.getByRole("tooltip"))
				.toHaveTextContent("biomejs/biome");
			await expect
				.poll(() =>
					svg
						.querySelector('g[aria-hidden="true"] path[fill="none"]')
						?.getAttribute("d"),
				)
				.toBe(line.getAttribute("d"));
			const band = Array.from(svg.querySelectorAll("path")).find(
				(path) =>
					path.textContent?.trim() === "biomejs/biome · min–max of samples",
			);
			if (!band) throw new Error("Missing sample range band");
			const highlightBand = svg.querySelector(
				'g[aria-hidden="true"] path:not([fill="none"])',
			);
			expect(highlightBand?.getAttribute("d")).toBe(band.getAttribute("d"));
			expect(Number(highlightBand?.getAttribute("opacity"))).toBeGreaterThan(
				Number(band.getAttribute("opacity")),
			);
			expect(svg.querySelector('g[aria-hidden="true"] line')).not.toBeNull();
			svg.dispatchEvent(
				new PointerEvent("pointermove", {
					bubbles: true,
					clientX: rect.left + 2,
					clientY: rect.top + 2,
				}),
			);
			await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
			await expect
				.poll(() => svg.querySelector('g[aria-hidden="true"]'))
				.toBeNull();
		}
		svg.dispatchEvent(new PointerEvent("pointerleave"));
	}
});
