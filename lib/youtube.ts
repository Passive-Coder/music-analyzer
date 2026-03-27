import "server-only";

import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

type YouTubeThumbnailSet = {
  default?: { url?: string | null } | null;
  medium?: { url?: string | null } | null;
  high?: { url?: string | null } | null;
  standard?: { url?: string | null } | null;
  maxres?: { url?: string | null } | null;
};

type YouTubePlaylistMetadata = {
  id?: string | null;
  snippet?: {
    channelTitle?: string | null;
    description?: string | null;
    thumbnails?: YouTubeThumbnailSet | null;
    title?: string | null;
  } | null;
};

type YouTubePlaylistItemsResponse = {
  items?: YouTubePlaylistItem[];
  nextPageToken?: string | null;
};

type YouTubePlaylistItem = {
  contentDetails?: {
    videoId?: string | null;
  } | null;
  id?: string | null;
  snippet?: {
    channelTitle?: string | null;
    description?: string | null;
    resourceId?: {
      videoId?: string | null;
    } | null;
    thumbnails?: YouTubeThumbnailSet | null;
    title?: string | null;
    videoOwnerChannelTitle?: string | null;
  } | null;
  status?: {
    privacyStatus?: string | null;
  } | null;
};

type YouTubeVideo = {
  contentDetails?: {
    duration?: string | null;
  } | null;
  id?: string | null;
  snippet?: {
    channelTitle?: string | null;
    thumbnails?: YouTubeThumbnailSet | null;
    title?: string | null;
  } | null;
};

type YouTubeVideosResponse = {
  items?: YouTubeVideo[];
};

class YouTubeConfigError extends Error {}
class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function parseYouTubePlaylistId(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new YouTubeConfigError("Paste a YouTube playlist link to continue.");
  }

  try {
    const url = new URL(trimmed);
    const playlistId = url.searchParams.get("list");

    if (playlistId) {
      return validateYouTubePlaylistId(playlistId);
    }
  } catch {
    return validateYouTubePlaylistId(trimmed);
  }

  throw new YouTubeConfigError("That YouTube playlist link could not be parsed.");
}

export async function fetchYouTubePlaylist(
  input: string
): Promise<PlaylistData> {
  const playlistId = parseYouTubePlaylistId(input);
  const apiKey = getYouTubeApiKey();
  const playlistMetadataUrl = new URL(`${YOUTUBE_API_BASE}/playlists`);

  playlistMetadataUrl.searchParams.set("part", "snippet");
  playlistMetadataUrl.searchParams.set("id", playlistId);
  playlistMetadataUrl.searchParams.set("maxResults", "1");
  playlistMetadataUrl.searchParams.set("key", apiKey);

  const playlistMetadataResponse = await youTubeFetch<{
    items?: YouTubePlaylistMetadata[];
  }>(playlistMetadataUrl.toString());
  const playlistMetadata = playlistMetadataResponse.items?.[0];

  if (!playlistMetadata) {
    throw new YouTubeApiError("That YouTube playlist could not be found.", 404);
  }

  const playlistTitle =
    sanitizeYouTubeText(playlistMetadata.snippet?.title ?? null) ??
    "YouTube Playlist";
  const playlistItems = await fetchAllPlaylistItems(playlistId, apiKey);
  const videosById = await fetchVideosById(
    playlistItems
      .map(
        (item) =>
          item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? null
      )
      .filter((videoId): videoId is string => Boolean(videoId)),
    apiKey
  );

  const songs = playlistItems
    .map((item, index) => mapPlaylistSong(item, videosById, playlistTitle, index))
    .filter((song): song is PlaylistSong => song !== null);

  return {
    description: sanitizeYouTubeText(playlistMetadata.snippet?.description ?? null),
    id: playlistMetadata.id ?? playlistId,
    imageUrl: pickThumbnailUrl(playlistMetadata.snippet?.thumbnails ?? null),
    owner:
      sanitizeYouTubeText(playlistMetadata.snippet?.channelTitle ?? null) ??
      "YouTube",
    songs,
    sourceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    title: playlistTitle,
  };
}

export { YouTubeApiError, YouTubeConfigError };

