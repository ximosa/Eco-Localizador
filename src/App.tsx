/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Radar, Power, Zap, Activity, ShieldAlert, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioEngine, EchoEngineState } from './lib/AudioEngine';
import { RadarCanvas } from './components/RadarCanvas';

export default function App() {
  const [engine] = useState(() => new AudioEngine());
  const [isStarted, setIsStarted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [distance, setDistance] = useState(0);
  const [audioData, setAudioData] = useState<Float32Array>(new Float32Array(1024));
  const [error, setError] = useState<string | null>(null);
  const [calibrationValue, setCalibrationValue] = useState(0);

  const scanIntervalRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('SISTEMA BLOQUEADO: No estás en una conexión segura (HTTPS o localhost). El acceso al micrófono no es posible.');
    }
  }, []);

  useEffect(() => {
    engine.setDataCallback((data) => {
      setAudioData(new Float32Array(data));
    });
  }, [engine]);

  const togglePower = async () => {
    console.log('Toggle Power called. current isStarted:', isStarted, 'isInitializing:', isInitializing);
    if (!isStarted) {
      if (isInitializing) return;
      setIsInitializing(true);
      try {
        await engine.initialize();
        setIsStarted(true);
        setError(null);
      } catch (err: any) {
        console.error(err);
        if (err.name === 'NotAllowedError') {
          setError('Permiso denegado. Haz clic en el candado de la barra de direcciones para permitir el micrófono.');
        } else if (err.name === 'NotFoundError') {
          setError('No se ha detectado ningún micrófono en este dispositivo.');
        } else {
          setError(`Fallo de hardware: ${err.message || 'Error desconocido'}`);
        }
      } finally {
        setIsInitializing(false);
      }
    } else {
      stopScanning();
      setIsStarted(false);
    }
  };

  const isScanningRef = useRef(false);

  const startScanning = () => {
    if (!isStarted || isScanning) return;
    setIsScanning(true);
    isScanningRef.current = true;
    
    let lastDistances: number[] = [];

    const runPing = async () => {
      if (!isScanningRef.current) return;
      const result = await engine.ping();
      
      if (result) {
        // Filtrado por Mediana para descartar picos de ruido aleatorio
        lastDistances.push(result.distance);
        if (lastDistances.length > 5) lastDistances.shift();
        
        const sorted = [...lastDistances].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        
        // Suavizado exponencial (EMA) para que el número baile de forma elegante
        setDistance(prev => {
          if (prev === 0) return median;
          return prev * 0.8 + median * 0.2;
        });
      }
      
      if (isScanningRef.current) {
        scanIntervalRef.current = window.setTimeout(runPing, 300);
      }
    };
    
    runPing();
  };

  const stopScanning = () => {
    setIsScanning(false);
    isScanningRef.current = false;
    if (scanIntervalRef.current) {
      window.clearTimeout(scanIntervalRef.current);
    }
  };

  const runCalibration = async () => {
    if (!isStarted || isCalibrating) return;
    setIsCalibrating(true);
    await engine.calibrate();
    setCalibrationValue(engine.getCalibrationValue());
    setIsCalibrating(false);
  };

  return (
    <div className="min-h-screen bg-[#060a06] text-[#00ff41] p-4 font-sans grid-bg flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 border-b border-[#00ff41]/30 pb-4">
        <div className="flex items-center gap-2">
          <Radar className="w-8 h-8 animate-pulse" />
          <h1 className="text-2xl font-bold tracking-tighter uppercase radar-glow">Eco-Localizador</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Estado del Sistema</div>
          <div className="text-sm font-mono flex items-center justify-end gap-2">
            <span className={isStarted ? "text-green-500" : "text-red-500"}>●</span>
            {isStarted ? "EN LÍNEA" : "DESCONECTADO"}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 items-start overflow-y-auto">
        {/* Left: Visualization */}
        <section className="flex flex-col gap-4">
          <RadarCanvas 
            audioData={audioData} 
            distance={distance} 
            isScanning={isScanning} 
          />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[#00ff41]/20 p-3 bg-black/40 rounded">
              <span className="text-[10px] block opacity-50 uppercase mb-1 font-mono">Latencia Interna</span>
              <span className="text-lg font-mono tracking-tight">{calibrationValue.toFixed(2)}ms</span>
            </div>
            <div className="border border-[#00ff41]/20 p-3 bg-black/40 rounded">
              <span className="text-[10px] block opacity-50 uppercase mb-1 font-mono">Tasa de Escaneo</span>
              <span className="text-lg font-mono tracking-tight">3.3 Hz</span>
            </div>
          </div>
        </section>

        {/* Right: Controls and Readout */}
        <section className="flex flex-col gap-6">
          <div className="border border-[#00ff41]/30 p-6 bg-black/60 rounded-lg shadow-inner relative overflow-hidden">
            {/* Background scanline effect */}
            <div className="absolute inset-0 pointer-events-none opacity-10 bg-gradient-to-b from-transparent via-[#00ff41]/20 to-transparent animate-pulse" />
            
            <label className="text-[12px] uppercase tracking-widest opacity-60 mb-4 block font-mono">Distancia al Objetivo</label>
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-bold tracking-tighter radar-glow">
                {distance === 0 ? "0.0" : distance.toFixed(1)}
              </span>
              <span className="text-2xl font-mono">M</span>
            </div>
            
            <div className="mt-8 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-xs font-mono py-1 border-y border-[#00ff41]/10">
                <Zap className="w-3 h-3 text-[#00ff41]" />
                <span>FASE: EMISIÓN DE SONAR ACTIVO</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono py-1 border-y border-[#00ff41]/10">
                <Activity className="w-3 h-3 text-[#00ff41]" />
                <span>FREQ: CHIRP 4KHz - 6KHz</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button 
              id="btn-power"
              disabled={isInitializing}
              onClick={togglePower}
              className={`btn-radar flex items-center justify-center gap-2 ${isStarted ? 'bg-red-900/20 text-red-500 border-red-500' : ''} ${isInitializing ? 'opacity-50' : ''}`}
            >
              <Power className={`w-4 h-4 ${isInitializing ? 'animate-spin' : ''}`} />
              {isInitializing ? 'Inicializando...' : (isStarted ? 'Desactivar Sistema' : 'Inicializar Hardware')}
            </button>

            <div className="grid grid-cols-2 gap-4">
              <button 
                id="btn-calibrate"
                disabled={!isStarted || isCalibrating}
                onClick={runCalibration}
                className="btn-radar flex items-center justify-center gap-2"
              >
                <Cpu className="w-4 h-4" />
                {isCalibrating ? 'Calibrando...' : 'Calibrar'}
              </button>
              
              <button 
                id="btn-scan"
                disabled={!isStarted || isCalibrating}
                onClick={isScanning ? stopScanning : startScanning}
                className={`btn-radar flex items-center justify-center gap-2 ${isScanning ? 'bg-[#00ff41]/20' : ''}`}
              >
                <Activity className="w-4 h-4" />
                {isScanning ? 'Detener Escaneo' : 'Iniciar Escaneo'}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 border border-red-500 bg-red-900/20 text-red-500 flex items-center gap-3 rounded"
              >
                <ShieldAlert className="shrink-0" />
                <p className="text-xs font-mono">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="text-[10px] text-center opacity-40 font-mono mt-auto pt-8">
            CONFIDENCIAL / ESPECIF. MILITAR / ACCESO HARDWARE REQ. / v1.0.7
          </div>
        </section>
      </main>
    </div>
  );
}
