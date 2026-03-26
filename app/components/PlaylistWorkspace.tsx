"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
  songs: PlaylistSong[];
  onSongsChange: React.Dispatch<React.SetStateAction<PlaylistSong[]>>;
  onPlaySong?: (song: PlaylistSong) => void;
  onStopSong?: () => void;
  activeSongId?: string | null;
};

export function PlaylistWorkspace({
  isVisible = false,
  songs,
  onSongsChange,
  onPlaySong,
  onStopSong,
  activeSongId,
}: PlaylistWorkspaceProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [requestState, setRequestState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState("");
  const [isSearchingYoutube, setIsSearchingYoutube] = useState(false);
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<PlaylistSong[]>([]);
  const [showYoutubeDropdown, setShowYoutubeDropdown] = useState(false);
  const [downloadingSongId, setDownloadingSongId] = useState<string | null>(null);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Multiplayer Group Session State ---
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [isHost, setIsHost] = useState(false);
  const hostTokenRef = useRef<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const filteredSongs = songs.filter((song) => {
    const query = youtubeSearchQuery.trim().toLowerCase();
    if (!query || query.includes("list=") || query.includes("youtube.com")) return true;
    const haystack = `${song.title} ${song.artists.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });

  // --- Internal Navigation ---
  const handleInternalNext = () => {
    if (songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === activeSongId);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= songs.length) nextIndex = 0;
    const nextSong = songs[nextIndex];
    if (nextSong) playPreview(nextSong);
  };

  const removeSongFromLibrary = (indexToRemove: number) => {
    onSongsChange(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    onSongsChange((currentSongs) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= currentSongs.length) return currentSongs;
      const nextSongs = [...currentSongs];
      const [song] = nextSongs.splice(index, 1);
      nextSongs.splice(nextIndex, 0, song);
      return nextSongs;
    });
  };

  const shuffleSongs = () => {
    onSongsChange((currentSongs) => {
      const nextSongs = [...currentSongs];
      for (let i = nextSongs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nextSongs[i], nextSongs[j]] = [nextSongs[j], nextSongs[i]];
      }
      return nextSongs;
    });
  };

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // --- Multiplayer Sync ---
  useEffect(() => {
    if (!sessionId) return;
    let interval: NodeJS.Timeout;

    if (isHost && hostTokenRef.current) {
      interval = setInterval(async () => {
        const { audioManager } = await import("@/lib/audioManager");
        if (!audioManager || !audioManager.audioElement) return;

        fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            roomCode: sessionId,
            hostId: hostTokenRef.current,
            roomTitle,
            state: {
              currentTime: audioManager.audioElement.currentTime,
              isPlaying: audioManager.isPlaying,
              currentSongId: activeSongId,
              songs,
            }
          })
        }).catch(err => console.error("Sync heartbeat failed", err));
      }, 1000);
    } else if (!isHost) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/sync?roomCode=${sessionId}`);
          if (!res.ok) {
            setSyncStatus("Room Disconnected");
            return;
          }
          const data = await res.json();
          if (!data.active) {
            setSyncStatus("Host Offline");
            return;
          }
          
          setSyncStatus(`Connected to: ${data.roomTitle || "Untitled Room"}`);
          const state = data.state;
          if (state.songs && state.songs.length !== songs.length) onSongsChange(state.songs);

          const { audioManager } = await import("@/lib/audioManager");
          if (!audioManager || !audioManager.audioElement) return;

          if (state.currentSongId && state.currentSongId !== activeSongId) {
            const nextSyncTrack = state.songs?.find((t: PlaylistSong) => t.id === state.currentSongId);
            if (nextSyncTrack && onPlaySong) onPlaySong(nextSyncTrack);
          }

          if (state.isPlaying && !audioManager.isPlaying) {
             // Let BottomPlayer handle play
          } else if (!state.isPlaying && audioManager.isPlaying) {
             audioManager.pause();
          }

          const localTime = audioManager.audioElement.currentTime;
          const hostTime = state.currentTime || 0;
          if (Math.abs(hostTime - localTime) > 2.5 && state.isPlaying) {
             audioManager.audioElement.currentTime = hostTime;
          }
        } catch (err) { console.error("Listener poll failed", err); }
      }, 2000);
    }

    return () => clearInterval(interval);
  }, [sessionId, isHost, activeSongId, songs, roomTitle, onPlaySong]);

  const handleYoutubeSearch = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setYoutubeSearchResults([]);
      setShowYoutubeDropdown(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      if (query.includes("list=") || query.includes("youtube.com")) {
         const listId = query.match(/[?&]list=([^&]+)/)?.[1];
         if (listId) {
            setIsSearchingYoutube(true);
            try {
              const { fetchYoutubePlaylist } = await import("@/lib/youtube");
              const tracks = await fetchYoutubePlaylist(listId);
              if (tracks.length > 0) {
                onSongsChange(prev => [...prev, ...tracks]);
                setYoutubeSearchQuery("");
                setShowYoutubeDropdown(false);
              }
            } catch (err) { console.error(err); }
            finally { setIsSearchingYoutube(false); }
         }
         return;
      }

      setIsSearchingYoutube(true);
      try {
        const { searchLyrics } = await import("@/lib/lyrics");
        const results = await searchLyrics(query);
        const formatted = results.map((t: any) => ({
          id: `lrc-${t.id}-${Math.random().toString(36).substring(7)}`,
          title: t.trackName,
          artists: [t.artistName],
          album: t.albumName,
          durationMs: t.duration * 1000,
          artworkUrl: null,
          previewUrl: null,
          spotifyId: null,
          spotifyUrl: null,
          uri: null,
          raw: t
        }));
        setYoutubeSearchResults(formatted);
        setShowYoutubeDropdown(formatted.length > 0);
      } catch (err) { console.error(err); }
      finally { setIsSearchingYoutube(false); }
    }, 500);
  };

  const playPreview = async (song: PlaylistSong) => {
    if (!onPlaySong) return;
    if (activeSongId === song.id) {
      if (onStopSong) onStopSong();
      return;
    }

    if (song.previewUrl) {
      onPlaySong(song);
    } else {
      setDownloadingSongId(song.id);
      try {
        let videoId = song.spotifyId;
        if (!videoId) {
           const { searchYoutubeTrack } = await import("@/lib/youtube");
           const query = `${song.title} ${song.artists[0]} official audio`;
           const ytResults = await searchYoutubeTrack(query);
           if (ytResults.length > 0) videoId = ytResults[0].spotifyId;
        }

        if (videoId) {
          const res = await fetch(`/api/extract-audio?videoId=${videoId}`);
          if (!res.ok) throw new Error("Extraction failed");
          const blob = await res.blob();
          song.previewUrl = URL.createObjectURL(blob);
          song.spotifyId = videoId;
          onPlaySong(song);
        }
      } catch (err) { console.error("Buffering failed", err); }
      finally { setDownloadingSongId(null); }
    }
  };

  if (!hasMounted) return null;

  return (
    <div className={`playlist-workspace${isVisible ? " is-visible" : " is-hidden"}`}>
      <div className="playlist-workspace__container">
        <div className="playlist-workspace__main">
          
          <div className="playlist-workspace__section sync-pane glass">
            <h2 className="section-title">Listen Together</h2>
            {!sessionId ? (
              <div className="sync-setup">
                <div className="sync-row">
                  <input 
                    type="text" 
                    placeholder="Enter Room Title..." 
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                    className="room-title-input"
                  />
                  <button 
                    className="btn btn--primary" 
                    onClick={async () => {
                      const hostId = "host-" + Math.random().toString(36).substring(7);
                      const res = await fetch("/api/sync", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "create", roomTitle: roomTitle || "Our Session", hostId, state: { songs, activeSongId } })
                      });
                      const data = await res.json();
                      if (data.roomCode) {
                        setSessionId(data.roomCode);
                        setIsHost(true);
                        hostTokenRef.current = hostId;
                        setSyncStatus("Hosting Room");
                      }
                    }}
                  >
                    Create Room
                  </button>
                </div>
                <div className="sync-divider"><span>OR JOIN</span></div>
                <div className="sync-row">
                  <input 
                    type="text" 
                    placeholder="Room Code" 
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                  <button className="btn btn--secondary" onClick={() => setSessionId(joinCodeInput)}>
                    Join
                  </button>
                </div>
              </div>
            ) : (
              <div className="sync-active">
                <div className="sync-status-info">
                  <div className="room-name">{roomTitle || "Untitled Session"}</div>
                  <div className="room-id">CODE: <strong>{sessionId}</strong></div>
                  <div className={`status-pill ${syncStatus?.includes("Connected") ? "online" : "offline"}`}>
                    {syncStatus || "Syncing..."} {isHost ? "(Host)" : ""}
                  </div>
                </div>
                <button className="btn btn--danger btn--sm" onClick={() => { setSessionId(null); setIsHost(false); }}>
                  Leave Session
                </button>
              </div>
            )}
          </div>

          <div className="playlist-workspace__section search-pane">
            <h2 className="section-title">Add To Library</h2>
            <div className="search-bar-container">
              <input
                type="text"
                placeholder="Search songs or paste YouTube Playlist URL..."
                value={youtubeSearchQuery}
                onChange={(e) => {
                  setYoutubeSearchQuery(e.target.value);
                  handleYoutubeSearch(e.target.value);
                }}
                autoComplete="off"
                className="main-search-input"
              />
              {isSearchingYoutube && <div className="spinner-small" />}
              
              {showYoutubeDropdown && youtubeSearchResults.length > 0 && (
                <div className="youtube-results-dropdown glass animate-in">
                  {youtubeSearchResults.map((result) => (
                    <div 
                      key={result.id} 
                      className="yt-result-item"
                      onClick={() => {
                         onSongsChange(prev => [...prev, result]);
                         setYoutubeSearchQuery("");
                         setShowYoutubeDropdown(false);
                      }}
                    >
                      <div className="result-thumb-placeholder" />
                      <div className="result-text">
                        <div className="result-title">{result.title}</div>
                        <div className="result-artist">{result.artists[0]}</div>
                      </div>
                      <div className="btn-add">+</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="playlist-workspace__section library-section">
            <div className="library-header">
              <h2 className="section-title">Music Library ({songs.length})</h2>
              <div className="library-actions">
                 <button className="btn btn--secondary btn--sm" onClick={() => songs.length > 0 && onPlaySong?.(songs[0])} title="Play All">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ marginRight: '6px' }}><path d="M8 5v14l11-7z"/></svg>
                    Play All
                 </button>
                 <button className="btn btn--icon" onClick={shuffleSongs} title="Shuffle Library">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                 </button>
              </div>
            </div>

            <div className="library-list">
              {filteredSongs.map((song, idx) => {
                const isActive = activeSongId === song.id;
                const isDownloading = downloadingSongId === song.id;
                return (
                  <div key={song.id} className={`library-item glass ${isActive ? 'active' : ''}`}>
                    <div className="item-rank">{(idx + 1).toString().padStart(2, '0')}</div>
                    <div className="item-main" onClick={() => playPreview(song)}>
                      <div className="item-artwork-container">
                        <div className="item-artwork">
                          {isDownloading ? (
                            <span className="loader-mini" />
                          ) : isActive ? (
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          )}
                        </div>
                      </div>
                      <div className="item-details">
                        <div className="item-title">{song.title}</div>
                        <div className="item-artist">{song.artists[0]}</div>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button className="btn btn--icon" onClick={() => moveSong(idx, -1)} disabled={idx === 0}>↑</button>
                      <button className="btn btn--icon" onClick={() => moveSong(idx, 1)} disabled={idx === songs.length - 1}>↓</button>
                      <button className="btn btn--icon btn--danger" onClick={() => removeSongFromLibrary(idx)}>&times;</button>
                    </div>
                  </div>
                );
              })}
              {songs.length === 0 && (
                <div className="empty-message">Search for music or paste a YouTube playlist link to populate your library.</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
