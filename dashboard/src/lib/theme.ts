export type ThemePreference = "system" | "light" | "dark";

export function parseTheme(value: string | null | undefined): ThemePreference {
	return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(
	preference: ThemePreference,
	prefersDark: boolean,
) {
	return preference === "system"
		? prefersDark
			? "dark"
			: "light"
		: preference;
}
