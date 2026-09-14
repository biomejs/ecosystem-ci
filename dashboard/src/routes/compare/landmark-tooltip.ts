import type { Action } from "svelte/action";

/** Show a description anchored to a chart mark, on hover or keyboard focus. */
export const landmarkTooltip: Action<SVGElement, string> = (node, initial) => {
	let description = initial;
	let visible = false;
	const tooltip = document.createElement("div");
	tooltip.className =
		"pointer-events-none fixed z-50 max-w-xs border border-base bg-page px-2 py-1 text-sm text-ink shadow-lg tabular-nums";
	tooltip.setAttribute("role", "tooltip");
	tooltip.id = `landmark-tooltip-${crypto.randomUUID()}`;
	node.setAttribute("tabindex", "0");
	node.setAttribute("role", "group");
	node.setAttribute("aria-label", description);
	function hide() {
		visible = false;
		tooltip.remove();
		node.removeAttribute("aria-describedby");
	}
	function show() {
		visible = true;
		const bounds = node.getBoundingClientRect();
		tooltip.textContent = description;
		document.body.appendChild(tooltip);
		node.setAttribute("aria-describedby", tooltip.id);
		const tip = tooltip.getBoundingClientRect();
		tooltip.style.left = `${Math.max(8, Math.min(innerWidth - tip.width - 8, bounds.left + bounds.width / 2 - tip.width / 2))}px`;
		tooltip.style.top = `${bounds.top >= tip.height + 8 ? bounds.top - tip.height - 8 : bounds.bottom + 8}px`;
	}
	function key(event: KeyboardEvent) {
		if (event.key === "Escape") hide();
	}
	node.addEventListener("pointerenter", show);
	node.addEventListener("pointerleave", hide);
	node.addEventListener("focus", show);
	node.addEventListener("blur", hide);
	node.addEventListener("keydown", key);
	window.addEventListener("scroll", hide, true);
	window.addEventListener("resize", hide);
	return {
		update(next) {
			description = next;
			node.setAttribute("aria-label", description);
			if (visible) show();
		},
		destroy() {
			hide();
			node.removeAttribute("tabindex");
			node.removeAttribute("role");
			node.removeAttribute("aria-label");
			node.removeEventListener("pointerenter", show);
			node.removeEventListener("pointerleave", hide);
			node.removeEventListener("focus", show);
			node.removeEventListener("blur", hide);
			node.removeEventListener("keydown", key);
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("resize", hide);
		},
	};
};
