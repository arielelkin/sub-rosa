// Intent: Compile the standalone Vue app and its geometry worker for static hosting.
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({ plugins: [vue()], base: "./" });
