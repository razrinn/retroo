import { cloudflare } from "@cloudflare/vite-plugin";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	// Tests set RETROO_TEST so their boards live in memory and never touch your local dev data.
	plugins: [vue(), cloudflare(process.env.RETROO_TEST ? { persistState: false } : {})],
});
