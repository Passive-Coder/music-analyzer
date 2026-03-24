import "server-only";

import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

type SpotifyTokenCache = {
  accessToken: string;
  expiresAt: number;
};

type SpotifyPlaylistTrackItem = {
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
};

type SpotifyTrack = {
  album?: {
    images?: Array<{ url?: string | null }>;
    name?: string | null;
  } | null;
  artists?: Array<{ name?: string | null }> | null;
  duration_ms?: number | null;
  external_urls?: {
    spotify?: string | null;
  } | null;
  id?: string | null;
  name?: string | null;
  uri?: string | null;
};

type SpotifyPlaylistResponse = {
  description?: string | null;
  external_urls?: {
    spotify?: string | null;
  } | null;
  id?: string | null;
  images?: Array<{ url?: string | null }> | null;
  name?: string | null;
  owner?: {
    display_name?: string | null;
    id?: string | null;
  } | null;
  tracks?: {
    items?: SpotifyPlaylistTrackItem[];
    next?: string | null;
  } | null;
};

type SpotifyPlaylistItemsResponse = {
  items?: SpotifyPlaylistTrackItem[];
  next?: string | null;
};

class SpotifyConfigError extends Error {}
class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

let cachedSpotifyToken: SpotifyTokenCache | null = null;

export function parseSpotifyPlaylistId(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new SpotifyConfigError("Paste a Spotify playlist link to continue.");
  }

  if (trimmed.startsWith("spotify:playlist:")) {
    const candidate = trimmed.split(":").pop() ?? "";
    return validateSpotifyPlaylistId(candidate);
  }

  try {
    const url = new URL(trimmed);
    const playlistId = url.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/)?.[1];

    if (playlistId) {
      return validateSpotifyPlaylistId(playlistId);
    }
  } catch {
    return validateSpotifyPlaylistId(trimmed);
  }

  throw new SpotifyConfigError("That Spotify playlist link could not be parsed.");
}

export async function fetchSpotifyPlaylist(
  input: string
): Promise<PlaylistData> {
  const playlistId = parseSpotifyPlaylistId(input);
  const accessToken = await getSpotifyAccessToken();

  const playlistUrl = new URL(`${SPOTIFY_API_BASE}/playlists/${playlistId}`);
  playlistUrl.searchParams.set("market", "US");

  const playlist = await spotifyFetch<SpotifyPlaylistResponse>(
    playlistUrl.toString(),
    accessToken
  );

  const songs = normalizeSpotifyTracks(playlist.tracks?.items ?? []);
  let nextPage = playlist.tracks?.next ?? null;

  while (nextPage) {
    const pageUrl = new URL(nextPage);

    if (!pageUrl.searchParams.has("market")) {
      pageUrl.searchParams.set("market", "US");
    }

    const page = await spotifyFetch<SpotifyPlaylistItemsResponse>(
      pageUrl.toString(),
      accessToken
    );

    songs.push(...normalizeSpotifyTracks(page.items ?? []));
    nextPage = page.next ?? null;
  }

  return {
    description: sanitizeSpotifyText(playlist.description ?? null),
    id: playlist.id ?? playlistId,
    imageUrl: playlist.images?.[0]?.url ?? null,
    owner:
      sanitizeSpotifyText(
        playlist.owner?.display_name ?? playlist.owner?.id ?? null
      ) ?? "Spotify",
    songs,
    spotifyUrl:
      playlist.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${playlistId}`,
    title: sanitizeSpotifyText(playlist.name ?? null) ?? "Spotify Playlist",
  };
}

export { SpotifyApiError, SpotifyConfigError };

async function getSpotifyAccessToken() {
  const staticToken = process.env.SPOTIFY_ACCESS_TOKEN?.trim();

  if (staticToken) {
    return staticToken;
  }

  if (cachedSpotifyToken && cachedSpotifyToken.expiresAt > Date.now() + 5_000) {
    return cachedSpotifyToken.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new SpotifyConfigError(
      "Spotify credentials are not configured. Set SPOTIFY_ACCESS_TOKEN or SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
    );
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new SpotifyApiError(
      "Spotify token request failed. Check your Spotify app credentials.",
      response.status
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new SpotifyApiError("Spotify did not return an access token.", 502);
  }

  cachedSpotifyToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };

  return payload.access_token;
}

async function spotifyFetch<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorPayload = (await safeJson(response)) as
      | {
          error?: {
            message?: string;
            status?: number;
          };
        }
      | undefined;

    throw new SpotifyApiError(
      errorPayload?.error?.message ??
        "Spotify rejected the playlist request.",
      response.status
    );
  }

  return (await response.json()) as T;
}

function normalizeSpotifyTracks(items: SpotifyPlaylistTrackItem[]) {
  return items
    .map((entry, index) => mapSpotifyTrack(entry, index))
    .filter((song): song is PlaylistSong => song !== null);
}

function mapSpotifyTrack(entry: SpotifyPlaylistTrackItem, index: number) {
  const item = entry.item ?? entry.track;

  if (!item?.name) {
    return null;
  }

  return {
    album: sanitizeSpotifyText(item.album?.name ?? null) ?? "Unknown Album",
    artists:
      item.artists
        ?.map((artist) => sanitizeSpotifyText(artist.name ?? null))
        .filter((artist): artist is string => Boolean(artist)) ?? [],
    artworkUrl: item.album?.images?.[0]?.url ?? null,
    durationMs: item.duration_ms ?? 0,
    id: item.id ?? `${item.uri ?? item.name}-${index}`,
    spotifyId: item.id ?? null,
    spotifyUrl: item.external_urls?.spotify ?? null,
    title: sanitizeSpotifyText(item.name ?? null) ?? "Untitled",
    uri: item.uri ?? null,
  };
}

function sanitizeSpotifyText(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function validateSpotifyPlaylistId(candidate: string) {
  if (!/^[a-zA-Z0-9]{10,}$/.test(candidate)) {
    throw new SpotifyConfigError("That Spotify playlist ID is not valid.");
  }

  return candidate;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
