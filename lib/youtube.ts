import "server-only";

import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

const YOUTUBE_WEB_BASE = "https://www.youtube.com";
const YOUTUBE_MUSIC_BASE = "https://music.youtube.com";
const YOUTUBE_INNERTUBE_BROWSE = "https://www.youtube.com/youtubei/v1/browse";
const YOUTUBE_MUSIC_INNERTUBE_BROWSE =
  "https://music.youtube.com/youtubei/v1/browse";
const REQUEST_HEADERS = {
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

type YouTubeClientName = "WEB" | "WEB_REMIX";
type PlaylistMetadata = {
  description: string | null;
  imageUrl: string | null;
  owner: string;
  title: string;
};

type YouTubePlaylistPageData = {
  initialData: Record<string, unknown>;
  innertubeApiKey: string;
  visitorData: string | null;
  clientVersion: string;
  sourceUrl: string;
  browseEndpoint: string;
  clientName: YouTubeClientName;
};

type ContinuationResponse = {
  onResponseReceivedActions?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: Array<Record<string, unknown>>;
    } | null;
  }>;
} & Record<string, unknown>;

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
  const defaultMetadata = getDefaultPlaylistMetadata(playlistId);
  let metadata = defaultMetadata;
  let songs: PlaylistSong[] = [];
  let lastError: unknown = null;
  let sourceUrl = `${YOUTUBE_MUSIC_BASE}/playlist?list=${playlistId}`;

  try {
    const playlistPage = await fetchPlaylistPageData(playlistId);
    sourceUrl = playlistPage.sourceUrl;
    metadata = extractPlaylistMetadata(playlistPage.initialData, playlistId);
    songs = await fetchAllPlaylistSongs(
      playlistPage,
      playlistId,
      metadata.title,
      getInitialPlaylistItems
    );
  } catch (error) {
    lastError = error;
  }

  if (!songs.length) {
    try {
      const musicPlaylistPage = await fetchMusicPlaylistPageData(playlistId);
      sourceUrl = musicPlaylistPage.sourceUrl;
      const musicMetadata = extractMusicPlaylistMetadata(
        musicPlaylistPage.initialData,
        playlistId
      );
      metadata = mergePlaylistMetadata(metadata, musicMetadata, playlistId);
      songs = await fetchAllPlaylistSongs(
        musicPlaylistPage,
        playlistId,
        metadata.title,
        getInitialMusicPlaylistItems
      );
    } catch (error) {
      lastError = error;
    }
  }

  if (!songs.length) {
    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new YouTubeApiError(
      "Could not find any songs inside this YouTube playlist.",
      404
    );
  }

  return {
    description: metadata.description,
    id: playlistId,
    imageUrl: metadata.imageUrl,
    owner: metadata.owner,
    songs,
    sourceUrl,
    title: metadata.title,
  };
}

export { YouTubeApiError, YouTubeConfigError };

async function fetchPlaylistPageData(
  playlistId: string
): Promise<YouTubePlaylistPageData> {
  const sourceUrl = `${YOUTUBE_MUSIC_BASE}/playlist?list=${playlistId}`;
  const pageUrl = `${YOUTUBE_WEB_BASE}/playlist?list=${playlistId}&hl=en`;
  const response = await fetch(pageUrl, {
    cache: "no-store",
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new YouTubeApiError(
      "YouTube rejected the playlist page request.",
      response.status
    );
  }

  const html = await response.text();
  const initialData = extractJsonFromHtml<Record<string, unknown>>(
    html,
    /var ytInitialData = (\{.*?\});/
  );
  const innertubeApiKey = extractMatch(
    html,
    /"INNERTUBE_API_KEY":"([^"]+)"/,
    "Could not find the embedded YouTube browse key."
  );
  const clientVersion = extractMatch(
    html,
    /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/,
    "Could not find the embedded YouTube client version."
  );
  const visitorDataMatch = html.match(/"visitorData":"([^"]+)"/);

  return {
    initialData,
    innertubeApiKey,
    visitorData: visitorDataMatch?.[1] ?? null,
    clientVersion,
    sourceUrl,
    browseEndpoint: YOUTUBE_INNERTUBE_BROWSE,
    clientName: "WEB",
  };
}

