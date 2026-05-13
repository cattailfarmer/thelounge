import type {AlienHandRenderRow, SharedMsg} from "../../../shared/types/msg";
import {store} from "../store";

const ENVELOPE_PROTOCOL = "AH1";
const RESOLVER_STORAGE_KEY = "alienhandPayloadResolver";
const RESOLVER_TOKEN_STORAGE_KEY = "alienhandPayloadResolverToken";

type AlienHandEnvelope = {
	appId: string;
	channelUuid: string;
	messageUuid: string;
	nick: string;
	timestamp: string;
};

export type AlienHandConversationBlock = {
	block_id: string;
	channel_uuid: string;
	message_uuid: string;
	sender: string;
	sender_type: string;
	created_at: string;
	payload_kind: string;
	presentation: string;
	raw_refs: Record<string, unknown>[];
	metadata?: Record<string, unknown>;
};

export type AlienHandConversationCut = {
	cut_id: string;
	source_block_id: string;
	position: number;
	status: string;
	created_at: string;
};

export type AlienHandConversationChapter = {
	chapter_id: string;
	title: string;
	summary: string;
	member_cut_ids: string[];
	member_block_ids: string[];
	created_at: string;
	updated_at: string;
	provenance?: Record<string, unknown>;
};

export type AlienHandConversationBookmark = {
	bookmark_id: string;
	target_type: "block" | "cut" | "chapter";
	target_id: string;
	scope: string;
	label: string;
	note: string;
	persistence: string;
	promotion_state: string;
};

export type AlienHandRefinementSearchHit = {
	term: string;
	block_id: string;
	offset: number;
	chapter_id?: string | null;
	cut_id?: string | null;
};

type AlienHandWindow = Window &
	typeof globalThis & {
		__ALIENHAND_PAYLOAD_RESOLVER__?: string;
		__ALIENHAND_PAYLOAD_RESOLVER_TOKEN__?: string;
	};

export function parseAlienHandEnvelope(text?: string): AlienHandEnvelope | null {
	if (!text) {
		return null;
	}

	const parts = text.trim().split(/\s+/);

	if (parts[0] !== ENVELOPE_PROTOCOL) {
		return null;
	}

	const values: Record<string, string> = {};

	for (const part of parts.slice(1)) {
		const splitAt = part.indexOf("=");

		if (splitAt < 1) {
			return null;
		}

		values[part.slice(0, splitAt)] = part.slice(splitAt + 1);
	}

	if (!values.a || !values.c || !values.m || !values.n || !values.t) {
		return null;
	}

	return {
		appId: values.a,
		channelUuid: values.c,
		messageUuid: values.m,
		nick: values.n,
		timestamp: values.t,
	};
}

