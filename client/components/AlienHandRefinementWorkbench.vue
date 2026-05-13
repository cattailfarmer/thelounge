<template>
	<aside v-if="channelUuid" class="alienhand-workbench" aria-label="AlienHand refinement workbench">
		<header class="alienhand-workbench__header">
			<div>
				<strong>AlienHand refinement</strong>
				<span>{{ channelUuid }}</span>
			</div>
			<div class="alienhand-workbench__controls">
				<button class="btn btn-sm" :disabled="loading" @click="refresh">Refresh</button>
				<button class="btn btn-sm" :aria-pressed="showRawPane" @click="showRawPane = !showRawPane">
					Raw
				</button>
				<button class="btn btn-sm" :aria-pressed="showCutsPane" @click="showCutsPane = !showCutsPane">
					Cuts
				</button>
				<button class="btn btn-sm" :aria-pressed="showEditsPane" @click="showEditsPane = !showEditsPane">
					Edits
				</button>
			</div>
		</header>

		<p v-if="error" class="alienhand-workbench__error">{{ error }}</p>

		<form class="alienhand-workbench__search" @submit.prevent="runSearch">
			<input v-model="searchTerm" placeholder="Search raw blocks" />
			<button class="btn btn-sm" :disabled="loading || !searchTerm.trim()">Search</button>
		</form>

		<div class="alienhand-workbench__panes">
			<section v-if="showRawPane" class="alienhand-workbench__pane">
				<header>
					<h3>Raw conversation</h3>
					<span>{{ blocks.length }} blocks</span>
				</header>
				<p v-if="!blocks.length" class="alienhand-workbench__empty">
					No persisted AlienHand blocks are available for this channel yet.
				</p>
				<article
					v-for="block in blocks"
					:key="block.block_id"
					:class="[
						'alienhand-workbench__card',
						{'alienhand-workbench__card--hit': searchHitBlockIds.has(block.block_id)},
					]"
				>
					<div class="alienhand-workbench__meta">
						<span>{{ block.sender }}</span>
						<time>{{ formatTimestamp(block.created_at) }}</time>
					</div>
					<p>{{ block.presentation }}</p>
					<button
						class="btn btn-sm"
						:disabled="pendingBlockId === block.block_id"
						@click="createCut(block)"
					>
						Inject into cuts
					</button>
				</article>
			</section>

			<section v-if="showCutsPane" class="alienhand-workbench__pane">
				<header>
					<h3>Cuts</h3>
					<span>{{ activeCuts.length }} active</span>
				</header>
				<p class="alienhand-workbench__pointer">Insertion pointer: end of cuts</p>
				<p v-if="!activeCuts.length" class="alienhand-workbench__empty">
					Use "Inject into cuts" on a raw block to start composing.
				</p>
				<article v-for="cut in activeCuts" :key="cut.cut_id" class="alienhand-workbench__card">
					<div class="alienhand-workbench__meta">
						<span>Cut {{ cut.position + 1 }}</span>
						<button
							class="alienhand-workbench__remove"
							:disabled="pendingCutId === cut.cut_id"
							@click="removeCut(cut)"
						>
							x
						</button>
					</div>
					<p>{{ blockById.get(cut.source_block_id)?.presentation || cut.source_block_id }}</p>
				</article>
				<form class="alienhand-workbench__chapter-form" @submit.prevent="createChapter">
					<input v-model="chapterTitle" placeholder="Chapter title" />
					<textarea v-model="chapterSummary" placeholder="Chapter summary" rows="3" />
					<button class="btn" :disabled="!activeCuts.length || loading">Create chapter</button>
				</form>
			</section>

			<section v-if="showEditsPane" class="alienhand-workbench__pane">
				<header>
					<h3>Edits</h3>
					<span>{{ chapters.length }} chapters</span>
				</header>
				<p v-if="!chapters.length" class="alienhand-workbench__empty">
					Chapters created from cuts will appear here.
				</p>
				<article v-for="chapter in chapters" :key="chapter.chapter_id" class="alienhand-workbench__card">
					<div class="alienhand-workbench__meta">
						<span>{{ chapter.member_cut_ids.length }} cuts</span>
						<time>{{ formatTimestamp(chapter.updated_at) }}</time>
					</div>
					<h4>{{ chapter.title }}</h4>
					<p>{{ chapter.summary || "No summary yet." }}</p>
				</article>
			</section>
		</div>

		<footer class="alienhand-workbench__footer">
			<button class="btn btn-sm" @click="showRawText = !showRawText">
				{{ showRawText ? "Hide" : "Show" }} raw text
			</button>
			<pre v-if="showRawText">{{ rawDebugText }}</pre>
		</footer>
	</aside>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref, watch} from "vue";

