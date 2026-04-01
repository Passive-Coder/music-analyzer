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

type PublishedPlaylistDocument = Omit<PublishedPlaylistRecord, "publisherEmail"> & {
  _id: Id<"publishedPlaylists">;
  creatorToken: string;
  publisherEmail?: string | null;
};

type ActivePlaylistDocument = {
  _id: Id<"activePlaylists">;
  code: string;
  currentBatch: PlaylistSong[];
  currentBatchIndex: number;
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

export const publishPlaylist = mutation({
  args: {
    batchSongs: v.array(playlistSongValidator),
    currentBatchIndex: v.number(),
    librarySongs: v.array(playlistSongValidator),
    loadedPlaylists: v.array(playlistDataValidator),
    publisherEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const batches = chunkSongs(args.batchSongs, BATCH_SIZE);
    const clampedBatchIndex = clampCurrentBatchIndex(
      args.currentBatchIndex,
      batches.length
    );
    const currentBatch = batches[clampedBatchIndex] ?? [];
    const now = new Date().toISOString();
    const code = await createUniqueAlphabeticCode(ctx);
    const creatorToken = createAlphabeticCode(CREATOR_TOKEN_LENGTH);

    const document = {
      batches,
      code,
      createdAt: now,
      creatorToken,
      currentBatch,
      currentBatchIndex: clampedBatchIndex,
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
    const published = await getPlaylistByCodeOrThrow(ctx, args.code);
    const active = await ensureActivePlaylistByCode(ctx, published, new Date().toISOString());
    const synced = syncActivePlaybackState(published, active, Date.now());

    if (synced.changed) {
      await patchSyncedPlaylistState(ctx, synced.published, synced.active);
    }

    const currentBatchSongIds = new Set(synced.published.currentBatch.map((song) => song.id));

    if (!currentBatchSongIds.has(args.songId)) {
      throw new Error("That song is not in the current voting batch.");
    }

    if (synced.active.currentSongId === args.songId) {
      throw new Error("The song that is currently playing cannot be voted on.");
    }

    if (synced.published.songsPlayedBefore.some((song) => song.id === args.songId)) {
      throw new Error("That song has already been played.");
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
    const published = await getPlaylistByCodeOrThrow(ctx, args.code);
    const active = await ensureActivePlaylistByCode(ctx, published, new Date().toISOString());
    const synced = syncActivePlaybackState(published, active, Date.now());

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
    const published = await getPlaylistByCodeOrThrow(ctx, args.code);
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
    const nextBatchIndex = Math.min(
      document.currentBatchIndex + 1,
      document.batches.length
    );

    if (nextBatchIndex === document.currentBatchIndex) {
      return toPublicRecord(document);
    }

    const playedSongs =
      document.currentBatch.length > 0
        ? [...document.songsPlayedBefore, ...document.currentBatch]
        : document.songsPlayedBefore;
    const nextCurrentBatch = document.batches[nextBatchIndex] ?? [];
    const updatedDocument = {
      ...document,
      currentBatch: nextCurrentBatch,
      currentBatchIndex: nextBatchIndex,
      songsPlayedBefore: playedSongs,
      songwiseVote: createVoteSnapshot(nextCurrentBatch),
      updatedAt: new Date().toISOString(),
    };

    await ctx.db.patch(document._id, {
      currentBatch: updatedDocument.currentBatch,
      currentBatchIndex: updatedDocument.currentBatchIndex,
      songsPlayedBefore: updatedDocument.songsPlayedBefore,
      songwiseVote: updatedDocument.songwiseVote,
      updatedAt: updatedDocument.updatedAt,
    });

    await ctx.db.patch(active._id, {
      currentBatch: nextCurrentBatch,
      currentBatchIndex: nextBatchIndex,
      currentSongId: nextCurrentBatch[0]?.id ?? null,
      currentSongStartedAt: nextCurrentBatch[0]
        ? new Date().toISOString()
        : null,
      songList: buildActiveSongList(nextCurrentBatch),
      songsPlayedBefore: playedSongs,
      updatedAt: updatedDocument.updatedAt,
      voterSelections: [],
    });

    return toPublicRecord(updatedDocument);
  },
});

export const getPublishedPlaylist = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await getPlaylistByCodeOrThrow(ctx, args.code);
    return toPublicRecord(document);
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

async function getPlaylistByCodeOrThrow(
  ctx: PublishedPlaylistLookupContext,
  code: string
): Promise<PublishedPlaylistDocument> {
  const normalizedCode = normalizeCode(code);
  const document = (
    (await ctx.db.query("publishedPlaylists").collect()) as PublishedPlaylistDocument[]
  ).find((entry) => entry.code === normalizedCode);

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

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function buildActivePlaylistSeed(
  published: Pick<
    PublishedPlaylistDocument,
    | "code"
    | "currentBatch"
    | "currentBatchIndex"
    | "songsPlayedBefore"
    | "updatedAt"
  >,
  nowIso: string
): ActivePlaylistSeed {
  return {
    code: published.code,
    currentBatch: published.currentBatch,
    currentBatchIndex: published.currentBatchIndex,
    currentSongId: published.currentBatch[0]?.id ?? null,
    currentSongStartedAt: published.currentBatch[0] ? nowIso : null,
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
    currentBatch: [...published.currentBatch],
    songsPlayedBefore: [...published.songsPlayedBefore],
    songwiseVote: [...published.songwiseVote],
  };
  let nextActive: ActivePlaylistDocument = {
    ...active,
    currentBatch: [...active.currentBatch],
    currentBatchIndex: active.currentBatchIndex,
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

  while (true) {
    syncActiveCollectionsFromPublished();
    ensureSongListMatchesCurrentBatch();

    if (!nextPublished.currentBatch.length) {
      if (
        nextActive.currentBatch.length > 0 ||
        nextActive.currentBatchIndex !== nextPublished.currentBatchIndex ||
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

    let currentSong =
      nextActive.currentBatch.find((song) => song.id === nextActive.currentSongId) ??
      null;

    if (!currentSong) {
      currentSong = nextActive.currentBatch[0] ?? null;

      if (!currentSong) {
        break;
      }

      nextActive = {
        ...nextActive,
        currentSongId: currentSong.id,
        currentSongStartedAt: new Date(nowMs).toISOString(),
        songList: buildActiveSongList(nextActive.currentBatch),
        voterSelections: [],
      };
      changed = true;
    }

    if (!nextActive.currentSongStartedAt) {
      nextActive = {
        ...nextActive,
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

    const playedSongIds = new Set(
      nextPublished.songsPlayedBefore.map((song) => song.id)
    );
    const remainingSongs = nextPublished.currentBatch.filter(
      (song) => !playedSongIds.has(song.id)
    );
    const nextSongStartAt = new Date(currentSongEndMs).toISOString();

    if (remainingSongs.length > 0) {
      const nextSong = chooseNextSong(
        nextPublished.currentBatch,
        remainingSongs,
        nextActive.songList
      );

      nextActive = {
        ...nextActive,
        currentSongId: nextSong.id,
        currentSongStartedAt: nextSongStartAt,
        currentBatch: [...nextPublished.currentBatch],
        currentBatchIndex: nextPublished.currentBatchIndex,
        songList: buildActiveSongList(nextPublished.currentBatch),
        songsPlayedBefore: [...nextPublished.songsPlayedBefore],
        voterSelections: [],
      };
      changed = true;
      continue;
    }

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
      currentBatch: nextBatch,
      currentBatchIndex: nextBatchIndex,
      currentSongId: nextBatch[0]?.id ?? null,
      currentSongStartedAt: nextBatch[0] ? nextSongStartAt : null,
      songList: buildActiveSongList(nextBatch),
      songsPlayedBefore: [...nextPublished.songsPlayedBefore],
      voterSelections: [],
    };
    changed = true;

    if (!nextBatch.length) {
      break;
    }
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
    currentBatch: published.currentBatch,
    currentBatchIndex: published.currentBatchIndex,
    songsPlayedBefore: published.songsPlayedBefore,
    songwiseVote: published.songwiseVote,
    updatedAt: published.updatedAt,
  });

  await ctx.db.patch(active._id, {
    currentBatch: active.currentBatch,
    currentBatchIndex: active.currentBatchIndex,
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

  return batch
    .filter((song) => remainingIds.has(song.id))
    .sort((leftSong, rightSong) => {
      const rightVote = voteMap.get(rightSong.id) ?? 0;
      const leftVote = voteMap.get(leftSong.id) ?? 0;

      if (rightVote !== leftVote) {
        return rightVote - leftVote;
      }

      return (
        batch.findIndex((song) => song.id === leftSong.id) -
        batch.findIndex((song) => song.id === rightSong.id)
      );
    })[0];
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
      active.currentBatch.find((song) => song.id === active.currentSongId) ?? null,
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
