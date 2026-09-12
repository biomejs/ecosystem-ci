export type ThemePreference = "system" | "light" | "dark";

export function parseTheme(value: string | null | undefined): ThemePreference {
	return value === "light" || value === "dark" ? value : "system";
}
