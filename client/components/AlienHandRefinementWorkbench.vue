<template>
	<section
		v-if="channelUuid"
		class="alienhand-workbench"
		aria-label="AlienHand refinement workbench"
	>
		<header class="alienhand-workbench__switchbar">
			<div class="alienhand-workbench__switches" aria-label="AlienHand frame toggles">
				<button
					type="button"
					:aria-pressed="showRawPane"
					aria-label="Show or hide Chat frame"
					@click="showRawPane = !showRawPane"
				>
					Chat
				</button>
				<button
					type="button"
					:aria-pressed="showCutsPane"
					aria-label="Show or hide Cutting frame"
					@click="showCutsPane = !showCutsPane"
				>
					Cutting
				</button>
				<button
					type="button"
					:aria-pressed="showEditsPane"
					aria-label="Show or hide Editing frame"
					@click="showEditsPane = !showEditsPane"
				>
					Editing
				</button>
			</div>
			<div class="alienhand-workbench__runtime">
				<span>{{ channelUuid }}</span>
				<button class="btn btn-sm" :disabled="loadingHistory" @click="loadHistory">
					Load history
				</button>
				<button class="btn btn-sm" :disabled="loading" @click="refresh">Refresh</button>
			</div>
		</header>

		<p v-if="error" class="alienhand-workbench__error">{{ error }}</p>
		<div class="alienhand-workbench__status" aria-live="polite">
			<span
				v-for="item in workbenchStatusItems"
				:key="item.text"
				:class="`alienhand-workbench__status-pill alienhand-workbench__status-pill--${item.kind}`"
			>
				{{ item.text }}
			</span>
		</div>

		<div class="alienhand-workbench__layout">
			<aside class="alienhand-workbench__directory" aria-label="AlienHand directory">
				<div class="alienhand-workbench__directory-tabs" role="tablist">
					<button
						type="button"
						role="tab"
						:aria-selected="directoryTab === 'nicks'"
						@click="directoryTab = 'nicks'"
					>
						Nicks
					</button>
					<button
						type="button"
						role="tab"
						:aria-selected="directoryTab === 'chapters'"
						@click="directoryTab = 'chapters'"
					>
						Chapters
					</button>
					<button
						type="button"
						role="tab"
						:aria-selected="directoryTab === 'workers'"
						@click="directoryTab = 'workers'"
					>
						Workers
					</button>
				</div>
				<div v-if="directoryTab === 'nicks'" class="alienhand-workbench__directory-panel">
					<span
						>{{ channel.users.length }} user{{
							channel.users.length === 1 ? "" : "s"
						}}</span
					>
					<ul>
						<li v-for="user in channel.users" :key="user.nick">
							<strong>{{ user.modes[0] || "" }}</strong>
							{{ user.nick }}
						</li>
					</ul>
				</div>
				<div
					v-else-if="directoryTab === 'chapters'"
					class="alienhand-workbench__directory-panel"
				>
					<span>{{ chapters.length }} chapter{{ chapters.length === 1 ? "" : "s" }}</span>
					<ul v-if="chapters.length">
						<li v-for="chapter in chapters" :key="chapter.chapter_id">
							<button
								type="button"
								:class="[
									'alienhand-workbench__directory-item',
									{
										'alienhand-workbench__directory-item--selected':
											selectedChapterId === chapter.chapter_id,
									},
								]"
								:aria-current="
									selectedChapterId === chapter.chapter_id
										? 'location'
										: undefined
								"
								@click="selectChapter(chapter)"
							>
								<strong>{{ chapter.member_cut_ids.length }}</strong>
								<span>{{ chapter.title || chapter.chapter_id }}</span>
							</button>
						</li>
					</ul>
					<p v-else>No chapters yet.</p>
					<form class="alienhand-workbench__chapter-form" @submit.prevent="createChapter">
						<input v-model="chapterTitle" placeholder="Chapter title" />
						<textarea v-model="chapterSummary" placeholder="Chapter summary" rows="3" />
						<button class="btn" :disabled="!activeCuts.length || loading">
							Create chapter
						</button>
					</form>
				</div>
				<div v-else class="alienhand-workbench__directory-panel">
					<span>{{ streamRequests.length }} worker request{{ streamRequests.length === 1 ? "" : "s" }}</span>
					<ul v-if="streamRequests.length">
						<li v-for="snapshot in streamRequests" :key="snapshot.request.request_id">
							<button
								type="button"
								:class="[
									'alienhand-workbench__directory-item',
									{
										'alienhand-workbench__directory-item--selected':
											selectedStreamRequestId === snapshot.request.request_id,
									},
								]"
								:aria-current="
									selectedStreamRequestId === snapshot.request.request_id
										? 'location'
										: undefined
								"
								@click="selectStreamRequest(snapshot)"
							>
								<strong>{{ snapshot.request.status }}</strong>
								<span>{{ snapshot.request.task_type }}</span>
							</button>
						</li>
					</ul>
					<p v-else>No worker requests yet.</p>
					<article
						v-if="selectedStreamRequest"
						class="alienhand-workbench__stream-inspector"
					>
						<div>
							<strong>{{ selectedStreamRequest.request.task_type }}</strong>
							<span>{{ selectedStreamRequest.request.status }}</span>
						</div>
						<p>{{ latestStreamResponseSummary(selectedStreamRequest) }}</p>
						<code>{{ shortSourceId(selectedStreamRequest.request.request_id) }}</code>
					</article>
				</div>
				<form class="alienhand-workbench__search" @submit.prevent="runSearch">
					<input v-model="searchTerm" placeholder="Search raw chat blocks" />
					<button class="btn btn-sm" :disabled="loading || !searchTerm.trim()">
						Search
					</button>
				</form>
			</aside>

			<section
				v-if="showRawPane"
				class="alienhand-workbench__frame alienhand-workbench__frame--chat"
			>
				<header class="alienhand-workbench__frame-header">
					<strong>Chat</strong>
					<span>{{ channel.name }}</span>
				</header>
				<div class="alienhand-workbench__frame-body alienhand-workbench__frame-body--chat">
					<slot name="chat" />
				</div>
				<div
					v-if="selectedSourceBlock"
					class="alienhand-workbench__source-dock"
					aria-label="Selected source message for cuts"
				>
					<div class="alienhand-workbench__source-bubble">
						<strong>@{{ selectedSourceBlock.sender }}</strong>
						<span>{{ selectedSourceBlock.presentation }}</span>
						<button
							class="alienhand-workbench__remove"
							aria-label="Clear selected source"
							title="Clear selected source"
							@click="selectedSourceBlock = null"
						>
							x
						</button>
					</div>
				</div>
			</section>

			<div
				v-if="showRawPane && showCutsPane"
				ref="bridgeRail"
				class="alienhand-workbench__bridge-rail"
				aria-label="Cut insertion bridge"
			>
				<button
					type="button"
					class="alienhand-workbench__bridge-arrow"
					aria-label="Insert selected source at current Cutting position"
					:disabled="
						!selectedSourceBlock || pendingBlockId === selectedSourceBlock.block_id
					"
					:style="{top: `${bridgeY}px`}"
					:title="bridgeTitle"
					@pointerdown="startBridgeDrag"
					@click="insertFromBridge"
				>
					&rarr;
				</button>
				<div class="alienhand-workbench__bridge-steps">
					<button
						type="button"
						class="alienhand-workbench__bridge-step"
						:disabled="insertionPosition <= 0"
						aria-label="Move cut insertion up"
						title="Move cut insertion up"
						@click="moveInsertion(-1)"
					>
						&uarr;
					</button>
					<button
						type="button"
						class="alienhand-workbench__bridge-step"
						:disabled="insertionPosition >= activeCuts.length"
						aria-label="Move cut insertion down"
						title="Move cut insertion down"
						@click="moveInsertion(1)"
					>
						&darr;
					</button>
				</div>
			</div>

			<section
				v-if="showCutsPane"
				class="alienhand-workbench__frame alienhand-workbench__frame--cuts"
			>
				<header class="alienhand-workbench__frame-header">
					<strong>Cutting</strong>
					<span>{{ activeCuts.length }} active</span>
				</header>
				<div
					ref="cutScroller"
					class="alienhand-workbench__frame-body"
					@scroll="syncBridgeToInsertionMarker"
				>
					<p class="alienhand-workbench__pointer">
						{{ insertionLabel }}. Select a chat line with its arrow, drag the bridge
						arrow here, then click it to cut.
					</p>
					<p v-if="!activeCuts.length" class="alienhand-workbench__empty">
						No cuts yet. Select a chat line, then use the bridge arrow between Chat and
						Cutting.
					</p>
					<div
						v-if="!activeCuts.length || insertionPosition === 0"
						class="alienhand-workbench__insertion-marker"
						:data-insertion-index="0"
					>
						<span>&rarr;</span>
						Insert here
					</div>
					<template v-for="(cut, index) in activeCuts" :key="cut.cut_id">
						<article
							:id="sourceElementId('cut', cut.cut_id)"
							:data-cut-id="cut.cut_id"
							:class="[
								'alienhand-workbench__card',
								{
									'alienhand-workbench__card--source-highlight':
										highlightedCutId === cut.cut_id,
								},
								{
									'alienhand-workbench__card--bookmarked': targetBookmarks(
										'cut',
										cut.cut_id
									).length,
								},
								{
									'alienhand-workbench__card--sticky': targetStickies(
										'cut',
										cut.cut_id
									).length,
								},
							]"
						>
							<div class="alienhand-workbench__meta">
								<span>Cut {{ index + 1 }}</span>
								<button
									class="alienhand-workbench__remove"
									:aria-label="`Remove cut ${index + 1}`"
									:disabled="pendingCutId === cut.cut_id"
									@click="removeCut(cut)"
								>
									x
								</button>
							</div>
							<p>
								<span
									:class="{
										'alienhand-workbench__stale-source': !hasCutSource(cut),
									}"
								>
									{{ cutSourcePresentation(cut) }}
								</span>
							</p>
							<div
								v-if="targetBookmarks('cut', cut.cut_id).length"
								class="alienhand-workbench__bookmarks"
							>
								<div
									v-for="bookmark in targetBookmarks('cut', cut.cut_id)"
									:key="bookmark.bookmark_id"
									class="alienhand-workbench__bookmark-chip"
								>
									Bookmark:
									{{ bookmark.note || bookmark.label || bookmark.bookmark_id }}
									<span
										v-if="bookmark.note"
										class="alienhand-workbench__bookmark-popover"
									>
										{{ bookmark.note }}
									</span>
								</div>
							</div>
							<div
								v-if="targetQuotes('cut', cut.cut_id).length"
								class="alienhand-workbench__quotes"
							>
								<blockquote
									v-for="quote in targetQuotes('cut', cut.cut_id)"
									:key="quote.quote_id"
								>
									{{ quote.excerpt }}
									<footer>
										Quote source: {{ quote.source_type }}
										{{ shortSourceId(quote.source_id) }}
									</footer>
								</blockquote>
							</div>
							<div
								v-if="targetStickies('cut', cut.cut_id).length"
								class="alienhand-workbench__stickies"
							>
								<span
									v-for="sticky in targetStickies('cut', cut.cut_id)"
									:key="sticky.sticky_id"
								>
									Pinned reminder
									<button
										type="button"
										:aria-label="`Unpin cut reminder ${sticky.sticky_id}`"
										@click="removeSticky(sticky)"
									>
										Unpin
									</button>
								</span>
							</div>
							<div class="alienhand-workbench__actions">
								<button
									class="btn btn-sm"
									:disabled="!canCreateSticky('cut', cut.cut_id)"
									@click="createSticky('cut', cut.cut_id)"
								>
									Pin
								</button>
								<button
									v-if="targetStickies('cut', cut.cut_id).length"
									class="btn btn-sm"
									@click="removeFirstSticky('cut', cut.cut_id)"
								>
									Unpin
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
									type="button"
									@click="
										fillQuoteDraft(
											'cut',
											cut.cut_id,
											cutSourcePresentation(cut)
										)
									"
								>
									Use source as quote
								</button>
								<button
									class="btn btn-sm"
									:disabled="!canCreateQuote('cut', cut.cut_id)"
								>
									Quote
								</button>
							</form>
						</article>
						<div
							v-if="insertionPosition === index + 1"
							class="alienhand-workbench__insertion-marker"
							:data-insertion-index="index + 1"
						>
							<span>&rarr;</span>
							Insert here
						</div>
					</template>
					<details v-if="removedCuts.length" class="alienhand-workbench__removed-cuts">
						<summary>{{ removedCuts.length }} removed cuts</summary>
						<button
							v-for="cut in removedCuts"
							:id="sourceElementId('cut', cut.cut_id)"
							:key="`removed:${cut.cut_id}`"
							type="button"
							class="alienhand-workbench__removed-cut"
							:aria-label="`Reveal source for removed cut ${cut.cut_id}`"
							@click="revealCutSource(cut)"
						>
							<span>Removed cut</span>
							<span
								:class="{
									'alienhand-workbench__stale-source': !hasCutSource(cut),
								}"
							>
								{{ cutSourcePresentation(cut) }}
							</span>
						</button>
					</details>
				</div>
			</section>

			<section
				v-if="showEditsPane"
				class="alienhand-workbench__frame alienhand-workbench__frame--edits"
			>
				<header class="alienhand-workbench__frame-header">
					<strong>Editing</strong>
					<span>{{ editingFrameStatus }}</span>
				</header>
				<div class="alienhand-workbench__frame-body">
					<p v-if="!selectedChapter" class="alienhand-workbench__empty">
						Create/select a chapter in the Chapters tab to focus Editing.
					</p>
					<div
						v-if="selectedChapter && editingFocusedCuts.length"
						class="alienhand-workbench__editing-projection"
					>
						<button
							v-for="cut in editingFocusedCuts"
							:key="`editing:${cut.cut_id}`"
							type="button"
							:class="[
								'alienhand-workbench__editing-line',
								{
									'alienhand-workbench__editing-line--source-highlight':
										highlightedEditCutId === cut.cut_id,
								},
								{
									'alienhand-workbench__editing-line--removed':
										cut.status === 'removed',
								},
							]"
							:aria-label="`Reveal source for ${editingCutLabel(
								cut
							)} ${cutSourcePresentation(cut)}`"
							@click="revealCutSource(cut)"
						>
							<strong>{{ editingCutLabel(cut) }}</strong>
							<span
								:class="{'alienhand-workbench__stale-source': !hasCutSource(cut)}"
							>
								{{ cutSourcePresentation(cut) }}
							</span>
						</button>
					</div>
					<p
						v-if="selectedChapter && !editingFocusedCuts.length"
						class="alienhand-workbench__empty"
					>
						This chapter has no visible source cuts yet.
					</p>
					<article
						v-if="selectedChapter"
						:id="sourceElementId('chapter', selectedChapter.chapter_id)"
						:class="[
							'alienhand-workbench__card',
							{
								'alienhand-workbench__card--source-highlight':
									selectedChapterId === selectedChapter.chapter_id,
							},
							{
								'alienhand-workbench__card--bookmarked': targetBookmarks(
									'chapter',
									selectedChapter.chapter_id
								).length,
							},
							{
								'alienhand-workbench__card--sticky': targetStickies(
									'chapter',
									selectedChapter.chapter_id
								).length,
							},
						]"
					>
						<div class="alienhand-workbench__meta">
							<span>{{ selectedChapter.member_cut_ids.length }} cuts</span>
							<time>{{ formatTimestamp(selectedChapter.updated_at) }}</time>
						</div>
						<h4>{{ selectedChapter.title }}</h4>
						<p>{{ selectedChapter.summary || "No summary yet." }}</p>
						<div
							v-if="tocEntriesForTarget('chapter', selectedChapter.chapter_id).length"
							class="alienhand-workbench__toc"
						>
							<span
								v-for="entry in tocEntriesForTarget(
									'chapter',
									selectedChapter.chapter_id
								)"
								:key="`${entry.toc_id}:${entry.ordinal}`"
							>
								TOC {{ entry.ordinal + 1 }}: {{ entry.title }}
							</span>
						</div>
						<div
							v-if="targetBookmarks('chapter', selectedChapter.chapter_id).length"
							class="alienhand-workbench__bookmarks"
						>
							<div
								v-for="bookmark in targetBookmarks(
									'chapter',
									selectedChapter.chapter_id
								)"
								:key="bookmark.bookmark_id"
								class="alienhand-workbench__bookmark-chip"
							>
								Bookmark:
								{{ bookmark.note || bookmark.label || bookmark.bookmark_id }}
								<span
									v-if="bookmark.note"
									class="alienhand-workbench__bookmark-popover"
								>
									{{ bookmark.note }}
								</span>
							</div>
						</div>
						<div
							v-if="targetQuotes('chapter', selectedChapter.chapter_id).length"
							class="alienhand-workbench__quotes"
						>
							<blockquote
								v-for="quote in targetQuotes('chapter', selectedChapter.chapter_id)"
								:key="quote.quote_id"
							>
								{{ quote.excerpt }}
								<footer>
									Quote source: {{ quote.source_type }}
									{{ shortSourceId(quote.source_id) }}
								</footer>
							</blockquote>
						</div>
						<div
							v-if="targetStickies('chapter', selectedChapter.chapter_id).length"
							class="alienhand-workbench__stickies"
						>
							<span
								v-for="sticky in targetStickies(
									'chapter',
									selectedChapter.chapter_id
								)"
								:key="sticky.sticky_id"
							>
								Pinned reminder
								<button
									type="button"
									:aria-label="`Unpin chapter reminder ${sticky.sticky_id}`"
									@click="removeSticky(sticky)"
								>
									Unpin
								</button>
							</span>
						</div>
						<div
							v-if="chapterEdits(selectedChapter).length"
							class="alienhand-workbench__edits"
						>
							<section
								v-for="edit in chapterEdits(selectedChapter)"
								:key="edit.edit_id"
							>
								<div>
									<strong>{{ edit.edit_type }}</strong>
									<span>{{ edit.author }}</span>
								</div>
								<p>{{ edit.reason || "No edit reason recorded." }}</p>
								<pre
									v-for="diff in editDiffsForEdit(edit.edit_id)"
									:key="diff.diff_id"
									>{{ formatJson(diff.content) }}</pre
								>
							</section>
						</div>
						<div class="alienhand-workbench__actions">
							<button
								class="btn btn-sm"
								:disabled="!canCreateSticky('chapter', selectedChapter.chapter_id)"
								@click="createSticky('chapter', selectedChapter.chapter_id)"
							>
								Pin
							</button>
							<button
								v-if="targetStickies('chapter', selectedChapter.chapter_id).length"
								class="btn btn-sm"
								@click="removeFirstSticky('chapter', selectedChapter.chapter_id)"
							>
								Unpin
							</button>
							<button
								class="btn btn-sm"
								:disabled="!canCreateTocEntry(selectedChapter)"
								@click="createTocEntry(selectedChapter)"
							>
								Add TOC
							</button>
						</div>
						<form
							class="alienhand-workbench__edit-form"
							@submit.prevent="createChapterEdit(selectedChapter)"
						>
							<textarea
								v-model="editDrafts[editDraftKey(selectedChapter.chapter_id)]"
								placeholder="Editorial edit note"
								rows="3"
							/>
							<button
								class="btn btn-sm"
								:disabled="!canCreateChapterEdit(selectedChapter)"
							>
								Apply edit
							</button>
						</form>
						<form
							class="alienhand-workbench__bookmark-form"
							@submit.prevent="createBookmark('chapter', selectedChapter.chapter_id)"
						>
							<input
								v-model="
									bookmarkDrafts[
										bookmarkKey('chapter', selectedChapter.chapter_id)
									]
								"
								placeholder="Bookmark note"
							/>
							<button
								class="btn btn-sm"
								:disabled="
									!canCreateBookmark('chapter', selectedChapter.chapter_id)
								"
							>
								Bookmark
							</button>
						</form>
						<form
							class="alienhand-workbench__quote-form"
							@submit.prevent="createQuote('chapter', selectedChapter.chapter_id)"
						>
							<input
								v-model="
									quoteDrafts[quoteKey('chapter', selectedChapter.chapter_id)]
								"
								placeholder="Quote excerpt"
							/>
							<button
								class="btn btn-sm"
								type="button"
								@click="
									fillQuoteDraft(
										'chapter',
										selectedChapter.chapter_id,
										selectedChapter.summary || selectedChapter.title
									)
								"
							>
								Use summary as quote
							</button>
							<button
								class="btn btn-sm"
								:disabled="!canCreateQuote('chapter', selectedChapter.chapter_id)"
							>
								Quote
							</button>
						</form>
					</article>
				</div>
			</section>
		</div>

		<footer class="alienhand-workbench__footer">
			<button class="btn btn-sm" @click="showRawText = !showRawText">
				{{ showRawText ? "Hide" : "Show" }} raw text
			</button>
			<button
				v-if="showRawText"
				class="btn btn-sm"
				type="button"
				:aria-pressed="trackRawText"
				@click="toggleRawTextTracking"
			>
				{{ trackRawText ? "Stop tracking raw text" : "Track raw text" }}
			</button>
			<p class="alienhand-workbench__shortcuts">
				Keyboard shortcuts: Ctrl+Alt+1 Chat, Ctrl+Alt+2 Cutting, Ctrl+Alt+3 Editing,
				Ctrl+Alt+R raw text, Ctrl+Alt+T raw tracking, Ctrl+Alt+H history, Ctrl+Alt+Enter
				insert selected source.
			</p>
			<pre v-if="showRawText" ref="rawTextOutput">{{ rawDebugText }}</pre>
		</footer>
	</section>
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
	createAlienHandHistoryRequest,
	listAlienHandRefinementBlocks,
	listAlienHandRefinementBookmarks,
	listAlienHandRefinementChapters,
	listAlienHandRefinementCuts,
	listAlienHandRefinementDirectives,
	listAlienHandRefinementEditDiffs,
	listAlienHandRefinementEdits,
	listAlienHandRefinementQuotes,
	listAlienHandRefinementStickies,
	listAlienHandRefinementToc,
	listAlienHandStreamRequests,
	removeAlienHandRefinementCut,
	removeAlienHandRefinementSticky,
	searchAlienHandRefinement,
	type AlienHandConversationBookmark,
	type AlienHandConversationBlock,
	type AlienHandConversationBlockInput,
	type AlienHandConversationChapter,
	type AlienHandConversationCut,
	type AlienHandConversationDirective,
	type AlienHandConversationEdit,
	type AlienHandConversationEditDiff,
	type AlienHandConversationQuote,
	type AlienHandConversationSticky,
	type AlienHandConversationTocEntry,
	type AlienHandHistoryReplayChunk,
	type AlienHandRefinementTargetType,
	type AlienHandStreamRequestSnapshot,
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
		const removedCuts = ref<AlienHandConversationCut[]>([]);
		const chapters = ref<AlienHandConversationChapter[]>([]);
		const bookmarks = ref<AlienHandConversationBookmark[]>([]);
		const quotes = ref<AlienHandConversationQuote[]>([]);
		const stickies = ref<AlienHandConversationSticky[]>([]);
		const edits = ref<AlienHandConversationEdit[]>([]);
		const editDiffs = ref<AlienHandConversationEditDiff[]>([]);
		const tocEntries = ref<AlienHandConversationTocEntry[]>([]);
		const directives = ref<AlienHandConversationDirective[]>([]);
		const streamRequests = ref<AlienHandStreamRequestSnapshot[]>([]);
		const streamSummary = ref<Record<string, number>>({});
		const selectedSourceBlock = ref<AlienHandConversationBlockInput | null>(null);
		const historyChunks = ref<AlienHandHistoryReplayChunk[]>([]);
		const bookmarkDrafts = ref<Record<string, string>>({});
		const quoteDrafts = ref<Record<string, string>>({});
		const editDrafts = ref<Record<string, string>>({});
		const loading = ref(false);
		const loadingHistory = ref(false);
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
		const insertionIndex = ref(0);
		const showRawPane = ref(true);
		const showCutsPane = ref(true);
		const showEditsPane = ref(true);
		const showRawText = ref(false);
		const trackRawText = ref(true);
		const highlightedBlockId = ref("");
		const highlightedCutId = ref("");
		const highlightedEditCutId = ref("");
		const selectedChapterId = ref("");
		const selectedStreamRequestId = ref("");
		const directoryTab = ref<"nicks" | "chapters" | "workers">("nicks");
		const cutScroller = ref<HTMLElement | null>(null);
		const bridgeRail = ref<HTMLElement | null>(null);
		const rawTextOutput = ref<HTMLElement | null>(null);
		const bridgeY = ref(520);
		const bridgeDragging = ref(false);
		const bridgeDragged = ref(false);
		const bridgeDragStartY = ref(0);
		const bridgeDragStartTop = ref(520);
		const sourceRevealStatus = ref("");
		const directiveSyncStatus = ref("");
		const historyStatus = ref("");
		const keyboardShortcutStatus = ref("");
		const rawTextStatus = ref("");
		let directivePollTimer: ReturnType<typeof window.setInterval> | null = null;

		const channelUuid = computed(() => alienHandChannelUuidFromName(props.channel.name));
		const activeCuts = computed(() => cuts.value.filter((cut) => cut.status === "active"));
		const insertionPosition = computed(() =>
			Math.min(Math.max(insertionIndex.value, 0), activeCuts.value.length)
		);
		const insertionLabel = computed(() =>
			insertionPosition.value === activeCuts.value.length
				? "end of Cutting"
				: `before cut ${insertionPosition.value + 1}`
		);
		const latestDirectiveSequence = computed(() =>
			directives.value.reduce(
				(maxSequence, directive) => Math.max(maxSequence, directive.sequence || 0),
				0
			)
		);
		const bridgeBlockedReason = computed(() => {
			if (!showRawPane.value || !showCutsPane.value) {
				return "Bridge blocked: show Chat and Cutting to insert source blocks.";
			}

			if (!selectedSourceBlock.value) {
				return "Bridge blocked: select a chat line with its arrow before inserting.";
			}

			if (pendingBlockId.value === selectedSourceBlock.value.block_id) {
				return "Bridge busy: inserting selected source block.";
			}

			return "";
		});
		const bridgeTitle = computed(
			() =>
				bridgeBlockedReason.value ||
				"Drag to choose the cut insertion point. Click to insert the selected chat line."
		);
		const blockById = computed(
			() => new Map(blocks.value.map((block) => [block.block_id, block]))
		);
		const cutById = computed(() => new Map(cuts.value.map((cut) => [cut.cut_id, cut])));
		const selectedChapter = computed(() =>
			chapters.value.find((chapter) => chapter.chapter_id === selectedChapterId.value)
		);
		const selectedStreamRequest = computed(() =>
			streamRequests.value.find(
				(snapshot) => snapshot.request.request_id === selectedStreamRequestId.value
			)
		);
		const activeStreamRequestCount = computed(() =>
			streamRequests.value.filter((snapshot) =>
				["ready", "claimed"].includes(snapshot.request.status)
			).length
		);
		const streamStatusSummaryText = computed(() => {
			const entries = Object.entries(streamSummary.value)
				.filter(([, count]) => count > 0)
				.sort(([left], [right]) => left.localeCompare(right));

			return entries.length
				? entries.map(([status, count]) => `${status} ${count}`).join(", ")
				: "none";
		});
		const editingFocusedCuts = computed(() => {
			if (!selectedChapter.value) {
				return [];
			}

			return selectedChapter.value.member_cut_ids
				.map((cutId) => cutById.value.get(cutId))
				.filter((cut): cut is AlienHandConversationCut => Boolean(cut));
		});
		const editingFrameStatus = computed(() => {
			if (!selectedChapter.value) {
				return "create/select a chapter";
			}

			const chapterEditIds = new Set(selectedChapter.value.edit_chain || []);
			const chapterEditCount = edits.value.filter((edit) =>
				chapterEditIds.has(edit.edit_id)
			).length;
			return `${selectedChapter.value.member_cut_ids.length} cuts / ${chapterEditCount} edits`;
		});
		const workbenchStatusItems = computed(() => {
			const items: Array<{kind: string; text: string}> = [];

			items.push({
				kind: loading.value ? "busy" : "ready",
				text: loading.value
					? "Refreshing refinement state."
					: `${blocks.value.length} stored blocks, ${activeCuts.value.length} active cuts.`,
			});

			if (bridgeBlockedReason.value) {
				items.push({kind: "blocked", text: bridgeBlockedReason.value});
			} else if (selectedSourceBlock.value) {
				items.push({
					kind: "ready",
					text: `Selected @${selectedSourceBlock.value.sender} for insertion at ${insertionLabel.value}.`,
				});
			}

			if (directives.value.length || showRawText.value) {
				items.push({
					kind: directives.value.length ? "ready" : "blocked",
					text: directives.value.length
						? `${directives.value.length} directive ledger events, latest #${latestDirectiveSequence.value}.`
						: "No directive ledger events for this channel.",
				});
			}

			if (streamRequests.value.length || showRawText.value) {
				items.push({
					kind: activeStreamRequestCount.value ? "busy" : "info",
					text: `${streamRequests.value.length} worker requests (${streamStatusSummaryText.value}).`,
				});
			}

			if (sourceRevealStatus.value) {
				items.push({kind: "info", text: sourceRevealStatus.value});
			}

			if (directiveSyncStatus.value && showRawText.value) {
				items.push({kind: "info", text: directiveSyncStatus.value});
			}

			if (historyStatus.value) {
				items.push({kind: "info", text: historyStatus.value});
			}

			if (keyboardShortcutStatus.value) {
				items.push({kind: "info", text: keyboardShortcutStatus.value});
			}

			if (rawTextStatus.value) {
				items.push({kind: "info", text: rawTextStatus.value});
			}

			if (error.value) {
				items.push({kind: "error", text: "Latest workbench error is shown above."});
			}

			return items;
		});
		const targetKey = (targetType: string, targetId: string) => `${targetType}:${targetId}`;
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
					directives: directives.value,
					editDiffs: editDiffs.value,
					edits: edits.value,
					historyChunks: historyChunks.value,
					quotes: quotes.value,
					removedCuts: removedCuts.value,
					stickies: stickies.value,
					streamRequests: streamRequests.value,
					streamSummary: streamSummary.value,
					tocEntries: tocEntries.value,
				},
				null,
				2
			)
		);

		const syncRawTextTracking = () => {
			if (!showRawText.value || !trackRawText.value) {
				return;
			}

			window.requestAnimationFrame(() => {
				if (rawTextOutput.value) {
					rawTextOutput.value.scrollTop = rawTextOutput.value.scrollHeight;
				}
			});
		};

		const toggleRawTextTracking = () => {
			trackRawText.value = !trackRawText.value;
			rawTextStatus.value = trackRawText.value
				? "Raw text tracking is on."
				: "Raw text tracking is off.";
			syncRawTextTracking();
		};

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
					nextRemovedCuts,
					nextChapters,
					nextBookmarks,
					nextQuotes,
					nextStickies,
					nextEdits,
					nextEditDiffs,
					nextTocEntries,
					nextDirectives,
					nextStreamRequestList,
				] = await Promise.all([
					listAlienHandRefinementBlocks(channelUuid.value),
					listAlienHandRefinementCuts(channelUuid.value),
					listAlienHandRefinementCuts(channelUuid.value, "removed"),
					listAlienHandRefinementChapters(channelUuid.value),
					listAlienHandRefinementBookmarks(channelUuid.value),
					listAlienHandRefinementQuotes(channelUuid.value),
					listAlienHandRefinementStickies(channelUuid.value),
					listAlienHandRefinementEdits(),
					listAlienHandRefinementEditDiffs(),
					listAlienHandRefinementToc("main"),
					listAlienHandRefinementDirectives(channelUuid.value),
					listAlienHandStreamRequests(channelUuid.value),
				]);

				blocks.value = nextBlocks;
				cuts.value = nextCuts;
				removedCuts.value = nextRemovedCuts;
				chapters.value = nextChapters;
				bookmarks.value = nextBookmarks;
				quotes.value = nextQuotes;
				stickies.value = nextStickies;
				edits.value = nextEdits;
				editDiffs.value = nextEditDiffs;
				tocEntries.value = nextTocEntries;
				directives.value = nextDirectives;
				streamRequests.value = nextStreamRequestList.requests;
				streamSummary.value = nextStreamRequestList.summary;
				if (
					selectedStreamRequestId.value &&
					!streamRequests.value.some(
						(snapshot) =>
							snapshot.request.request_id === selectedStreamRequestId.value
					)
				) {
					selectedStreamRequestId.value = "";
				}
				sourceRevealStatus.value = "Refinement state refreshed.";
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				loading.value = false;
			}
		};

		const pollDirectiveLedger = async () => {
			if (!channelUuid.value || loading.value) {
				return;
			}

			try {
				const nextDirectives = await listAlienHandRefinementDirectives(
					channelUuid.value,
					latestDirectiveSequence.value,
					20
				);

				if (!nextDirectives.length) {
					return;
				}

				directiveSyncStatus.value = `Directive ledger sync saw ${
					nextDirectives.length
				} remote event${nextDirectives.length === 1 ? "" : "s"}.`;
				await refresh();
			} catch (caught) {
				directiveSyncStatus.value = `Directive ledger sync waiting: ${
					caught instanceof Error ? caught.message : String(caught)
				}`;
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
				const hits = await searchAlienHandRefinement(term, channelUuid.value);
				searchHitBlockIds.value = new Set(hits.map((hit) => hit.block_id));
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				loading.value = false;
			}
		};

		const loadHistory = async () => {
			if (!channelUuid.value) {
				return;
			}

			loadingHistory.value = true;
			error.value = "";
			historyStatus.value = "Loading channel history.";

			try {
				const response = await createAlienHandHistoryRequest(channelUuid.value);
				historyChunks.value = response.chunks;
				historyStatus.value = `Loaded history: ${response.resolved_payloads} payloads across ${response.chunk_count} chunks.`;
				if (response.stream_request_id) {
					selectedStreamRequestId.value = response.stream_request_id;
				}
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
				historyStatus.value = "History request failed; see workbench error.";
			} finally {
				loadingHistory.value = false;
			}
		};

		const createCut = async (block: AlienHandConversationBlock) => {
			pendingBlockId.value = block.block_id;
			error.value = "";

			try {
				const position = insertionPosition.value;
				await createAlienHandRefinementCut(block.block_id, position);
				insertionIndex.value = position + 1;
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingBlockId.value = "";
			}
		};

		const insertSelectedSource = async (sourceBlockInput?: AlienHandConversationBlockInput) => {
			const sourceBlock = sourceBlockInput || selectedSourceBlock.value;

			if (!sourceBlock) {
				error.value = "Select a live chat line before inserting into cuts.";
				sourceRevealStatus.value =
					"Insertion is blocked until a source chat line is selected.";
				return;
			}

			pendingBlockId.value = sourceBlock.block_id;
			error.value = "";

			try {
				const storedBlock = await createAlienHandRefinementBlock(sourceBlock);
				const position = insertionPosition.value;
				await createAlienHandRefinementCut(storedBlock.block_id, position);
				insertionIndex.value = position + 1;

				if (selectedSourceBlock.value?.block_id === sourceBlock.block_id) {
					selectedSourceBlock.value = null;
				}

				sourceRevealStatus.value = `Inserted source block at ${insertionLabel.value}.`;
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingBlockId.value = "";
			}
		};

		const insertFromBridge = async (event: MouseEvent) => {
			if (bridgeDragged.value) {
				event.preventDefault();
				return;
			}

			await insertSelectedSource();
		};

		const shortcutTargetIsEditable = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement)) {
				return false;
			}

			return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
		};

		const handleWorkbenchShortcut = (event: KeyboardEvent) => {
			if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) {
				return;
			}

			if (shortcutTargetIsEditable(event.target)) {
				return;
			}

			const key = event.key.toLowerCase();

			if (key === "1") {
				event.preventDefault();
				showRawPane.value = !showRawPane.value;
				keyboardShortcutStatus.value = `Ctrl+Alt+1 toggled Chat ${
					showRawPane.value ? "on" : "off"
				}.`;
			} else if (key === "2") {
				event.preventDefault();
				showCutsPane.value = !showCutsPane.value;
				keyboardShortcutStatus.value = `Ctrl+Alt+2 toggled Cutting ${
					showCutsPane.value ? "on" : "off"
				}.`;
			} else if (key === "3") {
				event.preventDefault();
				showEditsPane.value = !showEditsPane.value;
				keyboardShortcutStatus.value = `Ctrl+Alt+3 toggled Editing ${
					showEditsPane.value ? "on" : "off"
				}.`;
			} else if (key === "r") {
				event.preventDefault();
				showRawText.value = !showRawText.value;
				keyboardShortcutStatus.value = `Ctrl+Alt+R toggled raw text ${
					showRawText.value ? "on" : "off"
				}.`;
				syncRawTextTracking();
			} else if (key === "t") {
				event.preventDefault();
				keyboardShortcutStatus.value = "Ctrl+Alt+T toggled raw text tracking.";
				toggleRawTextTracking();
			} else if (key === "h") {
				event.preventDefault();
				keyboardShortcutStatus.value = "Ctrl+Alt+H requested channel history.";
				void loadHistory();
			} else if (event.key === "Enter") {
				event.preventDefault();
				keyboardShortcutStatus.value =
					"Ctrl+Alt+Enter inserts selected source at the Cutting pointer.";
				void insertSelectedSource();
			}
		};

		const updateInsertionFromClientY = (clientY: number) => {
			const cutCards = Array.from(
				cutScroller.value?.querySelectorAll<HTMLElement>("[data-cut-id]") || []
			);
			let nextIndex = cutCards.length;

			for (const [index, card] of cutCards.entries()) {
				const rect = card.getBoundingClientRect();

				if (clientY < rect.top + rect.height / 2) {
					nextIndex = index;
					break;
				}
			}

			insertionIndex.value = nextIndex;
		};

		const clampBridgeY = (value: number) => {
			const railHeight = bridgeRail.value?.clientHeight || window.innerHeight;
			const minY = 30;
			const maxY = Math.max(minY, railHeight - 54);

			return Math.min(Math.max(value, minY), maxY);
		};

		const syncBridgeToInsertionMarker = () => {
			if (bridgeDragging.value) {
				return;
			}

			window.requestAnimationFrame(() => {
				const rail = bridgeRail.value;
				const marker = cutScroller.value?.querySelector<HTMLElement>(
					`[data-insertion-index="${insertionPosition.value}"]`
				);

				if (!rail || !marker) {
					return;
				}

				const railRect = rail.getBoundingClientRect();
				const markerRect = marker.getBoundingClientRect();
				const arrowCenterOffset = 17;

				bridgeY.value = clampBridgeY(
					markerRect.top + markerRect.height / 2 - railRect.top - arrowCenterOffset
				);
			});
		};

		const moveInsertion = (delta: number) => {
			insertionIndex.value = Math.min(
				Math.max(insertionPosition.value + delta, 0),
				activeCuts.value.length
			);
			sourceRevealStatus.value = `Insertion position moved to ${insertionLabel.value}.`;
			syncBridgeToInsertionMarker();
		};

		const startBridgeDrag = (event: PointerEvent) => {
			const target = event.currentTarget as HTMLElement;
			bridgeDragStartY.value = event.clientY;
			bridgeDragStartTop.value = bridgeY.value;
			bridgeDragging.value = true;
			bridgeDragged.value = false;
			target.setPointerCapture(event.pointerId);

			const moveBridge = (moveEvent: PointerEvent) => {
				const delta = moveEvent.clientY - bridgeDragStartY.value;
				bridgeY.value = clampBridgeY(bridgeDragStartTop.value + delta);

				if (Math.abs(delta) > 4) {
					bridgeDragged.value = true;
				}

				updateInsertionFromClientY(moveEvent.clientY);
			};

			const stopBridge = () => {
				window.removeEventListener("pointermove", moveBridge);
				bridgeDragging.value = false;
				syncBridgeToInsertionMarker();
				window.setTimeout(() => {
					bridgeDragged.value = false;
				}, 0);
			};

			window.addEventListener("pointermove", moveBridge);
			window.addEventListener("pointerup", stopBridge, {once: true});
			updateInsertionFromClientY(event.clientY);
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
				const chapter = await createAlienHandRefinementChapter(title, summary, cutIds);
				selectedChapterId.value = chapter.chapter_id;
				directoryTab.value = "chapters";
				sourceRevealStatus.value = `Created and selected chapter ${
					chapter.title || chapter.chapter_id
				}.`;
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

		const hasCutSource = (cut: AlienHandConversationCut) =>
			blockById.value.has(cut.source_block_id);

		const cutSourcePresentation = (cut: AlienHandConversationCut) =>
			blockById.value.get(cut.source_block_id)?.presentation ||
			`Missing source block ${cut.source_block_id}`;

		const editingCutLabel = (cut: AlienHandConversationCut) =>
			cut.status === "removed" ? "Removed editing source line" : "Editing source line";

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

		const sourceElementId = (sourceType: "block" | "cut" | "chapter", sourceId: string) =>
			`alienhand-${sourceType}-${sourceId.replace(/[^a-z0-9_-]/gi, "_")}`;

		const sourceBlockElementId = (sourceId: string) => {
			const match = /^thelounge:[^:]+:(\d+)$/.exec(sourceId);

			return match ? `msg-${match[1]}` : sourceElementId("block", sourceId);
		};

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
			return (
				Boolean(editDrafts.value[key]?.trim()) &&
				pendingEditChapterId.value !== chapter.chapter_id
			);
		};

		const canCreateTocEntry = (chapter: AlienHandConversationChapter) =>
			!tocEntriesForTarget("chapter", chapter.chapter_id).length &&
			pendingTocChapterId.value !== chapter.chapter_id;

		const createBookmark = async (
			targetType: AlienHandRefinementTargetType,
			targetId: string
		) => {
			const key = bookmarkKey(targetType, targetId);
			const note = bookmarkDrafts.value[key]?.trim() || "";

			if (!note) {
				error.value = "Add a note before creating a bookmark.";
				return;
			}

			pendingBookmarkKey.value = key;
			error.value = "";

			try {
				await createAlienHandRefinementBookmark(
					targetType,
					targetId,
					"Workbench bookmark",
					note
				);
				delete bookmarkDrafts.value[key];
				await refresh();
			} catch (caught) {
				error.value = caught instanceof Error ? caught.message : String(caught);
			} finally {
				pendingBookmarkKey.value = "";
			}
		};

		const fillQuoteDraft = (
			sourceType: AlienHandRefinementTargetType,
			sourceId: string,
			excerpt: string
		) => {
			quoteDrafts.value[quoteKey(sourceType, sourceId)] = excerpt;
			sourceRevealStatus.value = `Quote draft filled from ${sourceType} source.`;
		};

		const shortSourceId = (sourceId: string) =>
			sourceId.length > 12 ? `${sourceId.slice(0, 8)}...` : sourceId;

		const selectStreamRequest = (snapshot: AlienHandStreamRequestSnapshot) => {
			selectedStreamRequestId.value = snapshot.request.request_id;
		};

		const latestStreamResponseSummary = (snapshot: AlienHandStreamRequestSnapshot) => {
			const response = snapshot.responses[0];

			if (response?.result_summary) {
				return response.result_summary;
			}

			if (response?.error_ref) {
				return response.error_ref;
			}

			if (snapshot.request.error_ref) {
				return snapshot.request.error_ref;
			}

			return `${snapshot.request.requester_kind}:${snapshot.request.requester_id}`;
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

		const removeFirstSticky = async (
			targetType: AlienHandStickyTargetType,
			targetId: string
		) => {
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

		const pulseSourceElement = (element: HTMLElement) => {
			element.classList.add("alienhand-workbench__message-source-highlight");
			window.setTimeout(() => {
				element.classList.remove("alienhand-workbench__message-source-highlight");
			}, 1800);
		};

		const scrollSourceIntoView = (
			sourceType: "block" | "cut" | "chapter",
			sourceId: string,
			foundMessage?: string,
			missingMessage?: string
		) => {
			window.requestAnimationFrame(() => {
				const element = document.getElementById(
					sourceType === "block"
						? sourceBlockElementId(sourceId)
						: sourceElementId(sourceType, sourceId)
				);

				if (element) {
					element.scrollIntoView({behavior: "smooth", block: "center"});
					pulseSourceElement(element);
					sourceRevealStatus.value =
						foundMessage ||
						(sourceType === "block"
							? "Revealed source chat message."
							: sourceType === "cut"
							? "Revealed source cut."
							: "Revealed selected chapter.");
				} else {
					sourceRevealStatus.value =
						missingMessage ||
						(sourceType === "block"
							? "Source chat message is not visible in the current Chat frame."
							: sourceType === "cut"
							? "Source cut is not visible in the current Cutting frame."
							: "Selected chapter is not visible in the current Editing frame.");
				}
			});
		};

		const revealCutSource = (cut: AlienHandConversationCut) => {
			highlightedCutId.value = cut.cut_id;
			highlightedBlockId.value = cut.source_block_id;
			highlightedEditCutId.value = cut.cut_id;
			const hiddenFrames = [
				showCutsPane.value ? "" : "Cutting",
				showRawPane.value ? "" : "Chat",
			].filter(Boolean);

			if (cut.status !== "active") {
				sourceRevealStatus.value = "Revealing source for a removed cut.";
			}

			if (!hasCutSource(cut)) {
				sourceRevealStatus.value =
					"Cut source block is missing from the current stored block set.";
			}

			if (showCutsPane.value) {
				scrollSourceIntoView(
					"cut",
					cut.cut_id,
					!hasCutSource(cut)
						? "Revealed cut; source block is missing from the stored block set."
						: cut.status === "active"
						? "Revealed source cut."
						: "Revealed removed cut.",
					cut.status === "active"
						? "Source cut is not visible in the current Cutting frame."
						: "Removed cut is not visible in the current Cutting frame."
				);
			} else {
				sourceRevealStatus.value = "Cutting is hidden, so the source cut cannot be shown.";
			}

			if (showRawPane.value && hasCutSource(cut)) {
				scrollSourceIntoView("block", cut.source_block_id);
			} else if (showRawPane.value) {
				sourceRevealStatus.value =
					"Cut source block is missing from the current stored block set.";
			} else if (!hasCutSource(cut)) {
				sourceRevealStatus.value =
					"Chat is hidden, and the source block is missing from the current stored block set.";
			} else {
				sourceRevealStatus.value =
					"Chat is hidden, so the source chat block cannot be shown.";
			}

			if (hiddenFrames.length === 2) {
				sourceRevealStatus.value =
					"Chat and Cutting are hidden, so the source locations are highlighted but not visible.";
			}
		};

		const selectChapter = (chapter: AlienHandConversationChapter) => {
			selectedChapterId.value = chapter.chapter_id;
			directoryTab.value = "chapters";

			if (showEditsPane.value) {
				scrollSourceIntoView(
					"chapter",
					chapter.chapter_id,
					`Selected chapter ${chapter.title || chapter.chapter_id}.`,
					"Editing is visible, but the selected chapter card is not currently mounted."
				);
			} else {
				sourceRevealStatus.value =
					"Editing is hidden, so the selected chapter card cannot be shown.";
			}

			const firstCut = chapter.member_cut_ids
				.map((cutId) => cutById.value.get(cutId))
				.find((cut): cut is AlienHandConversationCut => Boolean(cut));

			if (firstCut) {
				revealCutSource(firstCut);
			} else {
				highlightedCutId.value = "";
				highlightedBlockId.value = "";
				highlightedEditCutId.value = "";
				sourceRevealStatus.value =
					"Selected chapter has no currently visible source cut to reveal.";
			}
		};

		const onSourceMessageSelected = (block: AlienHandConversationBlockInput) => {
			if (block.channel_uuid !== channelUuid.value) {
				return;
			}

			selectedSourceBlock.value = block;
			sourceRevealStatus.value = `Selected @${block.sender} for Cutting.`;
		};

		const onSourceMessageInsertRequested = (block: AlienHandConversationBlockInput) => {
			if (block.channel_uuid !== channelUuid.value) {
				return;
			}

			selectedSourceBlock.value = block;
			void insertSelectedSource(block);
		};

		onMounted(() => {
			eventbus.on("alienhand:source-message:selected", onSourceMessageSelected);
			eventbus.on(
				"alienhand:source-message:insert-requested",
				onSourceMessageInsertRequested
			);
			directivePollTimer = window.setInterval(() => {
				void pollDirectiveLedger();
			}, 5000);
			window.addEventListener("keydown", handleWorkbenchShortcut);
		});

		onBeforeUnmount(() => {
			eventbus.off("alienhand:source-message:selected", onSourceMessageSelected);
			eventbus.off(
				"alienhand:source-message:insert-requested",
				onSourceMessageInsertRequested
			);

			if (directivePollTimer !== null) {
				window.clearInterval(directivePollTimer);
				directivePollTimer = null;
			}

			window.removeEventListener("keydown", handleWorkbenchShortcut);
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
				removedCuts.value = [];
				streamRequests.value = [];
				streamSummary.value = {};
				historyChunks.value = [];
				selectedSourceBlock.value = null;
				bookmarkDrafts.value = {};
				quoteDrafts.value = {};
				editDrafts.value = {};
				insertionIndex.value = 0;
				searchHitBlockIds.value = new Set();
				highlightedBlockId.value = "";
				highlightedCutId.value = "";
				highlightedEditCutId.value = "";
				selectedChapterId.value = "";
				selectedStreamRequestId.value = "";
				sourceRevealStatus.value = "";
				historyStatus.value = "";
				keyboardShortcutStatus.value = "";
				rawTextStatus.value = "";
				await refresh();
			},
			{immediate: true}
		);

		watch(
			() => [rawDebugText.value, showRawText.value, trackRawText.value],
			() => {
				syncRawTextTracking();
			}
		);

		watch(
			() => activeCuts.value.length,
			(count) => {
				if (insertionIndex.value > count) {
					insertionIndex.value = count;
				}

				syncBridgeToInsertionMarker();
			}
		);

		watch(
			() => [
				insertionPosition.value,
				showRawPane.value,
				showCutsPane.value,
				selectedSourceBlock.value?.block_id || "",
			],
			() => {
				syncBridgeToInsertionMarker();
			}
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
			bridgeRail,
			bridgeY,
			bridgeBlockedReason,
			bridgeTitle,
			createBookmark,
			createChapter,
			createChapterEdit,
			createCut,
			createQuote,
			createSticky,
			createTocEntry,
			cuts,
			cutScroller,
			cutSourcePresentation,
			cutById,
			directoryTab,
			directiveSyncStatus,
			directives,
			editDiffs,
			editDiffsForEdit,
			editDraftKey,
			editDrafts,
			editingCutLabel,
			editingFocusedCuts,
			editingFrameStatus,
			edits,
			error,
			fillQuoteDraft,
			firstSticky,
			formatJson,
			formatTimestamp,
			highlightedBlockId,
			highlightedCutId,
			highlightedEditCutId,
			historyChunks,
			historyStatus,
			insertionIndex,
			insertionLabel,
			insertSelectedSource,
			insertFromBridge,
			keyboardShortcutStatus,
			loading,
			loadingHistory,
			loadHistory,
			moveInsertion,
			pendingBlockId,
			pendingCutId,
			pendingEditChapterId,
			pendingTocChapterId,
			quoteDrafts,
			quoteKey,
			quotes,
			rawDebugText,
			rawTextOutput,
			rawTextStatus,
			refresh,
			removeCut,
			removeFirstSticky,
			removeSticky,
			revealCutSource,
			removedCuts,
			runSearch,
			searchHitBlockIds,
			searchTerm,
			selectChapter,
			selectStreamRequest,
			selectedChapter,
			selectedStreamRequest,
			selectedSourceBlock,
			selectedChapterId,
			selectedStreamRequestId,
			hasCutSource,
			showCutsPane,
			showEditsPane,
			showRawPane,
			showRawText,
			sourceElementId,
			sourceRevealStatus,
			startBridgeDrag,
			shortSourceId,
			latestStreamResponseSummary,
			syncBridgeToInsertionMarker,
			stickies,
			streamRequests,
			streamStatusSummaryText,
			streamSummary,
			targetBookmarks,
			targetQuotes,
			targetStickies,
			toggleRawTextTracking,
			tocEntries,
			tocEntriesForTarget,
			trackRawText,
			workbenchStatusItems,
		};
	},
});
</script>
