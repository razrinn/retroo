<script setup lang="ts">
import { ref } from "vue";
import Mascot from "./Mascot.vue";
import { type ListedBoard, formatCode, normalizeCode, post } from "./lib";

const joinCode = ref("");
const title = ref("");
const password = ref("");
const previous = ref("");
const boards = ref<ListedBoard[] | null>(null);
const error = ref("");

function join() {
	const c = normalizeCode(joinCode.value);
	if (!c) return (error.value = "Codes have 8 characters, like K7QM-4XPT.");
	location.href = `/b/${c}`;
}

// The previous-board picker appears once the create password checks out.
async function loadBoards() {
	try {
		boards.value = await post<ListedBoard[]>("/api/boards/list", { password: password.value });
		previous.value = boards.value[0]?.code ?? "";
	} catch {
		boards.value = null;
	}
}

async function create() {
	error.value = "";
	try {
		const { code } = await post<{ code: string }>("/api/boards", { title: title.value, password: password.value, previous: previous.value });
		location.href = `/b/${code}`;
	} catch (e) {
		error.value = (e as Error).message;
	}
}
</script>

<template>
	<main>
		<div class="hero">
			<Mascot :size="96" class="hero-mascot" />
			<h1>retro</h1>
			<p class="muted">Sprint retrospectives</p>
		</div>

		<form class="panel join" @submit.prevent="join">
			<label for="code">Join a board</label>
			<div class="row">
				<input
					id="code"
					:value="joinCode"
					class="mono big"
					placeholder="K7QM-4XPT"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					@input="joinCode = formatCode(($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = joinCode"
				/>
				<button class="primary">Join</button>
			</div>
		</form>

		<form class="panel" @submit.prevent="create">
			<label for="title">New board</label>
			<input id="title" v-model="title" maxlength="100" placeholder="Sprint 42 (optional)" />
			<input v-model="password" type="password" placeholder="Password" aria-label="Password" required @change="loadBoards" />
			<template v-if="boards">
				<label for="previous" class="small-label">Carry over action items from</label>
				<select id="previous" v-model="previous">
					<option value="">None</option>
					<option v-for="b in boards" :key="b.code" :value="b.code">{{ b.title || "Untitled" }} · {{ formatCode(b.code) }}</option>
				</select>
			</template>
			<button>Create board</button>
		</form>

		<p v-if="error" class="error" role="alert">{{ error }}</p>
		<p class="foot"><a href="/boards">Past boards</a></p>
	</main>
</template>

<style scoped>
main {
	max-width: 440px;
	margin: 0 auto;
	padding: 16px;
}
.hero {
	position: relative;
	text-align: center;
	padding: 32px 0 24px;
}
.hero h1 {
	font-size: 56px;
	letter-spacing: -2px;
}
.hero p {
	margin: 4px 0 0;
}
.hero-mascot {
	animation: float 4s ease-in-out infinite;
}
@keyframes float {
	50% {
		translate: 0 -6px;
	}
}
form {
	display: grid;
	gap: 10px;
	margin-bottom: 14px;
}
label {
	font-weight: 700;
}
.small-label {
	font-size: 13px;
	color: var(--muted);
	font-weight: 600;
}
.big {
	font-size: 18px;
	text-align: center;
}
.foot {
	text-align: center;
}
</style>
