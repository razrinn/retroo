<script setup lang="ts">
import { nextTick, ref } from "vue";

// A button that asks first, in place: "Reveal" becomes "Reveal for everyone? Yes · Cancel".
// Cancels itself after a few seconds or on Esc, so a stray click never leaves it armed.
defineProps<{ ask: string; yes?: string; danger?: boolean }>();
const emit = defineEmits<{ confirm: [] }>();

const armed = ref(false);
const yesBtn = ref<HTMLButtonElement>();
let timer = 0;
async function arm() {
	armed.value = true;
	clearTimeout(timer);
	timer = setTimeout(() => (armed.value = false), 5000);
	await nextTick();
	yesBtn.value?.focus();
}
function confirm() {
	armed.value = false;
	emit("confirm");
}
</script>

<template>
	<span v-if="armed" class="confirm" role="group" :aria-label="ask" @keydown.esc="armed = false">
		<span class="ask">{{ ask }}</span>
		<button ref="yesBtn" class="small" :class="danger ? 'danger' : 'primary'" @click="confirm">{{ yes ?? "Yes" }}</button>
		<button class="ghost small" @click="armed = false">Cancel</button>
	</span>
	<button v-else v-bind="$attrs" @click="arm"><slot /></button>
</template>

<style scoped>
.confirm {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 2px 4px 2px 10px;
	border-radius: 999px;
	background: var(--surface);
	border: 1.5px solid var(--border);
	animation: pop-in 0.2s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.ask {
	font-size: 13px;
	font-weight: 700;
	white-space: nowrap;
}
.danger {
	background: var(--danger);
	border-color: var(--danger);
	color: var(--surface);
}
@keyframes pop-in {
	from {
		scale: 0.85;
		opacity: 0;
	}
}
</style>
