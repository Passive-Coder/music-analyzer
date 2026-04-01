/* eslint-disable @next/next/no-img-element */
"use client";

import {
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
import { SubwooferScene } from "@/app/components/SubwooferScene";
import type {
  ActivePlaylistSongVote,
  ActivePlaylistState,
  PlaylistSong,
} from "@/lib/playlist-types";
import { getConvexBrowserClient } from "@/lib/convex-browser-client";
import { api } from "@/convex/_generated/api";

type VoteSongWorkspaceProps = {
  defaultCode?: string | null;
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
  onVolumeChange,
  volumeLevel = 72,
}: VoteSongWorkspaceProps) {
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
  const [pressedKeyId, setPressedKeyId] = useState<string | null>(null);
  const [pressedBlackKeyId, setPressedBlackKeyId] = useState<string | null>(null);
  const [resultsViewStage, setResultsViewStage] = useState<
    "hidden" | "entering" | "visible" | "exiting"
  >("hidden");
  const lastSelectionKeyRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const resultsViewTimeoutRef = useRef<number | null>(null);
  const currentSong = activeState?.currentSong ?? null;
  const activeTopSongIds = useMemo(
    () => getTopSongIds(activeState?.songList ?? []),
    [activeState?.songList]
  );
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
  }, [activeCode, convexClient]);

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
    if (timelineSongs.length === 0) {
      setSelectedTimelineSongId(null);
      return;
    }

    setSelectedTimelineSongId((currentValue) =>
      currentValue &&
      timelineSongs.some((entry) => entry.song.id === currentValue)
        ? currentValue
        : null
    );
  }, [timelineSongs]);

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

  const hasJoinedRoom = activeCode !== null && activeState !== null;
  const hasEndedSession = previousResult !== null && !hasJoinedRoom;
  const isResultsVisible = resultsViewStage !== "hidden";
  const resultsSnapshot = activeState
    ? {
        batch: activeState.currentBatch,
        songList: activeState.songList,
        topSongIds: activeTopSongIds,
      }
    : previousResult;
  const toggleResultsView = () => {
    if (resultsViewTimeoutRef.current !== null) {
      window.clearTimeout(resultsViewTimeoutRef.current);
      resultsViewTimeoutRef.current = null;
    }

    if (resultsViewStage === "hidden") {
      setResultsViewStage("entering");
      resultsViewTimeoutRef.current = window.setTimeout(() => {
        setResultsViewStage("visible");
        resultsViewTimeoutRef.current = null;
      }, 920);
      return;
    }

    if (resultsViewStage === "visible") {
      setResultsViewStage("exiting");
      resultsViewTimeoutRef.current = window.setTimeout(() => {
        setResultsViewStage("hidden");
        resultsViewTimeoutRef.current = null;
      }, 760);
      return;
    }

    if (resultsViewStage === "entering") {
      setResultsViewStage("visible");
      return;
    }

    setResultsViewStage("hidden");
  };
  const handleSessionEnded = (message: string) => {
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
    setError(message);
  };

  return (
    <div
      className={`vote-song-workspace${
        hasJoinedRoom
          ? " vote-song-workspace--live"
          : hasEndedSession
            ? " vote-song-workspace--ended"
            : " vote-song-workspace--intro"
      }`}
    >
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

          <div className="vote-song-workspace__left">
            <div className="vote-song-workspace__section-header">
                <div>
                  <h3 className="playlist-workspace__songs-title">
                    Voting Options
                  </h3>
                </div>
                <div className="vote-song-workspace__header-side">
                  <button
                    type="button"
                    className="playlist-workspace__secondary vote-song-workspace__previous-button"
                    onClick={() => {
                      toggleResultsView();
                    }}
                  >
                    {isResultsVisible ? "Back To Voting" : "Show Results"}
                  </button>
                  <span className="playlist-workspace__pill">
                    One vote only
                  </span>
                  <span className="playlist-workspace__songs-count">
                    Change anytime before the song ends
                  </span>
                </div>
              </div>
            <div className="vote-song-workspace__card vote-song-workspace__card--vote">
              {error ? <p className="playlist-workspace__error">{error}</p> : null}

              {isResultsVisible && resultsSnapshot ? (
                <VoteSubwooferPanel
                  currentSongId={activeState.currentSongId}
                  selectedSongId={selectedSongId}
                  songList={resultsSnapshot.songList}
                  songs={resultsSnapshot.batch}
                  stage={resultsViewStage}
                  topSongIds={resultsSnapshot.topSongIds}
                />
              ) : (
                <div className="vote-song-workspace__piano-shell">
                  <div className="vote-song-workspace__piano-viewport">
                    <div className="vote-song-workspace__piano">
                      {WHITE_PIANO_KEYS.map((keyLabel, index) => {
                        const song = activeState.currentBatch[index] ?? null;
                        const voteCount =
                          song
                            ? activeState.songList.find((entry) => entry.songId === song.id)
                                ?.vote ?? 0
                            : 0;
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
                              <span className="vote-song-workspace__piano-key-label">
                                
                              </span>
                              <strong>
                                <MarqueeText text={song?.title ?? "Empty"} />
                              </strong>
                              <span>
                                <MarqueeText
                                  text={
                                    song
                                      ? isCurrentSong
                                        ? `Playing · ${voteCount} votes`
                                        : `${voteCount} votes`
                                      : "No song"
                                  }
                                />
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
                        >
                          <span className="vote-song-workspace__piano-black-label">
                            
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="vote-song-workspace__middle">
            <div className="vote-song-workspace__card vote-song-workspace__card--results">
              <div className="vote-song-workspace__section-header vote-song-workspace__section-header--compact">
                <div>
                  <h3 className="playlist-workspace__songs-title">Live Results</h3>
                </div>
              </div>

              <div className="vote-song-workspace__results-list">
                <VoteResultsList
                  currentSongId={activeState.currentSongId}
                  highlightSongIds={activeTopSongIds}
                  songList={activeState.songList}
                  songs={activeState.currentBatch}
                />
              </div>
            </div>
          </div>

          <div className="vote-song-workspace__right">
            <VoteSongPlayerPanel
              song={activeState.currentSong}
              startedAt={activeState.currentSongStartedAt}
              code={activeCode}
              onVolumeChange={onVolumeChange}
              selectedTimelineSong={selectedTimelineSong}
              onCloseSelectedTimelineSong={() => {
                setSelectedTimelineSongId(null);
              }}
              volumeLevel={volumeLevel}
            />
          </div>
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
  const voteMax = Math.max(...songList.map((entry) => entry.vote), 1);
  const baseVertices = songs.map((song, index) => {
    const angle = songs.length === 1 ? -90 : -90 + (360 / songs.length) * index;
    const radians = (angle * Math.PI) / 180;

    return {
      left: 50 + Math.cos(radians) * 31,
      song,
      top: 48 + Math.sin(radians) * 31,
    };
  });
  const positionedSongs = baseVertices.map(({ left, song, top }) => {
    const voteCount =
      songList.find((entry) => entry.songId === song.id)?.vote ?? 0;
    const voteRatio = voteCount / voteMax;

    return {
      left,
      song,
      top,
      voteCount,
      voteRatio,
    };
  });
  const skillOutlinePoints = baseVertices
    .map(({ left, top }) => `${left},${top}`)
    .join(" ");
  const wavePoints = positionedSongs
    .map(({ left, top, voteRatio }) =>
      scalePointFromCenter(left, top, 50, 48, 0.72 + voteRatio * 0.42)
    )
    .map(({ left, top }) => `${left},${top}`)
    .join(" ");
  const outerWavePoints = positionedSongs
    .map(({ left, top, voteRatio }) =>
      scalePointFromCenter(left, top, 50, 48, 0.94 + voteRatio * 0.56)
    )
    .map(({ left, top }) => `${left},${top}`)
    .join(" ");

  return (
    <div
      className={`vote-song-workspace__subwoofer-shell vote-song-workspace__subwoofer-shell--${stage}`}
    >
      <SubwooferScene stage={stage} />
      <div className="vote-song-workspace__subwoofer-graph" aria-hidden="true">
        <svg
          className="vote-song-workspace__skill-outline"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {positionedSongs.length > 1 ? (
            <>
              <polygon
                points={outerWavePoints}
                className="vote-song-workspace__skill-wave vote-song-workspace__skill-wave--outer"
              />
              <polygon
                points={wavePoints}
                className="vote-song-workspace__skill-wave vote-song-workspace__skill-wave--inner"
              />
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
            "--vote-skill-delay": `${index * 90}ms`,
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
                  <strong>{song.title}</strong>
                  <span>{voteCount} votes</span>
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
                <MarqueeText text={song.title} />
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
  onVolumeChange,
  onCloseSelectedTimelineSong,
  selectedTimelineSong,
  song,
  startedAt,
  volumeLevel = 72,
}: {
  code: string | null;
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
  const volumeRef = useRef(volumeLevel);
  const [volume, setVolume] = useState(volumeLevel);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [status, setStatus] = useState("Waiting for a live song...");
  const streamSongId = song?.id ?? null;
  const streamDurationMs = song?.durationMs ?? 0;
  const videoId = song ? getSongVideoId(song) : null;
  const fallbackDurationSeconds = song ? song.durationMs / 1000 : 0;
  const displayedCurrentSeconds = song && startedAt && videoId ? currentSeconds : 0;
  const displayedDurationSeconds =
    song && startedAt && videoId
      ? durationSeconds || fallbackDurationSeconds
      : fallbackDurationSeconds;
  const displayedStatus = !song
    ? "Waiting for a live song..."
    : !startedAt
      ? "Waiting for the live room clock..."
      : !videoId
        ? "This song cannot be streamed from YouTube Music."
        : status;

  useEffect(() => {
    return () => {
      destroyYouTubePlayer(playerRef, progressIntervalRef);
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;

    if (!player) {
      return;
    }

    player.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const clampedVolume = Math.max(0, Math.min(100, volumeLevel));

    volumeRef.current = clampedVolume;
    setVolume((currentVolume) =>
      currentVolume === clampedVolume ? currentVolume : clampedVolume
    );
  }, [volumeLevel]);

  useEffect(() => {
    if (!streamSongId || !startedAt || !hostRef.current || !videoId) {
      destroyYouTubePlayer(playerRef, progressIntervalRef);
      return;
    }

    let cancelled = false;

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
            setCurrentSeconds(offsetSeconds);
            setStatus("Live playback synced to the room.");
            progressIntervalRef.current = window.setInterval(() => {
              const currentTime = event.target.getCurrentTime();
              const liveDuration = event.target.getDuration();

              setCurrentSeconds(currentTime);

              if (Number.isFinite(liveDuration) && liveDuration > 0) {
                setDurationSeconds(liveDuration);
              }
            }, 500);
          },
          onStateChange: () => {
            setStatus("Live playback synced to the room.");
          },
        },
        height: "0",
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
        width: "0",
      });
    });

    return () => {
      cancelled = true;
      destroyYouTubePlayer(playerRef, progressIntervalRef);
    };
  }, [startedAt, streamDurationMs, streamSongId, videoId]);

  const progress =
    displayedDurationSeconds > 0
      ? Math.min((displayedCurrentSeconds / displayedDurationSeconds) * 100, 100)
      : 0;

  const updateVolume = (nextVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, nextVolume));
    volumeRef.current = clampedVolume;
    setVolume(clampedVolume);
    onVolumeChange?.(clampedVolume);
  };

  return (
    <div className="vote-song-player">
      {selectedTimelineSong ? (
        <TimelineRecorder
          song={selectedTimelineSong}
          onClose={onCloseSelectedTimelineSong ?? (() => {})}
          variant="player-side"
        />
      ) : null}
      <div className="vote-song-player__device">
        <div className="vote-song-player__screen">
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
          <div className="vote-song-player__screen-copy">
            <p className="playlist-workspace__songs-eyebrow">Now Playing</p>
            <h3 className="vote-song-player__title">
              {song?.title ?? "No live song yet"}
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
        </div>

        <div className="vote-song-player__wheel">
          <div className="vote-song-player__wheel-ring">
            <span className="vote-song-player__wheel-label vote-song-player__wheel-label--top">
              MENU
            </span>
            <button
              type="button"
              className="vote-song-player__wheel-button vote-song-player__wheel-button--left"
              onClick={() => updateVolume(volume - 8)}
              aria-label="Lower volume"
            >
              VOL -
            </button>
            <button
              type="button"
              className="vote-song-player__wheel-button vote-song-player__wheel-button--right"
              onClick={() => updateVolume(volume + 8)}
              aria-label="Raise volume"
            >
              VOL +
            </button>
            <span className="vote-song-player__wheel-label vote-song-player__wheel-label--bottom">
              LIVE
            </span>
            <div className="vote-song-player__wheel-center">
              <span>VOL</span>
              <strong>{volume}</strong>
            </div>
          </div>
        </div>

        <div className="vote-song-player__footer">
          <span>{displayedStatus}</span>
          {code ? <span>Room {code}</span> : null}
        </div>
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
            onStateChange: () => void;
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
  if (intervalRef.current !== null) {
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  playerRef.current?.destroy();
  playerRef.current = null;
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

function scalePointFromCenter(
  left: number,
  top: number,
  centerLeft: number,
  centerTop: number,
  scale: number
) {
  return {
    left: centerLeft + (left - centerLeft) * scale,
    top: centerTop + (top - centerTop) * scale,
  };
}

function formatPlaybackTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(Math.floor(seconds), 0) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
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
      const nextGap = Math.max(Math.round(containerWidth * 0.16), 28);
      const nextTravel = textWidth + nextGap;
      const nextDuration = Math.max(nextTravel / 38, 7.5);

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
