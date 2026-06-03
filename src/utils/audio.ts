// Web Audio API Synthesizer for MashMatch v4.0 (Requirement 6)
// Retro-arcade styled digital audio effects synthesized live in-browser.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a custom sci-fi frequency sweep (Intro step)
 */
export function playIntroSweep() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 1.2);
    
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    // Add simple filter to make it warmer
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(2000, now + 1.2);
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 1.2);
  } catch (e) {
    console.warn('Audio Context is blocked or unsupported', e);
  }
}

/**
 * Play a double digital chime (3rd Place)
 */
export function playThirdPlaceChime() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const notes = [440, 554.37]; // A4 -> C#5 (positive major chord)
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.15);
      
      gainNode.gain.setValueAtTime(0.001, now + index * 0.15);
      gainNode.gain.linearRampToValueAtTime(0.12, now + index * 0.15 + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.15 + 0.4);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + index * 0.15);
      osc.stop(now + index * 0.15 + 0.4);
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Play a triple Note bright harmonic arpeggio (2nd Place)
 */
export function playSecondPlaceArpeggio() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5 (C Major Arpeggio)
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.1);
      
      gainNode.gain.setValueAtTime(0.001, now + index * 0.1);
      gainNode.gain.linearRampToValueAtTime(0.12, now + index * 0.1 + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.5);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + index * 0.1);
      osc.stop(now + index * 0.1 + 0.5);
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Play Grand Triumph Fanfare with simulated confetti pop (1st Place / Champion)
 */
export function playChampionFanfare() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Notes for triumphant fanfare: C5, E5, G5, C6 (very fast ascension)
    const tones = [523.25, 659.25, 783.99, 1046.50];
    tones.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      // Warm square/saw mix by using parallel oscillators or just triangle+sine
      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);
      
      // Longer notes for champion
      gainNode.gain.setValueAtTime(0.001, now + index * 0.08);
      gainNode.gain.linearRampToValueAtTime(0.15, now + index * 0.08 + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 1.2);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 1.2);
    });
    
    // White noise confetti pop simulation
    const bufferSize = ctx.sampleRate * 0.3; // 0.3 seconds duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    // Low pass filter for heavy boom bass confetti pop
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.3);
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    noiseNode.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noiseNode.start(now);
    noiseNode.stop(now + 0.3);
  } catch (e) {
    console.warn(e);
  }
}
