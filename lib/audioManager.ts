export class AudioManager {
  audioContext: AudioContext | null = null;
  audioElement: HTMLAudioElement | null = null;
  sourceNode: MediaElementAudioSourceNode | null = null;
  analyserNode: AnalyserNode | null = null;
  isPlaying: boolean = false;
  frequencyData: Uint8Array | null = null;

  init() {
    if (!this.audioContext && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);

      this.audioElement = new Audio();
      this.audioElement.crossOrigin = "anonymous";
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);

      this.audioElement.addEventListener("ended", () => {
        this.isPlaying = false;
      });
      this.audioElement.addEventListener("pause", () => {
        this.isPlaying = false;
      });
      this.audioElement.addEventListener("play", () => {
        this.isPlaying = true;
      });
    }
  }

  async play(url: string) {
    this.init();
    if (!this.audioContext || !this.audioElement) return;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    if (this.audioElement.src !== url) {
      this.audioElement.src = url;
    }

    try {
      await this.audioElement.play();
      this.isPlaying = true;
    } catch (e) {
      console.error("Audio playback failed", e);
      this.isPlaying = false;
    }
  }

  pause() {
    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.isPlaying = false;
  }

  seek(time: number) {
    if (this.audioElement) {
      this.audioElement.currentTime = time;
    }
  }

  getCurrentTime() {
    return this.audioElement ? this.audioElement.currentTime : 0;
  }

  getDuration() {
    return this.audioElement ? this.audioElement.duration || 0 : 0;
  }

  getFrequencyData() {
    if (!this.analyserNode || !this.isPlaying || !this.frequencyData) {
      return { low: 0, mid: 0, high: 0 };
    }

    this.analyserNode.getByteFrequencyData(this.frequencyData as any);

    let lowSum = 0, midSum = 0, highSum = 0;
    
    for (let i = 0; i < 3; i++) lowSum += this.frequencyData[i];
    for (let i = 3; i < 24; i++) midSum += this.frequencyData[i];
    for (let i = 24; i < 256; i++) highSum += this.frequencyData[i];

    return {
      low: lowSum / (3 * 255),
      mid: midSum / (21 * 255),
      high: highSum / ((256 - 24) * 255),
    };
  }
}

export const audioManager = typeof window !== "undefined" ? new AudioManager() : null;
