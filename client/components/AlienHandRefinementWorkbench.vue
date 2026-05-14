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
					Chat
				</button>
				<button class="btn btn-sm" :aria-pressed="showCutsPane" @click="showCutsPane = !showCutsPane">
					Cutting
				</button>
				<button class="btn btn-sm" :aria-pressed="showEditsPane" @click="showEditsPane = !showEditsPane">
					Editing
				</button>
			</div>
		</header>

		<p v-if="error" class="alienhand-workbench__error">{{ error }}</p>

		<div
			v-if="selectedSourceBlock"
			class="alienhand-workbench__source-bridge"
			aria-label="Selected source message for cuts"
		>
			<button
				class="alienhand-workbench__source-arrow"
				:disabled="pendingBlockId === selectedSourceBlock.block_id"
				title="Insert selected message into cuts"
				@click="insertSelectedSource"
			>
				&rarr;
			</button>
			<div class="alienhand-workbench__source-bubble">
				<strong>@{{ selectedSourceBlock.sender }}</strong>
				<span>{{ selectedSourceBlock.presentation }}</span>
				<button
					class="alienhand-workbench__remove"
					title="Clear selected source"
					@click="selectedSourceBlock = null"
				>
					x
				</button>
			</div>
		</div>

		<form class="alienhand-workbench__search" @submit.prevent="runSearch">
			<input v-model="searchTerm" placeholder="Search raw blocks" />
			<button class="btn btn-sm" :disabled="loading || !searchTerm.trim()">Search</button>
		</form>

		<div class="alienhand-workbench__panes">
			<section v-if="showRawPane" class="alienhand-workbench__pane">
				<header>
					<h3>Chat</h3>
					<span>{{ blocks.length }} blocks</span>
				</header>
				<p v-if="!blocks.length" class="alienhand-workbench__empty">
					No persisted AlienHand blocks are available for this channel yet.
				</p>
				<article
					v-for="block in blocks"
					:id="sourceElementId('block', block.block_id)"
					:key="block.block_id"
					:class="[
						'alienhand-workbench__card',
						{'alienhand-workbench__card--hit': searchHitBlockIds.has(block.block_id)},
						{
							'alienhand-workbench__card--source-highlight':
								highlightedBlockId === block.block_id,
						},
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
					<h3>Cutting</h3>
					<span>{{ activeCuts.length }} active</span>
				</header>
				<p class="alienhand-workbench__pointer">
					Select a live chat line with its arrow, then use the bridge arrow to insert it here.
				</p>
				<p v-if="!activeCuts.length" class="alienhand-workbench__empty">
					Use "Inject into cuts" on a raw block to start composing.
				</p>
				<article
					v-for="cut in activeCuts"
					:id="sourceElementId('cut', cut.cut_id)"
					:key="cut.cut_id"
					:class="[
						'alienhand-workbench__card',
						{
							'alienhand-workbench__card--source-highlight':
								highlightedCutId === cut.cut_id,
						},
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
					<h3>Editing</h3>
					<span>{{ chapters.length }} chapters / {{ edits.length }} edits</span>
				</header>
				<p v-if="!chapters.length" class="alienhand-workbench__empty">
					Chapters created from cuts will appear here.
				</p>
				<div v-if="activeCuts.length" class="alienhand-workbench__editing-projection">
					<header>
						<strong>Editing text</strong>
						<span>Click a line to reveal its source cut and chat block.</span>
					</header>
					<button
						v-for="cut in activeCuts"
						:key="`editing:${cut.cut_id}`"
						type="button"
						:class="[
							'alienhand-workbench__editing-line',
							{
								'alienhand-workbench__editing-line--source-highlight':
									highlightedEditCutId === cut.cut_id,
							},
						]"
						@click="revealCutSource(cut)"
					>
						{{ blockById.get(cut.source_block_id)?.presentation || cut.source_block_id }}
					</button>
				</div>
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
						v-if="tocEntriesForTarget('chapter', chapter.chapter_id).length"
						class="alienhand-workbench__toc"
					>
						<span
							v-for="entry in tocEntriesForTarget('chapter', chapter.chapter_id)"
							:key="`${entry.toc_id}:${entry.ordinal}`"
						>
							TOC {{ entry.ordinal + 1 }}: {{ entry.title }}
						</span>
					</div>
					<div v-if="chapterEdits(chapter).length" class="alienhand-workbench__edits">
						<section v-for="edit in chapterEdits(chapter)" :key="edit.edit_id">
							<div>
								<strong>{{ edit.edit_type }}</strong>
								<span>{{ edit.author }}</span>
							</div>
							<p>{{ edit.reason || "No edit reason recorded." }}</p>
							<pre
								v-for="diff in editDiffsForEdit(edit.edit_id)"
								:key="diff.diff_id"
							>{{ formatJson(diff.content) }}</pre>
						</section>
					</div>
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
						<button
							class="btn btn-sm"
							:disabled="!canCreateTocEntry(chapter)"
							@click="createTocEntry(chapter)"
						>
							Add TOC
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
					<form
						class="alienhand-workbench__edit-form"
						@submit.prevent="createChapterEdit(chapter)"
					>
						<textarea
							v-model="editDrafts[editDraftKey(chapter.chapter_id)]"
							placeholder="Editorial edit note"
							rows="3"
						/>
						<button
							class="btn btn-sm"
							:disabled="!canCreateChapterEdit(chapter)"
						>
							Apply edit
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
import {computed, defineComponent, onBeforeUnmount, onMounted, PropType, ref, watch} from "vue";

