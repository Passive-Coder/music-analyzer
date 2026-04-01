export class AudioManager {
  audioContext: AudioContext | null = null;
  audioElement: HTMLAudioElement | null = null;
  sourceNode: MediaElementAudioSourceNode | null = null;
  analyserNode: AnalyserNode | null = null;
  isPlaying = false;
  frequencyData: Uint8Array | null = null;
  onEndedCallback: (() => void) | null = null;

  init() {
    if (!this.audioContext && typeof window !== "undefined") {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

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
        this.onEndedCallback?.();
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
    } catch (error) {
      console.error("Audio playback failed", error);
      this.isPlaying = false;
    }
  }

  async resume() {
    if (!this.audioElement || !this.audioContext) return;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    try {
      await this.audioElement.play();
    } catch (error) {
      console.error("Audio resume failed", error);
    }
  }

  pause() {
    this.audioElement?.pause();
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

  setOnEnded(callback: () => void) {
    this.onEndedCallback = callback;
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

    this.analyserNode.getByteFrequencyData(this.frequencyData);

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;

    for (let index = 0; index < 3; index += 1) lowSum += this.frequencyData[index];
    for (let index = 3; index < 24; index += 1) midSum += this.frequencyData[index];
    for (let index = 24; index < 256; index += 1) highSum += this.frequencyData[index];

    return {
      low: lowSum / (3 * 255),
      mid: midSum / (21 * 255),
      high: highSum / ((256 - 24) * 255),
    };
  }
}

export const audioManager =
  typeof window !== "undefined" ? new AudioManager() : null;
