import { describe, expect, it } from "vitest";
import { parseTheme } from "../dashboard/src/lib/theme";

describe("dashboard theme", () => {
	it("accepts explicit themes and treats missing or invalid preferences as system", () => {
		expect(parseTheme("light")).toBe("light");
		expect(parseTheme("dark")).toBe("dark");
		for (const value of [null, undefined, "system", "", "invalid"]) {
			expect(parseTheme(value)).toBe("system");
		}
	});
});