import type {ClientChan} from "../js/types";
import {
	alienHandChannelUuidFromName,
	createAlienHandRefinementChapter,
	createAlienHandRefinementCut,
	listAlienHandRefinementBlocks,
	listAlienHandRefinementChapters,
	listAlienHandRefinementCuts,
	removeAlienHandRefinementCut,
	searchAlienHandRefinement,
	type AlienHandConversationBlock,
	type AlienHandConversationChapter,
	type AlienHandConversationCut,
} from "../js/helpers/alienhand";

export default defineComponent({
	name: "AlienHandRefinementWorkbench",
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const blocks = ref<AlienHandConversationBlock[]>([]);
		const cuts = ref<AlienHandConversationCut[]>([]);
		const chapters = ref<AlienHandConversationChapter[]>([]);
		const loading = ref(false);
		const error = ref("");
		const pendingBlockId = ref("");
		const pendingCutId = ref("");
		const searchTerm = ref("");
		const searchHitBlockIds = ref(new Set<string>());
		const chapterTitle = ref("");
		const chapterSummary = ref("");
		const showRawPane = ref(true);
		const showCutsPane = ref(true);
		const showEditsPane = ref(true);
		const showRawText = ref(false);

		const channelUuid = computed(() => alienHandChannelUuidFromName(props.channel.name));
		const activeCuts = computed(() => cuts.value.filter((cut) => cut.status === "active"));
		const blockById = computed(
			() => new Map(blocks.value.map((block) => [block.block_id, block]))
		);
		const rawDebugText = computed(() =>
			JSON.stringify(
				{
					blocks: blocks.value,
					chapters: chapters.value,
					cuts: cuts.value,
				},
				null,
				2
			)
		);

		const refresh = async () => {
			if (!channelUuid.value) {
				return;
			}

			loading.value = true;
			error.value = "";

			try {
				const [nextBlocks, nextCuts, nextChapters] = await Promise.all([
					listAlienHandRefinementBlocks(channelUuid.value),
					listAlienHandRefinementCuts(channelUuid.value),
					listAlienHandRefinementChapters(channelUuid.value),
				]);

				blocks.value = nextBlocks;
				cuts.value = nextCuts;
				chapters.value = nextChapters;
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				loading.value = false;
			}
		};

		const runSearch = async () => {
			const term = searchTerm.value.trim();

			if (!term) {
				searchHitBlockIds.value = new Set();
				return;
			}

			loading.value = true;
			error.value = "";

			try {
				const hits = await searchAlienHandRefinement(term);
				searchHitBlockIds.value = new Set(hits.map((hit) => hit.block_id));
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				loading.value = false;
			}
		};

		const createCut = async (block: AlienHandConversationBlock) => {
			pendingBlockId.value = block.block_id;
			error.value = "";

			try {
				await createAlienHandRefinementCut(block.block_id);
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingBlockId.value = "";
			}
		};

		const removeCut = async (cut: AlienHandConversationCut) => {
			pendingCutId.value = cut.cut_id;
			error.value = "";

			try {
				await removeAlienHandRefinementCut(cut.cut_id);
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingCutId.value = "";
			}
		};

		const createChapter = async () => {
			const cutIds = activeCuts.value.map((cut) => cut.cut_id);

			if (!cutIds.length) {
				error.value = "Add at least one active cut before creating a chapter.";
				return;
			}

			const title =
				chapterTitle.value.trim() ||
				props.channel.topic ||
				`Chapter ${chapters.value.length + 1}`;
			const summary = chapterSummary.value.trim();

			loading.value = true;
			error.value = "";

			try {
				await createAlienHandRefinementChapter(title, summary, cutIds);
				chapterTitle.value = "";
				chapterSummary.value = "";
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				loading.value = false;
			}
		};

		const formatTimestamp = (value: string) => {
			const timestamp = Date.parse(value);

			if (Number.isNaN(timestamp)) {
				return value;
			}

			return new Date(timestamp).toLocaleString();
		};

		watch(
			channelUuid,
			async () => {
				blocks.value = [];
				cuts.value = [];
				chapters.value = [];
				searchHitBlockIds.value = new Set();
				await refresh();
			},
			{immediate: true}
		);

		return {
			activeCuts,
			blockById,
			blocks,
			channelUuid,
			chapterSummary,
			chapterTitle,
			chapters,
			createChapter,
			createCut,
			cuts,
			error,
			formatTimestamp,
			loading,
			pendingBlockId,
			pendingCutId,
			rawDebugText,
			refresh,
			removeCut,
			runSearch,
			searchHitBlockIds,
			searchTerm,
			showCutsPane,
			showEditsPane,
			showRawPane,
			showRawText,
		};
	},
});
</script>
