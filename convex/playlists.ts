import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

import type {
  ActivePlaylistSongVote,
  ActivePlaylistState,
  PlaylistData,
  PlaylistSong,
  PublishedPlaylistRecord,
  SongwiseVote,
} from "../lib/playlist-types";

import { playlistDataValidator, playlistSongValidator } from "./validators";

const PLAYLIST_CODE_LENGTH = 6;
const CREATOR_TOKEN_LENGTH = 12;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BATCH_SIZE = 5;

type VoterSelection = {
  viewerId: string;
  songId: string;
};

type PublishedPlaylistDocument = Omit<
  PublishedPlaylistRecord,
  "publisherEmail" | "currentSong" | "currentSongStartedAt"
> & {
  _id: Id<"publishedPlaylists">;
  creatorToken: string;
  currentSong?: PlaylistSong | null;
  currentSongStartedAt?: string | null;
  publisherEmail?: string | null;
};

type ActivePlaylistDocument = {
  _id: Id<"activePlaylists">;
  code: string;
  currentBatch: PlaylistSong[];
  currentBatchIndex: number;
  currentSong?: PlaylistSong | null;
  currentSongId?: string | null;
  currentSongStartedAt?: string | null;
  songList: ActivePlaylistSongVote[];
  songsPlayedBefore: PlaylistSong[];
  updatedAt: string;
  voterSelections: VoterSelection[];
};

type PublishedPlaylistLookupContext = {
  db: {
    query: (table: "publishedPlaylists") => {
      collect: () => Promise<PublishedPlaylistDocument[]>;
    };
  };
};

type ActivePlaylistLookupContext = {
  db: {
    query: (table: "activePlaylists") => {
      collect: () => Promise<ActivePlaylistDocument[]>;
    };
  };
};

type ActivePlaylistInsertContext = {
  db: {
    insert: (
      table: "activePlaylists",
      value: Omit<ActivePlaylistDocument, "_id">
    ) => Promise<Id<"activePlaylists">>;
  };
};

type PlaylistPatchContext = {
  db: {
    patch: <TableName extends "publishedPlaylists" | "activePlaylists">(
      id: Id<TableName>,
      value: Record<string, unknown>
    ) => Promise<unknown>;
  };
};

type PlaylistDeleteContext = {
  db: {
    delete: <TableName extends "publishedPlaylists" | "activePlaylists">(
      id: Id<TableName>
    ) => Promise<unknown>;
  };
};

export const publishPlaylist = mutation({
  args: {
    batchSongs: v.array(playlistSongValidator),
    currentBatchIndex: v.number(),
    initialSongId: v.optional(v.union(v.string(), v.null())),
    librarySongs: v.array(playlistSongValidator),
    loadedPlaylists: v.array(playlistDataValidator),
    publisherEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await deletePublisherSessions(ctx, args.publisherEmail);

    const batches = chunkSongs(args.batchSongs, BATCH_SIZE);
    const clampedBatchIndex = clampCurrentBatchIndex(
      args.currentBatchIndex,
      batches.length
    );
    const initialSong =
      args.librarySongs.find((song) => song.id === args.initialSongId) ??
      batches[clampedBatchIndex]?.[0] ??
      null;
    const currentBatchIndex = clampedBatchIndex;
    const currentBatch = batches[currentBatchIndex] ?? [];
    const now = new Date().toISOString();
    const code = await createUniqueAlphabeticCode(ctx);
    const creatorToken = createAlphabeticCode(CREATOR_TOKEN_LENGTH);

    const document = {
      batches,
      code,
      createdAt: now,
      creatorToken,
      currentSong: initialSong,
      currentSongStartedAt: initialSong ? now : null,
      currentBatch,
      currentBatchIndex,
      librarySongs: args.librarySongs,
      loadedPlaylists: args.loadedPlaylists,
      publisherEmail: args.publisherEmail,
      songsPlayedBefore: [],
      songwiseVote: createVoteSnapshot(currentBatch),
      updatedAt: now,
    };

    await ctx.db.insert("publishedPlaylists", document);
    await ctx.db.insert("activePlaylists", buildActivePlaylistSeed(document, now));

    return {
      code,
      creatorToken,
      record: toPublicRecord(document),
    };
  },
});

type ActivePlaylistSeed = Omit<ActivePlaylistDocument, "_id">;

