// Optional soft sounds, made with Web Audio (no files). Off by default; the header toggle remembers the choice.
import { load, save } from "./lib";

let enabled = load("sound") === "on";
let ctx: AudioContext | null = null;

export const soundOn = () => enabled;
export function setSound(on: boolean) {
	enabled = on;
	save("sound", on ? "on" : "off");
	if (on) beep(660, 0.08, 0.05); // a tiny confirmation, and browsers need a click to start audio anyway
}

// One short tone that glides from `freq` to `to`, fading out over `length` seconds.
function beep(freq: number, length: number, volume = 0.06, to = freq, delay = 0) {
	if (!enabled) return;
	ctx ??= new AudioContext();
	const t = ctx.currentTime + delay;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "sine";
	osc.frequency.setValueAtTime(freq, t);
	osc.frequency.exponentialRampToValueAtTime(to, t + length);
	gain.gain.setValueAtTime(0.0001, t);
	gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t);
	osc.stop(t + length + 0.02);
}

export const sounds = {
	// Cards flipping on reveal: a few soft paper ticks.
	reveal(cards: number) {
		for (let i = 0; i < Math.min(cards, 6); i++) beep(520 + i * 40, 0.06, 0.04, 380, i * 0.09);
	},
	// Timer ran out: a gentle two-note chime.
	timesUp() {
		beep(880, 0.35, 0.06);
		beep(660, 0.5, 0.06, 660, 0.18);
	},
	// Emoji combo: a little rising pop.
	combo() {
		beep(400, 0.16, 0.06, 900);
	},
};
