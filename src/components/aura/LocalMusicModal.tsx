import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, FolderOpen, Play, Pause, SkipBack, SkipForward, Shuffle, Search, Music } from "lucide-react";

interface Track {
  name: string;
  path: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function LocalMusicModal({ isOpen, onClose }: Props) {
  const [folder, setFolder] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem("aura:local-music-folder") : null),
  );
  const [tracks, setTracks] = useState<Track[]>([]);
  const [search, setSearch] = useState("");
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Refs so audio event handlers always see fresh values without re-registering
  const currentIdxRef = useRef(-1);
  const shuffleRef = useRef(false);
  const filteredRef = useRef<Track[]>([]);

  const filtered = search.trim()
    ? tracks.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : tracks;

  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { filteredRef.current = filtered; }, [filtered]);

  // Create the audio element once — keep it alive for the component's lifetime
  // so playback persists across open/close cycles of the modal UI.
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onPlayEvt = () => setIsPlaying(true);
    const onPauseEvt = () => setIsPlaying(false);
    const onEnded = () => {
      const list = filteredRef.current;
      if (list.length === 0) return;
      const next = shuffleRef.current
        ? Math.floor(Math.random() * list.length)
        : (currentIdxRef.current + 1) % list.length;
      playRaw(list[next], next);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlayEvt);
    audio.addEventListener("pause", onPauseEvt);
    audio.addEventListener("ended", onEnded);

    // Parent stream/generated audio started → pause local
    const onStreamStart = () => audio.pause();
    window.addEventListener("aura:stream-start", onStreamStart);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlayEvt);
      audio.removeEventListener("pause", onPauseEvt);
      audio.removeEventListener("ended", onEnded);
      window.removeEventListener("aura:stream-start", onStreamStart);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!folder || !window.electronAPI) return;
    setLoading(true);
    window.electronAPI.scanMusicFolder(folder).then((result) => {
      setTracks(result);
      setLoading(false);
    });
  }, [folder]);

  const playRaw = (track: Track, idx: number) => {
    const audio = audioRef.current;
    if (!audio || !window.electronAPI) return;
    audio.src = window.electronAPI.fileToUrl(track.path);
    audio.load();
    audio.play().catch(() => {});
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    // Tell parent to pause its stream/generated/YouTube audio
    window.dispatchEvent(new CustomEvent("aura:local-start", { detail: { name: track.name } }));
  };

  const handlePickFolder = async () => {
    const picked = await window.electronAPI?.pickMusicFolder();
    if (!picked) return;
    setFolder(picked);
    localStorage.setItem("aura:local-music-folder", picked);
    setCurrentIdx(-1);
    setProgress(0);
    setDuration(0);
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
      const track = filtered[currentIdxRef.current];
      if (track) window.dispatchEvent(new CustomEvent("aura:local-start", { detail: { name: track.name } }));
    }
  };

  const handlePrev = () => {
    if (filtered.length === 0) return;
    const idx = shuffleRef.current
      ? Math.floor(Math.random() * filtered.length)
      : (currentIdxRef.current - 1 + filtered.length) % filtered.length;
    playRaw(filtered[idx], idx);
  };

  const handleNext = () => {
    if (filtered.length === 0) return;
    const idx = shuffleRef.current
      ? Math.floor(Math.random() * filtered.length)
      : (currentIdxRef.current + 1) % filtered.length;
    playRaw(filtered[idx], idx);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(duration) || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  const activeTrack = currentIdx >= 0 ? filtered[currentIdx] : null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-150 ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />

      {/* Panel */}
      <motion.div
        animate={{ scale: isOpen ? 1 : 0.96, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.14 }}
        className="relative z-10 w-[min(500px,95vw)] max-h-[84vh] flex flex-col pixel-panel bg-card border-2 border-primary/40 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-border shrink-0">
          <Music size={13} className="text-primary" />
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}>LOCAL LIBRARY</span>
          <button
            onClick={handlePickFolder}
            className="ml-auto flex items-center gap-1.5 px-2 py-1 border border-border hover:border-primary text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}
          >
            <FolderOpen size={11} />
            {folder ? "CHANGE FOLDER" : "PICK FOLDER"}
          </button>
          <button onClick={onClose} className="ml-1 text-muted-foreground hover:text-primary shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Current folder path */}
        {folder && (
          <div className="px-4 py-1.5 bg-muted/10 border-b border-border/40 shrink-0">
            <p className="text-muted-foreground truncate" style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}>
              {folder}
            </p>
          </div>
        )}

        {/* Search bar */}
        {tracks.length > 0 && (
          <div className="px-3 py-2 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2 bg-input border border-border px-2 py-1.5">
              <Search size={11} className="text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search tracks..."
                className="flex-1 bg-transparent outline-none"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
              />
            </div>
          </div>
        )}

        {/* Track list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!folder && (
            <div className="flex flex-col items-center justify-center gap-3 h-52 text-muted-foreground">
              <FolderOpen size={40} className="opacity-20" />
              <span style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>PICK A FOLDER TO LOAD MUSIC</span>
            </div>
          )}
          {folder && loading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
              SCANNING...
            </div>
          )}
          {folder && !loading && filtered.length === 0 && (
            <div className="flex items-center justify-center h-40 text-muted-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
              {search ? "NO RESULTS" : "NO AUDIO FILES FOUND"}
            </div>
          )}
          {filtered.map((track, idx) => {
            const active = idx === currentIdx;
            return (
              <button
                key={track.path}
                onClick={() => playRaw(track, idx)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-border/25 transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                }`}
              >
                {/* Track number / playing indicator */}
                <span className="shrink-0 w-6 flex items-center justify-center" style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}>
                  {active && isPlaying ? (
                    <span className="inline-flex items-end gap-px h-3.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-0.5 bg-primary inline-block"
                          animate={{ height: ["30%", "100%", "50%", "85%", "30%"] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className={active ? "text-primary" : "opacity-35"}>{String(idx + 1).padStart(2, "0")}</span>
                  )}
                </span>

                {/* Track name */}
                <span className="truncate" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                  {track.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Playback controls — only shown once a track has been selected */}
        {activeTrack && (
          <div className="border-t-2 border-border px-4 pt-3 pb-4 shrink-0 space-y-2.5 bg-card">
            {/* Now playing label */}
            <p className="text-primary truncate" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
              {activeTrack.name}
            </p>

            {/* Seekbar */}
            <div className="space-y-1">
              <div className="h-1.5 bg-muted/40 cursor-pointer group relative" onClick={handleSeek}>
                <div
                  className="h-full bg-primary transition-none"
                  style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : "0%" }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: duration > 0 ? `calc(${(progress / duration) * 100}% - 5px)` : "-5px" }}
                />
              </div>
              <div className="flex justify-between text-muted-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: 7 }}>
                <span>{fmt(progress)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-5">
              <button
                onClick={() => setShuffle((v) => !v)}
                className={`transition-colors ${shuffle ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                title="Shuffle"
              >
                <Shuffle size={13} />
              </button>
              <button onClick={handlePrev} className="text-muted-foreground hover:text-primary transition-colors">
                <SkipBack size={17} />
              </button>
              <button
                onClick={handlePlayPause}
                className="w-9 h-9 flex items-center justify-center border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
              </button>
              <button onClick={handleNext} className="text-muted-foreground hover:text-primary transition-colors">
                <SkipForward size={17} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
