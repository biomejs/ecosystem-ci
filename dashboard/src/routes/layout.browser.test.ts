import axe from "axe-core";
import { afterEach, expect, test, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import Layout from "./Layout.fixture.svelte";

declare module "vitest/browser" {
	interface BrowserCommands {
		setColorScheme(colorScheme: "light" | "dark" | null): Promise<void>;
	}
}

vi.mock("$app/state", () => ({
	page: { url: new URL("https://example.test/") },
}));

afterEach(async () => {
	localStorage.removeItem("ecosystem-ci-theme");
	delete document.documentElement.dataset.theme;
	document.documentElement.style.fontSize = "";
	vi.restoreAllMocks();
	await commands.setColorScheme(null);
});

test("theme persistence, native system changes and head metadata agree", async () => {
	await commands.setColorScheme("dark");
	let screen = await render(Layout);
	const select = screen.getByRole("combobox", { name: "Theme", exact: true });
	await expect.element(select).toHaveValue("system");
	await expect
		.poll(() => getComputedStyle(document.documentElement).backgroundColor)
		.toBe("rgb(23, 24, 28)");
	await commands.setColorScheme("light");
	await expect
		.poll(() => getComputedStyle(document.documentElement).backgroundColor)
		.toBe("rgb(255, 255, 255)");
	await select.selectOptions("dark");
	expect(localStorage.getItem("ecosystem-ci-theme")).toBe("dark");
	expect(
		Array.from(document.querySelectorAll('meta[name="theme-color"]'), (meta) =>
			meta.getAttribute("content"),
		),
	).toEqual(["#17181c", "#17181c"]);
	await screen.unmount();
	screen = await render(Layout);
	await expect
		.element(screen.getByRole("combobox", { name: "Theme", exact: true }))
		.toHaveValue("dark");
	expect(getComputedStyle(document.documentElement).colorScheme).toBe("dark");
	await screen
		.getByRole("combobox", { name: "Theme", exact: true })
		.selectOptions("system");
	expect(localStorage.getItem("ecosystem-ci-theme")).toBeNull();
	expect(document.documentElement.dataset.theme).toBe("system");
	expect(
		Array.from(document.querySelectorAll('meta[name="theme-color"]'), (meta) =>
			meta.getAttribute("content"),
		),
	).toEqual(["#ffffff", "#17181c"]);
});

test("theme controls work with blocked storage", async () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new DOMException("Blocked", "SecurityError");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new DOMException("Blocked", "SecurityError");
	});
	const screen = await render(Layout);
	await screen
		.getByRole("combobox", { name: "Theme", exact: true })
		.selectOptions("dark");
	expect(document.documentElement.dataset.theme).toBe("dark");
});

test("branded navigation and theme controls reflow with enlarged text", async () => {
	await page.viewport(320, 900);
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
		const select = screen
			.getByRole("combobox", { name: "Theme", exact: true })
			.element();
		const caret = select.parentElement?.querySelector("svg");
		if (!caret) throw new Error("Missing select caret");
		expect(getComputedStyle(select).minHeight).toBe("36px");
		expect(getComputedStyle(select).borderRadius).toBe("4px");
		expect(getComputedStyle(caret).color).toBe(
			theme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 24, 28)",
		);
		expect((await axe.run(document.body)).violations).toEqual([]);
		document.documentElement.style.fontSize = "200%";
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
			window.innerWidth,
		);
		document.documentElement.style.fontSize = "";
	}
});