export const appendLoadedPlaylist = mutation({
  args: {
    code: v.string(),
    creatorToken: v.string(),
    playlist: playlistDataValidator,
  },
  handler: async (ctx, args) => {
    const document = await getAuthorizedPlaylist(ctx, args.code, args.creatorToken);

    if (
      document.loadedPlaylists.some(
        (playlist: PlaylistData) => playlist.id === args.playlist.id
      )
    ) {
      return toPublicRecord(document);
    }

    const updatedDocument = {
      ...document,
      librarySongs: [...document.librarySongs, ...args.playlist.songs],
      loadedPlaylists: [...document.loadedPlaylists, args.playlist],
      updatedAt: new Date().toISOString(),
    };

    await ctx.db.patch(document._id, {
      librarySongs: updatedDocument.librarySongs,
      loadedPlaylists: updatedDocument.loadedPlaylists,
      updatedAt: updatedDocument.updatedAt,
    });

    return toPublicRecord(updatedDocument);
  },
});

export const updateUpcomingBatchSong = mutation({
  args: {
    batchIndex: v.number(),
    code: v.string(),
    creatorToken: v.string(),
    replacementSong: playlistSongValidator,
    songIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const document = await getAuthorizedPlaylist(ctx, args.code, args.creatorToken);

    if (args.batchIndex <= document.currentBatchIndex) {
      throw new Error("Only upcoming batches can be edited.");
    }

    const targetBatch = document.batches[args.batchIndex];

    if (!targetBatch) {
      throw new Error("That batch does not exist.");
    }

    if (args.songIndex < 0 || args.songIndex >= targetBatch.length) {
      throw new Error("That song position is invalid.");
    }

    const nextBatches = document.batches.map(
      (batch: PlaylistSong[], batchIndex: number) => {
        if (batchIndex !== args.batchIndex) {
          return batch;
        }

        return batch.map((song: PlaylistSong, songIndex: number) =>
          songIndex === args.songIndex ? args.replacementSong : song
        );
      }
    );

    const updatedDocument = {
      ...document,
      batches: nextBatches,
      updatedAt: new Date().toISOString(),
    };

    await ctx.db.patch(document._id, {
      batches: updatedDocument.batches,
      updatedAt: updatedDocument.updatedAt,
    });

    return toPublicRecord(updatedDocument);
  },
});

export const voteForCurrentBatchSong = mutation({
  args: {
    code: v.string(),
    songIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const document = await getPlaylistByCodeOrThrow(ctx, args.code);

    if (
      args.songIndex < 0 ||
      args.songIndex >= document.currentBatch.length ||
      args.songIndex >= document.songwiseVote.length
    ) {
      throw new Error("That song cannot be voted for.");
    }

    const voteKey = String(args.songIndex + 1);
    const nextVotes = document.songwiseVote.map(
      (vote: SongwiseVote, voteIndex: number) => {
        if (voteIndex !== args.songIndex) {
          return vote;
        }

        return {
          [voteKey]: (vote[voteKey] ?? 0) + 1,
        };
      }
    );

    const updatedDocument = {
      ...document,
      songwiseVote: nextVotes,
      updatedAt: new Date().toISOString(),
    };

    await ctx.db.patch(document._id, {
      songwiseVote: updatedDocument.songwiseVote,
      updatedAt: updatedDocument.updatedAt,
    });

    return toPublicRecord(updatedDocument);
  },
});

