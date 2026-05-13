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
						{
							'alienhand-workbench__card--bookmarked':
								targetBookmarks('block', block.block_id).length,
						},
						{
							'alienhand-workbench__card--sticky':
								targetStickies('block', block.block_id).length,
						},
					]"
				>
					<div class="alienhand-workbench__meta">
						<span>{{ block.sender }}</span>
						<time>{{ formatTimestamp(block.created_at) }}</time>
					</div>
					<p>{{ block.presentation }}</p>
					<div v-if="targetStickies('block', block.block_id).length" class="alienhand-workbench__stickies">
						<span
							v-for="sticky in targetStickies('block', block.block_id)"
							:key="sticky.sticky_id"
						>
							Pinned reminder
							<button class="btn btn-sm" @click="removeSticky(sticky)">
								Unpin
							</button>
						</span>
					</div>
					<div v-if="targetBookmarks('block', block.block_id).length" class="alienhand-workbench__bookmarks">
						<div
							v-for="bookmark in targetBookmarks('block', block.block_id)"
							:key="bookmark.bookmark_id"
							:class="[
								'alienhand-workbench__bookmark-chip',
								{
									'alienhand-workbench__bookmark-chip--sticky':
										targetStickies('bookmark', bookmark.bookmark_id).length,
								},
							]"
						>
							Bookmark: {{ bookmark.note || bookmark.label || bookmark.bookmark_id }}
							<span v-if="bookmark.note" class="alienhand-workbench__bookmark-popover">
								{{ bookmark.note }}
							</span>
							<button
								v-if="firstSticky('bookmark', bookmark.bookmark_id)"
								class="btn btn-sm"
								@click="removeFirstSticky('bookmark', bookmark.bookmark_id)"
							>
								Unpin
							</button>
							<button
								v-else
								class="btn btn-sm"
								:disabled="!canCreateSticky('bookmark', bookmark.bookmark_id)"
								@click="createSticky('bookmark', bookmark.bookmark_id)"
							>
								Pin
							</button>
						</div>
					</div>
					<div v-if="targetQuotes('block', block.block_id).length" class="alienhand-workbench__quotes">
						<blockquote
							v-for="quote in targetQuotes('block', block.block_id)"
							:key="quote.quote_id"
						>
							{{ quote.excerpt }}
						</blockquote>
					</div>
					<div class="alienhand-workbench__actions">
						<button
							class="btn btn-sm"
							:disabled="pendingBlockId === block.block_id"
							@click="createCut(block)"
						>
							Inject into cuts
						</button>
						<button
							class="btn btn-sm"
							:disabled="!canCreateSticky('block', block.block_id)"
							@click="createSticky('block', block.block_id)"
						>
							Pin
						</button>
					</div>
					<form
						class="alienhand-workbench__bookmark-form"
						@submit.prevent="createBookmark('block', block.block_id)"
					>
						<input
							v-model="bookmarkDrafts[bookmarkKey('block', block.block_id)]"
							placeholder="Bookmark note"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateBookmark('block', block.block_id)"
						>
							Bookmark
						</button>
					</form>
					<form
						class="alienhand-workbench__quote-form"
						@submit.prevent="createQuote('block', block.block_id)"
					>
						<input
							v-model="quoteDrafts[quoteKey('block', block.block_id)]"
							placeholder="Quote excerpt"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateQuote('block', block.block_id)"
						>
							Quote
						</button>
					</form>
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
				<article
					v-for="cut in activeCuts"
					:key="cut.cut_id"
					:class="[
						'alienhand-workbench__card',
						{
							'alienhand-workbench__card--bookmarked':
								targetBookmarks('cut', cut.cut_id).length,
						},
						{
							'alienhand-workbench__card--sticky':
								targetStickies('cut', cut.cut_id).length,
						},
					]"
				>
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
					<div v-if="targetStickies('cut', cut.cut_id).length" class="alienhand-workbench__stickies">
						<span
							v-for="sticky in targetStickies('cut', cut.cut_id)"
							:key="sticky.sticky_id"
						>
							Pinned reminder
							<button class="btn btn-sm" @click="removeSticky(sticky)">
								Unpin
							</button>
						</span>
					</div>
					<div v-if="targetBookmarks('cut', cut.cut_id).length" class="alienhand-workbench__bookmarks">
						<div
							v-for="bookmark in targetBookmarks('cut', cut.cut_id)"
							:key="bookmark.bookmark_id"
							:class="[
								'alienhand-workbench__bookmark-chip',
								{
									'alienhand-workbench__bookmark-chip--sticky':
										targetStickies('bookmark', bookmark.bookmark_id).length,
								},
							]"
						>
							Bookmark: {{ bookmark.note || bookmark.label || bookmark.bookmark_id }}
							<span v-if="bookmark.note" class="alienhand-workbench__bookmark-popover">
								{{ bookmark.note }}
							</span>
							<button
								v-if="firstSticky('bookmark', bookmark.bookmark_id)"
								class="btn btn-sm"
								@click="removeFirstSticky('bookmark', bookmark.bookmark_id)"
							>
								Unpin
							</button>
							<button
								v-else
								class="btn btn-sm"
								:disabled="!canCreateSticky('bookmark', bookmark.bookmark_id)"
								@click="createSticky('bookmark', bookmark.bookmark_id)"
							>
								Pin
							</button>
						</div>
					</div>
					<div v-if="targetQuotes('cut', cut.cut_id).length" class="alienhand-workbench__quotes">
						<blockquote
							v-for="quote in targetQuotes('cut', cut.cut_id)"
							:key="quote.quote_id"
						>
							{{ quote.excerpt }}
						</blockquote>
					</div>
					<div class="alienhand-workbench__actions">
						<button
							class="btn btn-sm"
							:disabled="!canCreateSticky('cut', cut.cut_id)"
							@click="createSticky('cut', cut.cut_id)"
						>
							Pin
						</button>
					</div>
					<form
						class="alienhand-workbench__bookmark-form"
						@submit.prevent="createBookmark('cut', cut.cut_id)"
					>
						<input
							v-model="bookmarkDrafts[bookmarkKey('cut', cut.cut_id)]"
							placeholder="Bookmark note"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateBookmark('cut', cut.cut_id)"
						>
							Bookmark
						</button>
					</form>
					<form
						class="alienhand-workbench__quote-form"
						@submit.prevent="createQuote('cut', cut.cut_id)"
					>
						<input
							v-model="quoteDrafts[quoteKey('cut', cut.cut_id)]"
							placeholder="Quote excerpt"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateQuote('cut', cut.cut_id)"
						>
							Quote
						</button>
					</form>
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
				<article
					v-for="chapter in chapters"
					:key="chapter.chapter_id"
					:class="[
						'alienhand-workbench__card',
						{
							'alienhand-workbench__card--bookmarked':
								targetBookmarks('chapter', chapter.chapter_id).length,
						},
						{
							'alienhand-workbench__card--sticky':
								targetStickies('chapter', chapter.chapter_id).length,
						},
					]"
				>
					<div class="alienhand-workbench__meta">
						<span>{{ chapter.member_cut_ids.length }} cuts</span>
						<time>{{ formatTimestamp(chapter.updated_at) }}</time>
					</div>
					<h4>{{ chapter.title }}</h4>
					<p>{{ chapter.summary || "No summary yet." }}</p>
					<div
						v-if="targetStickies('chapter', chapter.chapter_id).length"
						class="alienhand-workbench__stickies"
					>
						<span
							v-for="sticky in targetStickies('chapter', chapter.chapter_id)"
							:key="sticky.sticky_id"
						>
							Pinned reminder
							<button class="btn btn-sm" @click="removeSticky(sticky)">
								Unpin
							</button>
						</span>
					</div>
					<div
						v-if="targetBookmarks('chapter', chapter.chapter_id).length"
						class="alienhand-workbench__bookmarks"
					>
						<div
							v-for="bookmark in targetBookmarks('chapter', chapter.chapter_id)"
							:key="bookmark.bookmark_id"
							:class="[
								'alienhand-workbench__bookmark-chip',
								{
									'alienhand-workbench__bookmark-chip--sticky':
										targetStickies('bookmark', bookmark.bookmark_id).length,
								},
							]"
						>
							Bookmark: {{ bookmark.note || bookmark.label || bookmark.bookmark_id }}
							<span v-if="bookmark.note" class="alienhand-workbench__bookmark-popover">
								{{ bookmark.note }}
							</span>
							<button
								v-if="firstSticky('bookmark', bookmark.bookmark_id)"
								class="btn btn-sm"
								@click="removeFirstSticky('bookmark', bookmark.bookmark_id)"
							>
								Unpin
							</button>
							<button
								v-else
								class="btn btn-sm"
								:disabled="!canCreateSticky('bookmark', bookmark.bookmark_id)"
								@click="createSticky('bookmark', bookmark.bookmark_id)"
							>
								Pin
							</button>
						</div>
					</div>
					<div
						v-if="targetQuotes('chapter', chapter.chapter_id).length"
						class="alienhand-workbench__quotes"
					>
						<blockquote
							v-for="quote in targetQuotes('chapter', chapter.chapter_id)"
							:key="quote.quote_id"
						>
							{{ quote.excerpt }}
						</blockquote>
					</div>
					<div class="alienhand-workbench__actions">
						<button
							class="btn btn-sm"
							:disabled="!canCreateSticky('chapter', chapter.chapter_id)"
							@click="createSticky('chapter', chapter.chapter_id)"
						>
							Pin
						</button>
					</div>
					<form
						class="alienhand-workbench__bookmark-form"
						@submit.prevent="createBookmark('chapter', chapter.chapter_id)"
					>
						<input
							v-model="bookmarkDrafts[bookmarkKey('chapter', chapter.chapter_id)]"
							placeholder="Bookmark note"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateBookmark('chapter', chapter.chapter_id)"
						>
							Bookmark
						</button>
					</form>
					<form
						class="alienhand-workbench__quote-form"
						@submit.prevent="createQuote('chapter', chapter.chapter_id)"
					>
						<input
							v-model="quoteDrafts[quoteKey('chapter', chapter.chapter_id)]"
							placeholder="Quote excerpt"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateQuote('chapter', chapter.chapter_id)"
						>
							Quote
						</button>
					</form>
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
	createAlienHandRefinementBookmark,
	createAlienHandRefinementChapter,
	createAlienHandRefinementCut,
	createAlienHandRefinementQuote,
	createAlienHandRefinementSticky,
	listAlienHandRefinementBlocks,
	listAlienHandRefinementBookmarks,
	listAlienHandRefinementChapters,
	listAlienHandRefinementCuts,
	listAlienHandRefinementQuotes,
	listAlienHandRefinementStickies,
	removeAlienHandRefinementCut,
	removeAlienHandRefinementSticky,
	searchAlienHandRefinement,
	type AlienHandConversationBookmark,
	type AlienHandConversationBlock,
	type AlienHandConversationChapter,
	type AlienHandConversationCut,
	type AlienHandConversationQuote,
	type AlienHandConversationSticky,
	type AlienHandRefinementTargetType,
	type AlienHandStickyTargetType,
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
		const bookmarks = ref<AlienHandConversationBookmark[]>([]);
		const quotes = ref<AlienHandConversationQuote[]>([]);
		const stickies = ref<AlienHandConversationSticky[]>([]);
		const bookmarkDrafts = ref<Record<string, string>>({});
		const quoteDrafts = ref<Record<string, string>>({});
		const loading = ref(false);
		const error = ref("");
		const pendingBlockId = ref("");
		const pendingCutId = ref("");
		const pendingBookmarkKey = ref("");
		const pendingQuoteKey = ref("");
		const pendingStickyKey = ref("");
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
		const targetKey = (targetType: string, targetId: string) =>
			`${targetType}:${targetId}`;
		const bookmarkKey = (targetType: AlienHandRefinementTargetType, targetId: string) =>
			targetKey(targetType, targetId);
		const quoteKey = (sourceType: AlienHandRefinementTargetType, sourceId: string) =>
			targetKey(sourceType, sourceId);
		const bookmarksByTarget = computed(() => {
			const grouped = new Map<string, AlienHandConversationBookmark[]>();

			for (const bookmark of bookmarks.value) {
				const key = targetKey(bookmark.target_type, bookmark.target_id);
				const group = grouped.get(key) || [];
				group.push(bookmark);
				grouped.set(key, group);
			}

			return grouped;
		});
		const quotesBySource = computed(() => {
			const grouped = new Map<string, AlienHandConversationQuote[]>();

			for (const quote of quotes.value) {
				const key = targetKey(quote.source_type, quote.source_id);
				const group = grouped.get(key) || [];
				group.push(quote);
				grouped.set(key, group);
			}

			return grouped;
		});
		const stickiesByTarget = computed(() => {
			const grouped = new Map<string, AlienHandConversationSticky[]>();

			for (const sticky of stickies.value) {
				const key = targetKey(sticky.target_type, sticky.target_id);
				const group = grouped.get(key) || [];
				group.push(sticky);
				grouped.set(key, group);
			}

			return grouped;
		});
		const rawDebugText = computed(() =>
			JSON.stringify(
				{
					blocks: blocks.value,
					bookmarks: bookmarks.value,
					chapters: chapters.value,
					cuts: cuts.value,
					quotes: quotes.value,
					stickies: stickies.value,
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
				const [nextBlocks, nextCuts, nextChapters, nextBookmarks, nextQuotes, nextStickies] = await Promise.all([
					listAlienHandRefinementBlocks(channelUuid.value),
					listAlienHandRefinementCuts(channelUuid.value),
					listAlienHandRefinementChapters(channelUuid.value),
					listAlienHandRefinementBookmarks(channelUuid.value),
					listAlienHandRefinementQuotes(channelUuid.value),
					listAlienHandRefinementStickies(channelUuid.value),
				]);

				blocks.value = nextBlocks;
				cuts.value = nextCuts;
				chapters.value = nextChapters;
				bookmarks.value = nextBookmarks;
				quotes.value = nextQuotes;
				stickies.value = nextStickies;
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

		const targetBookmarks = (targetType: AlienHandRefinementTargetType, targetId: string) =>
			bookmarksByTarget.value.get(bookmarkKey(targetType, targetId)) || [];

		const targetQuotes = (sourceType: AlienHandRefinementTargetType, sourceId: string) =>
			quotesBySource.value.get(quoteKey(sourceType, sourceId)) || [];

		const targetStickies = (targetType: AlienHandStickyTargetType, targetId: string) =>
			stickiesByTarget.value.get(targetKey(targetType, targetId)) || [];

		const firstSticky = (targetType: AlienHandStickyTargetType, targetId: string) =>
			targetStickies(targetType, targetId)[0];

		const canCreateBookmark = (targetType: AlienHandRefinementTargetType, targetId: string) => {
			const key = bookmarkKey(targetType, targetId);
			return Boolean(bookmarkDrafts.value[key]?.trim()) && pendingBookmarkKey.value !== key;
		};

		const canCreateQuote = (sourceType: AlienHandRefinementTargetType, sourceId: string) => {
			const key = quoteKey(sourceType, sourceId);
			return Boolean(quoteDrafts.value[key]?.trim()) && pendingQuoteKey.value !== key;
		};

		const canCreateSticky = (targetType: AlienHandStickyTargetType, targetId: string) => {
			const key = targetKey(targetType, targetId);
			return !targetStickies(targetType, targetId).length && pendingStickyKey.value !== key;
		};

		const createBookmark = async (targetType: AlienHandRefinementTargetType, targetId: string) => {
			const key = bookmarkKey(targetType, targetId);
			const note = bookmarkDrafts.value[key]?.trim() || "";

			if (!note) {
				error.value = "Add a note before creating a bookmark.";
				return;
			}

			pendingBookmarkKey.value = key;
			error.value = "";

			try {
				await createAlienHandRefinementBookmark(targetType, targetId, "Workbench bookmark", note);
				delete bookmarkDrafts.value[key];
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingBookmarkKey.value = "";
			}
		};

		const createQuote = async (sourceType: AlienHandRefinementTargetType, sourceId: string) => {
			const key = quoteKey(sourceType, sourceId);
			const excerpt = quoteDrafts.value[key]?.trim() || "";

			if (!excerpt) {
				error.value = "Add an excerpt before creating a quote.";
				return;
			}

			pendingQuoteKey.value = key;
			error.value = "";

			try {
				await createAlienHandRefinementQuote(sourceType, sourceId, excerpt, {
					channel_uuid: channelUuid.value,
					source_id: sourceId,
					source_type: sourceType,
				});
				delete quoteDrafts.value[key];
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingQuoteKey.value = "";
			}
		};

		const createSticky = async (targetType: AlienHandStickyTargetType, targetId: string) => {
			const key = targetKey(targetType, targetId);
			pendingStickyKey.value = key;
			error.value = "";

			try {
				await createAlienHandRefinementSticky(targetType, targetId);
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingStickyKey.value = "";
			}
		};

		const removeSticky = async (sticky: AlienHandConversationSticky) => {
			pendingStickyKey.value = targetKey(sticky.target_type, sticky.target_id);
			error.value = "";

			try {
				await removeAlienHandRefinementSticky(sticky.sticky_id);
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingStickyKey.value = "";
			}
		};

		const removeFirstSticky = async (targetType: AlienHandStickyTargetType, targetId: string) => {
			const sticky = firstSticky(targetType, targetId);

			if (sticky) {
				await removeSticky(sticky);
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
				bookmarks.value = [];
				quotes.value = [];
				stickies.value = [];
				bookmarkDrafts.value = {};
				quoteDrafts.value = {};
				searchHitBlockIds.value = new Set();
				await refresh();
			},
			{immediate: true}
		);

		return {
			activeCuts,
			blockById,
			bookmarkDrafts,
			bookmarkKey,
			bookmarks,
			blocks,
			canCreateBookmark,
			canCreateQuote,
			canCreateSticky,
			channelUuid,
			chapterSummary,
			chapterTitle,
			chapters,
			createBookmark,
			createChapter,
			createCut,
			createQuote,
			createSticky,
			cuts,
			error,
			firstSticky,
			formatTimestamp,
			loading,
			pendingBlockId,
			pendingCutId,
			quoteDrafts,
			quoteKey,
			quotes,
			rawDebugText,
			refresh,
			removeCut,
			removeFirstSticky,
			removeSticky,
			runSearch,
			searchHitBlockIds,
			searchTerm,
			showCutsPane,
			showEditsPane,
			showRawPane,
			showRawText,
			stickies,
			targetBookmarks,
			targetQuotes,
			targetStickies,
		};
	},
});
</script>