async function fetchMusicPlaylistPageData(
  playlistId: string
): Promise<YouTubePlaylistPageData> {
  const sourceUrl = `${YOUTUBE_MUSIC_BASE}/playlist?list=${playlistId}`;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new YouTubeApiError(
      "YouTube Music rejected the playlist page request.",
      response.status
    );
  }

  const html = await response.text();
  const initialData = extractMusicBrowseDataFromHtml(html);
  const innertubeApiKey = extractMatch(
    html,
    /"INNERTUBE_API_KEY":"([^"]+)"/,
    "Could not find the embedded YouTube Music browse key."
  );
  const clientVersion = extractMatch(
    html,
    /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/,
    "Could not find the embedded YouTube Music client version."
  );
  const visitorDataMatch =
    html.match(/"VISITOR_DATA":"([^"]+)"/) ??
    html.match(/"visitorData":"([^"]+)"/);

  return {
    initialData,
    innertubeApiKey,
    visitorData: visitorDataMatch?.[1] ?? null,
    clientVersion,
    sourceUrl,
    browseEndpoint: YOUTUBE_MUSIC_INNERTUBE_BROWSE,
    clientName: "WEB_REMIX",
  };
}

async function fetchAllPlaylistSongs(
  playlistPage: YouTubePlaylistPageData,
  playlistId: string,
  playlistTitle: string,
  getInitialItems: (
    initialData: Record<string, unknown>
  ) => Array<Record<string, unknown>>
): Promise<PlaylistSong[]> {
  const songs: PlaylistSong[] = extractPlaylistSongsFromItems(
    getInitialItems(playlistPage.initialData),
    playlistId,
    playlistTitle
  );
  let continuationToken = getPlaylistContinuationToken(playlistPage.initialData);

  while (continuationToken) {
    const continuationItems = await fetchContinuationItems(
      playlistPage,
      continuationToken
    );
    songs.push(
      ...extractPlaylistSongsFromItems(
        continuationItems,
        playlistId,
        playlistTitle
      )
    );
    continuationToken = getPlaylistContinuationToken({ items: continuationItems });
  }

  return songs;
}

