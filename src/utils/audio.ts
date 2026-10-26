/**
 * Web Audio API synthesizer for retro-futuristic sound alerts in CyberNotes.
 * Zero external files, 100% offline-friendly, high-performance, and ultra-low latency.
 */

// Un único AudioContext reutilizado: crear uno por sonido agotaba instancias
// (Chromium limita los contextos vivos) y generaba basura por cada clic.
let sharedCtx: AudioContext | null = null;
function getSharedContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioContextClass();
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

export function playSynthSound(preset: string) {
  if (preset === 'off' || !preset) return;

  try {
    const ctx = getSharedContext();
    if (!ctx) return;

    if (preset === 'mechanical-click') {
      // Metallic tactile hardware key click
      const bufferSize = ctx.sampleRate * 0.05; // 50ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1200, ctx.currentTime);
      noiseFilter.Q.setValueAtTime(2.0, ctx.currentTime);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      // Low frequency pop for tactile depth
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.015);

      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

      osc.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      osc.start();
      noise.stop(ctx.currentTime + 0.05);
      osc.stop(ctx.currentTime + 0.05);

    } else if (preset === 'cyber-beep') {
      // Crisp neon double beep chirp
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      // First fast chirp
      osc1.frequency.setValueAtTime(950, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(1300, ctx.currentTime + 0.05);

      // Second offset chirp
      osc2.frequency.setValueAtTime(1400, ctx.currentTime + 0.045);
      osc2.frequency.exponentialRampToValueAtTime(1900, ctx.currentTime + 0.095);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.10);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc1.stop(ctx.currentTime + 0.06);
      osc2.start(ctx.currentTime + 0.045);
      osc2.stop(ctx.currentTime + 0.10);

    } else if (preset === 'digital-chime') {
      // Beautiful ascending 3-note cyber chime
      const notes = [659.25, 783.99, 987.77]; // E5, G5, B5
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.06);

        gain.gain.setValueAtTime(0, ctx.currentTime + index * 0.06);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + index * 0.06 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.06 + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime + index * 0.06);
        osc.stop(ctx.currentTime + index * 0.06 + 0.19);
      });

    } else if (preset === 'glitch-blip') {
      // Glitchy retro fast pitch sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(70, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 0.07);

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(700, ctx.currentTime);

      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.075);
    }
  } catch (e) {
    console.error('Audio synthesis failed:', e);
  }
}
