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
  private visualAnalyser: AnalyserNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private state: EchoEngineState = EchoEngineState.IDLE;
  
  // Calibration latency (ms) - internal device delay from speaker to mic
  private calibrationLatency: number = 0;
  
  // Audio parameters
  private readonly CHIRP_DURATION = 0.01; // 10ms
  private readonly START_FREQ = 4000;
  private readonly END_FREQ = 6000;
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
      
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 16384; // 341ms of history at 48kHz
      
      this.visualAnalyser = this.audioCtx.createAnalyser();
      this.visualAnalyser.fftSize = 2048;
      
      this.inputSource = this.audioCtx.createMediaStreamSource(stream);
      
      this.inputGain = this.audioCtx.createGain();
      this.inputGain.gain.value = 2.0; // Boost input signal
      
      // Bandpass filter centered at 5kHz
      this.filter = this.audioCtx.createBiquadFilter();
      this.filter.type = 'bandpass';
      this.filter.frequency.value = 5000;
      this.filter.Q.value = 2.0; // Wider bandpass for the sweep
      
      // Connect chains
      this.inputSource.connect(this.inputGain);

      // Path 1: Sonar (Filtered at 5kHz to ignore background noise)
      this.inputGain.connect(this.filter);
      this.filter.connect(this.analyser);
      
      // Path 2: Visual (Raw audio for the UI waves)
      this.inputGain.connect(this.visualAnalyser);
      
      // Start visual update loop
      this.startVisualLoop();
      
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
    
    // Use a small scheduling offset to avoid timing issues
    const startTime = this.audioCtx.currentTime + 0.01;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.START_FREQ, startTime);
    osc.frequency.exponentialRampToValueAtTime(this.END_FREQ, startTime + this.CHIRP_DURATION);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + 0.002);
    gain.gain.setValueAtTime(1, startTime + this.CHIRP_DURATION - 0.002);
    gain.gain.linearRampToValueAtTime(0, startTime + this.CHIRP_DURATION);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    const perfStartTime = performance.now() + 10; // Match the 10ms offset
    osc.start(startTime);
    osc.stop(startTime + this.CHIRP_DURATION);
    
    return perfStartTime;
  }

  async ping(): Promise<ScanResult | null> {
    if (!this.audioCtx || !this.analyser) return null;
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    
    const sendTime = await this.chirp();
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const bufferLength = this.analyser!.fftSize;
        const dataArray = new Float32Array(bufferLength);
        this.analyser!.getFloatTimeDomainData(dataArray);

        const now = performance.now();
        let bestPeakVal = 0;
        let bestPeakTime = 0;
        
        let noiseSum = 0;
        let noiseSamples = 0;

        for (let i = 0; i < dataArray.length; i++) {
           const val = Math.abs(dataArray[i]);
           const samplesAgo = dataArray.length - i;
           const msAgo = (samplesAgo / this.audioCtx!.sampleRate) * 1000;
           const timeOfSample = now - msAgo;
           
           const timeSinceSend = timeOfSample - sendTime;
           
           if (this.state === EchoEngineState.CALIBRATING) {
               // En calibración, buscar el pico máximo en los primeros 40ms (el eco interno)
               if (timeSinceSend > 0 && timeSinceSend < 40) {
                   if (val > bestPeakVal) {
                       bestPeakVal = val;
                       bestPeakTime = timeOfSample;
                   }
               }
           } else {
               // En escaneo, ignorar el ruido interno (crosstalk)
               const ignoreUntil = this.calibrationLatency + 10;
               
               // Buscar el pico absoluto DESPUÉS de ese tiempo y medir el ruido de fondo
               if (timeSinceSend > ignoreUntil) {
                   noiseSum += val;
                   noiseSamples++;
                   
                   if (val > bestPeakVal) {
                       bestPeakVal = val;
                       bestPeakTime = timeOfSample;
                   }
               }
           }
        }

        // Si estamos calibrando, aceptamos cualquier pico claro. Si estamos midiendo, usamos SNR (Signal-to-Noise Ratio).
        const avgNoise = noiseSamples > 0 ? noiseSum / noiseSamples : 0;
        const dynamicThreshold = this.state === EchoEngineState.CALIBRATING 
            ? 0.005 
            : Math.max(avgNoise * 3.5, 0.005); // El eco debe destacar x3.5 sobre el ruido de fondo

        if (bestPeakVal > dynamicThreshold) {
          const latencyRaw = bestPeakTime - sendTime;
          const correctedTime = Math.max(0, latencyRaw - this.calibrationLatency);
          const distance = (this.SPEED_OF_SOUND * (correctedTime / 1000)) / 2;

          resolve({
            distance,
            latencyRaw,
            peakAmplitude: bestPeakVal
          });
        } else {
          resolve(null);
        }
      }, 120);
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
    } else {
      console.warn('Calibration failed to find pulses. Using default hardware latency.');
      this.calibrationLatency = 15; // Average internal latency for mobile devices
    }
    this.state = EchoEngineState.IDLE;
  }

  private startVisualLoop() {
    const dataArray = new Float32Array(this.visualAnalyser!.frequencyBinCount);
    let lastUpdate = 0;
    const loop = (now: number) => {
      if (!this.visualAnalyser) return;
      
      // Throttle to ~20fps to avoid hogging the main thread
      if (now - lastUpdate > 50) {
        this.visualAnalyser.getFloatTimeDomainData(dataArray);
        if (this.onDataCallback) this.onDataCallback(dataArray);
        lastUpdate = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  getCalibrationValue() {
    return this.calibrationLatency;
  }

  getState() {
    return this.state;
  }
}
