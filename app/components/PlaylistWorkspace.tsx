"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import {
  getGoogleSessionAction,
  signOutOfGoogleAction,
} from "@/app/actions/googleAuth";
import { syncActivePlaylistPlaybackAction } from "@/app/actions/activePlaylist";
import {
  abortPublishedPlaylistAction,
  advanceCurrentBatchAction,
  appendLoadedPlaylistAction,
  getOwnedPublishedPlaylistAction,
  publishPlaylistAction,
  updateUpcomingBatchSongAction,
  voteForCurrentBatchSongAction,
} from "@/app/actions/playlistPublishing";
import { GoogleSignInPanel } from "@/app/components/GoogleSignInPanel";
import { VoteSongWorkspace } from "@/app/components/VoteSongWorkspace";
import { getConvexBrowserClient } from "@/lib/convex-browser-client";
import type { GoogleSession } from "@/lib/google-session";
import type {
  PlaylistData,
  PlaylistSong,
  PublishedPlaylistRecord,
  SongwiseVote,
} from "@/lib/playlist-types";
import { api } from "@/convex/_generated/api";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
  mode?: "publish" | "vote";
  onPublish?: () => void;
  onVoteVolumeChange?: (volume: number) => void;
  voteVolumeLevel?: number;
};

type RequestState = "idle" | "loading";
type MutationState = "idle" | "publishing" | "syncing";
type AuthState = "loading" | "authenticated" | "unauthenticated";
type EditingTarget = {
  batchIndex: number;
  globalIndex: number;
  songIndex: number;
} | null;
type SongEntry = {
  index: number;
  song: PlaylistSong;
};
type BatchStatus = "completed" | "ongoing" | "upcoming";

const BATCH_SIZE = 5;
const EXAMPLE_PLAYLIST_ID = "example-fallback-playlist";
const EXAMPLE_PLAYLIST_TITLE = "Example Playlist";
const EXAMPLE_PLAYLIST: PlaylistData = {
  description: "Fallback data shown when the YouTube playlist request fails.",
  id: EXAMPLE_PLAYLIST_ID,
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
  sourceUrl: "https://music.youtube.com/",
  title: EXAMPLE_PLAYLIST_TITLE,
};

