import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import "../app.css";
import Fixture from "./StickyHorizontalScroll.fixture.svelte";

afterEach(() => {
	window.scrollTo(0, 0);
});

async function setup() {
	await page.viewport(1000, 800);
	window.scrollTo(0, 0);
	const screen = await render(Fixture);
	const viewport = screen.getByRole("region", { name: "Wide table" }).element();
	// The native scrollbar is decorative and deliberately hidden from AT.
	const findProxy = () =>
		viewport.parentElement?.querySelector<HTMLElement>('[aria-hidden="true"]');
	await expect.poll(findProxy).toBeTruthy();
	const proxy = findProxy();
	if (!proxy) throw new Error("Expected a horizontal scrollbar");
	return { screen, viewport, proxy, findProxy };
}

test("horizontal scrolling stays synchronized in both directions", async () => {
	const { viewport, proxy } = await setup();
	expect(viewport).toHaveAttribute("tabindex", "0");
	(viewport as HTMLElement).focus();
	expect(document.activeElement).toBe(viewport);
	expect(proxy.scrollWidth).toBe(viewport.scrollWidth);

	// Native scroll events exercise the handlers without dispatching synthetic events.
	proxy.scrollLeft = 240;
	await expect.poll(() => viewport.scrollLeft).toBe(240);
	viewport.scrollLeft = 480;
	await expect.poll(() => proxy.scrollLeft).toBe(480);
	proxy.scrollLeft = 0;
	await expect.poll(() => viewport.scrollLeft).toBe(0);
});

test("scrollbar stays at the viewport bottom until the table ends", async () => {
	const { viewport, proxy } = await setup();
	const expectAtViewportBottom = async () => {
		await expect
			.poll(() =>
				Math.abs(proxy.getBoundingClientRect().bottom - window.innerHeight),
			)
			.toBeLessThanOrEqual(1);
	};

	await expectAtViewportBottom();
	window.scrollTo(0, 500);
	await expect.poll(() => window.scrollY).toBe(500);
	expect(viewport.getBoundingClientRect().top).toBeLessThan(0);
	expect(viewport.getBoundingClientRect().bottom).toBeGreaterThan(
		window.innerHeight,
	);
	await expectAtViewportBottom();

	const tableBottom = viewport.getBoundingClientRect().bottom + window.scrollY;
	window.scrollTo(0, tableBottom - 300);
	await expect.poll(() => window.scrollY).toBe(tableBottom - 300);
	await expect
		.poll(() =>
			Math.abs(
				proxy.getBoundingClientRect().top -
					viewport.getBoundingClientRect().bottom,
			),
		)
		.toBeLessThanOrEqual(1);
	expect(proxy.getBoundingClientRect().bottom).toBeLessThan(window.innerHeight);
});

test("scrollbar responds to container and content resizing", async () => {
	const { screen, viewport, findProxy } = await setup();
	const container = screen.getByTestId("container").element();
	const content = screen.getByTestId("content").element();

	container.style.width = "1300px";
	await expect.poll(findProxy).toBeNull();
	container.style.width = "600px";
	await expect.poll(findProxy).toBeTruthy();

	content.style.width = "500px";
	await expect.poll(findProxy).toBeNull();
	content.style.width = "1500px";
	await expect.poll(() => findProxy()?.scrollWidth).toBe(1500);
	const proxy = findProxy();
	if (!proxy) throw new Error("Expected scrollbar to reappear");
	proxy.scrollLeft = 800;
	await expect.poll(() => viewport.scrollLeft).toBe(800);
});
