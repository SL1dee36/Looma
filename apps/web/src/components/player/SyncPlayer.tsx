// Author: Nazaryan Artem (@sl1dee36)
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Sparkles,
  Film,
  Settings2,
  Captions,
} from 'lucide-react';
import type { PlaybackState } from '@looma/shared';

interface SyncPlayerProps {
  playback: PlaybackState | null;
  canControl: boolean;
  getExpectedTime: () => number;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
  onRateChange: (rate: number, time: number) => void;
  onSelectStream: (index: number) => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          host?: string;
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (ev: { target: YTPlayerInstance }) => void;
            onStateChange?: (ev: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(vol: number): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
  getAvailableQualityLevels?(): string[];
  getPlaybackQuality?(): string;
  setPlaybackQuality?(quality: string): void;
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
  setOption?(module: string, option: string, value: unknown): void;
  getOption?(module: string, option: string): unknown;
  destroy(): void;
}

interface QualityOption {
  id: string;
  label: string;
}

interface SubtitleOption {
  id: number | string;
  label: string;
}

const YT_QUALITY_LABELS: Record<string, string> = {
  highres: '4K+',
  hd2160: '2160p',
  hd1440: '1440p',
  hd1080: '1080p',
  hd720: '720p',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
  auto: 'Авто',
};

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function SyncPlayer({
  playback,
  canControl,
  getExpectedTime,
  onPlay,
  onPause,
  onSeek,
  onRateChange,
  onSelectStream,
}: SyncPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const hlsRef = useRef<Hls | null>(null);

  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [openMenu, setOpenMenu] = useState<'quality' | 'subtitles' | null>(null);

  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | string>(-1);

  const hideTimerRef = useRef<number | null>(null);

  const media = playback?.media ?? null;
  const activeStream = media ? media.streams[media.selectedStreamIndex] ?? media.streams[0] : null;
  const streamType = activeStream?.type ?? null;
  const streamUrl = activeStream?.url ?? null;

  // Reset quality/subtitles when media changes
  useEffect(() => {
    setOpenMenu(null);
    setQualityOptions([]);
    setSelectedQuality('auto');
    setSubtitleOptions([]);
    setSubtitlesEnabled(false);
    setSelectedSubtitle(-1);
  }, [media?.id, streamUrl]);

  // Load HLS / MP4
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || (streamType !== 'hls' && streamType !== 'mp4')) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (streamType === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels: QualityOption[] = [
          { id: '-1', label: 'Авто' },
          ...hls.levels.map((lvl, idx) => ({
            id: String(idx),
            label: lvl.height ? `${lvl.height}p` : `Уровень ${idx + 1}`,
          })),
        ];
        setQualityOptions(levels);
        setSelectedQuality('-1');
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        const tracks = data.subtitleTracks.map((t, idx) => ({
          id: idx,
          label: t.name || t.lang || `Дорожка ${idx + 1}`,
        }));
        setSubtitleOptions(tracks);
      });

      hlsRef.current = hls;
    } else {
      video.src = streamUrl;
      if (media && media.streams.length > 1) {
        setQualityOptions(
          media.streams.map((s, idx) => ({ id: `stream:${idx}`, label: s.quality }))
        );
        setSelectedQuality(`stream:${media.selectedStreamIndex}`);
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamType, streamUrl]);

  // Load YouTube IFrame API player
  useEffect(() => {
    ytReadyRef.current = false;
    if (streamType !== 'youtube' || !streamUrl || !ytContainerRef.current) {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !ytContainerRef.current || !window.YT) return;
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
      }
      const mount = document.createElement('div');
      ytContainerRef.current.innerHTML = '';
      ytContainerRef.current.appendChild(mount);

      ytPlayerRef.current = new window.YT.Player(mount, {
        host: 'https://www.youtube-nocookie.com',
        videoId: streamUrl,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            ytReadyRef.current = true;
            ev.target.setVolume(muted ? 0 : Math.round(volume * 100));
            const expected = getExpectedTime();
            ev.target.seekTo(expected, true);
            if (playback?.isPlaying) ev.target.playVideo();
            else ev.target.pauseVideo();

            const dur = ev.target.getDuration();
            if (dur) setDuration(dur);

            const levels = ev.target.getAvailableQualityLevels?.() ?? [];
            if (levels.length > 0) {
              setQualityOptions(
                levels.map((q) => ({ id: q, label: YT_QUALITY_LABELS[q] || q }))
              );
              setSelectedQuality(ev.target.getPlaybackQuality?.() || levels[0]);
            }
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const playingState = window.YT?.PlayerState?.PLAYING ?? 1;
            setLocalPlaying(ev.data === playingState);

            // Refresh available quality levels once video starts buffering/playing
            const levels = ev.target.getAvailableQualityLevels?.() ?? [];
            if (levels.length > 0) {
              setQualityOptions(
                levels.map((q) => ({ id: q, label: YT_QUALITY_LABELS[q] || q }))
              );
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      ytReadyRef.current = false;
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamType, streamUrl]);

  // Apply server playback state to local player
  useEffect(() => {
    if (!playback || !activeStream) return;
    const expected = getExpectedTime();

    if (streamType === 'hls' || streamType === 'mp4') {
      const video = videoRef.current;
      if (!video) return;
      if (Math.abs(video.currentTime - expected) > 0.6) {
        video.currentTime = expected;
      }
      if (video.playbackRate !== playback.playbackRate) {
        video.playbackRate = playback.playbackRate;
      }
      if (playback.isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
      }
      setLocalPlaying(!video.paused);
    } else if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
      const yt = ytPlayerRef.current;
      const ytTime = yt.getCurrentTime?.() ?? 0;
      if (Math.abs(ytTime - expected) > 0.8) {
        yt.seekTo(expected, true);
      }
      yt.setPlaybackRate?.(playback.playbackRate);
      if (playback.isPlaying) {
        yt.playVideo?.();
        setLocalPlaying(true);
      } else {
        yt.pauseVideo?.();
        setLocalPlaying(false);
      }
    }
  }, [playback, activeStream, streamType, getExpectedTime]);

  // Periodic UI time update + gentle drift correction
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!playback || !activeStream) return;
      const expected = getExpectedTime();

      if (streamType === 'hls' || streamType === 'mp4') {
        const video = videoRef.current;
        if (!video) return;
        setCurrentTime(video.currentTime);
        setLocalPlaying(!video.paused);
        if (Number.isFinite(video.duration)) setDuration(video.duration);
        if (playback.isPlaying && !video.paused && Math.abs(video.currentTime - expected) > 1.0) {
          video.currentTime = expected;
        }
      } else if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
        const yt = ytPlayerRef.current;
        const t = yt.getCurrentTime?.() ?? 0;
        const d = yt.getDuration?.() ?? 0;
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        const state = yt.getPlayerState?.();
        if (playback.isPlaying && state === 1 && Math.abs(t - expected) > 1.2) {
          yt.seekTo(expected, true);
        }
      }
    }, 500);

    return () => window.clearInterval(id);
  }, [playback, activeStream, streamType, getExpectedTime]);

  // Real-frame ambient canvas sampler (~5 FPS, 32x18px) for HLS / MP4
  useEffect(() => {
    if (!ambientEnabled || (streamType !== 'hls' && streamType !== 'mp4')) return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = ambientCanvasRef.current;
      if (!video || !canvas || video.paused || video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // Cross-origin video without CORS headers cannot be sampled
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [ambientEnabled, streamType]);

  // Volume sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
      videoRef.current.volume = volume;
    }
    if (ytReadyRef.current && ytPlayerRef.current) {
      if (muted) ytPlayerRef.current.mute?.();
      else {
        ytPlayerRef.current.unMute?.();
        ytPlayerRef.current.setVolume?.(Math.round(volume * 100));
      }
    }
  }, [muted, volume]);

  const getActiveTime = () => {
    if ((streamType === 'hls' || streamType === 'mp4') && videoRef.current) {
      return videoRef.current.currentTime;
    }
    if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
      return ytPlayerRef.current.getCurrentTime?.() ?? currentTime;
    }
    return currentTime;
  };

  const togglePlay = () => {
    if (!playback) return;
    const t = getActiveTime();

    if (streamType === 'hls' || streamType === 'mp4') {
      const video = videoRef.current;
      if (!video) return;
      if (!localPlaying) {
        video.play().catch(() => {});
        setLocalPlaying(true);
        if (canControl) onPlay(t);
      } else {
        if (canControl) {
          video.pause();
          setLocalPlaying(false);
          onPause(t);
        }
      }
    } else if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
      const yt = ytPlayerRef.current;
      if (!localPlaying) {
        yt.playVideo?.();
        setLocalPlaying(true);
        if (canControl) onPlay(t);
      } else if (canControl) {
        yt.pauseVideo?.();
        setLocalPlaying(false);
        onPause(t);
      }
    }
  };

  const handleSeekInput = (newTime: number) => {
    if (!canControl) return;
    setCurrentTime(newTime);
    if ((streamType === 'hls' || streamType === 'mp4') && videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(newTime, true);
    }
    onSeek(newTime);
  };

  const handleSelectQuality = (id: string) => {
    setSelectedQuality(id);
    setOpenMenu(null);

    if (id.startsWith('stream:')) {
      const idx = Number(id.split(':')[1]);
      if (canControl && Number.isFinite(idx)) onSelectStream(idx);
      return;
    }
    if (streamType === 'hls' && hlsRef.current) {
      hlsRef.current.currentLevel = Number(id);
    } else if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
      ytPlayerRef.current.setPlaybackQuality?.(id);
    }
  };

  const toggleSubtitles = () => {
    if (streamType === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
      const yt = ytPlayerRef.current;
      const next = !subtitlesEnabled;
      setSubtitlesEnabled(next);
      if (next) {
        yt.loadModule?.('captions');
        yt.setOption?.('captions', 'reload', true);
      } else {
        yt.unloadModule?.('captions');
      }
      return;
    }

    if (streamType === 'hls' && hlsRef.current) {
      if (subtitleOptions.length === 0) return;
      if (subtitleOptions.length === 1) {
        const nextIdx = subtitlesEnabled ? -1 : Number(subtitleOptions[0].id);
        hlsRef.current.subtitleTrack = nextIdx;
        setSubtitlesEnabled(nextIdx !== -1);
        setSelectedSubtitle(nextIdx);
      } else {
        setOpenMenu((m) => (m === 'subtitles' ? null : 'subtitles'));
      }
      return;
    }

    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      if (!tracks || tracks.length === 0) return;
      const next = !subtitlesEnabled;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = next && i === 0 ? 'showing' : 'disabled';
      }
      setSubtitlesEnabled(next);
    }
  };

  const selectHlsSubtitle = (trackId: number) => {
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = trackId;
    }
    setSelectedSubtitle(trackId);
    setSubtitlesEnabled(trackId !== -1);
    setOpenMenu(null);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((v) => !v);
      } else if (e.key === 'c' || e.key === 'C') {
        toggleSubtitles();
      } else if (e.key === 'ArrowRight' && canControl) {
        handleSeekInput(Math.min(duration || 99999, getActiveTime() + 5));
      } else if (e.key === 'ArrowLeft' && canControl) {
        handleSeekInput(Math.max(0, getActiveTime() - 5));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const revealControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (localPlaying) {
        setControlsVisible(false);
        setOpenMenu(null);
      }
    }, 2800);
  };

  if (!media || !activeStream) {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-white/8 bg-[#12141A] text-center p-8">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#181B22] text-zinc-400">
          <Film className="h-6 w-6" />
        </div>
        <h3 className="text-base font-medium text-white">Кинозал готов к запуску</h3>
        <p className="mt-1.5 max-w-sm text-xs text-zinc-400">
          Вставьте ссылку на страницу с фильмом, YouTube или видео в панели справа.
        </p>
      </div>
    );
  }

  const activeQualityLabel =
    qualityOptions.find((q) => q.id === selectedQuality)?.label || activeStream.quality || 'Авто';

  return (
    <div
      ref={containerRef}
      onMouseMove={revealControls}
      onMouseLeave={() => localPlaying && setControlsVisible(false)}
      className="relative aspect-video w-full min-w-0 max-w-full select-none group"
    >
      {/* Ambient Glow: only for HLS / MP4 where real video frames can be sampled */}
      {ambientEnabled && (streamType === 'hls' || streamType === 'mp4') && (
        <div className="pointer-events-none absolute -inset-4 z-0 rounded-3xl opacity-75 blur-2xl saturate-200 transition-opacity duration-700">
          <canvas
            ref={ambientCanvasRef}
            width={32}
            height={18}
            className="h-full w-full rounded-3xl transition-all duration-300"
          />
        </div>
      )}

      {/* Main Clipped Player Frame */}
      <div className="relative z-10 h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        {/* Video Surface */}
        {(streamType === 'hls' || streamType === 'mp4') && (
          <video
            ref={videoRef}
            crossOrigin="anonymous"
            onClick={togglePlay}
            playsInline
            className="h-full w-full object-contain bg-black"
          />
        )}

        {streamType === 'youtube' && (
          <div className="relative h-full w-full overflow-hidden">
            <div
              ref={ytContainerRef}
              className="pointer-events-none absolute inset-x-0 -top-[70px] h-[calc(100%+140px)] w-full [&>iframe]:h-full [&>iframe]:w-full"
            />
            <div onClick={togglePlay} className="absolute inset-0 z-10 cursor-pointer" />
          </div>
        )}

        {streamType === 'iframe' && (
          <div className="relative h-full w-full">
            <iframe
              src={streamUrl ?? ''}
              allowFullScreen
              className="h-full w-full border-0"
              title={media.title}
            />
            {media.streams.length > 1 && canControl && (
              <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#12141A]/90 backdrop-blur-md p-1 shadow-xl">
                  {media.streams.map((s, idx) => (
                    <button
                      key={s.url + idx}
                      type="button"
                      onClick={() => onSelectStream(idx)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] transition cursor-pointer ${
                        idx === media.selectedStreamIndex
                          ? 'bg-indigo-500/25 text-indigo-200'
                          : 'text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {s.quality}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Unified Minimalist Controls */}
        {streamType !== 'iframe' && (
          <div
            className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-3.5 pt-14 transition-opacity duration-300 ${
              controlsVisible || !localPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Seekbar */}
            <div className="mb-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={Math.min(currentTime, duration || 100)}
                disabled={!canControl}
                onChange={(e) => handleSeekInput(Number(e.target.value))}
                className="h-1 w-full accent-indigo-400 cursor-pointer disabled:cursor-default"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  title={localPlaying ? 'Пауза (Space)' : 'Воспроизвести (Space)'}
                >
                  {localPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="text-zinc-300 hover:text-white transition cursor-pointer"
                    title="Звук (M)"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      setMuted(false);
                      setVolume(Number(e.target.value));
                    }}
                    className="hidden sm:block w-20 h-1 accent-white cursor-pointer"
                  />
                </div>

                <span className="font-mono text-xs text-zinc-300">
                  {formatTime(currentTime)} <span className="text-zinc-500">/</span>{' '}
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2 relative">
                {/* Subtitles toggle / menu */}
                {(streamType === 'youtube' || subtitleOptions.length > 0) && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={toggleSubtitles}
                      title="Субтитры (C)"
                      className={`rounded-lg p-1.5 transition cursor-pointer ${
                        subtitlesEnabled
                          ? 'bg-indigo-500/25 text-indigo-300'
                          : 'bg-white/10 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <Captions className="h-4 w-4" />
                    </button>
                    {openMenu === 'subtitles' && subtitleOptions.length > 1 && (
                      <div className="absolute bottom-10 right-0 w-40 rounded-xl border border-white/10 bg-[#12141A] p-1 shadow-xl z-30">
                        <button
                          type="button"
                          onClick={() => selectHlsSubtitle(-1)}
                          className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                            selectedSubtitle === -1
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'text-zinc-300 hover:bg-white/5'
                          }`}
                        >
                          Выключить
                        </button>
                        {subtitleOptions.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => selectHlsSubtitle(Number(t.id))}
                            className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                              selectedSubtitle === t.id
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Quality selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenu((m) => (m === 'quality' ? null : 'quality'))
                    }
                    className="flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-zinc-200 transition cursor-pointer"
                    title="Качество видео"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {activeQualityLabel}
                  </button>
                  {openMenu === 'quality' && (
                    <div className="absolute bottom-10 right-0 w-48 rounded-xl border border-white/10 bg-[#12141A] p-1 shadow-xl z-30">
                      {qualityOptions.length > 0 ? (
                        qualityOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSelectQuality(opt.id)}
                            className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                              opt.id === selectedQuality
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))
                      ) : (
                        <div className="px-2.5 py-1.5 text-xs text-zinc-400">Авто (по умолчанию)</div>
                      )}
                      {media.streams.length > 1 && canControl && (
                        <>
                          <div className="my-1 border-t border-white/8" />
                          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
                            Плеер / Источник
                          </div>
                          {media.streams.map((s, idx) => (
                            <button
                              key={s.url + idx}
                              type="button"
                              onClick={() => {
                                onSelectStream(idx);
                                setOpenMenu(null);
                              }}
                              className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs truncate transition cursor-pointer ${
                                idx === media.selectedStreamIndex
                                  ? 'bg-indigo-500/20 text-indigo-300'
                                  : 'text-zinc-300 hover:bg-white/5'
                              }`}
                            >
                              {s.label || s.quality}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Playback rate */}
                {canControl && (
                  <button
                    type="button"
                    onClick={() => {
                      const rates = [1, 1.25, 1.5, 2];
                      const next =
                        rates[(rates.indexOf(playback?.playbackRate ?? 1) + 1) % rates.length];
                      onRateChange(next, getActiveTime());
                    }}
                    className="rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 font-mono text-xs text-zinc-200 transition cursor-pointer"
                    title="Скорость воспроизведения"
                  >
                    {playback?.playbackRate ?? 1}x
                  </button>
                )}

                {(streamType === 'hls' || streamType === 'mp4') && (
                  <button
                    type="button"
                    onClick={() => setAmbientEnabled((v) => !v)}
                    title="Эмбиент-подсветка"
                    className={`rounded-lg p-1.5 transition cursor-pointer ${
                      ambientEnabled
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title="Полный экран (F)"
                  className="rounded-lg bg-white/10 hover:bg-white/20 p-1.5 text-zinc-200 transition cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