export function alienHandChannelUuidFromName(name?: string): string | null {
	if (!name) {
		return null;
	}

	const normalized = name.trim().replace(/^#/, "").toLowerCase();

	return /^[0-9a-f]{32}$/.test(normalized) ? normalized : null;
}

export function getAlienHandPayloadResolverBase(): string | null {
	const alienhandWindow = window as AlienHandWindow;
	const configured = normalizeBaseUrl(alienhandWindow.__ALIENHAND_PAYLOAD_RESOLVER__);

	if (configured) {
		return configured;
	}

	const serverConfigured = normalizeBaseUrl(
		store.state.serverConfiguration?.alienhand?.payloadResolverBaseUrl
	);

	if (serverConfigured) {
		return serverConfigured;
	}

	const templateConfigured = normalizeBaseUrl(document.body.dataset.alienhandPayloadResolver);

	if (templateConfigured) {
		return templateConfigured;
	}

	try {
		return normalizeBaseUrl(window.localStorage.getItem(RESOLVER_STORAGE_KEY));
	} catch {
		return null;
	}
}

export function getAlienHandPayloadResolverToken(): string | null {
	const alienhandWindow = window as AlienHandWindow;
	const configured = normalizeToken(alienhandWindow.__ALIENHAND_PAYLOAD_RESOLVER_TOKEN__);

	if (configured) {
		return configured;
	}

	const serverConfigured = normalizeToken(
		store.state.serverConfiguration?.alienhand?.payloadResolverToken
	);

	if (serverConfigured) {
		return serverConfigured;
	}

	const templateConfigured = normalizeToken(document.body.dataset.alienhandPayloadResolverToken);

	if (templateConfigured) {
		return templateConfigured;
	}

	try {
		return normalizeToken(window.localStorage.getItem(RESOLVER_TOKEN_STORAGE_KEY));
	} catch {
		return null;
	}
}

export async function resolveAlienHandMessage(message: SharedMsg): Promise<boolean> {
	const envelope = parseAlienHandEnvelope(message.text);

	if (!envelope) {
		return false;
	}

	if (message.alienhand) {
		return true;
	}

	const resolverBase = getAlienHandPayloadResolverBase();

	if (!resolverBase) {
		message.alienhand = buildAlienHandStatusRow(envelope, "payload_resolver_unconfigured", "payload_error");
		return true;
	}

	message.alienhand = buildAlienHandStatusRow(envelope, "payload_resolving", "resolving");
	const resolverToken = getAlienHandPayloadResolverToken();
	const headers: Record<string, string> = {Accept: "application/json"};

	if (resolverToken) {
		headers.Authorization = `Bearer ${resolverToken}`;
	}

	try {
		const response = await fetch(
			`${resolverBase}/alienhand/payloads/${encodeURIComponent(envelope.messageUuid)}/render`,
			{
				credentials: "omit",
				headers,
			}
		);

		if (!response.ok) {
			throw new Error(`payload resolver returned ${response.status}`);
		}

		message.alienhand = (await response.json()) as AlienHandRenderRow;
	} catch (error) {
		message.alienhand = buildAlienHandStatusRow(
			envelope,
			"payload_resolver_fetch_failed",
			"payload_error",
			error
		);
	}

	return true;
}

export async function listAlienHandRefinementBlocks(
	channelUuid: string
): Promise<AlienHandConversationBlock[]> {
	const response = await fetchAlienHandRefinement<{blocks?: AlienHandConversationBlock[]}>(
		`/blocks?channel=${encodeURIComponent(channelUuid)}`
	);

	return response.blocks || [];
}

export async function listAlienHandRefinementCuts(
	channelUuid: string,
	status = "active"
): Promise<AlienHandConversationCut[]> {
	const response = await fetchAlienHandRefinement<{cuts?: AlienHandConversationCut[]}>(
		`/cuts?channel=${encodeURIComponent(channelUuid)}&status=${encodeURIComponent(status)}`
	);

	return response.cuts || [];
}

export async function listAlienHandRefinementChapters(
	channelUuid: string
): Promise<AlienHandConversationChapter[]> {
	const response = await fetchAlienHandRefinement<{chapters?: AlienHandConversationChapter[]}>(
		`/chapters?channel=${encodeURIComponent(channelUuid)}`
	);

	return response.chapters || [];
}

export async function listAlienHandRefinementBookmarks(
	channelUuid: string,
	targetType?: AlienHandConversationBookmark["target_type"]
): Promise<AlienHandConversationBookmark[]> {
	const targetTypeQuery = targetType ? `&target_type=${encodeURIComponent(targetType)}` : "";
	const response = await fetchAlienHandRefinement<{bookmarks?: AlienHandConversationBookmark[]}>(
		`/bookmarks?channel=${encodeURIComponent(channelUuid)}${targetTypeQuery}`
	);

	return response.bookmarks || [];
}

export async function searchAlienHandRefinement(
	query: string
): Promise<AlienHandRefinementSearchHit[]> {
	const response = await fetchAlienHandRefinement<{hits?: AlienHandRefinementSearchHit[]}>(
		`/search?q=${encodeURIComponent(query)}`
	);

	return response.hits || [];
}

export async function createAlienHandRefinementCut(
	sourceBlockId: string,
	position?: number
): Promise<AlienHandConversationCut> {
	const response = await fetchAlienHandRefinement<{cut: AlienHandConversationCut}>("/cuts", {
		body: JSON.stringify({
			position,
			source_block_id: sourceBlockId,
		}),
		method: "POST",
	});

	return response.cut;
}

export async function removeAlienHandRefinementCut(
	cutId: string
): Promise<AlienHandConversationCut> {
	const response = await fetchAlienHandRefinement<{cut: AlienHandConversationCut}>(
		`/cuts/${encodeURIComponent(cutId)}`,
		{method: "DELETE"}
	);

	return response.cut;
}

export async function createAlienHandRefinementChapter(
	title: string,
	summary: string,
	cutIds: string[]
): Promise<AlienHandConversationChapter> {
	const response = await fetchAlienHandRefinement<{chapter: AlienHandConversationChapter}>(
		"/chapters",
		{
			body: JSON.stringify({
				cut_ids: cutIds,
				summary,
				title,
			}),
			method: "POST",
		}
	);

	return response.chapter;
}

export async function createAlienHandRefinementBookmark(
	targetType: AlienHandConversationBookmark["target_type"],
	targetId: string,
	label: string,
	note: string
): Promise<AlienHandConversationBookmark> {
	const response = await fetchAlienHandRefinement<{bookmark: AlienHandConversationBookmark}>(
		"/bookmarks",
		{
			body: JSON.stringify({
				label,
				note,
				target_id: targetId,
				target_type: targetType,
			}),
			method: "POST",
		}
	);

	return response.bookmark;
}

async function fetchAlienHandRefinement<T>(path: string, init: RequestInit = {}): Promise<T> {
	const resolverBase = getAlienHandPayloadResolverBase();

	if (!resolverBase) {
		throw new Error("AlienHand payload resolver is not configured");
	}

	const headers = new Headers(init.headers);
	headers.set("Accept", "application/json");

	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const resolverToken = getAlienHandPayloadResolverToken();

	if (resolverToken) {
		headers.set("Authorization", `Bearer ${resolverToken}`);
	}

	const response = await fetch(`${resolverBase}/alienhand/refinement${path}`, {
		...init,
		credentials: "omit",
		headers,
	});

	if (!response.ok) {
		throw new Error(`AlienHand refinement API returned ${response.status}`);
	}

	return (await response.json()) as T;
}

function buildAlienHandStatusRow(
	envelope: AlienHandEnvelope,
	reason: string,
	status: string,
	error?: unknown
): AlienHandRenderRow {
	return {
		message_uuid: envelope.messageUuid,
		channel_uuid: envelope.channelUuid,
		sender: "payload_resolver",
		sender_type: "service",
		event_type: status === "payload_error" ? "payload_error" : "system_note",
		payload_kind: "system",
		created_at: envelope.timestamp,
		orientation: "system",
		status,
		content: {reason},
		frames: [],
		metadata: {
			envelope,
			error: error instanceof Error ? error.message : String(error || ""),
		},
	};
}

function normalizeBaseUrl(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();

	if (!trimmed) {
		return null;
	}

	return trimmed.replace(/\/+$/, "");
}

function normalizeToken(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();

	return trimmed || null;
}
