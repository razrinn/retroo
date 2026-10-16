<script setup lang="ts">
import Board from "./Board.vue";
import Home from "./Home.vue";
import PastBoards from "./PastBoards.vue";
import { normalizeCode } from "./lib";

const path = location.pathname;
const rawCode = path.match(/^\/b\/([^/]+)/)?.[1];
const code = rawCode ? normalizeCode(decodeURIComponent(rawCode)) || rawCode : "";
if (rawCode && code !== rawCode) history.replaceState(null, "", `/b/${code}`);
</script>

<template>
	<Board v-if="path === '/demo'" code="DEMO" demo />
	<Board v-else-if="code" :code="code" />
	<PastBoards v-else-if="path === '/boards'" />
	<Home v-else />
</template>
