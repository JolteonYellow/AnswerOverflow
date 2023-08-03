import { z } from 'zod';
import { router, withUserServersProcedure } from '~api/router/trpc';
import { findMessageResultPage, searchMessages } from '@answeroverflow/db';
import {
	canUserViewPrivateMessage,
	stripPrivateChannelData,
	stripPrivateFullMessageData,
	stripPrivateServerData,
} from '~api/utils/permissions';
import { TRPCError } from '@trpc/server';

export const messagesRouter = router({
	/*
    Message page by ID
    Variants:
      - Root Message Not Found
      - Text channel thread message that has a parent message
      - Text channel thread message that has no parent message
      - Text channel thread message starting from anywhere in the thread
      - Forum post from root message of post
      - Forum post from any other message in the post
  */
	threadFromMessageId: withUserServersProcedure
		.input(z.string())
		.meta({
			tenantAuthAccessible: true,
		})
		.query(async ({ input, ctx }) => {
			const data = await findMessageResultPage(input);
			if (!data) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Message not found',
				});
			}
			const { messages, channel, server, thread } = data;

			return {
				messages: messages.map((message) =>
					stripPrivateFullMessageData(message, ctx.userServers),
				),
				parentChannel: stripPrivateChannelData(channel),
				server: stripPrivateServerData(server),
				thread: thread ? stripPrivateChannelData(thread) : undefined,
			};
		}),
	search: withUserServersProcedure
		.input(
			z.object({
				query: z.string(),
				serverId: z.string().optional(),
				channelId: z.string().optional(),
			}),
		)
		.meta({
			tenantAuthAccessible: true,
		})
		.query(async ({ input, ctx }) => {
			const searchResults = await searchMessages(input);
			const strippedSearchResults = searchResults.map(
				({ message, channel, server, thread, score }) => ({
					message: stripPrivateFullMessageData(message, ctx.userServers),
					channel: stripPrivateChannelData(channel),
					server: stripPrivateServerData(server),
					thread: thread ? stripPrivateChannelData(thread) : undefined,
					score,
				}),
			);
			return strippedSearchResults
				.filter(
					(result) =>
						canUserViewPrivateMessage(ctx.userServers, result.message) ||
						result.message.public,
				)
				.splice(0, 20);
		}),
});