export const voteForActivePlaylistSong = mutation({
  args: {
    code: v.string(),
    viewerId: v.string(),
    songId: v.string(),
  },
  handler: async (ctx, args) => {
    const published = await getPlaylistByCode(ctx, args.code);

    if (!published) {
      throw new Error("This music session is no longer available.");
    }

    const active = await ensureActivePlaylistByCode(ctx, published, new Date().toISOString());
    const synced = syncActivePlaybackState(published, active, Date.now());

    if (isSessionComplete(synced.published, synced.active)) {
      await deletePlaylistSession(ctx, synced.published.code);
      throw new Error("This music session has ended.");
    }

    if (synced.changed) {
      await patchSyncedPlaylistState(ctx, synced.published, synced.active);
    }

    const currentBatchSongIds = new Set(synced.published.currentBatch.map((song) => song.id));

    if (!currentBatchSongIds.has(args.songId)) {
      throw new Error("That song is not in the current voting batch.");
    }

    const previousSelection = synced.active.voterSelections.find(
      (selection) => selection.viewerId === args.viewerId
    );

    if (previousSelection?.songId === args.songId) {
      return {
        activeState: toActivePlaylistState(synced.published, synced.active),
        selectedSongId: args.songId,
      };
    }

    const nextSongList = synced.active.songList.map((entry) => {
      let vote = entry.vote;

      if (previousSelection?.songId === entry.songId) {
        vote = Math.max(0, vote - 1);
      }

      if (entry.songId === args.songId) {
        vote += 1;
      }

      return {
        ...entry,
        vote,
      };
    });

    const nextSelections = synced.active.voterSelections
      .filter((selection) => selection.viewerId !== args.viewerId)
      .concat({
        viewerId: args.viewerId,
        songId: args.songId,
      });
    const updatedAt = new Date().toISOString();

    await ctx.db.patch(synced.active._id, {
      songList: nextSongList,
      updatedAt,
      voterSelections: nextSelections,
    });

    return {
      activeState: toActivePlaylistState(synced.published, {
        ...synced.active,
        songList: nextSongList,
        updatedAt,
        voterSelections: nextSelections,
      }),
      selectedSongId: args.songId,
    };
  },
});

export const syncActivePlaylistPlayback = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const published = await getPlaylistByCode(ctx, args.code);

    if (!published) {
      return null;
    }

    const active = await ensureActivePlaylistByCode(ctx, published, new Date().toISOString());
    const synced = syncActivePlaybackState(published, active, Date.now());

    if (isSessionComplete(synced.published, synced.active)) {
      await deletePlaylistSession(ctx, synced.published.code);
      return null;
    }

    if (synced.changed) {
      await patchSyncedPlaylistState(ctx, synced.published, synced.active);
    }

    return toActivePlaylistState(synced.published, synced.active);
  },
});

export const getActivePlaylistState = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const published = await getPlaylistByCode(ctx, args.code);

    if (!published) {
      return null;
    }

    const active = await getActivePlaylistByCode(ctx, args.code);

    if (!active) {
      return toActivePlaylistState(
        published,
        buildTransientActivePlaylist(published)
      );
    }

    return toActivePlaylistState(published, active);
  },
});

export const getActivePlaylistViewerSelection = query({
  args: {
    code: v.string(),
    viewerId: v.string(),
  },
  handler: async (ctx, args) => {
    const active = await getActivePlaylistByCode(ctx, args.code);
    return {
      selectedSongId: active
        ? active.voterSelections.find(
            (selection) => selection.viewerId === args.viewerId
          )?.songId ?? null
        : null,
    };
  },
});

export const advanceCurrentBatch = mutation({
  args: {
    code: v.string(),
    creatorToken: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await getAuthorizedPlaylist(ctx, args.code, args.creatorToken);
    const active = await ensureActivePlaylistByCode(ctx, document, new Date().toISOString());
    const synced = syncActivePlaybackState(document, active, Date.now());

    if (isSessionComplete(synced.published, synced.active)) {
      await deletePlaylistSession(ctx, synced.published.code);
      throw new Error("This music session has ended.");
    }

    if (synced.changed) {
      await patchSyncedPlaylistState(ctx, synced.published, synced.active);
    }

    const nowIso = new Date().toISOString();
    const nextPlayedSongs =
      synced.active.currentSong &&
      !synced.published.songsPlayedBefore.some(
        (song) => song.id === synced.active.currentSong?.id
      )
        ? [...synced.published.songsPlayedBefore, synced.active.currentSong]
        : [...synced.published.songsPlayedBefore];

    if (!synced.published.currentBatch.length) {
      await deletePlaylistSession(ctx, synced.published.code);
      throw new Error("This music session has ended.");
    }

    const nextSong = chooseNextSong(
      synced.published.currentBatch,
      synced.published.currentBatch,
      buildSongListFromVoteSnapshot(
        synced.published.currentBatch,
        synced.published.songwiseVote
      )
    );
    const nextBatchIndex = Math.min(
      synced.published.currentBatchIndex + 1,
      synced.published.batches.length
    );
    const nextCurrentBatch = synced.published.batches[nextBatchIndex] ?? [];
    const updatedPublished = {
      ...synced.published,
      currentSong: nextSong,
      currentSongStartedAt: nowIso,
      currentBatch: nextCurrentBatch,
      currentBatchIndex: nextBatchIndex,
      songsPlayedBefore: nextPlayedSongs,
      songwiseVote: createVoteSnapshot(nextCurrentBatch),
      updatedAt: nowIso,
    };
    const updatedActive = {
      ...synced.active,
      currentSong: nextSong,
      currentSongId: nextSong.id,
      currentSongStartedAt: nowIso,
      currentBatch: nextCurrentBatch,
      currentBatchIndex: nextBatchIndex,
      songList: buildActiveSongList(nextCurrentBatch),
      songsPlayedBefore: nextPlayedSongs,
      updatedAt: nowIso,
      voterSelections: [],
    };

    await patchSyncedPlaylistState(ctx, updatedPublished, updatedActive);
    return toPublicRecord(updatedPublished);
  },
});

