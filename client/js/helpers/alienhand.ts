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
