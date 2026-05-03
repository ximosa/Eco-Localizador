import React, { useRef, useEffect } from 'react';

interface RadarCanvasProps {
  audioData: Float32Array;
  distance: number;
  isScanning: boolean;
}

export const RadarCanvas: React.FC<RadarCanvasProps> = ({ audioData, distance, isScanning }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const angleRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // --- Background Radar Rings ---
      ctx.strokeStyle = 'rgba(0, 255, 65, 0.2)';
      ctx.lineWidth = 1;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(centerX, centerY) - 20;

      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (maxRadius / 4) * i, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Axis lines
      ctx.beginPath();
      ctx.moveTo(centerX - maxRadius, centerY);
      ctx.lineTo(centerX + maxRadius, centerY);
      ctx.moveTo(centerX, centerY - maxRadius);
      ctx.lineTo(centerX, centerY + maxRadius);
      ctx.stroke();

      // --- Radar Sweep ---
      if (isScanning) {
        angleRef.current = (angleRef.current + 0.05) % (Math.PI * 2);
        const sweepGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
        sweepGradient.addColorStop(0, 'rgba(0, 255, 65, 0)');
        sweepGradient.addColorStop(1, 'rgba(0, 255, 65, 0.2)');

        ctx.fillStyle = sweepGradient;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, maxRadius, angleRef.current - 0.2, angleRef.current);
        ctx.lineTo(centerX, centerY);
        ctx.fill();

        // Tip of the sweep
        ctx.strokeStyle = '#00FF41';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
          centerX + Math.cos(angleRef.current) * maxRadius,
          centerY + Math.sin(angleRef.current) * maxRadius
        );
        ctx.stroke();
      }

      // --- Oscilloscope View (Bottom) ---
      const oscHeight = 100;
      const oscTop = height - oscHeight - 10;
      ctx.fillStyle = 'rgba(0, 20, 0, 0.5)';
      ctx.fillRect(10, oscTop, width - 20, oscHeight);
      ctx.strokeStyle = '#00FF41';
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      const sliceWidth = (width - 20) / audioData.length;
      let x = 10;

      for (let i = 0; i < audioData.length; i++) {
        const v = audioData[i] * 50; // Scale amplitude
        const y = oscTop + oscHeight / 2 + v;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.stroke();

      // Labels
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00FF41';
      ctx.fillText('SEÑAL EN TIEMPO REAL', 15, oscTop + 15);
      
      // Distance Marker on Radar
      if (distance > 0 && distance < 10) { // arbitrary max view range for UI
        const mappedRadius = (distance / 10) * maxRadius;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, mappedRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#FF0000';
        ctx.fillText(`${distance.toFixed(2)}m`, centerX + mappedRadius + 5, centerY - 5);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationRef.current);
  }, [audioData, distance, isScanning]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={500}
      className="w-full h-auto bg-black rounded-lg border border-[#003B00] shadow-[0_0_20px_rgba(0,59,0,0.3)]"
      id="radar-canvas"
    />
  );
};