export const getPublishedPlaylist = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await getPlaylistByCode(ctx, args.code);
    return document ? toPublicRecord(document) : null;
  },
});

export const getOwnedPublishedPlaylist = query({
  args: {
    publisherEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.publisherEmail.trim().toLowerCase();
    const document = (
      (await ctx.db.query("publishedPlaylists").collect()) as PublishedPlaylistDocument[]
    )
      .filter(
        (entry) => entry.publisherEmail?.trim().toLowerCase() === normalizedEmail
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    if (!document) {
      return null;
    }

    return {
      creatorToken: document.creatorToken,
      record: toPublicRecord(document),
    };
  },
});

export const abortPublishedPlaylist = mutation({
  args: {
    code: v.string(),
    creatorToken: v.string(),
  },
  handler: async (ctx, args) => {
    await getAuthorizedPlaylist(ctx, args.code, args.creatorToken);
    await deletePlaylistSession(ctx, args.code);
    return { ok: true };
  },
});

function clampCurrentBatchIndex(currentBatchIndex: number, totalBatches: number) {
  if (!totalBatches) {
    return 0;
  }

  if (currentBatchIndex < 0) {
    return 0;
  }

  if (currentBatchIndex >= totalBatches) {
    return totalBatches - 1;
  }

  return currentBatchIndex;
}

function chunkSongs(songs: PlaylistSong[], batchSize: number) {
  const batches: PlaylistSong[][] = [];

  for (let index = 0; index < songs.length; index += batchSize) {
    batches.push(songs.slice(index, index + batchSize));
  }

  return batches;
}

function createVoteSnapshot(currentBatch: PlaylistSong[]) {
  return currentBatch.map((_, songIndex) => ({
    [String(songIndex + 1)]: 0,
  }));
}

function buildActiveSongList(currentBatch: PlaylistSong[]) {
  return currentBatch.map((song) => ({
    songId: song.id,
    songName: song.title,
    vote: 0,
  }));
}

function buildSongListFromVoteSnapshot(
  currentBatch: PlaylistSong[],
  songwiseVote: SongwiseVote[]
) {
  return currentBatch.map((song, songIndex) => ({
    songId: song.id,
    songName: song.title,
    vote: songwiseVote[songIndex]?.[String(songIndex + 1)] ?? 0,
  }));
}

async function createUniqueAlphabeticCode(
  ctx: PublishedPlaylistLookupContext
) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = createAlphabeticCode(PLAYLIST_CODE_LENGTH);
    const existing = (
      (await ctx.db.query("publishedPlaylists").collect()) as { code: string }[]
    ).find((document) => document.code === code);

    if (!existing) {
      return code;
    }
  }

  throw new Error("Could not generate a unique playlist code.");
}

function createAlphabeticCode(length: number) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    const letterIndex = Math.floor(Math.random() * ALPHABET.length);
    code += ALPHABET[letterIndex];
  }

  return code;
}

async function getAuthorizedPlaylist(
  ctx: PublishedPlaylistLookupContext,
  code: string,
  creatorToken: string
): Promise<PublishedPlaylistDocument> {
  const document = await getPlaylistByCodeOrThrow(ctx, code);

  if (document.creatorToken !== creatorToken) {
    throw new Error("Only the playlist creator can change upcoming batches.");
  }

  return document;
}

