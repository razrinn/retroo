import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "retroo",
		compatibilityDate: "2026-10-06",
		entrypoint,
		domains: ["retroo.rzrn.dev"],
		assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*"] },
		env: {
			DB: bindings.d1(),
			BOARD: bindings.durableObject({ worker: "retroo", exportName: "Board" }),
			CREATE_PASSWORD: bindings.secret(),
		},
		exports: {
			Board: exports.durableObject({ storage: "sqlite" }),
		},
	},
});
