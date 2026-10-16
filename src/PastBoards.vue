<script setup lang="ts">
import { ref } from "vue";
import { type ListedBoard, formatCode, post } from "./lib";

const password = ref("");
const boards = ref<ListedBoard[] | null>(null);
const error = ref("");

async function show() {
	error.value = "";
	try {
		boards.value = await post<ListedBoard[]>("/api/boards/list", { password: password.value });
	} catch (e) {
		error.value = (e as Error).message;
	}
}
</script>

<template>
	<main>
		<h1><a href="/">retro</a> <span class="muted">/ Past boards</span></h1>
		<form v-if="!boards" class="panel row" @submit.prevent="show">
			<input v-model="password" type="password" placeholder="Password" aria-label="Password" required />
			<button class="primary">Show</button>
		</form>
		<p v-if="error" class="error" role="alert">{{ error }}</p>
		<p v-if="boards && !boards.length" class="muted">No boards yet.</p>
		<ul v-if="boards">
			<li v-for="(b, i) in boards" :key="b.code" :style="{ rotate: `${(i % 3) - 1}deg` }">
				<a :href="`/b/${b.code}`">{{ b.title || "Untitled" }}</a>
				<span class="mono muted">{{ formatCode(b.code) }}</span>
				<span class="muted">{{ new Date(b.created_at).toLocaleDateString() }}</span>
			</li>
		</ul>
	</main>
</template>

<style scoped>
main {
	max-width: 560px;
	margin: 0 auto;
	padding: 32px 16px;
}
h1 {
	margin-bottom: 20px;
}
h1 a {
	color: inherit;
	text-decoration: none;
}
ul {
	list-style: none;
	padding: 0;
	display: grid;
	gap: 10px;
}
li {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	align-items: center;
	padding: 12px 14px;
	border-radius: 6px;
	background: var(--surface);
	box-shadow: var(--shadow);
}
li a {
	flex: 1;
	font-weight: 700;
	text-decoration: none;
	color: var(--text);
}
</style>