async function getPlaylistByCode(
  ctx: PublishedPlaylistLookupContext,
  code: string
): Promise<PublishedPlaylistDocument | null> {
  const normalizedCode = normalizeCode(code);
  const document = (
    (await ctx.db.query("publishedPlaylists").collect()) as PublishedPlaylistDocument[]
  ).find((entry) => entry.code === normalizedCode);

  return document ?? null;
}

async function getPlaylistByCodeOrThrow(
  ctx: PublishedPlaylistLookupContext,
  code: string
): Promise<PublishedPlaylistDocument> {
  const document = await getPlaylistByCode(ctx, code);

  if (!document) {
    throw new Error("That playlist code could not be found.");
  }

  return document;
}

async function getActivePlaylistByCode(
  ctx: ActivePlaylistLookupContext,
  code: string
): Promise<ActivePlaylistDocument | null> {
  const normalizedCode = normalizeCode(code);
  const document = (
    (await ctx.db.query("activePlaylists").collect()) as ActivePlaylistDocument[]
  ).find((entry) => entry.code === normalizedCode);

  return document ?? null;
}

async function ensureActivePlaylistByCode(
  ctx: ActivePlaylistLookupContext & ActivePlaylistInsertContext,
  published: PublishedPlaylistDocument,
  nowIso: string
): Promise<ActivePlaylistDocument> {
  const existingDocument = await getActivePlaylistByCode(ctx, published.code);

  if (existingDocument) {
    return existingDocument;
  }

  const seed = buildActivePlaylistSeed(published, nowIso);
  const insertedId = await ctx.db.insert("activePlaylists", seed);

  return {
    _id: insertedId,
    ...seed,
  };
}

async function deletePublisherSessions(
  ctx: PublishedPlaylistLookupContext & ActivePlaylistLookupContext & PlaylistDeleteContext,
  publisherEmail: string
) {
  const normalizedEmail = publisherEmail.trim().toLowerCase();
  const sessions = (
    (await ctx.db.query("publishedPlaylists").collect()) as PublishedPlaylistDocument[]
  ).filter(
    (entry) => entry.publisherEmail?.trim().toLowerCase() === normalizedEmail
  );

  for (const session of sessions) {
    await deletePlaylistSession(ctx, session.code);
  }
}