async function fetchContinuationItems(
  playlistPage: YouTubePlaylistPageData,
  continuationToken: string
) {
  const payload = {
    context: {
      client: {
        clientName: playlistPage.clientName,
        clientVersion: playlistPage.clientVersion,
        ...(playlistPage.visitorData
          ? { visitorData: playlistPage.visitorData }
          : {}),
      },
    },
    continuation: continuationToken,
  };

  const response = await fetch(
    `${playlistPage.browseEndpoint}?key=${encodeURIComponent(
      playlistPage.innertubeApiKey
    )}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        ...REQUEST_HEADERS,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new YouTubeApiError(
      "YouTube rejected the playlist continuation request.",
      response.status
    );
  }

  const data = (await response.json()) as ContinuationResponse;

  return (
    data.onResponseReceivedActions?.[0]?.appendContinuationItemsAction
      ?.continuationItems ?? []
  );
}

function extractPlaylistMetadata(
  initialData: Record<string, unknown>,
  playlistId: string
): PlaylistMetadata {
  const sidebarPrimary = findFirstRenderer(
    initialData,
    "playlistSidebarPrimaryInfoRenderer"
  ) as Record<string, unknown> | null;
  const sidebarSecondary = findFirstRenderer(
    initialData,
    "playlistSidebarSecondaryInfoRenderer"
  ) as Record<string, unknown> | null;
  const metadataRenderer = findFirstRenderer(
    initialData,
    "playlistMetadataRenderer"
  ) as Record<string, unknown> | null;
  const pageHeader = findFirstRenderer(
    initialData,
    "pageHeaderRenderer"
  ) as Record<string, unknown> | null;

  const title =
    getText(sidebarPrimary?.title) ??
    getString(metadataRenderer?.title) ??
    getString(pageHeader?.pageTitle) ??
    "YouTube Playlist";

  const description =
    getText(metadataRenderer?.description) ??
    getText(sidebarPrimary?.description) ??
    null;

  const owner =
    getText(getObject(sidebarSecondary, "videoOwner.videoOwnerRenderer.title")) ??
    getText(sidebarPrimary?.ownerText) ??
    extractOwnerFromPageHeader(pageHeader) ??
    "YouTube Music";

  const imageUrl =
    pickThumbnailUrl(
      getObject(
        sidebarPrimary?.thumbnailRenderer,
        "playlistVideoThumbnailRenderer.thumbnail"
      )
    ) ??
    pickThumbnailUrl(
      getObject(pageHeader, "content.pageHeaderViewModel.heroImage.contentPreviewImageViewModel.image")
    ) ??
    `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`;

  return {
    description: sanitizeYouTubeText(description),
    imageUrl,
    owner: sanitizeYouTubeText(owner) ?? "YouTube Music",
    title: sanitizeYouTubeText(title) ?? "YouTube Playlist",
  };
}

function extractMusicPlaylistMetadata(
  initialData: Record<string, unknown>,
  playlistId: string
): PlaylistMetadata {
  const microformat = findFirstRenderer(
    initialData,
    "microformatDataRenderer"
  ) as Record<string, unknown> | null;
  const header = findFirstRenderer(
    initialData,
    "musicResponsiveHeaderRenderer"
  ) as Record<string, unknown> | null;

  return {
    description:
      sanitizeYouTubeText(getString(microformat?.description)) ??
      sanitizeYouTubeText(getText(header?.description)) ??
      null,
    imageUrl:
      pickThumbnailUrl(microformat?.thumbnail) ??
      pickThumbnailUrl(
        getObject(header, "thumbnail.musicThumbnailRenderer.thumbnail")
      ) ??
      `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`,
    owner:
      sanitizeYouTubeText(
        getText(getObject(header, "subtitle.runs.0.text")) ??
          getText(getObject(header, "straplineTextOne"))
      ) ?? "YouTube Music",
    title:
      sanitizeYouTubeText(getString(microformat?.title)) ??
      sanitizeYouTubeText(getText(header?.title)) ??
      "YouTube Playlist",
  };
}

function getInitialPlaylistItems(initialData: Record<string, unknown>) {
  const playlistVideoListRenderer = findFirstRenderer(
    initialData,
    "playlistVideoListRenderer"
  ) as Record<string, unknown> | null;
  const contents = playlistVideoListRenderer?.contents;

  return Array.isArray(contents)
    ? (contents.filter(isRecord) as Array<Record<string, unknown>>)
    : [];
}

function getInitialMusicPlaylistItems(initialData: Record<string, unknown>) {
  const musicPlaylistShelfRenderer = findFirstRenderer(
    initialData,
    "musicPlaylistShelfRenderer"
  ) as Record<string, unknown> | null;
  const contents = musicPlaylistShelfRenderer?.contents;

  return Array.isArray(contents)
    ? (contents.filter(isRecord) as Array<Record<string, unknown>>)
    : [];
}

function extractPlaylistSongsFromItems(
  items: Array<Record<string, unknown>>,
  playlistId: string,
  playlistTitle: string
): PlaylistSong[] {
  const songs: PlaylistSong[] = [];

  items.forEach((item, index) => {
    const song =
      mapPlaylistSong(item, playlistId, playlistTitle, index) ??
      mapMusicPlaylistSong(item, playlistId, playlistTitle, index);

    if (song) {
      songs.push(song);
    }
  });

  return songs;
}

function mapPlaylistSong(
  item: Record<string, unknown>,
  playlistId: string,
  playlistTitle: string,
  index: number
) {
  const renderer = item.playlistVideoRenderer;

  if (!isRecord(renderer)) {
    return null;
  }

  const title = sanitizeYouTubeText(getText(renderer.title));
  const videoId = getString(renderer.videoId);

  if (!title || !videoId) {
    return null;
  }

  if (title === "Private video" || title === "Deleted video") {
    return null;
  }

  const artist =
    sanitizeYouTubeText(getText(renderer.shortBylineText)) ?? "Unknown Channel";
  const durationSeconds = Number(renderer.lengthSeconds ?? 0);

  return {
    album: playlistTitle,
    artists: [artist],
    artworkUrl: pickThumbnailUrl(renderer.thumbnail),
    durationMs: Number.isFinite(durationSeconds) ? durationSeconds * 1000 : 0,
    id: getString(renderer.videoId) ?? `${playlistId}-${index}`,
    sourceId: videoId,
    sourceUrl: `https://music.youtube.com/watch?v=${videoId}&list=${playlistId}`,
    title,
  };
}

