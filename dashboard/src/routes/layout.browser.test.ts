import axe from "axe-core";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import template from "../app.html?raw";
import Layout from "./Layout.fixture.svelte";

vi.mock("$app/state", () => ({
	page: { url: new URL("https://example.test/") },
}));

afterEach(() => {
	localStorage.removeItem("ecosystem-ci-theme");
	delete document.documentElement.dataset.theme;
	delete document.documentElement.dataset.themePreference;
	document.documentElement.style.fontSize = "";
	vi.restoreAllMocks();
});

function initializeTheme() {
	const source = new DOMParser()
		.parseFromString(template, "text/html")
		.querySelector("script")?.textContent;
	if (!source) throw new Error("Missing initial theme script");
	const script = document.createElement("script");
	script.textContent = source;
	document.head.appendChild(script);
	script.remove();
}

test("theme initialization, persistence and system changes agree", async () => {
	const media = Object.assign(new EventTarget(), { matches: true });
	vi.spyOn(window, "matchMedia").mockReturnValue(media as MediaQueryList);
	initializeTheme();
	expect(document.documentElement.dataset.theme).toBe("dark");
	let screen = await render(Layout);
	const select = screen.getByRole("combobox", { name: "Theme", exact: true });
	await expect.element(select).toHaveValue("system");
	media.matches = false;
	media.dispatchEvent(new Event("change"));
	expect(document.documentElement.dataset.theme).toBe("light");
	await select.selectOptions("dark");
	expect(localStorage.getItem("ecosystem-ci-theme")).toBe("dark");
	await screen.unmount();
	initializeTheme();
	screen = await render(Layout);
	await expect
		.element(screen.getByRole("combobox", { name: "Theme", exact: true }))
		.toHaveValue("dark");
	expect(getComputedStyle(document.documentElement).colorScheme).toBe("dark");
	await screen
		.getByRole("combobox", { name: "Theme", exact: true })
		.selectOptions("system");
	expect(localStorage.getItem("ecosystem-ci-theme")).toBeNull();
	expect(document.documentElement.dataset.theme).toBe("light");
});

test("theme controls work with blocked storage", async () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new DOMException("Blocked", "SecurityError");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new DOMException("Blocked", "SecurityError");
	});
	initializeTheme();
	const screen = await render(Layout);
	await screen
		.getByRole("combobox", { name: "Theme", exact: true })
		.selectOptions("dark");
	expect(document.documentElement.dataset.theme).toBe("dark");
});

test("branded navigation and theme controls reflow with enlarged text", async () => {
	await page.viewport(320, 900);
	initializeTheme();
	const screen = await render(Layout);
	await expect
		.element(screen.getByRole("link", { name: "Biome Ecosystem CI home" }))
		.toHaveAttribute("href", "/");
	const skip = screen.getByRole("link", { name: "Skip to content" });
	(skip.element() as HTMLElement).focus();
	await expect.element(skip).toBeVisible();
	await skip.click();
	expect(document.activeElement).toBe(screen.getByRole("main").element());
	for (const theme of ["light", "dark"]) {
		await screen
			.getByRole("combobox", { name: "Theme", exact: true })
			.selectOptions(theme);
		expect((await axe.run(document.body)).violations).toEqual([]);
		document.documentElement.style.fontSize = "200%";
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
			window.innerWidth,
		);
		document.documentElement.style.fontSize = "";
	}
});
