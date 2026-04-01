import { NextResponse } from "next/server";

import {
  fetchYouTubePlaylist,
  YouTubeApiError,
  YouTubeConfigError,
} from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      playlistUrl?: unknown;
    };
    const playlistUrl =
      typeof payload.playlistUrl === "string" ? payload.playlistUrl : "";

    const playlist = await fetchYouTubePlaylist(playlistUrl);

    return NextResponse.json({ playlist });
  } catch (error) {
    if (error instanceof YouTubeConfigError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 400,
        }
      );
    }

    if (error instanceof YouTubeApiError) {
      return NextResponse.json(
        {
          error:
            error.status === 401 || error.status === 403 || error.status === 429
              ? "YouTube rejected the playlist lookup. Use a public playlist link and try again."
              : error.message,
        },
        {
          status:
            error.status === 401 || error.status === 403
              ? 502
              : error.status,
        }
      );
    }

    return NextResponse.json(
      { error: "Playlist loading failed." },
      {
        status: 500,
      }
    );
  }
}