function mapMusicPlaylistSong(
  item: Record<string, unknown>,
  playlistId: string,
  playlistTitle: string,
  index: number
) {
  const renderer = item.musicResponsiveListItemRenderer;

  if (!isRecord(renderer)) {
    return null;
  }

  const title = sanitizeYouTubeText(
    getText(getMusicColumnText(renderer.flexColumns, 0))
  );
  const videoId =
    getString(getObject(renderer, "playlistItemData.videoId")) ??
    getString(
      getObject(
        renderer,
        "overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId"
      )
    );

  if (!title || !videoId) {
    return null;
  }

  if (title === "Private video" || title === "Deleted video") {
    return null;
  }

  const artists = extractMusicArtists(renderer);
  const durationMs = parseDurationToMs(
    sanitizeYouTubeText(getText(getMusicColumnText(renderer.fixedColumns, 0)))
  );

  return {
    album: playlistTitle,
    artists: artists.length ? artists : ["Unknown Artist"],
    artworkUrl:
      pickThumbnailUrl(
        getObject(renderer, "thumbnail.musicThumbnailRenderer.thumbnail")
      ) ?? pickThumbnailUrl(renderer.thumbnail),
    durationMs,
    id:
      getString(getObject(renderer, "playlistItemData.playlistSetVideoId")) ??
      videoId ??
      `${playlistId}-${index}`,
    sourceId: videoId,
    sourceUrl: `${YOUTUBE_MUSIC_BASE}/watch?v=${videoId}&list=${playlistId}`,
    title,
  };
}

function getPlaylistContinuationToken(source: Record<string, unknown>) {
  const continuations = findAllRenderers(source, "continuationItemRenderer");

  for (const continuation of continuations) {
    if (!isRecord(continuation)) {
      continue;
    }

    const directToken = getString(
      getObject(
        continuation.continuationEndpoint,
        "continuationCommand.token"
      )
    );

    if (directToken) {
      return directToken;
    }

    const commands = getArray(
      getObject(continuation.continuationEndpoint, "commandExecutorCommand.commands")
    );

    for (const command of commands) {
      const wrappedToken = getString(
        getObject(command, "continuationCommand.token")
      );

      if (wrappedToken) {
        return wrappedToken;
      }
    }
  }

  return null;
}

function extractOwnerFromPageHeader(pageHeader: Record<string, unknown> | null) {
  const metadataRows = getArray(
    getObject(
      pageHeader,
      "content.pageHeaderViewModel.metadata.contentMetadataViewModel.metadataRows"
    )
  );

  for (const row of metadataRows) {
    const parts = getArray((row as Record<string, unknown>).metadataParts);

    for (const part of parts) {
      const avatarText = getText((part as Record<string, unknown>).avatarStack);

      if (avatarText) {
        return avatarText.replace(/^by\s+/i, "");
      }
    }
  }

  return null;
}

function findFirstRenderer(
  source: unknown,
  key: string
): Record<string, unknown> | null {
  const matches = findAllRenderers(source, key);

  return matches.length ? matches[0] : null;
}

function findAllRenderers(
  source: unknown,
  key: string,
  matches: Array<Record<string, unknown>> = []
): Array<Record<string, unknown>> {
  if (Array.isArray(source)) {
    for (const item of source) {
      findAllRenderers(item, key, matches);
    }

    return matches;
  }

  if (!isRecord(source)) {
    return matches;
  }

  for (const [entryKey, value] of Object.entries(source)) {
    if (entryKey === key && isRecord(value)) {
      matches.push(value);
    }

    findAllRenderers(value, key, matches);
  }

  return matches;
}

function extractMusicBrowseDataFromHtml(html: string) {
  const pushPattern =
    /initialData\.push\(\{path: '([^']+)', params: JSON\.parse\('((?:[^'\\]|\\.)*)'\), data: '((?:[^'\\]|\\.)*)'\}\);/g;

  for (const match of html.matchAll(pushPattern)) {
    const path = decodeJavaScriptStringLiteral(match[1]);

    if (path !== "/browse") {
      continue;
    }

    const data = decodeJavaScriptStringLiteral(match[3]);
    return JSON.parse(data) as Record<string, unknown>;
  }

  throw new YouTubeApiError(
    "Could not read the YouTube Music playlist page data.",
    502
  );
}

function extractJsonFromHtml<T>(html: string, pattern: RegExp) {
  const match = html.match(pattern);

  if (!match?.[1]) {
    throw new YouTubeApiError(
      "Could not read the YouTube playlist page data.",
      502
    );
  }

  return JSON.parse(match[1]) as T;
}

function extractMatch(html: string, pattern: RegExp, message: string) {
  const match = html.match(pattern);

  if (!match?.[1]) {
    throw new YouTubeApiError(message, 502);
  }

  return match[1];
}

function getDefaultPlaylistMetadata(playlistId: string): PlaylistMetadata {
  return {
    description: null,
    imageUrl: `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`,
    owner: "YouTube Music",
    title: "YouTube Playlist",
  };
}

