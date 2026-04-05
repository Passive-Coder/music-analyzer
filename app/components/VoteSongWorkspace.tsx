/* eslint-disable @next/next/no-img-element */
"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  useRef,
  type MutableRefObject,
} from "react";

import {
  getActivePlaylistViewerSelectionAction,
  syncActivePlaylistPlaybackAction,
  voteForActivePlaylistSongAction,
} from "@/app/actions/activePlaylist";
import { MusicVisualizerSphere } from "@/app/components/MusicVisualizerSphere";
import { SubwooferScene } from "@/app/components/SubwooferScene";
import { VoteSongBeatParticles } from "@/app/components/VoteSongBeatParticles";
import { VoteSongLyricsPanel } from "@/app/components/VoteSongLyricsPanel";
import type { TrackLyrics } from "@/lib/lyrics";
import {
  createPlaybackClockSample,
  type PlaybackClockSample,
} from "@/lib/playback-sync";
import type {
  ActivePlaylistSongVote,
  ActivePlaylistState,
  PlaylistSong,
  PreviousPlaylistResults,
} from "@/lib/playlist-types";
import { getConvexBrowserClient } from "@/lib/convex-browser-client";
import { api } from "@/convex/_generated/api";

type VoteSongWorkspaceProps = {
  defaultCode?: string | null;
  isVisible?: boolean;
  onVolumeChange?: (volume: number) => void;
  volumeLevel?: number;
};

type JoinState = "idle" | "joining";
type VoteMutationState = "idle" | "voting";
type TimelineSongEntry = {
  song: PlaylistSong;
  variant: "played" | "pending";
};
const WHITE_PIANO_KEYS = ["C", "D", "E", "F", "G"] as const;
const BLACK_PIANO_KEYS = [
  { afterIndex: 0, label: "C#" },
  { afterIndex: 1, label: "D#" },
  { afterIndex: 3, label: "F#" },
] as const;
type PreviousResultSnapshot = {
  batch: PlaylistSong[];
  code: string | null;
  endedMessage: string;
  songList: ActivePlaylistSongVote[];
  topSongIds: string[];
};