function getYouTubeApiKey() {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  if (!apiKey) {
    throw new YouTubeConfigError(
      "YouTube credentials are not configured. Set YOUTUBE_API_KEY on the server."
    );
  }

  return apiKey;
}

async function fetchAllPlaylistItems(playlistId: string, apiKey: string) {
  const items: YouTubePlaylistItem[] = [];
  let nextPageToken: string | null = null;

  do {
    const pageUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);

    pageUrl.searchParams.set("part", "snippet,contentDetails,status");
    pageUrl.searchParams.set("playlistId", playlistId);
    pageUrl.searchParams.set("maxResults", "50");
    pageUrl.searchParams.set("key", apiKey);

    if (nextPageToken) {
      pageUrl.searchParams.set("pageToken", nextPageToken);
    }

    const response =
      await youTubeFetch<YouTubePlaylistItemsResponse>(pageUrl.toString());

    items.push(...(response.items ?? []));
    nextPageToken = response.nextPageToken ?? null;
  } while (nextPageToken);

  return items;
}

async function fetchVideosById(videoIds: string[], apiKey: string) {
  const uniqueIds = Array.from(new Set(videoIds));
  const videosById = new Map<string, YouTubeVideo>();

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const batch = uniqueIds.slice(index, index + 50);

    if (!batch.length) {
      continue;
    }

    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set("part", "contentDetails,snippet");
    videosUrl.searchParams.set("id", batch.join(","));
    videosUrl.searchParams.set("maxResults", "50");
    videosUrl.searchParams.set("key", apiKey);

    const response = await youTubeFetch<YouTubeVideosResponse>(
      videosUrl.toString()
    );

    for (const video of response.items ?? []) {
      if (video.id) {
        videosById.set(video.id, video);
      }
    }
  }

  return videosById;
}

async function youTubeFetch<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    const errorPayload = (await safeJson(response)) as
      | {
          error?: {
            code?: number;
            message?: string;
          };
        }
      | undefined;

    throw new YouTubeApiError(
      errorPayload?.error?.message ??
        "YouTube rejected the playlist request.",
      response.status
    );
  }

  return (await response.json()) as T;
}

function mapPlaylistSong(
  item: YouTubePlaylistItem,
  videosById: Map<string, YouTubeVideo>,
  playlistTitle: string,
  index: number
) {
  const videoId =
    item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? null;
  const video = videoId ? videosById.get(videoId) : undefined;
  const title = sanitizeYouTubeText(
    video?.snippet?.title ?? item.snippet?.title ?? null
  );

  if (!title || title === "Private video" || title === "Deleted video") {
    return null;
  }

  const channelTitle =
    sanitizeYouTubeText(
      video?.snippet?.channelTitle ??
        item.snippet?.videoOwnerChannelTitle ??
        item.snippet?.channelTitle ??
        null
    ) ?? "Unknown Channel";

  return {
    album: playlistTitle,
    artists: [channelTitle],
    artworkUrl:
      pickThumbnailUrl(video?.snippet?.thumbnails ?? null) ??
      pickThumbnailUrl(item.snippet?.thumbnails ?? null),
    durationMs: parseYouTubeDuration(video?.contentDetails?.duration ?? null),
    id: item.id ?? `${videoId ?? title}-${index}`,
    sourceId: videoId,
    sourceUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    title,
  };
}

function parseYouTubeDuration(duration: string | null) {
  if (!duration) {
    return 0;
  }

  const match = duration.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i
  );

  if (!match) {
    return 0;
  }

  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const totalSeconds =
    Number(days) * 86_400 +
    Number(hours) * 3_600 +
    Number(minutes) * 60 +
    Number(seconds);

  return totalSeconds * 1000;
}

function pickThumbnailUrl(thumbnails: YouTubeThumbnailSet | null) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

function sanitizeYouTubeText(value: string | null) {
  if (!value) {
    return null;
  }

  const sanitized = value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || null;
}

function validateYouTubePlaylistId(candidate: string) {
  const normalizedCandidate = candidate.trim();

  if (!/^[A-Za-z0-9_-]{10,}$/.test(normalizedCandidate)) {
    throw new YouTubeConfigError("That YouTube playlist ID is not valid.");
  }

  return normalizedCandidate;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
