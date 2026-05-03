/**
 * Echo-Locator Audio Engine
 * Handles sonar pulse generation, echo detection, and distance calculation.
 */

export enum EchoEngineState {
  IDLE = 'idle',
  CALIBRATING = 'calibrating',
  SCANNING = 'scanning',
}

interface ScanResult {
  distance: number;
  latencyRaw: number;
  peakAmplitude: number;
}

export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private state: EchoEngineState = EchoEngineState.IDLE;
  
  // Calibration latency (ms) - internal device delay from speaker to mic
  private calibrationLatency: number = 0;
  
  // Audio parameters
  private readonly CHIRP_DURATION = 0.01; // 10ms
  private readonly START_FREQ = 16000;
  private readonly END_FREQ = 18000;
  private readonly SPEED_OF_SOUND = 343; // m/s
  
  private onDataCallback: ((data: Float32Array, result?: ScanResult) => void) | null = null;

  constructor() {}

  async initialize() {
    if (this.audioCtx) return;
    
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('El acceso al micrófono no está disponible. Asegúrate de estar usando HTTPS y un navegador moderno.');
    }
    
    try {
      // First try with sonar-optimized settings
      const constraints = {
        audio: {
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
        } 
      };
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        console.warn('Optimized constraints failed, falling back to basic audio', e);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      this.audioCtx = new AudioContext({ sampleRate: 48000 });
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      
      this.inputSource = this.audioCtx.createMediaStreamSource(stream);
      
      // Bandpass filter centered at 19kHz
      this.filter = this.audioCtx.createBiquadFilter();
      this.filter.type = 'bandpass';
      this.filter.frequency.value = 17000;
      this.filter.Q.value = 5.0; // Sharpness
      
      this.inputSource.connect(this.filter);
      this.filter.connect(this.analyser);
      
    } catch (err) {
      console.error('Failed to initialize audio engine:', err);
      throw err;
    }
  }

  setDataCallback(cb: (data: Float32Array, result?: ScanResult) => void) {
    this.onDataCallback = cb;
  }

  private async chirp(): Promise<number> {
    if (!this.audioCtx) return 0;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.START_FREQ, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(this.END_FREQ, this.audioCtx.currentTime + this.CHIRP_DURATION);

    gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.audioCtx.currentTime + 0.002);
    gain.gain.setValueAtTime(1, this.audioCtx.currentTime + this.CHIRP_DURATION - 0.002);
    gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + this.CHIRP_DURATION);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    const startTime = performance.now();
    osc.start();
    osc.stop(this.audioCtx.currentTime + this.CHIRP_DURATION);
    
    return startTime;
  }

  async ping(): Promise<ScanResult | null> {
    if (!this.audioCtx || !this.analyser) return null;
    
    const sendTime = await this.chirp();
    
    // We need to listen for the echo.
    // In a real sonar, we'd use cross-correlation, but for simple app, 
    // we'll look for the first threshold crossing in the filtered buffer.
    
    return new Promise((resolve) => {
      const bufferLength = this.analyser!.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      
      // Allow some time for the signal to travel and return
      let startTimeSearch = performance.now();
      const searchWindow = 200; // ms to listen for echo
      
      const checkPeak = () => {
        const now = performance.now();
        if (now - startTimeSearch > searchWindow) {
          resolve(null);
          return;
        }

        this.analyser!.getFloatTimeDomainData(dataArray);
        if (this.onDataCallback) this.onDataCallback(dataArray);

        // Peak detection logic
        let peakValue = 0;
        let peakIndex = -1;
        const threshold = 0.05; // Adjustable

        for (let i = 0; i < dataArray.length; i++) {
          const val = Math.abs(dataArray[i]);
          if (val > threshold && val > peakValue) {
            peakValue = val;
            peakIndex = i;
          }
        }

        if (peakIndex !== -1) {
          // Calculate time
          // This is a simplified peak detection.
          const timeOfPeak = performance.now();
          const latencyRaw = timeOfPeak - sendTime;
          
          // Correction for calibration
          const correctedTime = Math.max(0, latencyRaw - this.calibrationLatency);
          const distance = (this.SPEED_OF_SOUND * (correctedTime / 1000)) / 2;

          resolve({
            distance,
            latencyRaw,
            peakAmplitude: peakValue
          });
        } else {
          requestAnimationFrame(checkPeak);
        }
      };

      requestAnimationFrame(checkPeak);
    });
  }

  async calibrate() {
    this.state = EchoEngineState.CALIBRATING;
    // Pings multiple times to find the average minimum latency (direct speaker-to-mic path)
    let latencies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await this.ping();
      if (result) latencies.push(result.latencyRaw);
      await new Promise(r => setTimeout(r, 200));
    }
    
    if (latencies.length > 0) {
      // Use the median or second percentile to find the "direct" arrival
      latencies.sort((a, b) => a - b);
      this.calibrationLatency = latencies[0]; // The fastest signal is the internal one
      console.log('Calibrated latency:', this.calibrationLatency);
    }
    this.state = EchoEngineState.IDLE;
  }

  getCalibrationValue() {
    return this.calibrationLatency;
  }

  getState() {
    return this.state;
  }
}
