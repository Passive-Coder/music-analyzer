import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  activePlaylistSongVoteValidator,
  activePlaylistVoterSelectionValidator,
  playlistDataValidator,
  playlistSongValidator,
  songwiseVoteValidator,
} from "./validators";

export default defineSchema({
  activePlaylists: defineTable({
    code: v.string(),
    currentBatch: v.array(playlistSongValidator),
    currentBatchIndex: v.number(),
    currentSongId: v.optional(v.union(v.string(), v.null())),
    currentSongStartedAt: v.optional(v.union(v.string(), v.null())),
    songList: v.array(activePlaylistSongVoteValidator),
    songsPlayedBefore: v.array(playlistSongValidator),
    updatedAt: v.string(),
    voterSelections: v.array(activePlaylistVoterSelectionValidator),
  }).index("by_code", ["code"]),
  publishedPlaylists: defineTable({
    batches: v.array(v.array(playlistSongValidator)),
    code: v.string(),
    createdAt: v.string(),
    creatorToken: v.string(),
    currentBatch: v.array(playlistSongValidator),
    currentBatchIndex: v.number(),
    librarySongs: v.array(playlistSongValidator),
    loadedPlaylists: v.array(playlistDataValidator),
    publisherEmail: v.optional(v.string()),
    songsPlayedBefore: v.array(playlistSongValidator),
    songwiseVote: v.array(songwiseVoteValidator),
    updatedAt: v.string(),
  }).index("by_code", ["code"]),
});
