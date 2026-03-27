import { NextResponse } from "next/server";

import { createPublishedPlaylistRecord } from "@/lib/published-playlists";
import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      playlist?: PlaylistData;
      songs?: PlaylistSong[];
      sourceUrl?: string;
    };

    if (!payload.playlist || !Array.isArray(payload.songs)) {
      return NextResponse.json(
        { error: "Playlist data is missing." },
        { status: 400 }
      );
    }

    const sourceUrl =
      typeof payload.sourceUrl === "string"
        ? payload.sourceUrl.trim()
        : payload.playlist.sourceUrl;

    const record = await createPublishedPlaylistRecord({
      playlist: payload.playlist,
      songs: payload.songs,
      sourceUrl,
    });

    return NextResponse.json({
      code: record.code,
      createdAt: record.createdAt,
      apiUrl: `/api/published-playlists/${record.code}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Publishing the playlist failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
