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

  try {
    try {
      const ytmusicResult = await getYouTubeMusicLyrics({
        album,
        artist,
        durationMs,
        title,
        videoId,
      });

      if (ytmusicResult.trackLyrics?.lines.length) {
        return Response.json({
          lyrics: ytmusicResult.trackLyrics,
          plainLyrics: ytmusicResult.plainLyrics ?? null,
          provider: "ytmusicapi",
          source: ytmusicResult.source ?? null,
          syncedLyrics: null,
          status: "ok",
        });
      }
    } catch {
      // Fall back to LRCLIB when the unofficial YouTube Music path fails.
    }

    const bestMatch = await getLyricsMatch({
      album,
      artist,
      duration,
      title,
    });

    if (!bestMatch?.syncedLyrics) {
      return Response.json({
        lyrics: null,
        plainLyrics: bestMatch?.plainLyrics ?? null,
        syncedLyrics: null,
        status: "not-found",
      });
    }

    return Response.json({
      lyrics: parseSyncedLyrics(bestMatch.syncedLyrics),
      plainLyrics: bestMatch.plainLyrics ?? null,
      provider: "lrclib",
      syncedLyrics: bestMatch.syncedLyrics,
      status: "ok",
    });
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
