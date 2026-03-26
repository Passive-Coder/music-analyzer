"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
  onPlaySong?: (song: PlaylistSong) => void;
  onStopSong?: () => void;
  activeSongId?: string | null;
};

type RequestState = "idle" | "publishing";
type SongEntry = {
  index: number;
  song: PlaylistSong;
};

export function PlaylistWorkspace({
  isVisible = false,
  onPlaySong,
  onStopSong,
  activeSongId,
}: PlaylistWorkspaceProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [batchSongs, setBatchSongs] = useState<PlaylistSong[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState("");
  const [isSearchingYoutube, setIsSearchingYoutube] = useState(false);
  const [downloadingSongId, setDownloadingSongId] = useState<string | null>(null);
  const [editingTargetIndex, setEditingTargetIndex] = useState<number | null>(null);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSongs = songs.length > 0;
  const hasBatchSongs = batchSongs.length > 0;
  const allSongEntries = songs.map((song, index) => ({ index, song }));
  const allBatchEntries = batchSongs.map((song, index) => ({ index, song }));
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  
  const filteredSongEntries = allSongEntries.filter(({ song }) => {
    if (!normalizedSearchQuery) return true;
    const haystack = `${song.title} ${song.artists.join(" ")}`.toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  });
  
  const songBatches = chunkSongEntries(allBatchEntries, 5);
  const activeBatch = songBatches[activeBatchIndex] ?? null;
  const editingTargetSong = editingTargetIndex !== null ? batchSongs[editingTargetIndex] ?? null : null;
  const editingTargetLabel = editingTargetIndex !== null ? String(editingTargetIndex + 1).padStart(2, "0") : null;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!songBatches.length) {
      if (activeBatchIndex !== 0) setActiveBatchIndex(0);
      return;
    }
    const maxBatchIndex = songBatches.length - 1;
    if (activeBatchIndex > maxBatchIndex) {
      setActiveBatchIndex(maxBatchIndex);
    }
  }, [activeBatchIndex, songBatches.length]);

  if (!hasMounted) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newSongs: PlaylistSong[] = Array.from(files).map((file) => {
      const url = URL.createObjectURL(file);
      return {
        title: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+[\s.-]+/, ""), // Clean track numbers/extensions
        artists: ["Local Audio"],
        album: "Local Upload",
        artworkUrl: null,
        durationMs: 0, 
        id: `local-${Math.random().toString(36).substring(2, 9)}`,
        previewUrl: url,
        spotifyId: null,
        spotifyUrl: null,
        uri: null,
      };
    });

    if (!playlist) {
      setPlaylist({
        id: "local-playlist",
        title: "Local Playback Session",
        owner: "You",
        imageUrl: null,
        spotifyUrl: "",
        songs: newSongs,
        description: "Local files session"
      });
    }

    setSongs(prev => [...prev, ...newSongs]);
    setBatchSongs(prev => [...prev, ...newSongs]);
    
    if (e.target) e.target.value = ''; 
  };

  const handlePublishPlaylist = () => {
    if (!hasBatchSongs) return;
    setRequestState("publishing");
    setTimeout(() => {
      setPublishedCode(Math.random().toString(36).substring(2, 8).toUpperCase());
      setRequestState("idle");
    }, 800);
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    setPublishedCode(null);
    setSongs((currentSongs) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= currentSongs.length) return currentSongs;
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
        [nextSongs[index], nextSongs[swapIndex]] = [nextSongs[swapIndex], nextSongs[index]];
      }
      return nextSongs;
    });
  };

  const createBatchesFromOrderedSongs = () => {
    if (!songs.length) return;
    setPublishedCode(null);
    setEditingTargetIndex(null);
    setActiveBatchIndex(0);
    setBatchSongs([...songs]);
  };

  const selectReplacementSong = (sourceIndex: number) => {
    if (editingTargetIndex === null) return;
    setPublishedCode(null);
    const sourceSong = songs[sourceIndex];
    if (!sourceSong) return;

    setBatchSongs((currentSongs) => {
      if (editingTargetIndex < 0 || editingTargetIndex >= currentSongs.length) return currentSongs;
      const nextSongs = [...currentSongs];
      nextSongs[editingTargetIndex] = sourceSong;
      return nextSongs;
    });
    setEditingTargetIndex(null);
  };

  const handleYoutubeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeSearchQuery.trim() || isSearchingYoutube) return;

    setIsSearchingYoutube(true);
    try {
      const { searchYoutubeTrack } = await import("@/lib/youtube");
      const track = await searchYoutubeTrack(youtubeSearchQuery);
      
      if (track) {
        if (!playlist) {
          setPlaylist({
            id: "local-playlist",
            title: "Local Playback Session",
            owner: "You",
            imageUrl: null,
            spotifyUrl: "",
            songs: [track],
            description: "Local files session"
          });
        }
        setSongs(prev => [...prev, track]);
        setBatchSongs(prev => [...prev, track]);
        setYoutubeSearchQuery("");
      } else {
        alert("No track found for that query.");
      }
    } catch (err) {
      console.error(err);
      alert("Search failed.");
    } finally {
      setIsSearchingYoutube(false);
    }
  };

  const playPreview = async (song: PlaylistSong) => {
    if (!onPlaySong) return;
    
    // Stop currently playing song if clicking active
    if (activeSongId === song.id) {
      if (onStopSong) onStopSong();
      return;
    }

    if (song.previewUrl) {
      onPlaySong(song);
    } else if (song.spotifyId) {
      // YouTube track — fetch and buffer into memory via our bridge API
      setDownloadingSongId(song.id);
      try {
        const res = await fetch(`/api/extract-audio?videoId=${song.spotifyId}`);
        if (!res.ok) throw new Error("Audio extraction failed from bridge API");

        // Decode directly into memory as Blob -> Object URL
        // Bypasses HTML5 CORS restrictions completely allowing immediate AnalyserNode linking
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        song.previewUrl = url;
        onPlaySong(song);
      } catch (err) {
        console.error("Buffering failed", err);
        alert("Failed to extract audio stream.");
      } finally {
        setDownloadingSongId(null);
      }
    }
  };

  return (
    <section className={`playlist-workspace${isVisible ? " is-visible" : " is-hidden"}`} aria-hidden={!isVisible}>
      <div className="playlist-workspace__layout">
        <div className="playlist-workspace__panel">
          <div className="playlist-workspace__loader">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
              <span className="playlist-workspace__label" style={{ marginBottom: "8px" }}>Local Audio Injector</span>
              <button
                type="button"
                className="playlist-workspace__primary"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: "100%", padding: "1rem" }}
              >
                Upload Local Audio Files (.mp3, .wav, .aac)
              </button>
              <input
                type="file"
                accept="audio/*"
                multiple
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginTop: "1.5rem" }}>
              <span className="playlist-workspace__label" style={{ marginBottom: "8px" }}>Or Search YouTube</span>
              <form onSubmit={handleYoutubeSearch} style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="playlist-workspace__input"
                  placeholder="e.g. Queen Bohemian Rhapsody"
                  value={youtubeSearchQuery}
                  onChange={(e) => setYoutubeSearchQuery(e.target.value)}
                  disabled={isSearchingYoutube}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="playlist-workspace__secondary"
                  disabled={isSearchingYoutube || !youtubeSearchQuery.trim()}
                  style={{ padding: "0 16px", minWidth: "80px" }}
                >
                  {isSearchingYoutube ? "..." : "Add"}
                </button>
              </form>
            </div>
          </div>

          <div className="playlist-workspace__batch-pane" style={{ marginTop: "16px" }}>
            <div className="playlist-workspace__songs-header">
              <div>
                <p className="playlist-workspace__songs-eyebrow">Batches</p>
                <h3 className="playlist-workspace__songs-title playlist-workspace__songs-title--compact">Ordered Groups Of 5</h3>
              </div>
              <div className="playlist-workspace__batch-nav">
                <p className="playlist-workspace__songs-count">{hasBatchSongs ? `Batch ${activeBatchIndex + 1} of ${songBatches.length}` : "0 batches"}</p>
                <div className="playlist-workspace__batch-buttons">
                  <button type="button" className="playlist-song-card__button" onClick={() => setActiveBatchIndex(i => Math.max(i - 1, 0))} disabled={!hasBatchSongs || activeBatchIndex === 0}>&lt;</button>
                  <button type="button" className="playlist-song-card__button" onClick={() => setActiveBatchIndex(i => Math.min(i + 1, songBatches.length - 1))} disabled={!hasBatchSongs || activeBatchIndex === songBatches.length - 1}>&gt;</button>
                </div>
              </div>
            </div>

            <div className="playlist-workspace__batch-scroll">
              {hasBatchSongs && activeBatch ? (
                <section className="playlist-batch">
                  <div className="playlist-batch__header">
                    <p className="playlist-batch__label">Batch {activeBatchIndex + 1}</p>
                    <p className="playlist-batch__range">{String(activeBatch[0].index + 1).padStart(2, "0")}-{String(activeBatch[activeBatch.length - 1].index + 1).padStart(2, "0")}</p>
                  </div>
                  <div className="playlist-batch__list">
                    {activeBatch.map(({ song, index }) => {
                      const isEditingTarget = editingTargetIndex === index;
                      const isPlaying = activeSongId === song.id;
                      
                      return (
                        <article key={`${song.id}-${index}`} className={`playlist-song-card${isEditingTarget ? " is-editing" : ""}${isPlaying ? " is-active" : ""}`}>
                          <div className="playlist-song-card__order">{String(index + 1).padStart(2, "0")}</div>
                          <div className="playlist-song-card__body">
                            <h4 className="playlist-song-card__title">
                              <MarqueeText text={song.title} />
                            </h4>
                            <p className="playlist-song-card__meta">
                              <MarqueeText text={`${song.artists.join(", ")} \u2022 ${song.album}`} />
                            </p>
                          </div>
                          <div className="playlist-song-card__side">
                            <div className="playlist-song-card__duration">
                              {/* Duration not known until decoded, display --:-- or Local */}
                              Local
                            </div>
                            <div className="playlist-song-card__controls">
                              <button
                                type="button"
                                className="playlist-song-card__button playlist-song-card__play-link"
                                onClick={() => playPreview(song)}
                                disabled={downloadingSongId === song.id}
                                style={{background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1rem", opacity: isPlaying ? 1 : 0.6}}
                              >
                                {downloadingSongId === song.id ? "..." : isPlaying ? "\u25A0" : "\u25B6"}
                              </button>
                              <button
                                type="button"
                                className={`playlist-song-card__button playlist-song-card__button--wide${isEditingTarget ? " playlist-song-card__button--active" : ""}`}
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
                  <p className="playlist-workspace__empty-title">Batches will appear here.</p>
                  <p className="playlist-workspace__empty-copy">Upload robust local mp3 tracks, visually organize them into sequenced blocks, and execute them perfectly into your 3D visualizer space.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="playlist-workspace__songs-pane">
          <div className="playlist-workspace__header playlist-workspace__header--meta">
            <div className="playlist-workspace__brand">
              <LocalAudioGlyph />
              <div>
                <p className="playlist-workspace__eyebrow">Local Files</p>
                <h2 className="playlist-workspace__title">Playlist</h2>
              </div>
            </div>
            <p className="playlist-workspace__copy">Construct a master queue entirely out of internal .mp3, .wav, or .m4a files securely parsed directly on your browser via the Web Audio API.</p>
          </div>

          {playlist ? (
            <div className="playlist-workspace__meta playlist-workspace__meta--local">
              <div>
                <p className="playlist-workspace__meta-label">Loaded Data</p>
                <h3 className="playlist-workspace__meta-title">{playlist.title}</h3>
                <p className="playlist-workspace__meta-subtitle">{playlist.owner} &bull; {songs.length} tracks</p>
              </div>
            </div>
          ) : (
            <div className="playlist-workspace__empty">
              <p className="playlist-workspace__empty-title">No local audio loaded yet.</p>
              <p className="playlist-workspace__empty-copy">Use the large button on the left to inject high-density local files. 100% private, never touches a server.</p>
            </div>
          )}

          <div className="playlist-workspace__songs-header">
            <div>
              <p className="playlist-workspace__songs-eyebrow">Songs</p>
              <h3 className="playlist-workspace__songs-title">Full Library View</h3>
            </div>
            <div className="playlist-workspace__songs-side">
              <button type="button" className="playlist-workspace__secondary" onClick={shuffleSongs} disabled={!hasSongs}>Random Shuffle</button>
              <p className="playlist-workspace__songs-count">{hasSongs ? `${filteredSongEntries.length} of ${songs.length} shown` : "0 songs"}</p>
            </div>
          </div>

          {editingTargetSong ? (
            <div className="playlist-workspace__edit-banner">
              <div>
                <p className="playlist-workspace__edit-label">Edit Active</p>
                <p className="playlist-workspace__edit-copy">Pick a song below to replace {editingTargetLabel} {editingTargetSong.title}.</p>
              </div>
              <button type="button" className="playlist-workspace__banner-button" onClick={() => setEditingTargetIndex(null)}>Cancel</button>
            </div>
          ) : null}

          <div className="playlist-workspace__search-row">
            <label className="playlist-workspace__field playlist-workspace__field--search">
              <span className="playlist-workspace__label">Search Songs</span>
              <input className="playlist-workspace__input" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Filter library by file name" disabled={!hasSongs} />
            </label>
            <button type="button" className="playlist-workspace__secondary playlist-workspace__search-action" onClick={createBatchesFromOrderedSongs} disabled={!hasSongs}>Sync To Batches</button>
          </div>

          <div className="playlist-workspace__songs-scroll">
            {hasSongs ? (
              filteredSongEntries.length ? (
                <div className="playlist-workspace__library-list">
                  {filteredSongEntries.map(({ song, index }) => {
                    const canSelectReplacement = editingTargetIndex !== null;
                    const isPlaying = activeSongId === song.id;

                    return (
                      <article key={`${song.id}-${index}`} className={`playlist-song-card playlist-song-card--local playlist-song-card--library${canSelectReplacement ? " is-selectable" : ""}${isPlaying ? " is-active" : ""}`}>
                        <div className="playlist-song-card__order">{String(index + 1).padStart(2, "0")}</div>
                        <div className="playlist-song-card__body">
                          <h4 className="playlist-song-card__title"><MarqueeText text={song.title} /></h4>
                          <p className="playlist-song-card__meta"><MarqueeText text={`${song.artists.join(", ")} \u2022 ${song.album}`} /></p>
                        </div>
                        <div className="playlist-song-card__side">
                          <div className="playlist-song-card__duration">Local</div>
                          <div className="playlist-song-card__controls">
                            <button 
                              type="button" 
                              className="playlist-song-card__play-link" 
                              style={{background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1rem", opacity: isPlaying ? 1 : 0.6}} 
                              onClick={() => playPreview(song)}
                              disabled={downloadingSongId === song.id}
                            >
                              {downloadingSongId === song.id ? "..." : isPlaying ? "\u25A0" : "\u25B6"}
                            </button>
                            <button type="button" className="playlist-song-card__button" onClick={() => moveSong(index, -1)} disabled={index === 0}>&uarr;</button>
                            <button type="button" className="playlist-song-card__button" onClick={() => moveSong(index, 1)} disabled={index === songs.length - 1}>&darr;</button>
                            {editingTargetIndex !== null && (
                              <button type="button" className="playlist-song-card__button playlist-song-card__button--wide playlist-song-card__button--select" onClick={() => selectReplacementSong(index)}>Select</button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="playlist-workspace__empty playlist-workspace__empty--songs"><p className="playlist-workspace__empty-title">No files match that filter.</p></div>
              )
            ) : (
              <div className="playlist-workspace__empty playlist-workspace__empty--songs"><p className="playlist-workspace__empty-title">Files will orchestrate here.</p><p className="playlist-workspace__empty-copy">Push bulk files into the uploader, manipulate their sequencing natively, and commit them to the internal batches stack.</p></div>
            )}
          </div>
        </aside>
      </div>

      <div className="playlist-workspace__publish">
        <button type="button" className="playlist-workspace__publish-button" onClick={handlePublishPlaylist} disabled={!hasBatchSongs || requestState === "publishing"}>
          {requestState === "publishing" ? "Publishing..." : "Publish Mix"}
        </button>
      </div>
    </section>
  );
}

function LocalAudioGlyph() {
  return (
    <div className="playlist-workspace__local-glyph" aria-hidden="true" style={{fill: "#b98cff"}}>
      <svg viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V8h2v4zm4 4h-2V8h2v8z" />
      </svg>
    </div>
  );
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
  const [overflowState, setOverflowState] = useState({ duration: 0, gap: 0, isOverflowing: false, travel: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const textNode = textRef.current;
    if (!container || !textNode) return;

    const resizeObserver = new ResizeObserver(() => {
      const containerWidth = container.offsetWidth;
      const textWidth = textNode.scrollWidth;
      if (textWidth > containerWidth) {
        setOverflowState({ duration: textWidth * 20, gap: 32, isOverflowing: true, travel: textWidth + 32 });
      } else {
        setOverflowState({ duration: 0, gap: 0, isOverflowing: false, travel: 0 });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [text]);

  if (!overflowState.isOverflowing) {
    return <span className="marquee-text" ref={containerRef}><span className="marquee-text__track" ref={textRef}>{text}</span></span>;
  }

  return (
    <span className="marquee-text is-overflowing" ref={containerRef} style={{ "--marquee-duration": `${overflowState.duration}ms`, "--marquee-travel": `${overflowState.travel}px`, "--marquee-gap": `${overflowState.gap}px` } as React.CSSProperties}>
      <span className="marquee-text__track" ref={textRef}>
        <span className="marquee-text__copy">{text}</span>
        <span className="marquee-text__gap" aria-hidden="true" />
        <span className="marquee-text__copy" aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}
