import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme } from "../dashboard/src/lib/theme";

describe("dashboard theme", () => {
	it("accepts explicit themes and treats missing or invalid preferences as system", () => {
		expect(parseTheme("light")).toBe("light");
		expect(parseTheme("dark")).toBe("dark");
		for (const value of [null, undefined, "system", "", "invalid"]) {
			expect(parseTheme(value)).toBe("system");
		}
	});

	it("uses the system only when there is no explicit theme", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
		for (const prefersDark of [true, false]) {
			expect(resolveTheme("light", prefersDark)).toBe("light");
			expect(resolveTheme("dark", prefersDark)).toBe("dark");
		}
	});
});
