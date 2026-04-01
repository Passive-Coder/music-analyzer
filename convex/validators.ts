import { v } from "convex/values";

export const playlistSongValidator = v.object({
  album: v.string(),
  artists: v.array(v.string()),
  artworkUrl: v.union(v.string(), v.null()),
  durationMs: v.number(),
  id: v.string(),
  originPlaylistId: v.optional(v.union(v.string(), v.null())),
  originPlaylistTitle: v.optional(v.union(v.string(), v.null())),
  sourceId: v.union(v.string(), v.null()),
  sourceUrl: v.union(v.string(), v.null()),
  title: v.string(),
});

export const playlistDataValidator = v.object({
  description: v.union(v.string(), v.null()),
  id: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  owner: v.string(),
  songs: v.array(playlistSongValidator),
  sourceUrl: v.string(),
  title: v.string(),
});

export const songwiseVoteValidator = v.record(v.string(), v.number());

export const activePlaylistSongVoteValidator = v.object({
  songId: v.string(),
  songName: v.string(),
  vote: v.number(),
});

export const activePlaylistVoterSelectionValidator = v.object({
  viewerId: v.string(),
  songId: v.string(),
});
