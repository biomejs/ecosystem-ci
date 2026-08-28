/// <reference types="@cloudflare/workers-types" />

declare global {
	interface CloudflareEnv {
		DB: D1Database;
		REPORTS: R2Bucket;
	}

	namespace App {
		interface Platform {
			env: CloudflareEnv;
			context: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};
