// The next-MC picker shows. The server sends the show, the winner and a seed; every screen plays the same
// show from that seed and lands on the same name. Keep SHOWS in step with src/worker.ts.
import { onMounted, onUnmounted, ref } from "vue";

export const SHOWS = ["wheel", "cars", "horses", "balloons", "slots", "plinko", "claw", "ducks", "potato", "lottery"] as const;
export type Pick = { show: (typeof SHOWS)[number]; winner: string; names: string[]; seed: number };
export type ShowProps = { names: string[]; winner: string; seed: number };

// The shows' look: retroo paper and ink, with Stickie's pastel fills and darker outlines, one per teammate.
export const INK = "#26215c";
export const PAPER = "#fffdf8";
export const PALETTE = [
	["#F5C4B3", "#F0997B", "#993C1D"],
	["#9FE1CB", "#5DCAA5", "#0F6E56"],
	["#CECBF6", "#AFA9EC", "#534AB7"],
	["#FAC775", "#EF9F27", "#854F0B"],
	["#B5D4F4", "#85B7EB", "#185FA5"],
	["#F4C0D1", "#ED93B1", "#993556"],
	["#C0DD97", "#97C459", "#3B6D11"],
	["#D3D1C7", "#B4B2A9", "#5F5E5A"],
] as const;
export const paintOf = (i: number) => PALETTE[i % PALETTE.length];
export const colorOf = (i: number) => paintOf(i)[0];
export const inkOf = (i: number) => paintOf(i)[2];
export const short = (name: string, max = 10) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

// Small seeded random generator (mulberry32): same seed, same numbers on every screen.
export function rng(seed: number) {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export function shuffle<T>(list: T[], rand: () => number) {
	const a = [...list];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const outCubic = (t: number) => 1 - (1 - t) ** 3;
export const inOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// 0 before a, 1 after b, eased in between.
export const span = (t: number, a: number, b: number) => inOutCubic(clamp01((t - a) / (b - a)));

// Seconds since the show started, ticking every frame until `length` seconds, then `done` once.
export function useClock(length: number, done: () => void) {
	const now = ref(0);
	let frame = 0;
	let start = 0;
	const step = (t: number) => {
		start ||= t;
		now.value = Math.min(length, (t - start) / 1000);
		if (now.value < length) frame = requestAnimationFrame(step);
		else done();
	};
	onMounted(() => (frame = requestAnimationFrame(step)));
	onUnmounted(() => cancelAnimationFrame(frame));
	return now;
}