export function PlaylistWorkspace({
  isVisible = false,
  mode = "publish",
  onPublish,
  onVoteVolumeChange,
  voteVolumeLevel = 72,
}: PlaylistWorkspaceProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authSession, setAuthSession] = useState<GoogleSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadedPlaylists, setLoadedPlaylists] = useState<PlaylistData[]>([]);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [batchSongs, setBatchSongs] = useState<PlaylistSong[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [songwiseVote, setSongwiseVote] = useState<SongwiseVote[]>([]);
  const [songsPlayedBefore, setSongsPlayedBefore] = useState<PlaylistSong[]>(
    []
  );
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [creatorToken, setCreatorToken] = useState<string | null>(null);
  const [openingSongId, setOpeningSongId] = useState<string | null>(null);
  const [publishedCurrentSong, setPublishedCurrentSong] = useState<PlaylistSong | null>(
    null
  );
  const [publishedCurrentSongStartedAt, setPublishedCurrentSongStartedAt] = useState<
    string | null
  >(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [mutationState, setMutationState] = useState<MutationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const [isSelectingOpeningSong, setIsSelectingOpeningSong] = useState(false);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [loadedPlaylistCursor, setLoadedPlaylistCursor] = useState(0);
  const [activeLoadedPlaylistId, setActiveLoadedPlaylistId] = useState<
    string | null
  >(null);
  const [playbackSong, setPlaybackSong] = useState<PlaylistSong | null>(null);
  const [playbackToken, setPlaybackToken] = useState(0);
  const convexClient = useMemo(() => getConvexBrowserClient(), []);

  const isVoteMode = mode === "vote";
  const isAuthenticated = authState === "authenticated";
  const isPublished = publishedCode !== null;
  const isCreator = isPublished && creatorToken !== null;
  const hasSongs = songs.length > 0;
  const hasBatchSongs = batchSongs.length > 0;
  const allSongEntries = songs.map((song, index) => ({ index, song }));
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSongEntries = allSongEntries.filter(({ song }) => {
    if (!normalizedSearchQuery) {
      return true;
    }

    const haystack = `${song.title} ${song.artists.join(" ")} ${song.originPlaylistTitle ?? ""}`.toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  });
  const songBatches = chunkSongEntries(
    batchSongs.map((song, index) => ({ index, song })),
    BATCH_SIZE
  );
  const displayedBatchIndex = isVoteMode
    ? Math.min(currentBatchIndex, Math.max(songBatches.length - 1, 0))
    : activeBatchIndex;
  const activeBatch = songBatches[displayedBatchIndex] ?? null;
  const openingSong = songs.find((song) => song.id === openingSongId) ?? songs[0] ?? null;
  const activeBatchStatus = getBatchStatus(
    displayedBatchIndex,
    currentBatchIndex,
    songBatches.length
  );
  const editingTargetSong =
    editingTarget !== null ? batchSongs[editingTarget.globalIndex] ?? null : null;
  const selectionMode = isSelectingOpeningSong
    ? "opening"
    : editingTarget !== null
      ? "batch"
      : null;
  const playbackEmbedUrl = getSongEmbedUrl(playbackSong, playbackToken);
  const busy = requestState !== "idle" || mutationState !== "idle";
  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted || !isVisible) {
      return;
    }

    let isCancelled = false;

    const loadSession = async () => {
      setAuthState("loading");
      setAuthError(null);
      const result = await getGoogleSessionAction();

      if (isCancelled) {
        return;
      }

      if (!result.ok) {
        setAuthSession(null);
        setAuthState("unauthenticated");
        setAuthError(result.error);
        return;
      }

      setAuthSession(result.session);
      setAuthState(result.session ? "authenticated" : "unauthenticated");
    };

    void loadSession();

    return () => {
      isCancelled = true;
    };
  }, [hasMounted, isVisible]);

  useEffect(() => {
    if (
      !hasMounted ||
      !isVisible ||
      isVoteMode ||
      authState !== "authenticated" ||
      !authSession
    ) {
      return;
    }

    let isCancelled = false;

    const loadOwnedSession = async () => {
      const result = await getOwnedPublishedPlaylistAction();

      if (isCancelled || !result.ok) {
        return;
      }

      if (!result.result) {
        setCreatorToken(null);
        clearPublishedSession();
        return;
      }

      applyPublishedRecord(
        result.result.record,
        result.result.record.code,
        result.result.creatorToken
      );
    };

    void loadOwnedSession();

    return () => {
      isCancelled = true;
    };
  }, [authSession, authState, hasMounted, isVisible, isVoteMode]);

  useEffect(() => {
    if (!loadedPlaylists.length) {
      if (loadedPlaylistCursor !== 0) {
        setLoadedPlaylistCursor(0);
      }

      if (activeLoadedPlaylistId !== null) {
        setActiveLoadedPlaylistId(null);
      }

      return;
    }

    const nextCursor = Math.min(
      loadedPlaylistCursor,
      Math.max(loadedPlaylists.length - 1, 0)
    );

    if (nextCursor !== loadedPlaylistCursor) {
      setLoadedPlaylistCursor(nextCursor);
    }

    const activeExists = activeLoadedPlaylistId
      ? loadedPlaylists.some((playlist) => playlist.id === activeLoadedPlaylistId)
      : false;

    if (!activeExists) {
      setActiveLoadedPlaylistId(loadedPlaylists[nextCursor]?.id ?? loadedPlaylists[0].id);
    }
  }, [activeLoadedPlaylistId, loadedPlaylistCursor, loadedPlaylists]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    if (!songBatches.length) {
      if (activeBatchIndex !== 0) {
        setActiveBatchIndex(0);
      }

      if (currentBatchIndex !== 0) {
        setCurrentBatchIndex(0);
      }

      setSongwiseVote([]);
      return;
    }

    const maxBatchIndex = songBatches.length - 1;

    if (activeBatchIndex > maxBatchIndex) {
      setActiveBatchIndex(maxBatchIndex);
    }

    if (!isPublished && currentBatchIndex > maxBatchIndex) {
      setCurrentBatchIndex(maxBatchIndex);
    }
  }, [
    activeBatchIndex,
    currentBatchIndex,
    hasMounted,
    isPublished,
    songBatches.length,
  ]);

  useEffect(() => {
    if (isPublished) {
      return;
    }

    if (!songs.length) {
      if (openingSongId !== null) {
        setOpeningSongId(null);
      }
      return;
    }

    const nextOpeningSongId =
      songs.find((song) => song.id === openingSongId)?.id ??
      songs[0]?.id ??
      null;

    if (nextOpeningSongId !== openingSongId) {
      setOpeningSongId(nextOpeningSongId);
    }
  }, [isPublished, openingSongId, songs]);

  useEffect(() => {
    if (!hasMounted || isPublished) {
      return;
    }

    const localCurrentBatch =
      chunkSongEntries(
        batchSongs.map((song, index) => ({ index, song })),
        BATCH_SIZE
      )[currentBatchIndex] ?? [];
    setSongwiseVote(createVoteSnapshot(localCurrentBatch));
  }, [batchSongs, currentBatchIndex, hasMounted, isPublished]);

  const clearPublishedSession = () => {
    setPublishedCode(null);
    setCreatorToken(null);
    setPublishedCurrentSong(null);
    setPublishedCurrentSongStartedAt(null);
    setSongwiseVote([]);
    setSongsPlayedBefore([]);
    setError(null);
  };

  const applyPublishedRecord = (
      record: PublishedPlaylistRecord,
    nextCode?: string | null,
    nextCreatorToken?: string | null,
    nextActiveBatchIndex?: number
  ) => {
    const flattenedBatchSongs = flattenSongBatches(record.batches);
    const resolvedActiveBatchIndex =
      typeof nextActiveBatchIndex === "number"
        ? Math.min(
            Math.max(nextActiveBatchIndex, 0),
            Math.max(record.batches.length - 1, 0)
          )
        : record.batches.length > 0
          ? Math.min(record.currentBatchIndex, record.batches.length - 1)
          : 0;
    const fallbackActiveBatchIndex =
      record.batches.length > 0
        ? Math.min(record.currentBatchIndex, record.batches.length - 1)
        : 0;

    setLoadedPlaylists(record.loadedPlaylists);
    setSongs(record.librarySongs);
    setBatchSongs(flattenedBatchSongs);
    setCurrentBatchIndex(record.currentBatchIndex);
    setSongwiseVote(record.songwiseVote);
    setSongsPlayedBefore(record.songsPlayedBefore);
    setPublishedCurrentSong(record.currentSong);
    setPublishedCurrentSongStartedAt(record.currentSongStartedAt);
    setOpeningSongId(record.currentSong?.id ?? null);
    setIsSelectingOpeningSong(false);
    setEditingTarget(null);
    setActiveBatchIndex(
      Number.isFinite(resolvedActiveBatchIndex)
        ? resolvedActiveBatchIndex
        : fallbackActiveBatchIndex
    );
    setPublishedCode(nextCode ?? record.code);
    const nextLoadedPlaylistId =
      record.loadedPlaylists.some(
        (playlist) => playlist.id === activeLoadedPlaylistId
      )
        ? activeLoadedPlaylistId
        : record.loadedPlaylists.at(-1)?.id ?? null;
    const nextLoadedPlaylistIndex = nextLoadedPlaylistId
      ? record.loadedPlaylists.findIndex(
          (playlist) => playlist.id === nextLoadedPlaylistId
        )
      : 0;
    setActiveLoadedPlaylistId(nextLoadedPlaylistId);
    setLoadedPlaylistCursor(Math.max(nextLoadedPlaylistIndex, 0));

    if (typeof nextCreatorToken === "string") {
      setCreatorToken(nextCreatorToken);
    }
  };

  useEffect(() => {
    if (!publishedCode) {
      return;
    }

    const watch = convexClient.watchQuery(api.playlists.getPublishedPlaylist, {
      code: publishedCode,
    });

    const applySnapshot = () => {
      try {
        const snapshot = watch.localQueryResult();

        if (typeof snapshot === "undefined") {
          return;
        }

        if (snapshot === null) {
          clearPublishedSession();
          return;
        }

        applyPublishedRecord(snapshot, snapshot.code, undefined, activeBatchIndex);
      } catch (watchError) {
        setError(
          watchError instanceof Error
            ? watchError.message
            : "The published session could not be refreshed."
        );
      }
    };

    applySnapshot();
    const unsubscribe = watch.onUpdate(applySnapshot);

    return () => {
      unsubscribe();
    };
  }, [activeBatchIndex, convexClient, publishedCode]);

  useEffect(() => {
    if (
      !publishedCode ||
      !publishedCurrentSong ||
      !publishedCurrentSongStartedAt ||
      !isCreator ||
      !isVisible
    ) {
      return;
    }

    const startedAtMs = Date.parse(publishedCurrentSongStartedAt);
    const currentSongEndAt =
      (Number.isFinite(startedAtMs) ? startedAtMs : Date.now()) +
      publishedCurrentSong.durationMs;
    const delay = Math.max(currentSongEndAt - Date.now() + 350, 350);
    const timeoutId = window.setTimeout(() => {
      void syncActivePlaylistPlaybackAction(publishedCode);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isCreator,
    isVisible,
    publishedCode,
    publishedCurrentSong,
    publishedCurrentSongStartedAt,
  ]);

  const handleLoadPlaylist = async () => {
    setRequestState("loading");
    setError(null);

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

      const examplePlaylistIndex = loadedPlaylists.findIndex(
        (playlist) => playlist.id === EXAMPLE_PLAYLIST_ID
      );
      const shouldReplaceExamplePlaylist =
        !publishedCode && !creatorToken && examplePlaylistIndex >= 0;
      const normalizedPlaylist = normalizePlaylistForWorkspace(
        payload.playlist,
        shouldReplaceExamplePlaylist ? examplePlaylistIndex : loadedPlaylists.length
      );

      if (
        loadedPlaylists.some(
          (playlist, playlistIndex) =>
            playlist.id === normalizedPlaylist.id &&
            (!shouldReplaceExamplePlaylist ||
              playlistIndex !== examplePlaylistIndex)
        )
      ) {
        throw new Error("That playlist is already in the loaded list.");
      }

      if (publishedCode && creatorToken) {
        const result = await appendLoadedPlaylistAction({
          code: publishedCode,
          creatorToken,
          playlist: normalizedPlaylist,
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        applyPublishedRecord(result.result, undefined, undefined, activeBatchIndex);
      } else {
        if (shouldReplaceExamplePlaylist) {
          setLoadedPlaylists((currentPlaylists) =>
            currentPlaylists.map((playlist, playlistIndex) =>
              playlistIndex === examplePlaylistIndex ? normalizedPlaylist : playlist
            )
          );
          setSongs((currentSongs) =>
            replacePlaylistSongs(
              currentSongs,
              EXAMPLE_PLAYLIST_ID,
              normalizedPlaylist.songs
            )
          );
          setBatchSongs((currentSongs) =>
            replacePlaylistSongs(
              currentSongs,
              EXAMPLE_PLAYLIST_ID,
              normalizedPlaylist.songs
            )
          );
          setCurrentBatchIndex(0);
          setActiveBatchIndex(0);
          setSongsPlayedBefore([]);
          setIsSelectingOpeningSong(false);
          setEditingTarget(null);
        } else {
          setLoadedPlaylists((currentPlaylists) => [
            ...currentPlaylists,
            normalizedPlaylist,
          ]);
          setSongs((currentSongs) => [...currentSongs, ...normalizedPlaylist.songs]);
        }
      }

      setActiveLoadedPlaylistId(normalizedPlaylist.id);
      setLoadedPlaylistCursor(
        shouldReplaceExamplePlaylist ? examplePlaylistIndex : loadedPlaylists.length
      );
      setPlaylistUrl("");
      setPlaybackSong(null);
      setError(null);
    } catch (loadError) {
      const fallbackPlaylist = normalizePlaylistForWorkspace(
        EXAMPLE_PLAYLIST,
        loadedPlaylists.length
      );
      const fallbackMessage =
        loadError instanceof Error
          ? `${loadError.message} Showing example playlist data instead.`
          : "Playlist loading failed. Showing example playlist data instead.";

      if (!loadedPlaylists.length) {
        setLoadedPlaylists([fallbackPlaylist]);
        setSongs(fallbackPlaylist.songs);
        setActiveLoadedPlaylistId(fallbackPlaylist.id);
        setLoadedPlaylistCursor(0);
      }

      setError(fallbackMessage);
    } finally {
      setRequestState("idle");
    }
  };

  const playSong = (song: PlaylistSong) => {
    const nextPlaybackToken = Date.now();
    const embedUrl = getSongEmbedUrl(song, nextPlaybackToken);

    if (!embedUrl) {
      const fallbackUrl = getSongPlaybackUrl(song);

      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }

      return;
    }

    setPlaybackSong(song);
    setPlaybackToken(nextPlaybackToken);
  };

  const handlePublishPlaylist = async () => {
    if (!hasBatchSongs) {
      return;
    }

    if (!openingSong) {
      setError("Choose the first song to start the room before publishing.");
      return;
    }

    setMutationState("publishing");
    setError(null);

    const result = await publishPlaylistAction({
      batchSongs,
      currentBatchIndex: 0,
      initialSongId: openingSong.id,
      librarySongs: songs,
      loadedPlaylists,
    });

    setMutationState("idle");

    if (!result.ok) {
      setError(result.error);
      return;
    }

    applyPublishedRecord(
      result.result.record,
      result.result.code,
      result.result.creatorToken
    );
    onPublish?.();
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    if (isPublished) {
      return;
    }

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
    if (isPublished) {
      return;
    }

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
    if (!songs.length || isPublished) {
      return;
    }

    setEditingTarget(null);
    setIsSelectingOpeningSong(false);
    setCurrentBatchIndex(0);
    setActiveBatchIndex(0);
    setSongsPlayedBefore([]);
    setBatchSongs([...songs]);
  };

  const handleRemoveLoadedPlaylist = (playlistId: string) => {
    if (isPublished) {
      return;
    }

    setLoadedPlaylists((currentPlaylists) =>
      currentPlaylists.filter((playlist) => playlist.id !== playlistId)
    );
    setSongs((currentSongs) =>
      currentSongs.filter((song) => song.originPlaylistId !== playlistId)
    );
    setBatchSongs((currentSongs) =>
      currentSongs.filter((song) => song.originPlaylistId !== playlistId)
    );
    setSongsPlayedBefore((currentSongs) =>
      currentSongs.filter((song) => song.originPlaylistId !== playlistId)
    );
    setPlaybackSong((currentSong) =>
      currentSong?.originPlaylistId === playlistId ? null : currentSong
    );
    setEditingTarget(null);
    setIsSelectingOpeningSong(false);
    setCurrentBatchIndex(0);
    setActiveBatchIndex(0);
    setError(null);
  };

  const selectReplacementSong = async (sourceIndex: number) => {
    if (editingTarget === null) {
      return;
    }

    const sourceSong = songs[sourceIndex];

    if (!sourceSong) {
      return;
    }

    setMutationState("syncing");
    setError(null);

    if (publishedCode && creatorToken) {
      const result = await updateUpcomingBatchSongAction({
        batchIndex: editingTarget.batchIndex,
        code: publishedCode,
        creatorToken,
        replacementSong: sourceSong,
        songIndex: editingTarget.songIndex,
      });

      setMutationState("idle");

      if (!result.ok) {
        setError(result.error);
        return;
      }

      applyPublishedRecord(result.result, undefined, undefined, activeBatchIndex);
      setEditingTarget(null);
      return;
    }

    setBatchSongs((currentSongs) => {
      if (
        editingTarget.globalIndex < 0 ||
        editingTarget.globalIndex >= currentSongs.length
      ) {
        return currentSongs;
      }

      const nextSongs = [...currentSongs];
      nextSongs[editingTarget.globalIndex] = sourceSong;

      return nextSongs;
    });
    setEditingTarget(null);
    setMutationState("idle");
  };

  const handleVoteForSong = async (songIndex: number) => {
    if (!hasBatchSongs || activeBatchStatus !== "ongoing") {
      return;
    }

    if (!publishedCode) {
      setSongwiseVote((currentVotes) =>
        currentVotes.map((vote, voteIndex) => {
          if (voteIndex !== songIndex) {
            return vote;
          }

          const voteKey = String(songIndex + 1);
          return {
            [voteKey]: (vote[voteKey] ?? 0) + 1,
          };
        })
      );
      return;
    }

    setMutationState("syncing");
    setError(null);

    const result = await voteForCurrentBatchSongAction({
      code: publishedCode,
      songIndex,
    });

    setMutationState("idle");

    if (!result.ok) {
      setError(result.error);
      return;
    }

    applyPublishedRecord(result.result, undefined, undefined, activeBatchIndex);
  };

  const handleAdvanceBatch = async () => {
    if (!songBatches.length || currentBatchIndex >= songBatches.length) {
      return;
    }

    if (publishedCode && creatorToken) {
      setMutationState("syncing");
      setError(null);

      const result = await advanceCurrentBatchAction({
        code: publishedCode,
        creatorToken,
      });

      setMutationState("idle");

      if (!result.ok) {
        setError(result.error);
        return;
      }

      applyPublishedRecord(result.result);
      return;
    }

    const currentBatch = songBatches[currentBatchIndex] ?? [];
    const nextBatchIndex = Math.min(currentBatchIndex + 1, songBatches.length);

    setSongsPlayedBefore((currentSongsPlayedBefore) => [
      ...currentSongsPlayedBefore,
      ...currentBatch.map(({ song }) => song),
    ]);
    setCurrentBatchIndex(nextBatchIndex);
    setActiveBatchIndex(
      songBatches.length > 0
        ? Math.min(nextBatchIndex, songBatches.length - 1)
        : 0
    );
  };

  const handleAbortSession = async () => {
    if (!publishedCode || !creatorToken) {
      return;
    }

    setMutationState("syncing");
    setError(null);

    const result = await abortPublishedPlaylistAction({
      code: publishedCode,
      creatorToken,
    });

    setMutationState("idle");

    if (!result.ok) {
      setError(result.error);
      return;
    }

    clearPublishedSession();
  };

  const handleBatchSongClick = (song: PlaylistSong) => {
    playSong(song);
  };

  const handleLibrarySongClick = (song: PlaylistSong, index: number) => {
    if (!isVoteMode && isSelectingOpeningSong) {
      setOpeningSongId(song.id);
      setIsSelectingOpeningSong(false);
      return;
    }

    if (!isVoteMode && editingTarget !== null) {
      void selectReplacementSong(index);
      return;
    }

    playSong(song);
  };

  const handleStartOpeningSelection = () => {
    setEditingTarget(null);
    setIsSelectingOpeningSong(true);
  };

  const handleStartBatchSelection = (target: EditingTarget) => {
    setIsSelectingOpeningSong(false);
    setEditingTarget(target);
  };

  const handleCancelSelection = () => {
    setIsSelectingOpeningSong(false);
    setEditingTarget(null);
  };

  const handleSignedIn = (session: GoogleSession) => {
    setAuthSession(session);
    setAuthState("authenticated");
    setAuthError(null);
  };

  const handleSignOut = async () => {
    const result = await signOutOfGoogleAction();

    if (!result.ok) {
      setAuthError(result.error);
      return;
    }

    setAuthSession(null);
    setAuthState("unauthenticated");
  };

  if (!hasMounted) {
    return null;
  }

  return (
    <section
          className={`playlist-workspace playlist-workspace--${mode}${
            isVisible ? " is-visible" : " is-hidden"
          }`}
      aria-hidden={!isVisible}
    >
      {isVoteMode ? (
        <VoteSongWorkspace
          defaultCode={publishedCode}
          onVolumeChange={onVoteVolumeChange}
          volumeLevel={voteVolumeLevel}
        />
      ) : !isAuthenticated ? (
        <div className="playlist-workspace__auth-layout">
          <aside className="playlist-workspace__songs-pane playlist-workspace__songs-pane--auth">
            <div className="playlist-workspace__header playlist-workspace__header--meta">
              <div className="playlist-workspace__brand">
                <div className="playlist-workspace__brand-copy">
                  <p className="playlist-workspace__eyebrow">YouTube</p>
                  <div className="playlist-workspace__brand-row">
                    <YouTubeGlyph />
                    <h2 className="playlist-workspace__title">
                      {isVoteMode ? "Choose Song" : "Playlist"}
                    </h2>
                  </div>
                </div>
              </div>
            </div>

            {authState === "loading" ? (
              <div className="playlist-workspace__auth-card">
                <p className="playlist-workspace__songs-eyebrow">
                  Google Sign-In
                </p>
                <h3 className="playlist-workspace__songs-title">
                  Checking your Google session
                </h3>
                <p className="playlist-workspace__copy">
                  Hold on while Octave checks whether you are already signed in.
                </p>
              </div>
            ) : (
              <GoogleSignInPanel mode={mode} onSignedIn={handleSignedIn} />
            )}

            {authError ? (
              <p className="playlist-workspace__error">{authError}</p>
            ) : null}
          </aside>
        </div>
      ) : (
        <>
      <div className="playlist-workspace__layout">
        <div className="playlist-workspace__panel">
          {!isVoteMode ? (
            <div className="playlist-workspace__loader">
              <label className="playlist-workspace__field">
                <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center'}}>
                    <span className="playlist-workspace__label">
                    YouTube Playlist Link
                  </span>
                  <span className="playlist-workspace__pill">
                    Signed in as {authSession?.email}
                  </span>
                </div>
                <input
                  className="playlist-workspace__input"
                  type="url"
                  value={playlistUrl}
                  onChange={(event) => setPlaylistUrl(event.target.value)}
                  placeholder="https://music.youtube.com/playlist?list=..."
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
          ) : null}

          {publishedCode ? (
            <div className="playlist-workspace__live-bar">
              <div>
                <p className="playlist-workspace__meta-label">Playlist Code</p>
                <p className="playlist-workspace__live-code">{publishedCode}</p>
              </div>
              <div className="playlist-workspace__live-now-playing">
                <p className="playlist-workspace__meta-label">Now Playing</p>
                <strong className="playlist-workspace__live-song">
                  <MarqueeText
                    text={publishedCurrentSong?.title ?? "Waiting to start"}
                  />
                </strong>
                <p className="playlist-workspace__live-meta">
                  <MarqueeText
                    text={
                      publishedCurrentSong
                        ? formatSongMeta(publishedCurrentSong)
                        : currentBatchIndex < songBatches.length
                          ? `Voting is open for batch ${currentBatchIndex + 1}.`
                          : "No vote batch is active right now."
                    }
                  />
                </p>
              </div>
              <div className="playlist-workspace__live-stats">
                <span className="playlist-workspace__pill">
                  {songsPlayedBefore.length} played
                </span>
                <span className="playlist-workspace__pill">
                  {songBatches.length
                    ? currentBatchIndex < songBatches.length
                      ? `Batch ${currentBatchIndex + 1}/${songBatches.length} voting`
                      : "No vote batch left"
                    : "0/0 current"}
                </span>
                {isCreator ? (
                  <button
                    type="button"
                    className="playlist-workspace__banner-button playlist-workspace__abort-button"
                    onClick={handleAbortSession}
                    disabled={busy}
                  >
                    Abort
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? <p className="playlist-workspace__error">{error}</p> : null}

          {!isVoteMode && !isPublished && hasSongs ? (
            <div className="playlist-workspace__opening-picker">
              <div className="playlist-workspace__opening-picker-copy">
                <div className="playlist-workspace__opening-picker-heading">
                  <p className="playlist-workspace__songs-eyebrow">Opening song</p>
                  <button
                    type="button"
                    className={`playlist-workspace__banner-button playlist-workspace__selection-button${
                      isSelectingOpeningSong
                        ? " playlist-workspace__selection-button--active"
                        : ""
                    }`}
                    onClick={handleStartOpeningSelection}
                    disabled={busy}
                  >
                    {isSelectingOpeningSong ? "Selecting" : "Select"}
                  </button>
                </div>
                <div className="playlist-workspace__opening-preview">
                  <strong className="playlist-workspace__opening-preview-title">
                    {openingSong ? (
                      <MarqueeText text={openingSong.title} />
                    ) : (
                      "Select the first song"
                    )}
                  </strong>
                  <span className="playlist-workspace__opening-preview-meta">
                    {openingSong ? (
                      <MarqueeText text={formatSongMeta(openingSong)} />
                    ) : (
                      "Create batches to choose the opener."
                    )}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="playlist-workspace__batch-pane">
            <div className="playlist-workspace__songs-header">
              <div>
                <p className="playlist-workspace__songs-eyebrow">Batches</p>
                <h3 className="playlist-workspace__songs-title playlist-workspace__songs-title--compact">
                  {isVoteMode ? "Vote For The Next Song" : "Ordered Groups Of 5"}
                </h3>
              </div>
              <div className="playlist-workspace__batch-nav">
                <p className="playlist-workspace__songs-count">
                  {hasBatchSongs
                    ? `Batch ${displayedBatchIndex + 1} of ${songBatches.length}`
                    : "0 batches"}
                </p>
                <div className="playlist-workspace__batch-nav-tools">
                  {!isVoteMode ? (
                    <button
                      type="button"
                      className="playlist-workspace__secondary playlist-workspace__secondary--compact"
                      onClick={handleAdvanceBatch}
                      disabled={
                        !songBatches.length ||
                        busy ||
                        (isPublished && !isCreator) ||
                        currentBatchIndex >= songBatches.length
                      }
                    >
                      Advance
                    </button>
                  ) : null}
                  {!isVoteMode ? (
                    <div className="playlist-workspace__batch-buttons">
                      <button
                        type="button"
                        className="playlist-song-card__button"
                        onClick={() =>
                          setActiveBatchIndex((currentIndex) =>
                            Math.max(currentIndex - 1, 0)
                          )
                        }
                        disabled={!hasBatchSongs || displayedBatchIndex === 0}
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
                          displayedBatchIndex === songBatches.length - 1
                        }
                        aria-label="Next batch"
                      >
                        &gt;
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="playlist-workspace__batch-scroll">
              {hasBatchSongs && activeBatch ? (
                <section className="playlist-batch">
                  <div className="playlist-batch__header">
                    <div className="playlist-batch__meta">
                      <p className="playlist-batch__label">
                        Batch {displayedBatchIndex + 1}
                      </p>
                      <p
                        className={`playlist-batch__status-pill playlist-batch__status-pill--${activeBatchStatus}`}
                      >
                        {formatBatchStatus(activeBatchStatus)}
                      </p>
                    </div>
                    <p className="playlist-batch__range">
                      {String(activeBatch[0].index + 1).padStart(2, "0")}-
                      {String(
                        activeBatch[activeBatch.length - 1].index + 1
                      ).padStart(2, "0")}
                    </p>
                  </div>

                  <div className="playlist-batch__list">
                    {activeBatch.map(({ song, index }, songIndex) => {
                      const isEditingTarget =
                        editingTarget?.globalIndex === index;
                      const isLiveCurrentSong = publishedCurrentSong?.id === song.id;
                      const voteCount = getVoteCount(songwiseVote, songIndex);
                      const canSelectBatchSong =
                        !isVoteMode &&
                        (!isPublished || (activeBatchStatus === "upcoming" && isCreator));

                      return (
                        <article
                          key={`${song.id}-${index}`}
                          className={`playlist-song-card${
                            isEditingTarget ? " is-editing" : ""
                          }${isLiveCurrentSong ? " is-live-current" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleBatchSongClick(song)}
                          onKeyDown={(event) =>
                            handleSongCardKeyDown(event, () =>
                              handleBatchSongClick(song)
                            )
                          }
                        >
                          <div className="playlist-song-card__order">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="playlist-song-card__body">
                            <h4 className="playlist-song-card__title">
                              <MarqueeText text={song.title} />
                            </h4>
                            <p className="playlist-song-card__meta">
                              <MarqueeText text={formatSongMeta(song)} />
                            </p>
                          </div>
                          <div className="playlist-song-card__side">
                            <div className="playlist-song-card__duration">
                              {formatDuration(song.durationMs)}
                            </div>
                            <div className="playlist-song-card__controls">
                              <button
                                type="button"
                                className="playlist-song-card__play-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  playSong(song);
                                }}
                                aria-label={`Play ${song.title}`}
                              >
                                ▶
                              </button>
                              {activeBatchStatus === "ongoing" && isPublished ? (
                                <>
                                  <button
                                    type="button"
                                    className="playlist-song-card__button playlist-song-card__button--wide"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleVoteForSong(songIndex);
                                    }}
                                    disabled={mutationState !== "idle"}
                                  >
                                    Vote
                                  </button>
                                  <span className="playlist-song-card__pill">
                                    {voteCount} votes
                                  </span>
                                </>
                              ) : null}
                              {canSelectBatchSong ? (
                                <button
                                  type="button"
                                  className={`playlist-song-card__button playlist-song-card__button--wide${
                                    isEditingTarget
                                      ? " playlist-song-card__button--active"
                                      : ""
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleStartBatchSelection({
                                      batchIndex: displayedBatchIndex,
                                      globalIndex: index,
                                      songIndex,
                                    });
                                  }}
                                >
                                  {isEditingTarget ? "Selecting" : "Select"}
                                </button>
                              ) : null}
                              {isLiveCurrentSong ? (
                                <span className="playlist-song-card__pill playlist-song-card__pill--live">
                                  Playing Now
                                </span>
                              ) : null}
                              {activeBatchStatus === "completed" && !isLiveCurrentSong ? (
                                <span className="playlist-song-card__pill">
                                  Played
                                </span>
                              ) : null}
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
                    Load playlists, order the full song list, then create
                    batches of 5 before publishing.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="playlist-workspace__songs-pane">
          <div className="playlist-workspace__session-bar">
            <button
              type="button"
              className="playlist-workspace__secondary playlist-workspace__secondary--compact"
              onClick={() => {
                void handleSignOut();
              }}
            >
              Sign Out
            </button>
          </div>
          <div className="playlist-workspace__header playlist-workspace__header--meta">
            <div className="playlist-workspace__brand">
              <div className="playlist-workspace__brand-copy">
                <p className="playlist-workspace__eyebrow">YouTube</p>
                <div className="playlist-workspace__brand-row">
                  <YouTubeGlyph />
                  <h2 className="playlist-workspace__title">
                    {isVoteMode ? "Choose Song" : "Playlist"}
                  </h2>
                </div>
              </div>
            </div>
          </div>

          {loadedPlaylists.length ? (
            <div className="playlist-workspace__loaded-shell">
              <div className="playlist-workspace__songs-header playlist-workspace__songs-header--tight">
                <div>
                  <p className="playlist-workspace__songs-eyebrow">
                    Loaded Playlists
                  </p>
                  <h3 className="playlist-workspace__songs-title playlist-workspace__songs-title--compact">
                    Added Sources
                  </h3>
                </div>
                <p className="playlist-workspace__songs-count">
                  {loadedPlaylists.length} playlists
                </p>
              </div>
              <div className="playlist-workspace__playlist-carousel-shell">
                <button
                  type="button"
                  className="playlist-song-card__button playlist-workspace__carousel-button"
                  onClick={() =>
                    setLoadedPlaylistCursor((currentIndex) =>
                      Math.max(currentIndex - 1, 0)
                    )
                  }
                  disabled={loadedPlaylistCursor === 0}
                  aria-label="Previous loaded playlist"
                >
                  &lt;
                </button>
                <div className="playlist-workspace__playlist-viewport">
                  <div
                    className="playlist-workspace__playlist-track"
                    style={{
                      transform: `translateX(-${loadedPlaylistCursor * 100}%)`,
                    }}
                  >
                    {loadedPlaylists.map((playlist) => (
                      <div
                        key={playlist.id}
                        className="playlist-workspace__playlist-slide"
                      >
                        <article
                          className={`playlist-workspace__loaded-item${
                            activeLoadedPlaylistId === playlist.id
                              ? " is-active"
                              : ""
                          }`}
                          onClick={() => setActiveLoadedPlaylistId(playlist.id)}
                        >
                          <div>
                            <p className="playlist-workspace__loaded-name">
                              {playlist.title}
                            </p>
                            <p className="playlist-workspace__loaded-meta">
                              {playlist.owner} · {playlist.songs.length} songs
                            </p>
                          </div>
                          <div className="playlist-workspace__loaded-actions">
                            <a
                              className="playlist-workspace__loaded-link"
                              href={playlist.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open
                            </a>
                            {!isPublished ? (
                              <button
                                type="button"
                                className="playlist-workspace__loaded-remove"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveLoadedPlaylist(playlist.id);
                                }}
                                disabled={busy}
                              >
                                Remove Playlist
                              </button>
                            ) : null}
                          </div>
                        </article>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="playlist-song-card__button playlist-workspace__carousel-button"
                  onClick={() =>
                    setLoadedPlaylistCursor((currentIndex) =>
                      Math.min(currentIndex + 1, loadedPlaylists.length - 1)
                    )
                  }
                  disabled={loadedPlaylistCursor >= loadedPlaylists.length - 1}
                  aria-label="Next loaded playlist"
                >
                  &gt;
                </button>
              </div>
            </div>
          ) : (
            <div className="playlist-workspace__empty playlist-workspace__empty--compact">
              <p className="playlist-workspace__empty-title">
                No playlist loaded yet.
              </p>
              <p className="playlist-workspace__empty-copy">
                Add a public YouTube playlist to build the live voting stack.
              </p>
            </div>
          )}

          <div className="playlist-workspace__songs-header">
            <div>
              <p className="playlist-workspace__songs-eyebrow">Songs</p>
              <h3 className="playlist-workspace__songs-title">
                {isVoteMode ? "Song Library" : "Full Song List"}
              </h3>
            </div>
            <div className="playlist-workspace__songs-side">
              {!isVoteMode ? (
                <button
                  type="button"
                  className="playlist-workspace__secondary"
                  onClick={shuffleSongs}
                  disabled={!hasSongs || isPublished || busy}
                >
                  Random Shuffle
                </button>
              ) : null}
              <p className="playlist-workspace__songs-count">
                {hasSongs
                  ? `${filteredSongEntries.length} of ${songs.length} shown`
                  : "0 songs"}
              </p>
            </div>
          </div>

          {selectionMode && !isVoteMode ? (
            <div className="playlist-workspace__edit-banner">
              <div>
                <p className="playlist-workspace__edit-label">
                  {selectionMode === "opening"
                    ? "Opening Song Selection"
                    : "Batch Song Selection"}
                </p>
                <p className="playlist-workspace__edit-copy">
                  {selectionMode === "opening"
                    ? "Click one song in the full song list to make it the opening song."
                    : `Click one song in the full song list to replace ${editingTargetSong?.title ?? "this batch slot"}.`}
                </p>
              </div>
              <button
                type="button"
                className="playlist-workspace__banner-button"
                onClick={handleCancelSelection}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {!isVoteMode ? (
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
                disabled={!hasSongs || isPublished || busy || selectionMode !== null}
              >
                Create Batches
              </button>
            </div>
          ) : null}

          <div className="playlist-workspace__songs-scroll">
            {hasSongs ? (
              filteredSongEntries.length ? (
                <div className="playlist-workspace__library-list">
                  {filteredSongEntries.map(({ song, index }) => {
                    const isSelectable = !isVoteMode && selectionMode !== null;

                    return (
                      <article
                        key={`${song.id}-${index}`}
                        className={`playlist-song-card playlist-song-card--library${
                          isSelectable ? " is-selectable" : ""
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleLibrarySongClick(song, index)}
                        onKeyDown={(event) =>
                          handleSongCardKeyDown(event, () =>
                            handleLibrarySongClick(song, index)
                          )
                        }
                      >
                        <div className="playlist-song-card__order">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="playlist-song-card__body">
                          <h4 className="playlist-song-card__title">
                            <MarqueeText text={song.title} />
                          </h4>
                          <p className="playlist-song-card__meta">
                            <MarqueeText text={formatSongMeta(song)} />
                          </p>
                        </div>
                        <div className="playlist-song-card__side">
                          <div className="playlist-song-card__duration">
                            {formatDuration(song.durationMs)}
                          </div>
                          <div className="playlist-song-card__controls">
                            <button
                              type="button"
                              className="playlist-song-card__play-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                playSong(song);
                              }}
                              aria-label={`Play ${song.title}`}
                            >
                              ▶
                            </button>
                            {!isVoteMode ? (
                              <>
                                <button
                                  type="button"
                                  className="playlist-song-card__button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveSong(index, -1);
                                  }}
                                  disabled={
                                    index === 0 ||
                                    isPublished ||
                                    busy ||
                                    selectionMode !== null
                                  }
                                  aria-label={`Move ${song.title} up`}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="playlist-song-card__button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveSong(index, 1);
                                  }}
                                  disabled={
                                    index === songs.length - 1 ||
                                    isPublished ||
                                    busy ||
                                    selectionMode !== null
                                  }
                                  aria-label={`Move ${song.title} down`}
                                >
                                  ↓
                                </button>
                              </>
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
                  Load one or more playlists to build the combined ordered song
                  list and then create the voting batches.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {!isVoteMode ? (
        <div className="playlist-workspace__publish">
          <button
            type="button"
            className="playlist-workspace__publish-button"
            onClick={() => void handlePublishPlaylist()}
            disabled={!hasBatchSongs || busy}
          >
            {mutationState === "publishing"
              ? "Publishing..."
              : "Publish Playlist"}
          </button>
        </div>
      ) : null}

      {playbackEmbedUrl ? (
        <div className="playlist-workspace__player-shell" aria-hidden="true">
          <iframe
            key={playbackEmbedUrl}
            className="playlist-workspace__player-frame"
            src={playbackEmbedUrl}
            title="YouTube Music player"
            allow="autoplay; encrypted-media; picture-in-picture"
          />
        </div>
      ) : null}
        </>
      )}
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
          strokeWidth="2.4"
          fill="none"
        />
        <path d="M25.8 23.9L40.8 32L25.8 40.1V23.9Z" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

function normalizePlaylistForWorkspace(playlist: PlaylistData, playlistIndex: number) {
  const scopedPlaylistId = playlist.id || `loaded-playlist-${playlistIndex + 1}`;

  return {
    ...playlist,
    id: scopedPlaylistId,
    songs: playlist.songs.map((song, songIndex) => {
      const songKey = song.sourceId ?? song.id ?? `${scopedPlaylistId}-${songIndex}`;

      return {
        ...song,
        id: `${scopedPlaylistId}::${songIndex}::${songKey}`,
        originPlaylistId: scopedPlaylistId,
        originPlaylistTitle: playlist.title,
      };
    }),
  };
}

function replacePlaylistSongs(
  currentSongs: PlaylistSong[],
  targetPlaylistId: string,
  replacementSongs: PlaylistSong[]
) {
  const firstMatchIndex = currentSongs.findIndex(
    (song) => song.originPlaylistId === targetPlaylistId
  );

  if (firstMatchIndex === -1) {
    return currentSongs;
  }

  const nextSongs = currentSongs.filter(
    (song) => song.originPlaylistId !== targetPlaylistId
  );

  return [
    ...nextSongs.slice(0, firstMatchIndex),
    ...replacementSongs,
    ...nextSongs.slice(firstMatchIndex),
  ];
}

function formatSongMeta(song: PlaylistSong) {
  const baseMeta = `${song.artists.join(", ")} · ${song.album}`;
  return song.originPlaylistTitle
    ? `${baseMeta} · ${song.originPlaylistTitle}`
    : baseMeta;
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
  return `https://music.youtube.com/search?q=${searchQuery}`;
}

function getSongEmbedUrl(song: PlaylistSong | null, playbackToken: number) {
  if (!song) {
    return null;
  }

  const videoId = getSongVideoId(song);

  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&octavePlayback=${playbackToken}`;
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

function handleSongCardKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onActivate: () => void
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onActivate();
}

function chunkSongEntries(entries: SongEntry[], chunkSize: number) {
  const batches: SongEntry[][] = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    batches.push(entries.slice(index, index + chunkSize));
  }

  return batches;
}

function flattenSongBatches(batches: PlaylistSong[][]) {
  return batches.flat();
}

function createVoteSnapshot(currentBatch: SongEntry[]) {
  return currentBatch.map((_, songIndex) => ({
    [String(songIndex + 1)]: 0,
  }));
}

function getVoteCount(songwiseVote: SongwiseVote[], songIndex: number) {
  const voteKey = String(songIndex + 1);
  return songwiseVote[songIndex]?.[voteKey] ?? 0;
}

function getBatchStatus(
  batchIndex: number,
  currentBatchIndex: number,
  totalBatches: number
): BatchStatus {
  if (!totalBatches) {
    return "upcoming";
  }

  if (currentBatchIndex >= totalBatches) {
    return "completed";
  }

  if (batchIndex < currentBatchIndex) {
    return "completed";
  }

  if (batchIndex === currentBatchIndex) {
    return "ongoing";
  }

  return "upcoming";
}

function formatBatchStatus(status: BatchStatus) {
  if (status === "ongoing") {
    return "Ongoing";
  }

  if (status === "completed") {
    return "Completed";
  }

  return "Upcoming";
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
    originPlaylistId: EXAMPLE_PLAYLIST_ID,
    originPlaylistTitle: EXAMPLE_PLAYLIST_TITLE,
    sourceId: null,
    sourceUrl: null,
    title,
  };
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
