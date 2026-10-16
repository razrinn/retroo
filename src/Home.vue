<script setup lang="ts">
import { ref } from "vue";
import { type ListedBoard, normalizeCode, post } from "./lib";

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
			<span class="deco d1" aria-hidden="true">✨</span>
			<span class="deco d2" aria-hidden="true">🔧</span>
			<span class="deco d3" aria-hidden="true">🚀</span>
			<h1>retro</h1>
			<p class="muted">Look back, laugh a little, fix one thing.</p>
		</div>

		<form class="panel join" @submit.prevent="join">
			<label for="code">Got a code?</label>
			<div class="row">
				<input id="code" v-model="joinCode" class="mono big" placeholder="K7QM-4XPT" autocomplete="off" />
				<button class="primary">Join</button>
			</div>
		</form>

		<form class="panel" @submit.prevent="create">
			<label for="title">Start a new retro</label>
			<input id="title" v-model="title" maxlength="100" placeholder="Sprint 42 (optional)" />
			<input v-model="password" type="password" placeholder="Create password" aria-label="Create password" required @change="loadBoards" />
			<template v-if="boards">
				<label for="previous" class="small-label">Bring open action items from</label>
				<select id="previous" v-model="previous">
					<option value="">Nothing, fresh start</option>
					<option v-for="b in boards" :key="b.code" :value="b.code">{{ b.title || "Untitled" }} · {{ b.code }}</option>
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
	padding: 48px 0 28px;
}
.hero h1 {
	font-size: 56px;
	letter-spacing: -2px;
}
.hero p {
	margin: 4px 0 0;
}
.deco {
	position: absolute;
	font-size: 28px;
	width: 52px;
	height: 52px;
	display: grid;
	place-items: center;
	border-radius: 6px;
	box-shadow: var(--shadow);
	animation: float 4s ease-in-out infinite;
}
.d1 {
	left: 4%;
	top: 30px;
	background: var(--note-well);
	rotate: -8deg;
}
.d2 {
	right: 6%;
	top: 22px;
	background: var(--note-improve);
	rotate: 7deg;
	animation-delay: -1.3s;
}
.d3 {
	left: 24%;
	top: 4px;
	background: var(--note-action);
	rotate: -4deg;
	animation-delay: -2.6s;
	width: 40px;
	height: 40px;
	font-size: 20px;
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
