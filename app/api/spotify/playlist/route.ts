import { NextResponse } from "next/server";

import {
  fetchSpotifyPlaylist,
  SpotifyApiError,
  SpotifyConfigError,
} from "@/lib/spotify";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      playlistUrl?: unknown;
    };
    const playlistUrl =
      typeof payload.playlistUrl === "string" ? payload.playlistUrl : "";

    const playlist = await fetchSpotifyPlaylist(playlistUrl);

    return NextResponse.json({ playlist });
  } catch (error) {
    if (error instanceof SpotifyConfigError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 400,
        }
      );
    }

    if (error instanceof SpotifyApiError) {
      const status =
        error.status === 401 || error.status === 403 ? 502 : error.status;

      return NextResponse.json(
        {
          error:
            error.status === 401 || error.status === 403
              ? "Spotify rejected the playlist lookup. Use a public playlist or configure a valid Spotify access token."
              : error.message,
        },
        {
          status,
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
