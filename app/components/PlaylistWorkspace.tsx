"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
};

type RequestState = "idle" | "loading" | "publishing";
type SongEntry = {
  index: number;
  song: PlaylistSong;
};

const EXAMPLE_PLAYLIST: PlaylistData = {
  description: "Fallback data shown when the YouTube playlist request fails.",
  id: "example-fallback-playlist",
  imageUrl: null,
  owner: "Octave Demo",
  songs: [
    createExampleSong(
      "example-song-01",
      "Velvet Echo",
      ["Nocturne Lane"],
      "Afterglow District",
      201000
    ),
    createExampleSong(
      "example-song-02",
      "Silver Skyline",
      ["Ari Vale", "Moon Static"],
      "City Signals",
      228000
    ),
    createExampleSong(
      "example-song-03",
      "Sundown Circuit",
      ["Kairo Bloom"],
      "Night Transit",
      194000
    ),
    createExampleSong(
      "example-song-04",
      "Lunar Frequency",
      ["Nova Thread"],
      "Orbit Hearts",
      247000
    ),
    createExampleSong(
      "example-song-05",
      "Glass Horizon",
      ["Mira Coast"],
      "Skyline Bloom",
      213000
    ),
    createExampleSong(
      "example-song-06",
      "Static Kisses",
      ["The Violet Run"],
      "Circuit Romance",
      189000
    ),
    createExampleSong(
      "example-song-07",
      "Parallel Lights",
      ["Echo Harbor", "Sael"],
      "Neon Tides",
      236000
    ),
    createExampleSong(
      "example-song-08",
      "Diamond Pulse",
      ["Luma Park"],
      "Midnight Chrome",
      205000
    ),
    createExampleSong(
      "example-song-09",
      "Afterimage",
      ["Rhea North"],
      "Satellite Diary",
      221000
    ),
    createExampleSong(
      "example-song-10",
      "Prism Avenue",
      ["Atlas June"],
      "Soft Voltage",
      232000
    ),
  ],
  sourceUrl: "https://www.youtube.com/",
  title: "Example Playlist",
};

