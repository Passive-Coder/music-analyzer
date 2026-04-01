"use server";

import { fetchMutation, fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";

import { getConvexDeploymentUrl } from "@/lib/convex-url";
import type {
  ActivePlaylistState,
  ActivePlaylistViewerSelection,
} from "@/lib/playlist-types";

const syncActivePlaylistPlaybackRef =
  makeFunctionReference<"mutation">("playlists:syncActivePlaylistPlayback");
const voteForActivePlaylistSongRef =
  makeFunctionReference<"mutation">("playlists:voteForActivePlaylistSong");
const getActivePlaylistViewerSelectionRef =
  makeFunctionReference<"query">("playlists:getActivePlaylistViewerSelection");

export async function syncActivePlaylistPlaybackAction(code: string) {
  try {
    const result = await fetchMutation(
      syncActivePlaylistPlaybackRef,
      { code },
      { url: getConvexDeploymentUrl() }
    );

    return { ok: true as const, result: result as ActivePlaylistState | null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Syncing the active playlist failed.",
      ok: false as const,
    };
  }
}

export async function voteForActivePlaylistSongAction(input: {
  code: string;
  songId: string;
  viewerId: string;
}) {
  try {
    const result = await fetchMutation(
      voteForActivePlaylistSongRef,
      {
        code: input.code,
        songId: input.songId,
        viewerId: input.viewerId,
      },
      { url: getConvexDeploymentUrl() }
    );

    return {
      ok: true as const,
      result: result as {
        activeState: ActivePlaylistState;
        selectedSongId: string | null;
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Voting for the song failed.",
      ok: false as const,
    };
  }
}

export async function getActivePlaylistViewerSelectionAction(
  code: string,
  viewerId: string
) {
  try {
    const result = await fetchQuery(
      getActivePlaylistViewerSelectionRef,
      { code, viewerId },
      { url: getConvexDeploymentUrl() }
    );

    return {
      ok: true as const,
      result: result as ActivePlaylistViewerSelection,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Loading the saved vote selection failed.",
      ok: false as const,
    };
  }
}
