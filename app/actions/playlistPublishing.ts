"use server";

import { fetchMutation, fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";

import { getConvexDeploymentUrl } from "@/lib/convex-url";
import { requireGoogleSession } from "@/lib/google-auth";
import type {
  PlaylistData,
  PlaylistSong,
  PublishPlaylistResult,
  PublishedPlaylistRecord,
} from "@/lib/playlist-types";

const publishPlaylistRef =
  makeFunctionReference<"mutation">("playlists:publishPlaylist");
const appendLoadedPlaylistRef =
  makeFunctionReference<"mutation">("playlists:appendLoadedPlaylist");
const updateUpcomingBatchSongRef =
  makeFunctionReference<"mutation">("playlists:updateUpcomingBatchSong");
const voteForCurrentBatchSongRef =
  makeFunctionReference<"mutation">("playlists:voteForCurrentBatchSong");
const advanceCurrentBatchRef =
  makeFunctionReference<"mutation">("playlists:advanceCurrentBatch");
const abortPublishedPlaylistRef =
  makeFunctionReference<"mutation">("playlists:abortPublishedPlaylist");
const getPublishedPlaylistRef =
  makeFunctionReference<"query">("playlists:getPublishedPlaylist");
const getOwnedPublishedPlaylistRef =
  makeFunctionReference<"query">("playlists:getOwnedPublishedPlaylist");

export async function publishPlaylistAction(input: {
  batchSongs: PlaylistSong[];
  currentBatchIndex: number;
  initialSongId: string | null;
  librarySongs: PlaylistSong[];
  loadedPlaylists: PlaylistData[];
}) {
  try {
    const session = await requireGoogleSession();
    const result = await fetchMutation(
      publishPlaylistRef,
      {
        ...input,
        publisherEmail: session.email,
      },
      { url: getConvexDeploymentUrl() }
    );

    return { ok: true as const, result: result as PublishPlaylistResult };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Publishing the playlist failed.",
      ok: false as const,
    };
  }
}

export async function appendLoadedPlaylistAction(input: {
  code: string;
  creatorToken: string;
  playlist: PlaylistData;
}) {
  return runPlaylistMutation(async () => {
    await requireGoogleSession();
    return fetchMutation(appendLoadedPlaylistRef, input, {
      url: getConvexDeploymentUrl(),
    });
  });
}

export async function updateUpcomingBatchSongAction(input: {
  batchIndex: number;
  code: string;
  creatorToken: string;
  replacementSong: PlaylistSong;
  songIndex: number;
}) {
  return runPlaylistMutation(async () => {
    await requireGoogleSession();
    return fetchMutation(updateUpcomingBatchSongRef, input, {
      url: getConvexDeploymentUrl(),
    });
  });
}

export async function voteForCurrentBatchSongAction(input: {
  code: string;
  songIndex: number;
}) {
  return runPlaylistMutation(async () => {
    await requireGoogleSession();
    return fetchMutation(voteForCurrentBatchSongRef, input, {
      url: getConvexDeploymentUrl(),
    });
  });
}

export async function advanceCurrentBatchAction(input: {
  code: string;
  creatorToken: string;
}) {
  return runPlaylistMutation(async () => {
    await requireGoogleSession();
    return fetchMutation(advanceCurrentBatchRef, input, {
      url: getConvexDeploymentUrl(),
    });
  });
}

export async function abortPublishedPlaylistAction(input: {
  code: string;
  creatorToken: string;
}) {
  return runPlaylistMutation(async () => {
    await requireGoogleSession();
    await fetchMutation(abortPublishedPlaylistRef, input, {
      url: getConvexDeploymentUrl(),
    });

    return null;
  });
}

export async function getPublishedPlaylistAction(code: string) {
  try {
    const result = await fetchQuery(
      getPublishedPlaylistRef,
      { code },
      { url: getConvexDeploymentUrl() }
    );

    return {
      ok: true as const,
      result: result as PublishedPlaylistRecord | null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Loading the published playlist failed.",
      ok: false as const,
    };
  }
}

export async function getOwnedPublishedPlaylistAction() {
  try {
    const session = await requireGoogleSession();
    const result = await fetchQuery(
      getOwnedPublishedPlaylistRef,
      { publisherEmail: session.email },
      { url: getConvexDeploymentUrl() }
    );

    return {
      ok: true as const,
      result: result as
        | {
            creatorToken: string;
            record: PublishedPlaylistRecord;
          }
        | null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Loading the creator session failed.",
      ok: false as const,
    };
  }
}

async function runPlaylistMutation<T>(
  operation: () => Promise<T>
) {
  try {
    const result = await operation();

    return { ok: true as const, result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Updating the published playlist failed.",
      ok: false as const,
    };
  }
}