export function PlaylistWorkspace({
  isVisible = false,
}: PlaylistWorkspaceProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [batchSongs, setBatchSongs] = useState<PlaylistSong[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTargetIndex, setEditingTargetIndex] = useState<number | null>(
    null
  );
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);

  const hasSongs = songs.length > 0;
  const hasBatchSongs = batchSongs.length > 0;
  const allSongEntries = songs.map((song, index) => ({ index, song }));
  const allBatchEntries = batchSongs.map((song, index) => ({ index, song }));
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSongEntries = allSongEntries
    .filter(({ song }) => {
      if (!normalizedSearchQuery) {
        return true;
      }

      const haystack = `${song.title} ${song.artists.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  const songBatches = chunkSongEntries(allBatchEntries, 5);
  const activeBatch = songBatches[activeBatchIndex] ?? null;
  const editingTargetSong =
    editingTargetIndex !== null ? batchSongs[editingTargetIndex] ?? null : null;
  const editingTargetLabel =
    editingTargetIndex !== null
      ? String(editingTargetIndex + 1).padStart(2, "0")
      : null;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!songBatches.length) {
      if (activeBatchIndex !== 0) {
        setActiveBatchIndex(0);
      }
      return;
    }

    const maxBatchIndex = songBatches.length - 1;

    if (activeBatchIndex > maxBatchIndex) {
      setActiveBatchIndex(maxBatchIndex);
    }
  }, [activeBatchIndex, songBatches.length]);

  if (!hasMounted) {
    return null;
  }

  const handleLoadPlaylist = async () => {
    setRequestState("loading");
    setError(null);
    setPublishedCode(null);

    try {
      const response = await fetch("/api/youtube/playlist", {
        body: JSON.stringify({ playlistUrl }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        playlist?: PlaylistData;
      };

      if (!response.ok || !payload.playlist) {
        throw new Error(payload.error ?? "Playlist loading failed.");
      }

      setPlaylist(payload.playlist);
      setSongs(payload.playlist.songs);
      setBatchSongs(payload.playlist.songs);
      setSearchQuery("");
      setEditingTargetIndex(null);
      setActiveBatchIndex(0);
    } catch (loadError) {
      const fallbackPlaylist = EXAMPLE_PLAYLIST;
      const fallbackMessage =
        loadError instanceof Error
          ? `${loadError.message} Showing example playlist data instead.`
          : "Playlist loading failed. Showing example playlist data instead.";

      setPlaylist(fallbackPlaylist);
      setSongs(fallbackPlaylist.songs);
      setBatchSongs(fallbackPlaylist.songs);
      setSearchQuery("");
      setEditingTargetIndex(null);
      setActiveBatchIndex(0);
      setError(fallbackMessage);
    } finally {
      setRequestState("idle");
    }
  };

  const handlePublishPlaylist = async () => {
    if (!playlist || !batchSongs.length) {
      return;
    }

    setRequestState("publishing");
    setError(null);

    try {
      const response = await fetch("/api/publish-playlist", {
        body: JSON.stringify({
          playlist,
          songs: batchSongs,
          sourceUrl: playlistUrl || playlist.sourceUrl,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const payload = (await response.json()) as {
        code?: string;
        error?: string;
      };

      if (!response.ok || !payload.code) {
        throw new Error(payload.error ?? "Publishing the playlist failed.");
      }

      setPublishedCode(payload.code);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Publishing the playlist failed."
      );
    } finally {
      setRequestState("idle");
    }
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    setPublishedCode(null);
    setSongs((currentSongs) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentSongs.length) {
        return currentSongs;
      }

      const nextSongs = [...currentSongs];
      const [song] = nextSongs.splice(index, 1);
      nextSongs.splice(nextIndex, 0, song);

      return nextSongs;
    });
  };

  const shuffleSongs = () => {
    setPublishedCode(null);
    setSongs((currentSongs) => {
      const nextSongs = [...currentSongs];

      for (let index = nextSongs.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [nextSongs[index], nextSongs[swapIndex]] = [
          nextSongs[swapIndex],
          nextSongs[index],
        ];
      }

      return nextSongs;
    });
  };

  const createBatchesFromOrderedSongs = () => {
    if (!songs.length) {
      return;
    }

    setPublishedCode(null);
    setEditingTargetIndex(null);
    setActiveBatchIndex(0);
    setBatchSongs([...songs]);
  };

  const selectReplacementSong = (sourceIndex: number) => {
    if (editingTargetIndex === null) {
      return;
    }

    setPublishedCode(null);
    const sourceSong = songs[sourceIndex];

    if (!sourceSong) {
      return;
    }

    setBatchSongs((currentSongs) => {
      if (
        editingTargetIndex < 0 ||
        editingTargetIndex >= currentSongs.length
      ) {
        return currentSongs;
      }

      const nextSongs = [...currentSongs];
      nextSongs[editingTargetIndex] = sourceSong;

      return nextSongs;
    });
    setEditingTargetIndex(null);
  };

  return (
    <section
      className={`playlist-workspace${isVisible ? " is-visible" : " is-hidden"}`}
      aria-hidden={!isVisible}
    >
      <div className="playlist-workspace__layout">
        <div className="playlist-workspace__panel">
          <div className="playlist-workspace__loader">
            <label className="playlist-workspace__field">
              <span className="playlist-workspace__label">
                YouTube Playlist Link
              </span>
              <input
                className="playlist-workspace__input"
                type="url"
                value={playlistUrl}
                onChange={(event) => setPlaylistUrl(event.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..."
              />
            </label>
            <button
              type="button"
              className="playlist-workspace__primary"
              onClick={handleLoadPlaylist}
              disabled={requestState !== "idle"}
            >
              {requestState === "loading" ? "Loading..." : "Load Playlist"}
            </button>
          </div>

          {error ? <p className="playlist-workspace__error">{error}</p> : null}

          <div className="playlist-workspace__batch-pane">
            <div className="playlist-workspace__songs-header">
              <div>
                <p className="playlist-workspace__songs-eyebrow">Batches</p>
                <h3 className="playlist-workspace__songs-title playlist-workspace__songs-title--compact">
                  Ordered Groups Of 5
                </h3>
              </div>
              <div className="playlist-workspace__batch-nav">
                <p className="playlist-workspace__songs-count">
                  {hasBatchSongs
                    ? `Batch ${activeBatchIndex + 1} of ${songBatches.length}`
                    : "0 batches"}
                </p>
                <div className="playlist-workspace__batch-buttons">
                  <button
                    type="button"
                    className="playlist-song-card__button"
                    onClick={() =>
                      setActiveBatchIndex((currentIndex) =>
                        Math.max(currentIndex - 1, 0)
                      )
                    }
                    disabled={!hasBatchSongs || activeBatchIndex === 0}
                    aria-label="Previous batch"
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    className="playlist-song-card__button"
                    onClick={() =>
                      setActiveBatchIndex((currentIndex) =>
                        Math.min(currentIndex + 1, songBatches.length - 1)
                      )
                    }
                    disabled={
                      !hasBatchSongs ||
                      activeBatchIndex === songBatches.length - 1
                    }
                    aria-label="Next batch"
                  >
                    &gt;
                  </button>
                </div>
              </div>
            </div>

            <div className="playlist-workspace__batch-scroll">
              {hasBatchSongs && activeBatch ? (
                <section className="playlist-batch">
                  <div className="playlist-batch__header">
                    <p className="playlist-batch__label">
                      Batch {activeBatchIndex + 1}
                    </p>
                    <p className="playlist-batch__range">
                      {String(activeBatch[0].index + 1).padStart(2, "0")}-
                      {String(
                        activeBatch[activeBatch.length - 1].index + 1
                      ).padStart(2, "0")}
                    </p>
                  </div>

                  <div className="playlist-batch__list">
                    {activeBatch.map(({ song, index }) => {
                      const isEditingTarget = editingTargetIndex === index;

                      return (
                        <article
                          key={`${song.id}-${index}`}
                          className={`playlist-song-card${
                            isEditingTarget ? " is-editing" : ""
                          }`}
                        >
                              <div className="playlist-song-card__order">
                                {String(index + 1).padStart(2, "0")}
                              </div>
                              <div className="playlist-song-card__body">
                                <h4 className="playlist-song-card__title">
                                  <MarqueeText text={song.title} />
                                </h4>
                                <p className="playlist-song-card__meta">
                                  <MarqueeText
                                    text={`${song.artists.join(", ")} · ${song.album}`}
                                  />
                                </p>
                              </div>
                          <div className="playlist-song-card__side">
                            <div className="playlist-song-card__duration">
                              {formatDuration(song.durationMs)}
                            </div>
                            <div className="playlist-song-card__controls">
                              <a
                                className="playlist-song-card__play-link"
                                href={getSongPlaybackUrl(song)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Play ${song.title} on YouTube`}
                              >
                                ▶
                              </a>
                              <button
                                type="button"
                                className={`playlist-song-card__button playlist-song-card__button--wide${
                                  isEditingTarget
                                    ? " playlist-song-card__button--active"
                                    : ""
                                }`}
                                onClick={() => setEditingTargetIndex(index)}
                              >
                                {isEditingTarget ? "Editing" : "Edit"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="playlist-workspace__empty playlist-workspace__empty--songs">
                  <p className="playlist-workspace__empty-title">
                    Batches will appear here.
                  </p>
                  <p className="playlist-workspace__empty-copy">
                    Load a playlist, reorder the full song list, and create
                    batches from that order when you are ready.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="playlist-workspace__songs-pane">
          <div className="playlist-workspace__header playlist-workspace__header--meta">
            <div className="playlist-workspace__brand">
              <div className="playlist-workspace__brand-copy">
                <p className="playlist-workspace__eyebrow">YouTube</p>
                <div className="playlist-workspace__brand-row">
                  <YouTubeGlyph />
                  <h2 className="playlist-workspace__title">Playlist</h2>
                </div>
              </div>
            </div>
            <p className="playlist-workspace__copy">
              Paste a YouTube playlist link, reorder the songs, edit any slot,
              shuffle the stack, and publish a backend code for the current
              sequence.
            </p>
          </div>

          {playlist ? (
            <div className="playlist-workspace__meta">
              <div>
                <p className="playlist-workspace__meta-label">
                  Loaded Playlist
                </p>
                <h3 className="playlist-workspace__meta-title">
                  {playlist.title}
                </h3>
                <p className="playlist-workspace__meta-subtitle">
                  {playlist.owner} · {songs.length} songs
                </p>
              </div>
              <a
                className="playlist-workspace__meta-link"
                href={playlist.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open On YouTube
              </a>
            </div>
          ) : (
            <div className="playlist-workspace__empty">
              <p className="playlist-workspace__empty-title">
                No playlist loaded yet.
              </p>
              <p className="playlist-workspace__empty-copy">
                The loader uses the YouTube Data API. If the request is
                rejected, configure `YOUTUBE_API_KEY` on the server.
              </p>
            </div>
          )}

          <div className="playlist-workspace__songs-header">
            <div>
              <p className="playlist-workspace__songs-eyebrow">Songs</p>
              <h3 className="playlist-workspace__songs-title">
                Full Song List
              </h3>
            </div>
            <div className="playlist-workspace__songs-side">
              <button
                type="button"
                className="playlist-workspace__secondary"
                onClick={shuffleSongs}
                disabled={!hasSongs}
              >
                Random Shuffle
              </button>
              <p className="playlist-workspace__songs-count">
                {hasSongs
                  ? `${filteredSongEntries.length} of ${songs.length} shown`
                  : "0 songs"}
              </p>
              {publishedCode ? (
                <p className="playlist-workspace__code playlist-workspace__code--align-end">
                  Backend code: <span>{publishedCode}</span>
                </p>
              ) : null}
            </div>
          </div>

          {editingTargetSong ? (
            <div className="playlist-workspace__edit-banner">
              <div>
                <p className="playlist-workspace__edit-label">Edit Active</p>
                <p className="playlist-workspace__edit-copy">
                  Pick a song below to replace {editingTargetLabel}{" "}
                  {editingTargetSong.title}.
                </p>
              </div>
              <button
                type="button"
                className="playlist-workspace__banner-button"
                onClick={() => setEditingTargetIndex(null)}
              >
                Cancel
              </button>
            </div>
          ) : null}

          <div className="playlist-workspace__search-row">
            <label className="playlist-workspace__field playlist-workspace__field--search">
              <span className="playlist-workspace__label">Search Songs</span>
              <input
                className="playlist-workspace__input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by title or artist"
                disabled={!hasSongs}
              />
            </label>
            <button
              type="button"
              className="playlist-workspace__secondary playlist-workspace__search-action"
              onClick={createBatchesFromOrderedSongs}
              disabled={!hasSongs}
            >
              Create Batches
            </button>
          </div>

          <div className="playlist-workspace__songs-scroll">
            {hasSongs ? (
              filteredSongEntries.length ? (
                <div className="playlist-workspace__library-list">
                  {filteredSongEntries.map(({ song, index }) => {
                    const canSelectReplacement = editingTargetIndex !== null;

                    return (
                      <article
                        key={`${song.id}-${index}`}
                        className={`playlist-song-card playlist-song-card--library${
                          canSelectReplacement ? " is-selectable" : ""
                        }`}
                      >
                        <div className="playlist-song-card__order">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="playlist-song-card__body">
                          <h4 className="playlist-song-card__title">
                            <MarqueeText text={song.title} />
                          </h4>
                          <p className="playlist-song-card__meta">
                            <MarqueeText
                              text={`${song.artists.join(", ")} · ${song.album}`}
                            />
                          </p>
                        </div>
                        <div className="playlist-song-card__side">
                          <div className="playlist-song-card__duration">
                            {formatDuration(song.durationMs)}
                          </div>
                          <div className="playlist-song-card__controls">
                            <a
                              className="playlist-song-card__play-link"
                              href={getSongPlaybackUrl(song)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Play ${song.title} on YouTube`}
                            >
                              ▶
                            </a>
                            <button
                              type="button"
                              className="playlist-song-card__button"
                              onClick={() => moveSong(index, -1)}
                              disabled={index === 0}
                              aria-label={`Move ${song.title} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="playlist-song-card__button"
                              onClick={() => moveSong(index, 1)}
                              disabled={index === songs.length - 1}
                              aria-label={`Move ${song.title} down`}
                            >
                              ↓
                            </button>
                            {editingTargetIndex !== null ? (
                              <button
                                type="button"
                                className="playlist-song-card__button playlist-song-card__button--wide playlist-song-card__button--select"
                                onClick={() => selectReplacementSong(index)}
                              >
                                Select
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="playlist-workspace__empty playlist-workspace__empty--songs">
                  <p className="playlist-workspace__empty-title">
                    No songs match that search.
                  </p>
                  <p className="playlist-workspace__empty-copy">
                    Try a different title or artist to bring songs back into the
                    list.
                  </p>
                </div>
              )
            ) : (
              <div className="playlist-workspace__empty playlist-workspace__empty--songs">
                <p className="playlist-workspace__empty-title">
                  Songs will appear here.
                </p>
                <p className="playlist-workspace__empty-copy">
                  Load a playlist to review the full ordered list, create
                  batches of 5, and edit any batch slot by selecting another
                  song from the same playlist.
                </p>
              </div>
            )}
          </div>
        </aside>
        </div>

      <div className="playlist-workspace__publish">
        <button
          type="button"
          className="playlist-workspace__publish-button"
          onClick={handlePublishPlaylist}
          disabled={!hasBatchSongs || requestState === "publishing"}
        >
          {requestState === "publishing" ? "Publishing..." : "Publish Playlist"}
        </button>
      </div>
    </section>
  );
}

function YouTubeGlyph() {
  return (
    <div className="youtube-glyph" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="30" fill="#FF1400" />
        <circle
          cx="32"
          cy="32"
          r="16.8"
          stroke="#FFFFFF"
          strokeWidth="2"
          fill="none"
        />
        <path d="M25.8 23.9L40.8 32L25.8 40.1V23.9Z" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getSongPlaybackUrl(song: PlaylistSong) {
  if (song.sourceUrl) {
    return song.sourceUrl;
  }

  const searchQuery = encodeURIComponent(`${song.title} ${song.artists.join(" ")}`);
  return `https://www.youtube.com/results?search_query=${searchQuery}`;
}

function chunkSongEntries(entries: SongEntry[], chunkSize: number) {
  const batches: SongEntry[][] = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    batches.push(entries.slice(index, index + chunkSize));
  }

  return batches;
}

function MarqueeText({ text }: { text: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowState, setOverflowState] = useState({
    duration: 0,
    gap: 0,
    isOverflowing: false,
    travel: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    const textNode = textRef.current;

    if (!container || !textNode) {
      return undefined;
    }

    let frameId = 0;
    let isCancelled = false;

    const measure = () => {
      const containerWidth = container.clientWidth;
      const textWidth = textNode.getBoundingClientRect().width;

      if (!containerWidth || !textWidth) {
        return;
      }

      const nextIsOverflowing = textWidth > containerWidth + 1;
      const nextGap = Math.max(Math.round(containerWidth * 0.18), 40);
      const nextTravel = textWidth + nextGap;
      const nextDuration = Math.max(nextTravel / 42, 8);

      setOverflowState((currentState) => {
        if (!nextIsOverflowing) {
          if (!currentState.isOverflowing) {
            return currentState;
          }

          return {
            duration: 0,
            gap: 0,
            isOverflowing: false,
            travel: 0,
          };
        }

        if (
          currentState.isOverflowing &&
          Math.abs(currentState.gap - nextGap) < 1 &&
          Math.abs(currentState.travel - nextTravel) < 1 &&
          Math.abs(currentState.duration - nextDuration) < 0.1
        ) {
          return currentState;
        }

        return {
          duration: nextDuration,
          gap: nextGap,
          isOverflowing: true,
          travel: nextTravel,
        };
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    const initialize = async () => {
      if ("fonts" in document) {
        await document.fonts.ready;
      }

      if (isCancelled) {
        return;
      }

      scheduleMeasure();
    };

    void initialize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;

    resizeObserver?.observe(container);
    resizeObserver?.observe(textNode);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [text]);

  const marqueeStyle = overflowState.isOverflowing
    ? ({
        "--marquee-duration": `${overflowState.duration}s`,
        "--marquee-gap": `${overflowState.gap}px`,
        "--marquee-travel": `${overflowState.travel}px`,
      } as CSSProperties)
    : undefined;

  return (
    <span
      ref={containerRef}
      className={`marquee-text${overflowState.isOverflowing ? " is-overflowing" : ""}`}
      style={marqueeStyle}
    >
      <span className="marquee-text__track">
        <span ref={textRef} className="marquee-text__copy">
          {text}
        </span>
        {overflowState.isOverflowing ? (
          <>
            <span className="marquee-text__gap" aria-hidden="true" />
            <span className="marquee-text__copy" aria-hidden="true">
              {text}
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}

function createExampleSong(
  id: string,
  title: string,
  artists: string[],
  album: string,
  durationMs: number
): PlaylistSong {
  return {
    album,
    artists,
    artworkUrl: null,
    durationMs,
    id,
    sourceId: null,
    sourceUrl: null,
    title,
  };
}
