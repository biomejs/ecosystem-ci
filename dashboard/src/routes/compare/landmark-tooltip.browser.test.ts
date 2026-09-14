import { expect, test } from "vitest";
import { landmarkTooltip } from "./landmark-tooltip";
import "../../app.css";

test("tooltip appears only on a landmark, stays fixed and cleans up", () => {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	const mark = document.createElementNS("http://www.w3.org/2000/svg", "g");
	const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
	rect.setAttribute("width", "100");
	rect.setAttribute("height", "18");
	mark.appendChild(rect);
	svg.appendChild(mark);
	document.body.appendChild(svg);
	const action = landmarkTooltip(mark, "base median 3 ms");
	const tooltip = () => document.querySelector('[role="tooltip"]');
	try {
		expect(mark.getAttribute("role")).toBe("group");
		svg.dispatchEvent(new PointerEvent("pointermove", { clientX: 150 }));
		expect(tooltip()).toBeNull();
		mark.dispatchEvent(new PointerEvent("pointerenter"));
		expect(tooltip()?.textContent).toBe("base median 3 ms");
		mark.dispatchEvent(new PointerEvent("pointermove", { clientX: 75 }));
		expect(tooltip()?.textContent).toBe("base median 3 ms");
		if (action) action.update?.("base median 4 ms");
		expect(tooltip()?.textContent).toBe("base median 4 ms");
		mark.dispatchEvent(new PointerEvent("pointerleave"));
		expect(tooltip()).toBeNull();
		mark.dispatchEvent(new FocusEvent("focus"));
		expect(tooltip()?.textContent).toBe("base median 4 ms");
		mark.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(tooltip()).toBeNull();
		mark.dispatchEvent(new FocusEvent("focus"));
	} finally {
		if (action) action.destroy?.();
		svg.remove();
	}
	expect(tooltip()).toBeNull();
	expect(mark.hasAttribute("role")).toBe(false);
});
