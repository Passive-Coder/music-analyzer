import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseSyncedLyrics, type TrackLyrics } from "@/lib/lyrics";

type LrcLibResponse = {
  albumName?: string;
  artistName?: string;
  duration?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  trackName?: string;
};

const LRCLIB_BASE_URL = "https://lrclib.net/api";
const execFileAsync = promisify(execFile);
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || "python";
const LYRICS_CACHE_TTL_MS = 30 * 60 * 1_000;
const lyricsCache = new Map<string, { expiresAt: number; payload: unknown }>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const artist = searchParams.get("artist")?.trim() ?? "";
  const album = searchParams.get("album")?.trim() ?? "";
  const durationMs = Number(searchParams.get("durationMs") ?? "0");
  const videoId = searchParams.get("videoId")?.trim() ?? "";

  if (!title || !artist) {
    return Response.json(
      { lyrics: null, plainLyrics: null, syncedLyrics: null, status: "missing-query" },
      { status: 400 }
    );
  }

  const duration = Number.isFinite(durationMs) && durationMs > 0
    ? Math.max(1, Math.round(durationMs / 1000))
    : undefined;
  const cacheKey = JSON.stringify({
    album,
    artist,
    durationMs,
    title,
    videoId,
  });
  const cached = lyricsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload);
  }

  try {
    const ytmusicPromise = getYouTubeMusicLyrics({
      album,
      artist,
      durationMs,
      title,
      videoId,
    }).catch(() => null);
    const lrclibPromise = getLyricsMatch({
      album,
      artist,
      duration,
      title,
    });
    const bestMatch = await lrclibPromise;

    if (!videoId && bestMatch?.syncedLyrics) {
      const payload = {
        lyrics: parseSyncedLyrics(bestMatch.syncedLyrics),
        plainLyrics: bestMatch.plainLyrics ?? null,
        provider: "lrclib",
        syncedLyrics: bestMatch.syncedLyrics,
        status: "ok",
      };
      rememberLyrics(cacheKey, payload);
      return Response.json(payload);
    }

    const ytmusicResult = await withTimeout(videoId ? 14_000 : 26_000, ytmusicPromise);

    if (ytmusicResult?.trackLyrics?.lines.length) {
      const payload = {
        lyrics: ytmusicResult.trackLyrics,
        plainLyrics: ytmusicResult.plainLyrics ?? null,
        provider: "ytmusicapi",
        source: ytmusicResult.source ?? null,
        syncedLyrics: null,
        status: "ok",
      };
      rememberLyrics(cacheKey, payload);
      return Response.json(payload);
    }

    if (bestMatch?.syncedLyrics) {
      const payload = {
        lyrics: parseSyncedLyrics(bestMatch.syncedLyrics),
        plainLyrics: bestMatch.plainLyrics ?? null,
        provider: "lrclib",
        syncedLyrics: bestMatch.syncedLyrics,
        status: "ok",
      };
      rememberLyrics(cacheKey, payload);
      return Response.json(payload);
    }

    if (ytmusicResult?.plainLyrics) {
      const payload = {
        lyrics: null,
        plainLyrics: ytmusicResult.plainLyrics,
        provider: "ytmusicapi",
        source: ytmusicResult.source ?? null,
        syncedLyrics: null,
        status: "not-found",
      };
      rememberLyrics(cacheKey, payload);
      return Response.json(payload);
    }

    const payload = {
      lyrics: null,
      plainLyrics: bestMatch?.plainLyrics ?? null,
      syncedLyrics: null,
      status: "not-found",
    };
    rememberLyrics(cacheKey, payload);
    return Response.json(payload);
  } catch {
    return Response.json(
      { lyrics: null, plainLyrics: null, syncedLyrics: null, status: "error" },
      { status: 502 }
    );
  }
}

async function getYouTubeMusicLyrics({
  album,
  artist,
  durationMs,
  title,
  videoId,
}: {
  album: string;
  artist: string;
  durationMs: number;
  title: string;
  videoId: string;
}) {
  const scriptPath = process.cwd() + "\\scripts\\ytmusic_lyrics.py";
  const { stdout } = await execFileAsync(
    PYTHON_EXECUTABLE,
    [
      scriptPath,
      title,
      artist,
      album,
      String(durationMs),
      videoId,
    ],
    {
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
      timeout: 30_000,
      windowsHide: true,
    }
  );

  return JSON.parse(stdout.trim() || "{}") as {
    plainLyrics?: string | null;
    provider?: string;
    source?: string | null;
    status?: string;
    trackLyrics?: TrackLyrics | null;
  };
}

async function withTimeout<T>(timeoutMs: number, promise: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await Promise.race<T | null>([
    promise,
    new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(null);
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function rememberLyrics(cacheKey: string, payload: unknown) {
  lyricsCache.set(cacheKey, {
    expiresAt: Date.now() + LYRICS_CACHE_TTL_MS,
    payload,
  });
}

async function getLyricsMatch({
  album,
  artist,
  duration,
  title,
}: {
  album: string;
  artist: string;
  duration?: number;
  title: string;
}) {
  const exact = await fetchLrcLibRecord("get", {
    album_name: album || undefined,
    artist_name: artist,
    duration: duration ? String(duration) : undefined,
    track_name: title,
  });

  if (exact?.syncedLyrics) {
    return exact;
  }

  const search = await fetchLrcLibRecordArray("search", {
    artist_name: artist,
    q: `${title} ${artist}`.trim(),
    track_name: title,
  });

  return search
    .filter((entry) => entry.syncedLyrics)
    .sort((left, right) =>
      scoreLyricsMatch(right, { album, artist, duration, title }) -
      scoreLyricsMatch(left, { album, artist, duration, title })
    )[0] ?? exact ?? null;
}

async function fetchLrcLibRecord(
  endpoint: "get",
  params: Record<string, string | undefined>
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 6_000);

  try {
    const response = await fetch(buildUrl(endpoint, params), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LrcLibResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLrcLibRecordArray(
  endpoint: "search",
  params: Record<string, string | undefined>
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 6_000);

  try {
    const response = await fetch(buildUrl(endpoint, params), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as LrcLibResponse[];
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildUrl(endpoint: "get" | "search", params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  return `${LRCLIB_BASE_URL}/${endpoint}?${searchParams.toString()}`;
}

function scoreLyricsMatch(
  entry: LrcLibResponse,
  target: {
    album: string;
    artist: string;
    duration?: number;
    title: string;
  }
) {
  let score = 0;

  const normalizedTitle = normalizeValue(entry.trackName);
  const targetTitle = normalizeValue(target.title);
  const normalizedArtist = normalizeValue(entry.artistName);
  const targetArtist = normalizeValue(target.artist);
  const normalizedAlbum = normalizeValue(entry.albumName);
  const targetAlbum = normalizeValue(target.album);

  if (normalizedTitle === targetTitle) {
    score += 8;
  } else if (normalizedTitle.includes(targetTitle) || targetTitle.includes(normalizedTitle)) {
    score += 4;
  }

  if (normalizedArtist === targetArtist) {
    score += 8;
  } else if (normalizedArtist.includes(targetArtist) || targetArtist.includes(normalizedArtist)) {
    score += 4;
  }

  if (targetAlbum && normalizedAlbum === targetAlbum) {
    score += 2;
  }

  if (target.duration && entry.duration) {
    const diff = Math.abs(entry.duration - target.duration);
    score += Math.max(0, 4 - Math.min(diff, 4));
  }

  return score;
}

function normalizeValue(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