async function deletePlaylistSession(
  ctx: PublishedPlaylistLookupContext & ActivePlaylistLookupContext & PlaylistDeleteContext,
  code: string
) {
  const published = await getPlaylistByCode(ctx, code);
  const active = await getActivePlaylistByCode(ctx, code);

  if (active) {
    await ctx.db.delete(active._id);
  }

  if (published) {
    await ctx.db.delete(published._id);
  }
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function buildActivePlaylistSeed(
  published: Pick<
    PublishedPlaylistDocument,
    | "code"
    | "currentSong"
    | "currentSongStartedAt"
    | "currentBatch"
    | "currentBatchIndex"
    | "songsPlayedBefore"
    | "updatedAt"
  >,
  nowIso: string
): ActivePlaylistSeed {
  const currentSong = published.currentSong ?? published.currentBatch[0] ?? null;
  const currentSongStartedAt =
    published.currentSongStartedAt ?? (currentSong ? nowIso : null);

  return {
    code: published.code,
    currentBatch: published.currentBatch,
    currentBatchIndex: published.currentBatchIndex,
    currentSong,
    currentSongId: currentSong?.id ?? null,
    currentSongStartedAt,
    songList: buildActiveSongList(published.currentBatch),
    songsPlayedBefore: published.songsPlayedBefore,
    updatedAt: published.updatedAt ?? nowIso,
    voterSelections: [],
  };
}

function buildTransientActivePlaylist(
  published: Pick<
    PublishedPlaylistDocument,
    | "code"
    | "currentSong"
    | "currentSongStartedAt"
    | "currentBatch"
    | "currentBatchIndex"
    | "songsPlayedBefore"
    | "updatedAt"
  >
): ActivePlaylistDocument {
  return {
    _id: "transient" as Id<"activePlaylists">,
    ...buildActivePlaylistSeed(published, published.updatedAt),
  };
}

function syncActivePlaybackState(
  published: PublishedPlaylistDocument,
  active: ActivePlaylistDocument,
  nowMs: number
) {
  let changed = false;
  let nextPublished: PublishedPlaylistDocument = {
    ...published,
    currentSong: published.currentSong ? { ...published.currentSong } : null,
    currentBatch: [...published.currentBatch],
    currentSongStartedAt: published.currentSongStartedAt ?? null,
    songsPlayedBefore: [...published.songsPlayedBefore],
    songwiseVote: [...published.songwiseVote],
  };
  let nextActive: ActivePlaylistDocument = {
    ...active,
    currentBatch: [...active.currentBatch],
    currentBatchIndex: active.currentBatchIndex,
    currentSong: active.currentSong ? { ...active.currentSong } : null,
    currentSongId: active.currentSongId ?? null,
    currentSongStartedAt: active.currentSongStartedAt ?? null,
    songList: active.songList.map((entry) => ({ ...entry })),
    songsPlayedBefore: [...active.songsPlayedBefore],
    voterSelections: active.voterSelections.map((selection) => ({
      ...selection,
    })),
  };

  const syncActiveCollectionsFromPublished = () => {
    const publishedBatchIds = nextPublished.currentBatch.map((song) => song.id).join("|");
    const activeBatchIds = nextActive.currentBatch.map((song) => song.id).join("|");
    const publishedPlayedIds = nextPublished.songsPlayedBefore
      .map((song) => song.id)
      .join("|");
    const activePlayedIds = nextActive.songsPlayedBefore.map((song) => song.id).join("|");

    if (
      publishedBatchIds !== activeBatchIds ||
      nextPublished.currentBatchIndex !== nextActive.currentBatchIndex ||
      publishedPlayedIds !== activePlayedIds
    ) {
      nextActive = {
        ...nextActive,
        currentBatch: [...nextPublished.currentBatch],
        currentBatchIndex: nextPublished.currentBatchIndex,
        songsPlayedBefore: [...nextPublished.songsPlayedBefore],
      };
      changed = true;
    }
  };

  const ensureSongListMatchesCurrentBatch = () => {
    const batchSongIds = nextActive.currentBatch.map((song) => song.id).join("|");
    const activeSongIds = nextActive.songList.map((song) => song.songId).join("|");

    if (batchSongIds !== activeSongIds) {
      nextActive = {
        ...nextActive,
        songList: buildActiveSongList(nextActive.currentBatch),
        voterSelections: [],
      };
      changed = true;
    }
  };

  const resolveCurrentSong = () => {
    if (nextActive.currentSong && nextActive.currentSongId === nextActive.currentSong.id) {
      return nextActive.currentSong;
    }

    if (nextActive.currentSongId) {
      const songFromBatch =
        nextActive.currentBatch.find((song) => song.id === nextActive.currentSongId) ?? null;

      if (songFromBatch) {
        return songFromBatch;
      }

      return (
        nextActive.songsPlayedBefore.find((song) => song.id === nextActive.currentSongId) ??
        null
      );
    }

    return null;
  };

  const advanceVotingBatch = (nowIso: string) => {
    const nextBatchIndex = Math.min(
      nextPublished.currentBatchIndex + 1,
      nextPublished.batches.length
    );
    const nextBatch = nextPublished.batches[nextBatchIndex] ?? [];

    nextPublished = {
      ...nextPublished,
      currentBatch: nextBatch,
      currentBatchIndex: nextBatchIndex,
      songwiseVote: createVoteSnapshot(nextBatch),
    };
    nextActive = {
      ...nextActive,
      currentBatch: [...nextBatch],
      currentBatchIndex: nextBatchIndex,
      songList: buildActiveSongList(nextBatch),
      voterSelections: [],
      updatedAt: nowIso,
    };
    changed = true;
  };

  while (true) {
    syncActiveCollectionsFromPublished();
    ensureSongListMatchesCurrentBatch();

    let currentSong = resolveCurrentSong();
    const unresolvedCurrentSong = currentSong;

    if (
      unresolvedCurrentSong &&
      !nextActive.currentSong &&
      nextPublished.currentBatch.some((song) => song.id === unresolvedCurrentSong.id)
    ) {
      const currentSongStartedAt =
        nextActive.currentSongStartedAt ?? new Date(nowMs).toISOString();

      nextActive = {
        ...nextActive,
        currentSong: unresolvedCurrentSong,
        currentSongId: unresolvedCurrentSong.id,
        currentSongStartedAt,
      };
      advanceVotingBatch(currentSongStartedAt);
      currentSong = resolveCurrentSong();
    }

    if (!currentSong && nextPublished.currentBatch.length) {
      currentSong = chooseNextSong(
        nextPublished.currentBatch,
        nextPublished.currentBatch,
        nextActive.songList
      );
      const currentSongStartedAt = new Date(nowMs).toISOString();

      nextActive = {
        ...nextActive,
        currentSong,
        currentSongId: currentSong.id,
        currentSongStartedAt,
      };
      advanceVotingBatch(currentSongStartedAt);
    }

    currentSong = resolveCurrentSong();

    if (!currentSong) {
      if (
        nextActive.currentBatch.length > 0 ||
        nextActive.currentBatchIndex !== nextPublished.currentBatchIndex ||
        nextActive.currentSong !== null ||
        nextActive.currentSongId !== null ||
        nextActive.currentSongStartedAt !== null ||
        nextActive.songList.length > 0 ||
        nextActive.songsPlayedBefore.length !== nextPublished.songsPlayedBefore.length ||
        nextActive.voterSelections.length > 0
      ) {
        nextActive = {
          ...nextActive,
          currentBatch: [],
          currentBatchIndex: nextPublished.currentBatchIndex,
          currentSong: null,
          currentSongId: null,
          currentSongStartedAt: null,
          songList: [],
          songsPlayedBefore: [...nextPublished.songsPlayedBefore],
          voterSelections: [],
        };
        changed = true;
      }

      break;
    }

    if (!nextActive.currentSongStartedAt) {
      nextActive = {
        ...nextActive,
        currentSong,
        currentSongStartedAt: new Date(nowMs).toISOString(),
      };
      changed = true;
    }

    const currentSongStartMs =
      Date.parse(nextActive.currentSongStartedAt ?? "") || nowMs;
    const currentSongEndMs = currentSongStartMs + currentSong.durationMs;

    if (nowMs < currentSongEndMs) {
      break;
    }

    if (!nextPublished.songsPlayedBefore.some((song) => song.id === currentSong.id)) {
      nextPublished = {
        ...nextPublished,
        songsPlayedBefore: [...nextPublished.songsPlayedBefore, currentSong],
      };
      nextActive = {
        ...nextActive,
        songsPlayedBefore: [...nextPublished.songsPlayedBefore],
      };
      changed = true;
    }

    const nextSongStartAt = new Date(currentSongEndMs).toISOString();

    if (nextPublished.currentBatch.length > 0) {
      const nextSong = chooseNextSong(
        nextPublished.currentBatch,
        nextPublished.currentBatch,
        nextActive.songList
      );

      nextActive = {
        ...nextActive,
        currentSong: nextSong,
        currentSongId: nextSong.id,
        currentSongStartedAt: nextSongStartAt,
        songsPlayedBefore: [...nextPublished.songsPlayedBefore],
      };
      advanceVotingBatch(nextSongStartAt);
      changed = true;
      continue;
    }

    nextActive = {
      ...nextActive,
      currentSong: null,
      currentSongId: null,
      currentSongStartedAt: null,
      songsPlayedBefore: [...nextPublished.songsPlayedBefore],
    };
    changed = true;
    break;
  }

  const publishedCurrentSong = resolveCurrentSong();
  const publishedCurrentSongId = nextPublished.currentSong?.id ?? null;
  const resolvedCurrentSongId = publishedCurrentSong?.id ?? null;
  const publishedCurrentSongStartedAt = nextPublished.currentSongStartedAt ?? null;
  const resolvedCurrentSongStartedAt = nextActive.currentSongStartedAt ?? null;

  if (
    publishedCurrentSongId !== resolvedCurrentSongId ||
    publishedCurrentSongStartedAt !== resolvedCurrentSongStartedAt
  ) {
    nextPublished = {
      ...nextPublished,
      currentSong: publishedCurrentSong ? { ...publishedCurrentSong } : null,
      currentSongStartedAt: resolvedCurrentSongStartedAt,
    };
    changed = true;
  }

  if (changed) {
    const updatedAt = new Date(nowMs).toISOString();
    nextPublished = {
      ...nextPublished,
      updatedAt,
    };
    nextActive = {
      ...nextActive,
      updatedAt,
    };
  }

  return {
    active: nextActive,
    changed,
    published: nextPublished,
  };
}

async function patchSyncedPlaylistState(
  ctx: PlaylistPatchContext,
  published: PublishedPlaylistDocument,
  active: ActivePlaylistDocument
) {
  await ctx.db.patch(published._id, {
    currentSong: published.currentSong ?? null,
    currentSongStartedAt: published.currentSongStartedAt ?? null,
    currentBatch: published.currentBatch,
    currentBatchIndex: published.currentBatchIndex,
    songsPlayedBefore: published.songsPlayedBefore,
    songwiseVote: published.songwiseVote,
    updatedAt: published.updatedAt,
  });

  await ctx.db.patch(active._id, {
    currentBatch: active.currentBatch,
    currentBatchIndex: active.currentBatchIndex,
    currentSong: active.currentSong ?? null,
    currentSongId: active.currentSongId ?? null,
    currentSongStartedAt: active.currentSongStartedAt ?? null,
    songList: active.songList,
    songsPlayedBefore: active.songsPlayedBefore,
    updatedAt: active.updatedAt,
    voterSelections: active.voterSelections,
  });
}

function chooseNextSong(
  batch: PlaylistSong[],
  remainingSongs: PlaylistSong[],
  votes: ActivePlaylistSongVote[]
) {
  const remainingIds = new Set(remainingSongs.map((song) => song.id));
  const voteMap = new Map(votes.map((vote) => [vote.songId, vote.vote]));
  const candidates = batch.filter((song) => remainingIds.has(song.id));

  if (!candidates.length) {
    throw new Error("A next song could not be chosen from the batch.");
  }

  let topVote = -Infinity;
  let topCandidates: PlaylistSong[] = [];

  for (const song of candidates) {
    const vote = voteMap.get(song.id) ?? 0;

    if (vote > topVote) {
      topVote = vote;
      topCandidates = [song];
      continue;
    }

    if (vote === topVote) {
      topCandidates.push(song);
    }
  }

  return topCandidates[Math.floor(Math.random() * topCandidates.length)];
}

function isSessionComplete(
  published: Pick<
    PublishedPlaylistDocument,
    "batches" | "currentBatch" | "currentBatchIndex" | "currentSong"
  >,
  active: Pick<ActivePlaylistDocument, "currentSongId">
) {
  return (
    published.currentSong === null &&
    active.currentSongId === null &&
    published.currentBatch.length === 0 &&
    published.currentBatchIndex >= published.batches.length
  );
}

function toActivePlaylistState(
  published: PublishedPlaylistDocument,
  active: ActivePlaylistDocument
): ActivePlaylistState {
  return {
    code: published.code,
    currentBatch: active.currentBatch,
    currentBatchIndex: active.currentBatchIndex,
    currentSong:
      active.currentSong ??
      active.currentBatch.find((song) => song.id === active.currentSongId) ??
      active.songsPlayedBefore.find((song) => song.id === active.currentSongId) ??
      null,
    currentSongId: active.currentSongId ?? null,
    currentSongStartedAt: active.currentSongStartedAt ?? null,
    playedSongs: active.songsPlayedBefore,
    songList: active.songList,
    updatedAt: active.updatedAt,
  };
}

function toPublicRecord(document: {
  batches: PlaylistSong[][];
  code: string;
  createdAt: string;
  currentSong?: PlaylistSong | null;
  currentSongStartedAt?: string | null;
  currentBatch: PlaylistSong[];
  currentBatchIndex: number;
  librarySongs: PlaylistSong[];
  loadedPlaylists: PlaylistData[];
  publisherEmail?: string | null;
  songsPlayedBefore: PlaylistSong[];
  songwiseVote: Array<Record<string, number>>;
  updatedAt: string;
}): PublishedPlaylistRecord {
  return {
    batches: document.batches,
    code: document.code,
    createdAt: document.createdAt,
    currentSong: document.currentSong ?? null,
    currentSongStartedAt: document.currentSongStartedAt ?? null,
    currentBatch: document.currentBatch,
    currentBatchIndex: document.currentBatchIndex,
    librarySongs: document.librarySongs,
    loadedPlaylists: document.loadedPlaylists,
    publisherEmail: document.publisherEmail ?? null,
    songsPlayedBefore: document.songsPlayedBefore,
    songwiseVote: document.songwiseVote,
    updatedAt: document.updatedAt,
  };
}