import type {ClientChan} from "../js/types";
import eventbus from "../js/eventbus";
import {
	alienHandChannelUuidFromName,
	createAlienHandRefinementBookmark,
	createAlienHandRefinementBlock,
	createAlienHandRefinementChapter,
	createAlienHandRefinementCut,
	createAlienHandRefinementEdit,
	createAlienHandRefinementQuote,
	createAlienHandRefinementSticky,
	createAlienHandRefinementTocEntry,
	listAlienHandRefinementBlocks,
	listAlienHandRefinementBookmarks,
	listAlienHandRefinementChapters,
	listAlienHandRefinementCuts,
	listAlienHandRefinementEditDiffs,
	listAlienHandRefinementEdits,
	listAlienHandRefinementQuotes,
	listAlienHandRefinementStickies,
	listAlienHandRefinementToc,
	removeAlienHandRefinementCut,
	removeAlienHandRefinementSticky,
	searchAlienHandRefinement,
	type AlienHandConversationBookmark,
	type AlienHandConversationBlock,
	type AlienHandConversationBlockInput,
	type AlienHandConversationChapter,
	type AlienHandConversationCut,
	type AlienHandConversationEdit,
	type AlienHandConversationEditDiff,
	type AlienHandConversationQuote,
	type AlienHandConversationSticky,
	type AlienHandConversationTocEntry,
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
		const edits = ref<AlienHandConversationEdit[]>([]);
		const editDiffs = ref<AlienHandConversationEditDiff[]>([]);
		const tocEntries = ref<AlienHandConversationTocEntry[]>([]);
		const selectedSourceBlock = ref<AlienHandConversationBlockInput | null>(null);
		const bookmarkDrafts = ref<Record<string, string>>({});
		const quoteDrafts = ref<Record<string, string>>({});
		const editDrafts = ref<Record<string, string>>({});
		const loading = ref(false);
		const error = ref("");
		const pendingBlockId = ref("");
		const pendingCutId = ref("");
		const pendingBookmarkKey = ref("");
		const pendingQuoteKey = ref("");
		const pendingStickyKey = ref("");
		const pendingEditChapterId = ref("");
		const pendingTocChapterId = ref("");
		const searchTerm = ref("");
		const searchHitBlockIds = ref(new Set<string>());
		const chapterTitle = ref("");
		const chapterSummary = ref("");
		const showRawPane = ref(false);
		const showCutsPane = ref(true);
		const showEditsPane = ref(true);
		const showRawText = ref(false);
		const highlightedBlockId = ref("");
		const highlightedCutId = ref("");
		const highlightedEditCutId = ref("");

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
		const editDiffsByEdit = computed(() => {
			const grouped = new Map<string, AlienHandConversationEditDiff[]>();

			for (const diff of editDiffs.value) {
				const group = grouped.get(diff.edit_id) || [];
				group.push(diff);
				grouped.set(diff.edit_id, group);
			}

			return grouped;
		});
		const tocEntriesByTarget = computed(() => {
			const grouped = new Map<string, AlienHandConversationTocEntry[]>();

			for (const entry of tocEntries.value) {
				const key = targetKey(entry.entry_type, entry.target_id);
				const group = grouped.get(key) || [];
				group.push(entry);
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
					editDiffs: editDiffs.value,
					edits: edits.value,
					quotes: quotes.value,
					stickies: stickies.value,
					tocEntries: tocEntries.value,
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
				const [
					nextBlocks,
					nextCuts,
					nextChapters,
					nextBookmarks,
					nextQuotes,
					nextStickies,
					nextEdits,
					nextEditDiffs,
					nextTocEntries,
				] = await Promise.all([
					listAlienHandRefinementBlocks(channelUuid.value),
					listAlienHandRefinementCuts(channelUuid.value),
					listAlienHandRefinementChapters(channelUuid.value),
					listAlienHandRefinementBookmarks(channelUuid.value),
					listAlienHandRefinementQuotes(channelUuid.value),
					listAlienHandRefinementStickies(channelUuid.value),
					listAlienHandRefinementEdits(),
					listAlienHandRefinementEditDiffs(),
					listAlienHandRefinementToc("main"),
				]);

				blocks.value = nextBlocks;
				cuts.value = nextCuts;
				chapters.value = nextChapters;
				bookmarks.value = nextBookmarks;
				quotes.value = nextQuotes;
				stickies.value = nextStickies;
				edits.value = nextEdits;
				editDiffs.value = nextEditDiffs;
				tocEntries.value = nextTocEntries;
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

		const insertSelectedSource = async () => {
			const sourceBlock = selectedSourceBlock.value;

			if (!sourceBlock) {
				error.value = "Select a live chat line before inserting into cuts.";
				return;
			}

			pendingBlockId.value = sourceBlock.block_id;
			error.value = "";

			try {
				const storedBlock = await createAlienHandRefinementBlock(sourceBlock);
				await createAlienHandRefinementCut(storedBlock.block_id, activeCuts.value.length);
				selectedSourceBlock.value = null;
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

		const chapterEdits = (chapter: AlienHandConversationChapter) => {
			const editIds = new Set(chapter.edit_chain || []);

			return edits.value.filter(
				(edit) =>
					editIds.has(edit.edit_id) ||
					edit.input_ref.id === chapter.chapter_id ||
					edit.output_ref.id === chapter.chapter_id
			);
		};

		const editDiffsForEdit = (editId: string) => editDiffsByEdit.value.get(editId) || [];

		const tocEntriesForTarget = (entryType: string, targetId: string) =>
			tocEntriesByTarget.value.get(targetKey(entryType, targetId)) || [];

		const editDraftKey = (chapterId: string) => targetKey("chapter-edit", chapterId);

		const sourceElementId = (sourceType: "block" | "cut", sourceId: string) =>
			`alienhand-${sourceType}-${sourceId.replace(/[^a-z0-9_-]/gi, "_")}`;

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

		const canCreateChapterEdit = (chapter: AlienHandConversationChapter) => {
			const key = editDraftKey(chapter.chapter_id);
			return Boolean(editDrafts.value[key]?.trim()) && pendingEditChapterId.value !== chapter.chapter_id;
		};

		const canCreateTocEntry = (chapter: AlienHandConversationChapter) =>
			!tocEntriesForTarget("chapter", chapter.chapter_id).length &&
			pendingTocChapterId.value !== chapter.chapter_id;

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

		const createChapterEdit = async (chapter: AlienHandConversationChapter) => {
			const key = editDraftKey(chapter.chapter_id);
			const note = editDrafts.value[key]?.trim() || "";

			if (!note) {
				error.value = "Add an edit note before applying an editorial edit.";
				return;
			}

			pendingEditChapterId.value = chapter.chapter_id;
			error.value = "";

			try {
				await createAlienHandRefinementEdit(
					{type: "chapter", id: chapter.chapter_id},
					{
						type: "chapter",
						id: chapter.chapter_id,
						revision: chapterEdits(chapter).length + 1,
					},
					"annotate",
					note,
					{
						add: [{path: "/editorial_notes/-", value: note}],
						chapter_id: chapter.chapter_id,
					}
				);
				delete editDrafts.value[key];
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingEditChapterId.value = "";
			}
		};

		const createTocEntry = async (chapter: AlienHandConversationChapter) => {
			pendingTocChapterId.value = chapter.chapter_id;
			error.value = "";

			try {
				await createAlienHandRefinementTocEntry(
					"main",
					tocEntries.value.length,
					"chapter",
					chapter.chapter_id,
					chapter.title || `Chapter ${tocEntries.value.length + 1}`,
					{
						block_ids: chapter.member_block_ids,
						cut_ids: chapter.member_cut_ids,
					}
				);
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingTocChapterId.value = "";
			}
		};

		const formatTimestamp = (value: string) => {
			const timestamp = Date.parse(value);

			if (Number.isNaN(timestamp)) {
				return value;
			}

			return new Date(timestamp).toLocaleString();
		};

		const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

		const scrollSourceIntoView = (sourceType: "block" | "cut", sourceId: string) => {
			window.requestAnimationFrame(() => {
				const element = document.getElementById(sourceElementId(sourceType, sourceId));

				if (element) {
					element.scrollIntoView({behavior: "smooth", block: "center"});
				}
			});
		};

		const revealCutSource = (cut: AlienHandConversationCut) => {
			highlightedCutId.value = cut.cut_id;
			highlightedBlockId.value = cut.source_block_id;
			highlightedEditCutId.value = cut.cut_id;

			if (showCutsPane.value) {
				scrollSourceIntoView("cut", cut.cut_id);
			}

			if (showRawPane.value) {
				scrollSourceIntoView("block", cut.source_block_id);
			}
		};

		const onSourceMessageSelected = (block: AlienHandConversationBlockInput) => {
			if (block.channel_uuid !== channelUuid.value) {
				return;
			}

			selectedSourceBlock.value = block;
		};

		onMounted(() => {
			eventbus.on("alienhand:source-message:selected", onSourceMessageSelected);
		});

		onBeforeUnmount(() => {
			eventbus.off("alienhand:source-message:selected", onSourceMessageSelected);
		});

		watch(
			channelUuid,
			async () => {
				blocks.value = [];
				cuts.value = [];
				chapters.value = [];
				bookmarks.value = [];
				quotes.value = [];
				stickies.value = [];
				edits.value = [];
				editDiffs.value = [];
				tocEntries.value = [];
				selectedSourceBlock.value = null;
				bookmarkDrafts.value = {};
				quoteDrafts.value = {};
				editDrafts.value = {};
				searchHitBlockIds.value = new Set();
				highlightedBlockId.value = "";
				highlightedCutId.value = "";
				highlightedEditCutId.value = "";
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
			canCreateChapterEdit,
			canCreateQuote,
			canCreateSticky,
			canCreateTocEntry,
			channelUuid,
			chapterEdits,
			chapterSummary,
			chapterTitle,
			chapters,
			createBookmark,
			createChapter,
			createChapterEdit,
			createCut,
			createQuote,
			createSticky,
			createTocEntry,
			cuts,
			editDiffs,
			editDiffsForEdit,
			editDraftKey,
			editDrafts,
			edits,
			error,
			firstSticky,
			formatJson,
			formatTimestamp,
			highlightedBlockId,
			highlightedCutId,
			highlightedEditCutId,
			insertSelectedSource,
			loading,
			pendingBlockId,
			pendingCutId,
			pendingEditChapterId,
			pendingTocChapterId,
			quoteDrafts,
			quoteKey,
			quotes,
			rawDebugText,
			refresh,
			removeCut,
			removeFirstSticky,
			removeSticky,
			revealCutSource,
			runSearch,
			searchHitBlockIds,
			searchTerm,
			selectedSourceBlock,
			showCutsPane,
			showEditsPane,
			showRawPane,
			showRawText,
			sourceElementId,
			stickies,
			targetBookmarks,
			targetQuotes,
			targetStickies,
			tocEntries,
			tocEntriesForTarget,
		};
	},
});
</script>
