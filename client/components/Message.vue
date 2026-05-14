<template>
	<div
		:id="'msg-' + message.id"
		:class="[
			'msg',
			{
				self: message.self,
				highlight: message.highlight || focused,
				'previous-source': isPreviousSource,
			},
		]"
		:data-type="message.type"
		:data-command="message.command"
		:data-from="message.from && message.from.nick"
	>
		<span
			aria-hidden="true"
			:aria-label="messageTimeLocale"
			class="time tooltipped tooltipped-e"
			>{{ `${messageTime}&#32;` }}
		</span>
		<button
			v-if="alienHandSourceAvailable"
			class="alienhand-source-arrow"
			type="button"
			aria-label="Stage this message for cuts"
			title="Stage this message for cuts"
			@click.stop="selectAlienHandSource"
		>
			&rarr;
		</button>
		<template v-if="message.alienhand">
			<AlienHandMessage :row="message.alienhand" />
		</template>
		<template v-else-if="message.type === 'unhandled'">
			<span class="from">[{{ message.command }}]</span>
			<span class="content">
				<span v-for="(param, id) in message.params" :key="id">{{
					`&#32;${param}&#32;`
				}}</span>
			</span>
		</template>
		<template v-else-if="isAction()">
			<span class="from"><span class="only-copy" aria-hidden="true">***&nbsp;</span></span>
			<component :is="messageComponent" :network="network" :message="message" />
		</template>
		<template v-else-if="message.type === 'action'">
			<span class="from"><span class="only-copy">*&nbsp;</span></span>
			<span class="content" dir="auto">
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<Username
					:user="message.from"
					:network="network"
					:channel="channel"
					dir="auto"
				/>&#32;<ParsedMessage :message="message" />
				<LinkPreview
					v-for="preview in message.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
		<template v-else>
			<span v-if="message.type === 'message'" class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">&lt;</span>
					<Username :user="message.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">&gt;&nbsp;</span>
				</template>
			</span>
			<span v-else-if="message.type === 'plugin'" class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">[</span>
					{{ message.from.nick }}
					<span class="only-copy" aria-hidden="true">]&nbsp;</span>
				</template>
			</span>
			<span v-else class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">-</span>
					<Username :user="message.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">-&nbsp;</span>
				</template>
			</span>
			<span class="content" dir="auto">
				<span
					v-if="message.showInActive"
					aria-label="This message was shown in your active channel"
					class="msg-shown-in-active tooltipped tooltipped-e"
					><span></span
				></span>
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<ParsedMessage :network="network" :message="message" />
				<LinkPreview
					v-for="preview in message.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import dayjs from "dayjs";

import constants from "../js/constants";
import eventbus from "../js/eventbus";
import {
	alienHandChannelUuidFromName,
	type AlienHandConversationBlockInput,
} from "../js/helpers/alienhand";
import localetime from "../js/helpers/localetime";
import Username from "./Username.vue";
import LinkPreview from "./LinkPreview.vue";
import ParsedMessage from "./ParsedMessage.vue";
import MessageTypes from "./MessageTypes";
import StatusmsgMarker from "./StatusmsgMarker.vue";
import AlienHandMessage from "./AlienHandMessage.vue";

import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";
import {useStore} from "../js/store";

MessageTypes.ParsedMessage = ParsedMessage;
MessageTypes.LinkPreview = LinkPreview;
MessageTypes.Username = Username;

export default defineComponent({
	name: "Message",
	components: {
		...MessageTypes,
		AlienHandMessage,
		StatusmsgMarker,
	},
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
		keepScrollPosition: Function as PropType<() => void>,
		isPreviousSource: Boolean,
		focused: Boolean,
	},
	setup(props) {
		const store = useStore();

		const timeFormat = computed(() => {
			let format: keyof typeof constants.timeFormats;

			if (store.state.settings.use12hClock) {
				format = store.state.settings.showSeconds ? "msg12hWithSeconds" : "msg12h";
			} else {
				format = store.state.settings.showSeconds ? "msgWithSeconds" : "msgDefault";
			}

			return constants.timeFormats[format];
		});

		const messageTime = computed(() => {
			return dayjs(props.message.time).format(timeFormat.value);
		});

		const messageTimeLocale = computed(() => {
			return localetime(props.message.time);
		});

		const alienHandChannelUuid = computed(() =>
			alienHandChannelUuidFromName(props.channel?.name)
		);

		const alienHandPresentation = computed(() => {
			const alienHandText = props.message.alienhand?.content?.text;

			if (typeof alienHandText === "string" && alienHandText.trim()) {
				return alienHandText;
			}

			if (props.message.text?.trim()) {
				return props.message.text;
			}

			if (props.message.params?.length) {
				return props.message.params.join(" ");
			}

			return props.message.command || "";
		});

		const alienHandSourceAvailable = computed(
			() => Boolean(alienHandChannelUuid.value) && Boolean(alienHandPresentation.value.trim())
		);

		const messageComponent = computed(() => {
			return "message-" + (props.message.type || "invalid"); // TODO: force existence of type in sharedmsg
		});

		const isAction = () => {
			if (!props.message.type) {
				return false;
			}

			return typeof MessageTypes["message-" + props.message.type] !== "undefined";
		};

		const selectAlienHandSource = () => {
			const channelUuid = alienHandChannelUuid.value;

			if (!channelUuid) {
				return;
			}

			const createdAt = new Date(props.message.time).toISOString();
			const block: AlienHandConversationBlockInput = {
				block_id: `thelounge:${channelUuid}:${props.message.id}`,
				channel_uuid: channelUuid,
				created_at: createdAt,
				message_uuid: `thelounge-${channelUuid}-${props.message.id}`,
				metadata: {
					channel_id: props.channel?.id,
					source: "thelounge_live_chat",
				},
				payload_kind: props.message.alienhand?.payload_kind || "irc_text",
				presentation: alienHandPresentation.value,
				raw_refs: [
					{
						kind: "thelounge_message",
						message_id: props.message.id,
					},
				],
				sender: props.message.alienhand?.sender || props.message.from?.nick || "unknown",
				sender_type: props.message.alienhand?.sender_type || "user",
			};

			eventbus.emit("alienhand:source-message:selected", block);
		};

		return {
			alienHandSourceAvailable,
			timeFormat,
			messageTime,
			messageTimeLocale,
			messageComponent,
			isAction,
			selectAlienHandSource,
		};
	},
});
</script>
