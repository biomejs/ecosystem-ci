import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
	viteConfig,
	defineConfig({
		optimizeDeps: { include: ["axe-core"] },
		test: {
			include: ["src/**/*.browser.test.ts"],
			browser: {
				commands: {
					setColorScheme: ({ page }, colorScheme: "light" | "dark" | null) =>
						page.emulateMedia({ colorScheme }),
				},
				enabled: true,
				provider: playwright(),
				headless: true,
				instances: [{ browser: "chromium" }],
				viewport: { width: 1440, height: 1000 },
			},
		},
	}),
);