function mergePlaylistMetadata(
  current: PlaylistMetadata,
  incoming: PlaylistMetadata,
  playlistId: string
) {
  const fallbackImage = `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`;

  return {
    description: current.description ?? incoming.description,
    imageUrl:
      !current.imageUrl || current.imageUrl === fallbackImage
        ? incoming.imageUrl ?? current.imageUrl
        : current.imageUrl,
    owner: current.owner === "YouTube Music" ? incoming.owner : current.owner,
    title: current.title === "YouTube Playlist" ? incoming.title : current.title,
  };
}

function getObject(source: unknown, path: string) {
  const segments = path.split(".");
  let current: unknown = source;

  for (const segment of segments) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function getArray(source: unknown) {
  return Array.isArray(source) ? source : [];
}

function getString(source: unknown) {
  return typeof source === "string" ? source : null;
}

function getText(source: unknown): string | null {
  if (typeof source === "string") {
    return source;
  }

  if (!source) {
    return null;
  }

  const simpleText = getString((source as Record<string, unknown>).simpleText);

  if (simpleText) {
    return simpleText;
  }

  const content = getString(
    getObject(source, "content")
  );

  if (content) {
    return content;
  }

  const runs = getArray((source as Record<string, unknown>).runs);

  if (!runs.length) {
    return null;
  }

  const text = runs
    .map((run) => getString((run as Record<string, unknown>).text) ?? "")
    .join("")
    .trim();

  return text || null;
}

function pickThumbnailUrl(thumbnailSource: unknown) {
  const thumbnails = getArray(
    isRecord(thumbnailSource)
      ? (thumbnailSource as Record<string, unknown>).thumbnails
      : undefined
  );

  for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
    const url = getString((thumbnails[index] as Record<string, unknown>).url);

    if (url) {
      return url;
    }
  }

  const sources = getArray(
    isRecord(thumbnailSource)
      ? (thumbnailSource as Record<string, unknown>).sources
      : undefined
  );

  for (let index = sources.length - 1; index >= 0; index -= 1) {
    const url = getString((sources[index] as Record<string, unknown>).url);

    if (url) {
      return url;
    }
  }

  return null;
}

function getMusicColumnText(columnsSource: unknown, index: number) {
  const columns = getArray(columnsSource);
  const column = columns[index];

  if (!isRecord(column)) {
    return undefined;
  }

  const flexText = getObject(column, "musicResponsiveListItemFlexColumnRenderer.text");

  if (flexText) {
    return flexText;
  }

  return getObject(column, "musicResponsiveListItemFixedColumnRenderer.text");
}

function extractMusicArtists(renderer: Record<string, unknown>) {
  const artistColumn = getArray(renderer.flexColumns)[1];

  if (!isRecord(artistColumn)) {
    return [];
  }

  const runs = getArray(
    getObject(artistColumn, "musicResponsiveListItemFlexColumnRenderer.text.runs")
  );
  const artists = runs
    .map((run) => {
      if (!isRecord(run)) {
        return null;
      }

      const pageType = getString(
        getObject(
          run,
          "navigationEndpoint.browseEndpoint.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType"
        )
      );

      if (pageType !== "MUSIC_PAGE_TYPE_ARTIST") {
        return null;
      }

      return sanitizeYouTubeText(getString(run.text));
    })
    .filter((value): value is string => Boolean(value));

  if (artists.length) {
    return artists;
  }

  const fallbackArtists = sanitizeYouTubeText(
    getText(getObject(artistColumn, "musicResponsiveListItemFlexColumnRenderer.text"))
  );

  return fallbackArtists ? [fallbackArtists] : [];
}

function parseDurationToMs(value: string | null) {
  if (!value) {
    return 0;
  }

  const parts = value
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

  if (!parts.length) {
    return 0;
  }

  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds * 1000;
}

function decodeJavaScriptStringLiteral(source: string) {
  return source.replace(
    /\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|["'\\/bfnrt])/g,
    (_match, token: string) => {
      if (token.startsWith("u")) {
        return String.fromCharCode(Number.parseInt(token.slice(1), 16));
      }

      if (token.startsWith("x")) {
        return String.fromCharCode(Number.parseInt(token.slice(1), 16));
      }

      switch (token) {
        case "b":
          return "\b";
        case "f":
          return "\f";
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "/":
          return "/";
        case "\\":
          return "\\";
        case '"':
          return '"';
        case "'":
          return "'";
        default:
          return token;
      }
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