export function VoteSongWorkspace({
  defaultCode = null,
  isVisible = false,
  onVolumeChange,
  volumeLevel = 72,
}: VoteSongWorkspaceProps) {
  const [isCompactVoteLayout, setIsCompactVoteLayout] = useState(false);
  const [isPhoneVoteLayout, setIsPhoneVoteLayout] = useState(false);
  const [isMobileCurrentSongVisible, setIsMobileCurrentSongVisible] = useState(false);
  const convexClient = useMemo(() => getConvexBrowserClient(), []);
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [voteState, setVoteState] = useState<VoteMutationState>("idle");
  const [playlistCodeInput, setPlaylistCodeInput] = useState(defaultCode ?? "");
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<ActivePlaylistState | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedTimelineSongId, setSelectedTimelineSongId] = useState<string | null>(
    null
  );
  const [timelineEdgeFade, setTimelineEdgeFade] = useState({
    left: false,
    right: false,
  });
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previousResult, setPreviousResult] =
    useState<PreviousResultSnapshot | null>(null);
  const [localPreviousResults, setLocalPreviousResults] =
    useState<PreviousPlaylistResults | null>(null);
  const [pressedKeyId, setPressedKeyId] = useState<string | null>(null);
  const [pressedBlackKeyId, setPressedBlackKeyId] = useState<string | null>(null);
  const [resultsViewStage, setResultsViewStage] = useState<
    "hidden" | "entering" | "visible" | "exiting"
  >("hidden");
  const lastSelectionKeyRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const resultsViewTimeoutRef = useRef<number | null>(null);
  const currentSong = activeState?.currentSong ?? null;
  const currentSongId = currentSong?.id ?? null;
  const currentSongTitle = currentSong?.title ?? "";
  const currentSongArtist = currentSong?.artists[0] ?? "";
  const currentSongAlbum = currentSong?.album ?? "";
  const currentSongDurationMs = currentSong?.durationMs ?? 0;
  const [lyricsData, setLyricsData] = useState<{
    plainLyrics: string | null;
    songId: string | null;
    status: "idle" | "loading" | "ready" | "missing" | "error";
    track: TrackLyrics | null;
  }>({
    plainLyrics: null,
    songId: null,
    status: "idle",
    track: null,
  });
  const activeTopSongIds = useMemo(
    () => getTopSongIds(activeState?.songList ?? []),
    [activeState?.songList]
  );
  const previousActiveBatchRef = useRef<{
    batch: PlaylistSong[];
    batchIndex: number;
    code: string | null;
    songList: ActivePlaylistSongVote[];
  } | null>(null);
  const livePlaybackRef = useRef<PlaybackClockSample>(
    createPlaybackClockSample(null, null)
  );
  const activeLyrics =
    currentSong && lyricsData.songId === currentSong.id ? lyricsData.track : null;
  const activePlainLyrics =
    currentSong && lyricsData.songId === currentSong.id ? lyricsData.plainLyrics : null;
  const activeLyricsStatus = !currentSong
    ? "idle"
    : lyricsData.songId === currentSong.id
      ? lyricsData.status
      : "loading";
  const timelineSongs = useMemo<TimelineSongEntry[]>(() => {
    if (!activeState) {
      return [];
    }

    const currentTimelineSong =
      activeState.currentSong ??
      activeState.currentBatch.find((song) => song.id === activeState.currentSongId) ??
      null;

    return [
      ...activeState.playedSongs.map((song) => ({
        song,
        variant: "played" as const,
      })),
      ...(currentTimelineSong
        ? [
            {
              song: currentTimelineSong,
              variant: "pending" as const,
            },
          ]
        : []),
    ];
  }, [activeState]);
  const selectedTimelineSong =
    timelineSongs.find((entry) => entry.song.id === selectedTimelineSongId)?.song ??
    null;
  const hasJoinedRoom = activeCode !== null && activeState !== null;
  const hasEndedSession = previousResult !== null && !hasJoinedRoom;
  const isResultsVisible = resultsViewStage !== "hidden";
  const isPhoneCurrentSongVisible =
    isPhoneVoteLayout && hasJoinedRoom && !isResultsVisible && isMobileCurrentSongVisible;
  const handleSessionEnded = useCallback(
    (message: string) => {
      if (activeState?.currentBatch.length) {
        setPreviousResult({
          batch: activeState.currentBatch,
          code: activeCode,
          endedMessage: message,
          songList: activeState.songList,
          topSongIds: getTopSongIds(activeState.songList),
        });
      }
      setResultsViewStage("hidden");
      setActiveCode(null);
      setActiveState(null);
      setSelectedSongId(null);
      setSelectedTimelineSongId(null);
      setIsMobileCurrentSongVisible(false);
      setError(message);
    },
    [activeCode, activeState]
  );

  useEffect(() => {
    return () => {
      if (resultsViewTimeoutRef.current !== null) {
        window.clearTimeout(resultsViewTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const existingViewerId = window.localStorage.getItem("octave-voter-id");
    const resolvedViewerId =
      existingViewerId ||
      (typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `viewer-${Math.random().toString(36).slice(2, 12)}`);

    if (!existingViewerId) {
      window.localStorage.setItem("octave-voter-id", resolvedViewerId);
    }

    const frameId = window.requestAnimationFrame(() => {
      setViewerId(resolvedViewerId);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!activeCode) {
      return;
    }

    const watch = convexClient.watchQuery(api.playlists.getActivePlaylistState, {
      code: activeCode,
    });

    const applySnapshot = () => {
      try {
        const snapshot = watch.localQueryResult();

        if (typeof snapshot === "undefined") {
          return;
        }

        if (snapshot === null) {
          handleSessionEnded("This music session has ended.");
          return;
        }

        setActiveState(snapshot);
        setError(null);
      } catch (watchError) {
        setError(
          watchError instanceof Error
            ? watchError.message
            : "The live vote feed could not be loaded."
        );
      }
    };

    applySnapshot();
    const unsubscribe = watch.onUpdate(applySnapshot);

    return () => {
      unsubscribe();
    };
  }, [activeCode, convexClient, handleSessionEnded]);

  useEffect(() => {
    if (!activeCode || !activeState) {
      previousActiveBatchRef.current = null;
      startTransition(() => {
        setLocalPreviousResults(null);
      });
      return;
    }

    const previousBatch = previousActiveBatchRef.current;

    if (
      previousBatch &&
      previousBatch.code === activeCode &&
      previousBatch.batch.length > 0 &&
      (previousBatch.batchIndex !== activeState.currentBatchIndex ||
        previousBatch.batch.map((song) => song.id).join("|") !==
          activeState.currentBatch.map((song) => song.id).join("|"))
    ) {
      setLocalPreviousResults({
        batch: previousBatch.batch,
        songList: previousBatch.songList,
      });
    }

    previousActiveBatchRef.current = {
      batch: activeState.currentBatch.map((song) => ({ ...song })),
      batchIndex: activeState.currentBatchIndex,
      code: activeCode,
      songList: activeState.songList.map((entry) => ({ ...entry })),
    };
  }, [activeCode, activeState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const compactQuery = window.matchMedia("(max-width: 1000px)");
    const phoneQuery = window.matchMedia("(max-width: 620px)");
    const syncResponsiveLayout = () => {
      setIsCompactVoteLayout(compactQuery.matches);
      setIsPhoneVoteLayout(phoneQuery.matches);

      if (!phoneQuery.matches) {
        setIsMobileCurrentSongVisible(false);
      }
    };

    syncResponsiveLayout();
    compactQuery.addEventListener("change", syncResponsiveLayout);
    phoneQuery.addEventListener("change", syncResponsiveLayout);

    return () => {
      compactQuery.removeEventListener("change", syncResponsiveLayout);
      phoneQuery.removeEventListener("change", syncResponsiveLayout);
    };
  }, []);

  useEffect(() => {
    if (!activeCode || !viewerId || !activeState?.currentSongStartedAt) {
      lastSelectionKeyRef.current = null;
      return;
    }

    const selectionKey = `${viewerId}:${activeCode}:${activeState.currentSongStartedAt}:${activeState.currentSongId ?? "none"}`;

    if (lastSelectionKeyRef.current === selectionKey) {
      return;
    }

    lastSelectionKeyRef.current = selectionKey;

    void (async () => {
      const result = await getActivePlaylistViewerSelectionAction(activeCode, viewerId);

      if (result.ok) {
        setSelectedSongId(result.result.selectedSongId);
      }
    })();
  }, [activeCode, activeState?.currentSongId, activeState?.currentSongStartedAt, viewerId]);

  useEffect(() => {
    if (!activeCode || !currentSong || !activeState?.currentSongStartedAt) {
      return;
    }

    const startedAtMs = Date.parse(activeState.currentSongStartedAt);
    const currentSongEndAt =
      (Number.isFinite(startedAtMs) ? startedAtMs : Date.now()) +
      currentSong.durationMs;
    const delay = Math.max(currentSongEndAt - Date.now() + 350, 350);
    const timeoutId = window.setTimeout(() => {
      void refreshActivePlaylist(activeCode, setActiveCode, setActiveState, setError);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCode, activeState?.currentSongStartedAt, currentSong]);

  useEffect(() => {
    const timelineScroll = timelineScrollRef.current;

    if (!timelineScroll) {
      return;
    }

    let frameId: number | null = null;

    const updateTimelineFade = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        const maxScrollLeft = Math.max(
          timelineScroll.scrollWidth - timelineScroll.clientWidth,
          0
        );
        const nextFade = {
          left: timelineScroll.scrollLeft > 2,
          right: maxScrollLeft - timelineScroll.scrollLeft > 2,
        };

        setTimelineEdgeFade((currentFade) =>
          currentFade.left === nextFade.left && currentFade.right === nextFade.right
            ? currentFade
            : nextFade
        );
        frameId = null;
      });
    };

    updateTimelineFade();
    timelineScroll.addEventListener("scroll", updateTimelineFade, { passive: true });
    window.addEventListener("resize", updateTimelineFade);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateTimelineFade();
          });

    resizeObserver?.observe(timelineScroll);

    const timelineContent = timelineScroll.firstElementChild;

    if (timelineContent instanceof HTMLElement) {
      resizeObserver?.observe(timelineContent);
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      timelineScroll.removeEventListener("scroll", updateTimelineFade);
      window.removeEventListener("resize", updateTimelineFade);
      resizeObserver?.disconnect();
    };
  }, [timelineSongs]);

  useEffect(() => {
    if (!currentSongId) {
      startTransition(() => {
        setLyricsData({
          plainLyrics: null,
          songId: null,
          status: "idle",
          track: null,
        });
      });
      return;
    }

    startTransition(() => {
      setLyricsData((currentValue) =>
        currentValue.songId === currentSongId
          ? currentValue
          : {
              plainLyrics: null,
              songId: currentSongId,
              status: "loading",
              track: null,
            }
      );
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException("Lyrics request timed out.", "AbortError"));
    }, 18_000);
    const query = new URLSearchParams({
      artist: currentSongArtist,
      durationMs: String(currentSongDurationMs),
      title: currentSongTitle,
    });
    const songId = currentSongId;
    const videoId = currentSong ? getSongVideoId(currentSong) : null;

    if (videoId) {
      query.set("videoId", videoId);
    }

    if (currentSongAlbum) {
      query.set("album", currentSongAlbum);
    }

    void fetch(`/api/lyrics?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          lyrics?: TrackLyrics | null;
          plainLyrics?: string | null;
          status?: string;
        };

        if (!response.ok) {
          throw new Error(payload.status ?? "Lyrics fetch failed.");
        }

        return payload;
      })
      .then((payload) => {
        const nextTrack = payload.lyrics ?? null;
        const nextPlainLyrics = payload.plainLyrics?.trim() || null;

        setLyricsData({
          plainLyrics: nextPlainLyrics,
          songId,
          status: nextTrack?.lines.length || nextPlainLyrics ? "ready" : "missing",
          track: nextTrack,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          setLyricsData((currentValue) =>
            currentValue.songId === songId && currentValue.status === "loading"
              ? {
                  plainLyrics: null,
                  songId,
                  status: "missing",
                  track: null,
                }
              : currentValue
          );
          return;
        }

        setLyricsData({
          plainLyrics: null,
          songId,
          status: "error",
          track: null,
        });
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    currentSongAlbum,
    currentSongArtist,
    currentSongDurationMs,
    currentSong,
    currentSongId,
    currentSongTitle,
  ]);

  const joinPlaylistByCode = useCallback(
    async (normalizedCode: string) => {
      if (!viewerId) {
        setError("Preparing your anonymous vote session. Try again in a moment.");
        return;
      }

      setJoinState("joining");
      setError(null);
      setResultsViewStage("hidden");

      const result = await syncActivePlaylistPlaybackAction(normalizedCode);
      setJoinState("idle");

      if (!result.ok) {
        if (
          result.error.includes("no longer available") ||
          result.error.includes("has ended")
        ) {
          handleSessionEnded("This music session has ended.");
          return;
        }

        setError(result.error);
        return;
      }

      if (!result.result) {
        handleSessionEnded("This music session has ended.");
        return;
      }

      setActiveCode(normalizedCode);
      setActiveState(result.result);
      setPreviousResult(null);
      setResultsViewStage("hidden");

      const viewerSelection = await getActivePlaylistViewerSelectionAction(
        normalizedCode,
        viewerId
      );

      if (viewerSelection.ok) {
        setSelectedSongId(viewerSelection.result.selectedSongId);
      }
    },
    [handleSessionEnded, viewerId]
  );

  useEffect(() => {
    const normalizedCode = normalizeCode(defaultCode ?? "");

    if (!normalizedCode) {
      return;
    }

    if (!viewerId || (activeCode === normalizedCode && activeState)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void joinPlaylistByCode(normalizedCode);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeCode, activeState, defaultCode, joinPlaylistByCode, viewerId]);

  const handleJoinPlaylist = async () => {
    const normalizedCode = normalizeCode(playlistCodeInput);

    if (!normalizedCode) {
      setError("Enter a playlist code to join the live vote room.");
      return;
    }

    if (!viewerId) {
      setError("Preparing your anonymous vote session. Try again in a moment.");
      return;
    }

    await joinPlaylistByCode(normalizedCode);
  };

  const handleVoteForSong = async (songId: string) => {
    if (!activeCode || !viewerId) {
      return;
    }

    setVoteState("voting");
    setError(null);
    const result = await voteForActivePlaylistSongAction({
      code: activeCode,
      songId,
      viewerId,
    });
    setVoteState("idle");
    setPressedKeyId((currentValue) => (currentValue === songId ? null : currentValue));

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setActiveState(result.result.activeState);
    setSelectedSongId(result.result.selectedSongId);
  };

  const liveResultsSource =
    activeState?.previousResults ?? localPreviousResults ?? null;
  const liveResultsSnapshot = liveResultsSource
    ? {
        batch: liveResultsSource.batch,
        songList: liveResultsSource.songList,
        topSongIds: getTopSongIds(liveResultsSource.songList),
      }
    : null;
  const resultsSnapshot = liveResultsSnapshot ?? previousResult;
  const toggleResultsView = () => {
    setIsMobileCurrentSongVisible(false);

    if (resultsViewTimeoutRef.current !== null) {
      window.clearTimeout(resultsViewTimeoutRef.current);
      resultsViewTimeoutRef.current = null;
    }

    if (resultsViewStage === "hidden") {
      setResultsViewStage("entering");
      resultsViewTimeoutRef.current = window.setTimeout(() => {
        setResultsViewStage("visible");
        resultsViewTimeoutRef.current = null;
      }, 340);
      return;
    }

    if (resultsViewStage === "visible") {
      setResultsViewStage("exiting");
      resultsViewTimeoutRef.current = window.setTimeout(() => {
        setResultsViewStage("hidden");
        resultsViewTimeoutRef.current = null;
      }, 240);
      return;
    }

    if (resultsViewStage === "entering") {
      setResultsViewStage("visible");
      return;
    }

    setResultsViewStage("hidden");
  };
  const voteOptionsPanel = activeState ? (
    <div className="vote-song-workspace__left">
      <div className="vote-song-workspace__section-header">
        <h3 className="playlist-workspace__songs-title playlist-workspace__songs-title--compact vote-song-workspace__section-title">
          Voting Options
        </h3>
        <div className="vote-song-workspace__header-actions">
          <button
            type="button"
            className="playlist-workspace__secondary vote-song-workspace__previous-button"
            onClick={() => {
              toggleResultsView();
            }}
          >
            {isResultsVisible ? "Back To Voting" : "Show Results"}
          </button>
          <span className="playlist-workspace__pill vote-song-workspace__header-pill">
            One vote only
          </span>
        </div>
        <span className="playlist-workspace__songs-count vote-song-workspace__header-caption">
          Change anytime before the song ends
        </span>
      </div>
      <div className="vote-song-workspace__card vote-song-workspace__card--vote">
        {error ? <p className="playlist-workspace__error">{error}</p> : null}

        {isResultsVisible ? (
          resultsSnapshot ? (
            <VoteSubwooferPanel
              currentSongId={activeState.currentSongId}
              selectedSongId={selectedSongId}
              songList={resultsSnapshot.songList}
              songs={resultsSnapshot.batch}
              stage={resultsViewStage}
              topSongIds={resultsSnapshot.topSongIds}
            />
          ) : (
            <div className="vote-song-workspace__ended-copy">
              <strong>Results pending</strong>
              <span>
                The first completed voting batch has not locked in yet.
              </span>
            </div>
          )
        ) : (
          <div className="vote-song-workspace__piano-shell">
            <div className="vote-song-workspace__piano-viewport">
              <div className="vote-song-workspace__piano">
                {WHITE_PIANO_KEYS.map((keyLabel, index) => {
                  const song = activeState.currentBatch[index] ?? null;
                  const isCurrentSong = song
                    ? activeState.currentSongId === song.id
                    : false;
                  const isSelected = song ? selectedSongId === song.id : false;
                  const isPressing = song ? pressedKeyId === song.id : false;
                  const canVote = !!song;

                  return (
                    <button
                      key={`white-${keyLabel}`}
                      type="button"
                      className={`vote-song-workspace__piano-white-key${
                        isSelected ? " is-selected" : ""
                      }${isCurrentSong ? " is-current" : ""}${
                        isPressing ? " is-pressing" : ""
                      }`}
                      onPointerDown={() => {
                        if (song && canVote && voteState === "idle") {
                          setPressedKeyId(song.id);
                        }
                      }}
                      onPointerUp={() => {
                        setPressedKeyId((currentValue) =>
                          currentValue === song?.id ? null : currentValue
                        );
                      }}
                      onPointerLeave={() => {
                        setPressedKeyId((currentValue) =>
                          currentValue === song?.id ? null : currentValue
                        );
                      }}
                      onPointerCancel={() => {
                        setPressedKeyId((currentValue) =>
                          currentValue === song?.id ? null : currentValue
                        );
                      }}
                      onClick={() => {
                        if (song && canVote) {
                          void handleVoteForSong(song.id);
                        }
                      }}
                      disabled={!canVote || voteState !== "idle"}
                    >
                      <div className="vote-song-workspace__piano-key-content">
                        <span className="vote-song-workspace__piano-key-art-shell">
                          {song?.artworkUrl ? (
                            <img
                              src={song.artworkUrl}
                              alt={song.title}
                              className="vote-song-workspace__piano-key-art"
                            />
                          ) : (
                            <span
                              className="vote-song-workspace__piano-key-art vote-song-workspace__piano-key-art--fallback"
                              aria-hidden="true"
                            >
                              {(song?.title ?? "Empty").charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="vote-song-workspace__piano-key-copy">
                          <strong>
                            <MarqueeText
                              align="center"
                              overflowStrategy="length"
                              text={song?.title ?? "Empty"}
                            />
                          </strong>
                        </span>
                      </div>
                    </button>
                  );
                })}

                {BLACK_PIANO_KEYS.map((key) => (
                  <div
                    key={`black-${key.label}`}
                    className={`vote-song-workspace__piano-black-key vote-song-workspace__piano-black-key--after-${key.afterIndex}${
                      pressedBlackKeyId === key.label ? " is-pressing" : ""
                    }`}
                    onPointerDown={() => {
                      setPressedBlackKeyId(key.label);
                    }}
                    onPointerUp={() => {
                      setPressedBlackKeyId((currentValue) =>
                        currentValue === key.label ? null : currentValue
                      );
                    }}
                    onPointerLeave={() => {
                      setPressedBlackKeyId((currentValue) =>
                        currentValue === key.label ? null : currentValue
                      );
                    }}
                    onPointerCancel={() => {
                      setPressedBlackKeyId((currentValue) =>
                        currentValue === key.label ? null : currentValue
                      );
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;
  const currentSongPanel = (
    <div className="vote-song-workspace__right">
      <VoteSongPlayerPanel
        isVisible={isVisible}
        song={activeState?.currentSong ?? null}
        startedAt={activeState?.currentSongStartedAt ?? null}
        code={activeCode}
        onVolumeChange={onVolumeChange}
        selectedTimelineSong={selectedTimelineSong}
        onCloseSelectedTimelineSong={() => {
          setSelectedTimelineSongId(null);
        }}
        lyrics={activeLyrics}
        plainLyrics={activePlainLyrics}
        lyricsStatus={activeLyricsStatus}
        onPlaybackProgress={({ capturedAtMs, currentMs, isPlaying, songId }) => {
          livePlaybackRef.current = {
            capturedAtMs,
            currentMs,
            isPlaying,
            songId,
          };
        }}
        volumeLevel={volumeLevel}
      />
    </div>
  );
  return (
    <div
      className={`vote-song-workspace${
        hasJoinedRoom
          ? " vote-song-workspace--live"
          : hasEndedSession
            ? " vote-song-workspace--ended"
            : " vote-song-workspace--intro"
      }${hasJoinedRoom && activeState && isCompactVoteLayout ? " vote-song-workspace--compact-live" : ""}${
        hasJoinedRoom && activeState && isPhoneVoteLayout ? " vote-song-workspace--phone-live" : ""
      }${
        isPhoneCurrentSongVisible
          ? " vote-song-workspace--phone-player-visible"
          : ""
      }`}
    >
      {hasJoinedRoom && activeState ? (
        <VoteSongBeatParticles
          currentSong={activeState.currentSong}
          lyrics={activeLyrics}
          playbackSampleRef={livePlaybackRef}
        />
      ) : null}
      {hasEndedSession && previousResult ? (
        <>
          <div className="vote-song-workspace__left vote-song-workspace__left--ended">
            <div className="vote-song-workspace__section-header">
              <div>
                <h3 className="playlist-workspace__songs-title">
                  Voting Options
                </h3>
                <p className="vote-song-workspace__ended-label">
                  {previousResult.endedMessage}
                </p>
              </div>
              <div className="vote-song-workspace__header-side">
                <button
                  type="button"
                  className="playlist-workspace__secondary vote-song-workspace__previous-button"
                  onClick={() => {
                    toggleResultsView();
                  }}
                >
                  {isResultsVisible ? "Hide Results" : "Show Results"}
                </button>
              </div>
            </div>
            <div className="vote-song-workspace__card vote-song-workspace__card--vote">
              {isResultsVisible ? (
                <>
                  <VoteSubwooferPanel
                    isStatic
                    selectedSongId={null}
                    songList={previousResult.songList}
                    songs={previousResult.batch}
                    stage={resultsViewStage}
                    topSongIds={previousResult.topSongIds}
                  />
                </>
              ) : (
                <div className="vote-song-workspace__ended-copy">
                  <strong>Session complete</strong>
                  <span>
                    Open show results to inspect the last vote snapshot, or
                    enter another code to join a new room.
                  </span>
                </div>
              )}
              {isResultsVisible ? (
                <div className="vote-song-workspace__results-list">
                  <VoteResultsList
                    highlightSongIds={previousResult.topSongIds}
                    songList={previousResult.songList}
                    songs={previousResult.batch}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="vote-song-workspace__entry vote-song-workspace__entry--side">
            <label className="vote-song-workspace__entry-label" htmlFor="vote-room-code">
              Enter Code
            </label>
            <input
              id="vote-room-code"
              className="playlist-workspace__input vote-song-workspace__entry-input"
              type="text"
              inputMode="text"
              maxLength={6}
              value={playlistCodeInput}
              onChange={(event) =>
                setPlaylistCodeInput(event.target.value.toUpperCase())
              }
              placeholder="ABCDEF"
            />
            <button
              type="button"
              className="playlist-workspace__primary vote-song-workspace__entry-button"
              onClick={() => {
                void handleJoinPlaylist();
              }}
              disabled={joinState !== "idle" || viewerId === null}
            >
              {joinState === "joining" ? "Entering..." : "Continue"}
            </button>
            {previousResult.code ? (
              <p className="vote-song-workspace__ended-room">
                Last room: {previousResult.code}
              </p>
            ) : null}
            {error ? <p className="playlist-workspace__error">{error}</p> : null}
          </div>
        </>
      ) : !hasJoinedRoom ? (
        <div className="vote-song-workspace__entry">
          <label className="vote-song-workspace__entry-label" htmlFor="vote-room-code">
            Enter Code
          </label>
          <input
            id="vote-room-code"
            className="playlist-workspace__input vote-song-workspace__entry-input"
            type="text"
            inputMode="text"
            maxLength={6}
            value={playlistCodeInput}
            onChange={(event) =>
              setPlaylistCodeInput(event.target.value.toUpperCase())
            }
            placeholder="ABCDEF"
          />
          <button
            type="button"
            className="playlist-workspace__primary vote-song-workspace__entry-button"
            onClick={() => {
              void handleJoinPlaylist();
            }}
            disabled={joinState !== "idle" || viewerId === null}
          >
            {joinState === "joining" ? "Entering..." : "Continue"}
          </button>
          {error ? <p className="playlist-workspace__error">{error}</p> : null}
        </div>
      ) : activeState ? (
        <>
          <div className="vote-song-workspace__timeline-shell">
            <div
              className="vote-song-workspace__timeline-viewport"
              data-fade-left={timelineEdgeFade.left}
              data-fade-right={timelineEdgeFade.right}
            >
              <div
                ref={timelineScrollRef}
                className="vote-song-workspace__timeline-scroll"
              >
                <div className="vote-song-workspace__timeline">
                  {timelineSongs.map((entry, index) => (
                    <TimelineNode
                      key={`${entry.song.id}-${entry.variant}-${index}`}
                      isActive={selectedTimelineSongId === entry.song.id}
                      isLast={index === timelineSongs.length - 1}
                      onClick={() => {
                        setSelectedTimelineSongId(entry.song.id);
                      }}
                      song={entry.song}
                      variant={entry.variant}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {isPhoneVoteLayout ? (
            <div className="vote-song-workspace__phone-stage">
              <div className="vote-song-workspace__phone-track">
                {voteOptionsPanel}
                {currentSongPanel}
              </div>
            </div>
          ) : (
            voteOptionsPanel
          )}

          {!isCompactVoteLayout && !isPhoneVoteLayout ? (
            <div className="vote-song-workspace__middle">
              <div className="vote-song-workspace__card vote-song-workspace__card--visualizer">
                <MusicVisualizerSphere
                  currentSong={activeState.currentSong}
                  lyrics={activeLyrics}
                  playbackSampleRef={livePlaybackRef}
                  songList={activeState.songList}
                />
              </div>
            </div>
          ) : null}

          {!isPhoneVoteLayout ? currentSongPanel : null}

          {isPhoneVoteLayout && !isResultsVisible ? (
            <button
              type="button"
              className="vote-song-workspace__mobile-player-toggle"
              onClick={() => {
                setIsMobileCurrentSongVisible((currentValue) => !currentValue);
              }}
            >
              {isPhoneCurrentSongVisible ? "← Go Back" : "Show Current Song →"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function VoteSubwooferPanel({
  currentSongId = null,
  isStatic = false,
  selectedSongId,
  songList,
  songs,
  stage,
  topSongIds,
}: {
  currentSongId?: string | null;
  isStatic?: boolean;
  selectedSongId: string | null;
  songList: ActivePlaylistSongVote[];
  songs: PlaylistSong[];
  stage: "hidden" | "entering" | "visible" | "exiting";
  topSongIds: string[];
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState<number | null>(null);
  const resultNodeOffsets = [
    { left: 0, top: -5.2 },
    { left: 2.2, top: -2.6 },
    { left: 1.5, top: -4.5 },
    { left: -1.5, top: -4.5 },
    { left: -2.2, top: -2.6 },
  ];
  const voteLookup = useMemo(
    () => new Map(songList.map((entry) => [entry.songId, entry.vote])),
    [songList]
  );
  const highestVote = useMemo(
    () => Math.max(...songList.map((entry) => entry.vote), 1),
    [songList]
  );

  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return undefined;
    }

    const updateGraphSize = () => {
      const nextSize = Math.max(Math.min(shell.clientWidth, shell.clientHeight) - 18, 0);
      setGraphSize((currentSize) =>
        currentSize !== null && Math.abs(currentSize - nextSize) < 1
          ? currentSize
          : nextSize
      );
    };

    updateGraphSize();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateGraphSize)
        : null;

    resizeObserver?.observe(shell);
    window.addEventListener("resize", updateGraphSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateGraphSize);
    };
  }, []);

  const pentagonVertices = songs.map((song, index) => {
    const angle = songs.length === 1 ? -90 : -90 + (360 / songs.length) * index;
    const radians = (angle * Math.PI) / 180;

    return {
      left: 50 + Math.cos(radians) * 36.2,
      song,
      top: 50 + Math.sin(radians) * 36.2,
    };
  });
  const positionedSongs = pentagonVertices.map(({ left, song, top }, index) => {
    const voteCount = voteLookup.get(song.id) ?? 0;
    const offset = resultNodeOffsets[index] ?? {
      left: 0,
      top: -3.6,
    };

    return {
      left: left + offset.left,
      song,
      top: top + offset.top,
      voteCount,
    };
  });
  const skillOutlinePoints = pentagonVertices
    .map(({ left, top }) => `${left},${top}`)
    .join(" ");
  const skillGraphPoints = pentagonVertices
    .map(({ left, song, top }) => {
      const voteRatio = highestVote > 0 ? (voteLookup.get(song.id) ?? 0) / highestVote : 0;
      const graphStretch = 1 + voteRatio * 0.08;

      return `${50 + (left - 50) * graphStretch},${50 + (top - 50) * graphStretch}`;
    })
    .join(" ");
  const waveLayers = Array.from({ length: 6 }, (_, index) => index);
  const graphStyle = graphSize
    ? ({
        "--vote-subwoofer-graph-size": `${graphSize}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={shellRef}
      className={`vote-song-workspace__subwoofer-shell vote-song-workspace__subwoofer-shell--${stage}`}
    >
      <SubwooferScene stage={stage} />
      <div
        className="vote-song-workspace__subwoofer-graph"
        aria-hidden="true"
        style={graphStyle}
      >
        <svg
          className="vote-song-workspace__skill-outline"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
        >
          {positionedSongs.length > 1 ? (
            <>
              <polygon
                points={skillOutlinePoints}
                className="vote-song-workspace__skill-outline-fill"
              />
              {waveLayers.map((waveIndex) => (
                <polygon
                  key={`wave-${waveIndex}`}
                  points={skillGraphPoints}
                  className="vote-song-workspace__skill-wave-ring"
                  style={
                    {
                      "--vote-wave-delay": `${waveIndex * 190}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </>
          ) : null}
          {positionedSongs.length > 1 ? (
            <polygon
              points={skillOutlinePoints}
              className="vote-song-workspace__skill-outline-path"
            />
          ) : null}
        </svg>
        {positionedSongs.map(({ left, song, top, voteCount }, index) => {
          const isTop = topSongIds.includes(song.id);
          const isSelected = selectedSongId === song.id;
          const isCurrent = currentSongId === song.id;
          const visualStyle = {
            "--vote-skill-delay": `${index * 38}ms`,
            "--vote-skill-left": `${left}%`,
            "--vote-skill-top": `${top}%`,
          } as CSSProperties;

          return (
            <div
              key={song.id}
              className="vote-song-workspace__skill-cluster"
              style={visualStyle}
            >
              <div
                className={`vote-song-workspace__skill-node${
                  isSelected ? " is-selected" : ""
                }${isTop ? " is-top" : ""}${isCurrent ? " is-current" : ""}${
                  isStatic ? " is-static" : ""
                }`}
              >
                <span className="vote-song-workspace__skill-node-art-shell">
                  {song.artworkUrl ? (
                    <img
                      src={song.artworkUrl}
                      alt={song.title}
                      className="vote-song-workspace__skill-node-art"
                    />
                  ) : (
                    <span
                      className="vote-song-workspace__skill-node-art vote-song-workspace__skill-node-art--fallback"
                      aria-hidden="true"
                    >
                      {song.title.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="vote-song-workspace__skill-node-copy">
                  <strong>
                    <MarqueeText
                      align="center"
                      durationScale={1.7}
                      gap="0"
                      text={song.title}
                    />
                  </strong>
                  <span>{voteCount}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VoteResultsList({
  currentSongId = null,
  highlightSongIds = [],
  songList,
  songs,
}: {
  currentSongId?: string | null;
  highlightSongIds?: string[];
  songList: ActivePlaylistSongVote[];
  songs: PlaylistSong[];
}) {
  const currentVoteMax = Math.max(...songList.map((entry) => entry.vote), 1);

  return (
    <>
      {songs.map((song) => {
        const voteCount =
          songList.find((entry) => entry.songId === song.id)?.vote ?? 0;
        const fillWidth = `${Math.max((voteCount / currentVoteMax) * 100, voteCount > 0 ? 10 : 0)}%`;
        const isCurrentSong = currentSongId === song.id;
        const isTop = highlightSongIds.includes(song.id);

        return (
          <div
            key={`result-${song.id}`}
            className={`vote-song-workspace__result-row${
              isCurrentSong ? " is-current" : ""
            }${isTop ? " is-top" : ""}`}
          >
            <div className="vote-song-workspace__result-copy">
              <strong>
                <MarqueeText gap="0.005ch" text={song.title} />
              </strong>
              <span>{voteCount} votes</span>
            </div>
            <div className="vote-song-workspace__result-bar">
              <span
                className="vote-song-workspace__result-fill"
                style={{ width: fillWidth }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

function TimelineNode({
  isActive,
  isLast,
  onClick,
  song,
  variant,
}: {
  isActive: boolean;
  isLast: boolean;
  onClick: () => void;
  song: PlaylistSong;
  variant: "played" | "pending";
}) {
  return (
    <>
      <button
        type="button"
        className={`vote-song-workspace__timeline-node vote-song-workspace__timeline-node--${variant}${
          isActive ? " is-active" : ""
        }`}
        aria-pressed={isActive}
        onClick={onClick}
      >
        <span className="vote-song-workspace__timeline-dot">
          {song.artworkUrl ? (
            <img
              src={song.artworkUrl}
              alt={song.title}
              className="vote-song-workspace__timeline-art"
            />
          ) : (
            <span className="vote-song-workspace__timeline-art-fallback" aria-hidden="true">
              {song.title.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="vote-song-workspace__timeline-label" title={song.title}>
          {song.title}
        </span>
      </button>
      {!isLast ? <span className="vote-song-workspace__timeline-line" /> : null}
    </>
  );
}

function TimelineRecorder({
  variant = "timeline",
  onClose,
  song,
}: {
  variant?: "timeline" | "player-side";
  onClose: () => void;
  song: PlaylistSong;
}) {
  const songUrl = getSongDestinationUrl(song);

  return (
    <div
      className={`vote-song-workspace__timeline-recorder vote-song-workspace__timeline-recorder--${variant}`}
      role="dialog"
      aria-label={`Selected song ${song.title}`}
    >
      <div className="vote-song-workspace__timeline-recorder-body">
        <button
          type="button"
          className="vote-song-workspace__timeline-recorder-close"
          onClick={onClose}
          aria-label="Close recorder"
        >
          ×
        </button>
        <div className="vote-song-workspace__timeline-recorder-window">
          {song.artworkUrl ? (
            <img
              src={song.artworkUrl}
              alt={song.title}
              className="vote-song-workspace__timeline-recorder-art"
            />
          ) : (
            <span
              className="vote-song-workspace__timeline-recorder-art vote-song-workspace__timeline-recorder-art--fallback"
              aria-hidden="true"
            >
              {song.title.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="vote-song-workspace__timeline-recorder-copy">
            <span>Selected Song</span>
            <strong>{song.title}</strong>
          </div>
        </div>
        <div className="vote-song-workspace__timeline-recorder-reels" aria-hidden="true">
          <span className="vote-song-workspace__timeline-recorder-reel" />
          <span className="vote-song-workspace__timeline-recorder-reel" />
        </div>
        {songUrl ? (
          <a
            className="vote-song-workspace__timeline-recorder-link"
            href={songUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in YouTube Music
          </a>
        ) : (
          <span className="vote-song-workspace__timeline-recorder-unavailable">
            No YouTube Music link
          </span>
        )}
      </div>
    </div>
  );
}

function VoteSongPlayerPanel({
  code,
  isVisible = false,
  lyrics,
  plainLyrics,
  lyricsStatus,
  onPlaybackProgress,
  onVolumeChange,
  onCloseSelectedTimelineSong,
  selectedTimelineSong,
  song,
  startedAt,
  volumeLevel = 72,
}: {
  code: string | null;
  isVisible?: boolean;
  lyrics: TrackLyrics | null;
  plainLyrics?: string | null;
  lyricsStatus: "idle" | "ready" | "missing" | "error" | "loading";
  onPlaybackProgress?: (payload: {
    capturedAtMs: number;
    currentMs: number | null;
    isPlaying: boolean;
    songId: string | null;
  }) => void;
  onVolumeChange?: (volume: number) => void;
  onCloseSelectedTimelineSong?: () => void;
  selectedTimelineSong?: PlaylistSong | null;
  song: PlaylistSong | null;
  startedAt: string | null;
  volumeLevel?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const onPlaybackProgressRef = useRef(onPlaybackProgress);
  const hasStartedPlaybackRef = useRef(false);
  const lastReportedPlaybackRef = useRef<{
    currentMs: number | null;
    isPlaying: boolean;
    songId: string | null;
  }>({
    currentMs: null,
    isPlaying: false,
    songId: null,
  });
  const resolvedVolume = Math.max(0, Math.min(100, volumeLevel));
  const volumeRef = useRef(resolvedVolume);
  const [playerClock, setPlayerClock] = useState<{
    currentSeconds: number | null;
    isPlaying: boolean;
    songId: string | null;
  }>({
    currentSeconds: null,
    isPlaying: false,
    songId: null,
  });
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [screenMode, setScreenMode] = useState<"now-playing" | "lyrics">("now-playing");
  const streamSongId = song?.id ?? null;
  const videoId = song ? getSongVideoId(song) : null;
  const fallbackDurationSeconds = song ? song.durationMs / 1000 : 0;
  const displayedDurationSeconds = durationSeconds || fallbackDurationSeconds;
  const displayedCurrentSeconds =
    playerClock.songId === streamSongId &&
    typeof playerClock.currentSeconds === "number"
      ? Math.min(
          Math.max(playerClock.currentSeconds, 0),
          displayedDurationSeconds || fallbackDurationSeconds
        )
      : 0;
  const playerSessionKey = `${Number(isVisible)}:${startedAt ?? ""}:${
    streamSongId ?? ""
  }:${videoId ?? ""}`;

  useEffect(() => {
    return () => {
      destroyYouTubePlayer(playerRef, progressIntervalRef);
    };
  }, []);

  useEffect(() => {
    onPlaybackProgressRef.current = onPlaybackProgress;
  }, [onPlaybackProgress]);

  const emitPlaybackProgress = useCallback(
    (
      currentSeconds: number | null,
      songId: string | null,
      isPlaying: boolean
    ) => {
      const currentMs =
        typeof currentSeconds === "number" && Number.isFinite(currentSeconds)
          ? Math.max(currentSeconds * 1_000, 0)
          : null;
      const lastReported = lastReportedPlaybackRef.current;

      if (
        lastReported.songId === songId &&
        lastReported.isPlaying === isPlaying &&
        Math.abs((lastReported.currentMs ?? -1) - (currentMs ?? -1)) < 24
      ) {
        return;
      }

      lastReportedPlaybackRef.current = {
        currentMs,
        isPlaying,
        songId,
      };
      onPlaybackProgressRef.current?.({
        capturedAtMs:
          typeof performance !== "undefined" ? performance.now() : Date.now(),
        currentMs,
        isPlaying,
        songId,
      });
    },
    []
  );

  useEffect(() => {
    const player = playerRef.current;

    volumeRef.current = resolvedVolume;

    if (!player) {
      return;
    }

    player.setVolume(resolvedVolume);
  }, [resolvedVolume]);

  useEffect(() => {
    if (!isVisible || !streamSongId || !startedAt || !hostRef.current || !videoId) {
      hasStartedPlaybackRef.current = false;
      startTransition(() => {
        setPlayerClock({
          currentSeconds: null,
          isPlaying: false,
          songId: streamSongId,
        });
      });
      emitPlaybackProgress(null, streamSongId, false);
      destroyYouTubePlayer(playerRef, progressIntervalRef);
      return;
    }

    let cancelled = false;
    hasStartedPlaybackRef.current = false;
    startTransition(() => {
      setPlayerClock({
        currentSeconds: null,
        isPlaying: false,
        songId: streamSongId,
      });
    });

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) {
        return;
      }

      destroyYouTubePlayer(playerRef, progressIntervalRef);
      hostRef.current.innerHTML = "";

      const offsetSeconds = Math.max(
        0,
        (Date.now() - Date.parse(startedAt)) / 1000
      );

      playerRef.current = new window.YT.Player(hostRef.current, {
        events: {
          onReady: (event: { target: YouTubePlayer }) => {
            event.target.setVolume(volumeRef.current);
            event.target.seekTo(offsetSeconds, true);
            event.target.playVideo();
            const liveDuration = event.target.getDuration();

            if (Number.isFinite(liveDuration) && liveDuration > 0) {
              setDurationSeconds(liveDuration);
            }
          },
          onStateChange: (event: { data: number; target: YouTubePlayer }) => {
            const liveDuration = event.target.getDuration();

            if (Number.isFinite(liveDuration) && liveDuration > 0) {
              setDurationSeconds(liveDuration);
            }

            if (event.data === YOUTUBE_PLAYER_STATE.PLAYING) {
              hasStartedPlaybackRef.current = true;
              startPlayerProgressTracking(event.target, progressIntervalRef, {
                setCurrentSeconds: (value) => {
                  setPlayerClock({
                    currentSeconds: value,
                    isPlaying: true,
                    songId: streamSongId,
                  });
                  emitPlaybackProgress(value, streamSongId, true);
                },
                setDurationSeconds,
              });
              return;
            }

            stopPlayerProgressTracking(progressIntervalRef);

            const currentTime = hasStartedPlaybackRef.current
              ? event.target.getCurrentTime()
              : event.data === YOUTUBE_PLAYER_STATE.ENDED
                ? event.target.getDuration()
                : null;
            const resolvedCurrentSeconds =
              typeof currentTime === "number" && Number.isFinite(currentTime)
                ? Math.max(currentTime, 0)
                : null;

            setPlayerClock({
              currentSeconds: resolvedCurrentSeconds,
              isPlaying: false,
              songId: streamSongId,
            });
            emitPlaybackProgress(resolvedCurrentSeconds, streamSongId, false);
          },
        },
        height: "1",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        videoId,
        width: "1",
      });
    });

    return () => {
      cancelled = true;
      hasStartedPlaybackRef.current = false;
      emitPlaybackProgress(null, streamSongId, false);
      destroyYouTubePlayer(playerRef, progressIntervalRef);
    };
  }, [
    emitPlaybackProgress,
    isVisible,
    playerSessionKey,
    startedAt,
    streamSongId,
    videoId,
  ]);

  const progress =
    displayedDurationSeconds > 0
      ? Math.min((displayedCurrentSeconds / displayedDurationSeconds) * 100, 100)
      : 0;

  const updateVolume = (nextVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, nextVolume));
    volumeRef.current = clampedVolume;
    playerRef.current?.setVolume(clampedVolume);
    playerRef.current?.playVideo();
    onVolumeChange?.(clampedVolume);
  };

  return (
    <div
      className={`vote-song-player${
        screenMode === "lyrics" ? " vote-song-player--lyrics-mode" : ""
      }`}
    >
      {selectedTimelineSong ? (
        <TimelineRecorder
          song={selectedTimelineSong}
          onClose={onCloseSelectedTimelineSong ?? (() => {})}
          variant="player-side"
        />
      ) : null}
      <div
        className={`vote-song-player__device${
          screenMode === "lyrics" ? " vote-song-player__device--lyrics" : ""
        }`}
      >
        <div className="vote-song-player__screen">
          {screenMode === "lyrics" ? (
            <>
              <VoteSongLyricsPanel
                artistText={song ? song.artists.join(", ") : "Waiting for sync"}
                currentTimeMs={displayedCurrentSeconds * 1_000}
                lyrics={lyrics}
                onBackToPlayer={() => {
                  setScreenMode("now-playing");
                }}
                plainLyrics={plainLyrics ?? null}
                songTitle={song?.title ?? "No live song yet"}
                status={lyricsStatus}
              />
              <div className="vote-song-player__progress-block vote-song-player__progress-block--lyrics">
                <div className="vote-song-player__progress-bar">
                  <span
                    className="vote-song-player__progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="vote-song-player__time-row">
                  <span>{formatPlaybackTime(displayedCurrentSeconds)}</span>
                  <span>{formatPlaybackTime(displayedDurationSeconds)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="vote-song-player__screen-copy">
              <button
                type="button"
                className="vote-song-player__inline-toggle"
                onClick={() => {
                  setScreenMode("lyrics");
                }}
              >
                Lyrics
              </button>
              <div className="vote-song-player__screen-media">
                {song?.artworkUrl ? (
                  <img
                    src={song.artworkUrl}
                    alt={song.title}
                    className="vote-song-player__art"
                  />
                ) : (
                  <div className="vote-song-player__screen-fallback" />
                )}
              </div>
              <p className="playlist-workspace__songs-eyebrow">Now Playing</p>
              <h3 className="vote-song-player__title">
                <MarqueeText
                  align="center"
                  text={song?.title ?? "No live song yet"}
                />
              </h3>
              <p className="vote-song-player__subtitle">
                {song
                  ? song.artists.join(", ")
                  : "Join a room to sync the active song"}
              </p>
              <div className="vote-song-player__progress-block">
                <div className="vote-song-player__progress-bar">
                  <span
                    className="vote-song-player__progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="vote-song-player__time-row">
                  <span>{formatPlaybackTime(displayedCurrentSeconds)}</span>
                  <span>{formatPlaybackTime(displayedDurationSeconds)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {screenMode === "lyrics" ? null : (
          <>
            <div className="vote-song-player__wheel">
              <div className="vote-song-player__wheel-ring">
                <span className="vote-song-player__wheel-button vote-song-player__wheel-button--top">
                  OCTAVE
                </span>
                <button
                  type="button"
                  className="vote-song-player__wheel-button vote-song-player__wheel-button--left"
                  onClick={() => updateVolume(resolvedVolume - 8)}
                  aria-label="Lower volume"
                >
                  VOL-
                </button>
                <button
                  type="button"
                  className="vote-song-player__wheel-button vote-song-player__wheel-button--right"
                  onClick={() => updateVolume(resolvedVolume + 8)}
                  aria-label="Raise volume"
                >
                  VOL+
                </button>
                <span className="vote-song-player__wheel-room">
                  {code || "----"}
                </span>
                <div className="vote-song-player__wheel-center">
                  <span>VOL</span>
                  <strong>{resolvedVolume}</strong>
                </div>
              </div>
            </div>
          </>
        )}

      </div>

      <div ref={hostRef} className="vote-song-player__hidden-host" />
    </div>
  );
}

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        config: {
          events: {
            onReady: (event: { target: YouTubePlayer }) => void;
            onStateChange: (event: { data: number; target: YouTubePlayer }) => void;
          };
          height: string;
          playerVars: Record<string, number>;
          videoId: string;
          width: string;
        }
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeIframeApiPromise: Promise<void> | null = null;
const YOUTUBE_PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
} as const;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (youTubeIframeApiPromise) {
    return youTubeIframeApiPromise;
  }

  youTubeIframeApiPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    const previousCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube player could not be loaded."));
    document.head.appendChild(script);
  });

  return youTubeIframeApiPromise;
}

function destroyYouTubePlayer(
  playerRef: MutableRefObject<YouTubePlayer | null>,
  intervalRef: MutableRefObject<number | null>
) {
  stopPlayerProgressTracking(intervalRef);

  playerRef.current?.destroy();
  playerRef.current = null;
}

function stopPlayerProgressTracking(
  intervalRef: MutableRefObject<number | null>
) {
  if (intervalRef.current !== null) {
    window.cancelAnimationFrame(intervalRef.current);
    intervalRef.current = null;
  }
}

function startPlayerProgressTracking(
  player: YouTubePlayer,
  intervalRef: MutableRefObject<number | null>,
  {
    setCurrentSeconds,
    setDurationSeconds,
  }: {
    setCurrentSeconds: (value: number) => void;
    setDurationSeconds: (value: number) => void;
  }
) {
  if (intervalRef.current !== null) {
    window.cancelAnimationFrame(intervalRef.current);
  }

  const updateProgress = () => {
    try {
      const currentTime = player.getCurrentTime();
      const liveDuration = player.getDuration();

      if (Number.isFinite(currentTime)) {
        setCurrentSeconds(currentTime);
      }

      if (Number.isFinite(liveDuration) && liveDuration > 0) {
        setDurationSeconds(liveDuration);
      }
    } catch {
      // Ignore transient iframe timing errors.
    }

    intervalRef.current = window.requestAnimationFrame(updateProgress);
  };

  intervalRef.current = window.requestAnimationFrame(updateProgress);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

async function refreshActivePlaylist(
  code: string,
  setActiveCode: (code: string | null) => void,
  setActiveState: (state: ActivePlaylistState | null) => void,
  setError: (error: string | null) => void
) {
  const result = await syncActivePlaylistPlaybackAction(code);

  if (!result.ok) {
    setError(result.error);
    return;
  }

  if (!result.result) {
    setActiveCode(null);
    setActiveState(null);
    setError("This music session has ended.");
    return;
  }

  setActiveState(result.result);
  setError(null);
}

function getSongVideoId(song: PlaylistSong) {
  if (song.sourceId) {
    return song.sourceId;
  }

  if (!song.sourceUrl) {
    return null;
  }

  try {
    const url = new URL(song.sourceUrl);
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function getSongDestinationUrl(song: PlaylistSong) {
  if (song.sourceUrl) {
    return song.sourceUrl;
  }

  const videoId = getSongVideoId(song);

  if (!videoId) {
    return null;
  }

  return `https://music.youtube.com/watch?v=${videoId}`;
}

function getTopSongIds(songList: ActivePlaylistSongVote[]) {
  const topVote = Math.max(...songList.map((entry) => entry.vote), 0);

  if (topVote <= 0) {
    return [];
  }

  return songList
    .filter((entry) => entry.vote === topVote)
    .map((entry) => entry.songId);
}

function formatPlaybackTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(Math.floor(seconds), 0) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function MarqueeText({
  align = "start",
  durationScale = 1,
  gap = "1ch",
  overflowStrategy = "measure",
  text,
}: {
  align?: "center" | "end" | "start";
  durationScale?: number;
  gap?: string;
  overflowStrategy?: "length" | "measure";
  text: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const normalizedGap = gap.trim() === "0" ? "0px" : gap;
  const [overflowState, setOverflowState] = useState({
    duration: 0,
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
    let retryTimeoutId: number | null = null;

    const measure = () => {
      const containerWidth = Math.ceil(container.getBoundingClientRect().width);
      const textWidth = Math.ceil(
        textNode.scrollWidth || textNode.getBoundingClientRect().width
      );

      if (!containerWidth || !textWidth) {
        if (retryTimeoutId === null) {
          retryTimeoutId = window.setTimeout(() => {
            retryTimeoutId = null;
            scheduleMeasure();
          }, 80);
        }
        return;
      }

      const computedStyle = window.getComputedStyle(textNode);
      const fontSize = Number.parseFloat(computedStyle.fontSize) || 16;
      const letterSpacing =
        computedStyle.letterSpacing === "normal"
          ? 0
          : Number.parseFloat(computedStyle.letterSpacing) || 0;
      const estimatedCharacterWidth = Math.max(fontSize * 0.54 + letterSpacing, 1);
      const lengthCapacity = Math.max(
        Math.floor(containerWidth / estimatedCharacterWidth),
        0
      );
      const nextIsOverflowing =
        overflowStrategy === "length"
          ? text.length > lengthCapacity
          : textWidth > containerWidth + 1;
      const nextTravel = textWidth;
      const nextDuration = Math.max((textWidth + fontSize * 0.5) / 40, 5.4) * durationScale;

      setOverflowState((currentState) => {
        if (!nextIsOverflowing) {
          if (!currentState.isOverflowing) {
            return currentState;
          }

          return {
            duration: 0,
            isOverflowing: false,
            travel: 0,
          };
        }

        if (
          currentState.isOverflowing &&
          Math.abs(currentState.travel - nextTravel) < 1 &&
          Math.abs(currentState.duration - nextDuration) < 0.1
        ) {
          return currentState;
        }

        return {
          duration: nextDuration,
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
      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        scheduleMeasure();
      }, 120);
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
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [align, durationScale, overflowStrategy, text]);

  const marqueeStyle = overflowState.isOverflowing
    ? ({
        "--marquee-duration": `${overflowState.duration}s`,
        "--marquee-gap": normalizedGap,
        "--marquee-travel": `${overflowState.travel}px`,
      } as CSSProperties)
    : undefined;

  return (
    <span
      ref={containerRef}
      className={`marquee-text marquee-text--mode-loop marquee-text--align-${align}${
        overflowState.isOverflowing ? " is-overflowing" : ""
      }`}
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
