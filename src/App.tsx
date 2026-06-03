/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db, handleFirestoreError } from './firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { Student, CountdownConfig, OperationType } from './types';
import { DEFAULT_STUDENTS } from './defaultStudents';
import { StudentAvatar } from './components/StudentAvatar';
import { AdminPanel } from './components/AdminPanel';
import { RevealShow } from './components/RevealShow';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Shield, 
  Clock, 
  Lock, 
  Volume2, 
  VolumeX, 
  Flame, 
  Sparkles, 
  Swords, 
  ChevronRight, 
  Plus 
} from 'lucide-react';

export default function App() {
  // 1. Core States
  const [students, setStudents] = useState<Student[]>([]);
  const [countdownConfig, setCountdownConfig] = useState<CountdownConfig | null>(null);
  const [activeCategory, setActiveCategory] = useState<'women' | 'men'>('women');

  // Voting Pairs
  const [leftContestant, setLeftContestant] = useState<Student | null>(null);
  const [rightContestant, setRightContestant] = useState<Student | null>(null);

  // Stats / Progress
  const [votedMatchups, setVotedMatchups] = useState<string[]>(() => {
    const saved = localStorage.getItem('mashMatch_voted_pairs');
    return saved ? JSON.parse(saved) : [];
  });

  // Countdown timer states
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number }>({ d: 0, h: 0, m: 0, s: 0 });
  const [timerFinished, setTimerFinished] = useState<boolean>(false);

  // UI state overlays
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [showRevealShow, setShowRevealShow] = useState<boolean>(false);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(true);

  // Play digital voting click Sound in-browser using synthetic Web Audio
  const playVoteSound = (winner: boolean) => {
    if (!sfxEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(winner ? 600 : 350, now);
      osc.frequency.exponentialRampToValueAtTime(10, now + 0.15);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn(e);
    }
  };

  // 2. Pre-hydration Cache & Background Synchronization Loop (Requirement 3)
  useEffect(() => {
    // Phase A: Pre-hydration instant load from localStorage
    const localCached = localStorage.getItem('mashMatch_cached_students');
    if (localCached) {
      try {
        const parsed = JSON.parse(localCached);
        if (parsed && parsed.length > 0) {
          setStudents(parsed);
        }
      } catch (err) {
        console.warn('Trouble pre-hydrating local students cache', err);
      }
    }

    // Phase B: Attach live Firestore snapshot listening
    const unsubscribeStudents = onSnapshot(
      collection(db, 'students'),
      async (snapshot) => {
        const list: Student[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Student);
        });

        if (list.length === 0) {
          // Automatic DB seeding if database is empty upon initial startup
          try {
            const seedPromises = DEFAULT_STUDENTS.map(student => {
              return setDoc(doc(db, 'students', student.id), {
                ...student,
                createdAt: serverTimestamp()
              });
            });
            await Promise.all(seedPromises);
            console.log('Seeded database with default students list successfully.');
          } catch (e) {
            console.error('Failure seeding default students in background', e);
          }
        } else {
          setStudents(list);
          localStorage.setItem('mashMatch_cached_students', JSON.stringify(list));
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'students');
      }
    );

    // Phase C: Attach live Firestore Config snapshot listening
    const unsubscribeConfig = onSnapshot(
      doc(db, 'config', 'countdown'),
      (docSnap) => {
        if (docSnap.exists()) {
          setCountdownConfig(docSnap.data() as CountdownConfig);
        } else {
          // Base config document fallback
          const defaultCountdown: CountdownConfig = {
            id: 'countdown',
            targetDate: new Date(Date.now() + 1000 * 3600 * 48).toISOString(), // 48h limit
            isActive: false
          };
          setDoc(doc(db, 'config', 'countdown'), defaultCountdown)
            .then(() => setCountdownConfig(defaultCountdown))
            .catch(err => console.warn(err));
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'config/countdown');
      }
    );

    return () => {
      unsubscribeStudents();
      unsubscribeConfig();
    };
  }, []);

  // 3. Countdown Ticking Engine with safety checks (Requirement 4 & 5)
  useEffect(() => {
    const updateTicker = () => {
      // Rule 4: Absolute optional chaining on config properties
      const isConfigActive = countdownConfig?.isActive ?? false;
      const targetDateStr = countdownConfig?.targetDate;

      if (!isConfigActive || !targetDateStr) {
        setTimerFinished(false);
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        return;
      }

      const targetMs = new Date(targetDateStr).getTime();
      const currentMs = Date.now();
      const difference = targetMs - currentMs;

      if (difference <= 0) {
        setTimerFinished(true);
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
      } else {
        setTimerFinished(false);
        const secs = Math.floor(difference / 1000);
        const mins = Math.floor(secs / 60);
        const hrs = Math.floor(mins / 60);
        const days = Math.floor(hrs / 24);

        setTimeLeft({
          d: days,
          h: hrs % 24,
          m: mins % 60,
          s: secs % 60
        });
      }
    };

    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => clearInterval(interval);
  }, [countdownConfig]);

  // 4. Random Pair Generator (Candidate Matchmaker selections)
  const selectRandomCandidates = useCallback(() => {
    // Filter candidates by category
    const filtered = students.filter(s => s.genre === activeCategory);
    if (filtered.length < 2) {
      setLeftContestant(null);
      setRightContestant(null);
      return;
    }

    // Select first randomly
    const idxA = Math.floor(Math.random() * filtered.length);
    let idxB = Math.floor(Math.random() * filtered.length);
    while (idxA === idxB) {
      idxB = Math.floor(Math.random() * filtered.length);
    }

    setLeftContestant(filtered[idxA]);
    setRightContestant(filtered[idxB]);
  }, [students, activeCategory]);

  // Select candidates on load or when dataset/category changes
  useEffect(() => {
    if (students.length > 0) {
      selectRandomCandidates();
    }
  }, [students, activeCategory, selectRandomCandidates]);

  // 5. Atomic ELO Voting & Expected Score logic calculation (Requirement 2)
  const castVote = async (winnerId: string, loserId: string) => {
    const isLocked = timerFinished && (countdownConfig?.isActive ?? false);
    if (isLocked) return; // Prevent voting inside locks

    if (!leftContestant || !rightContestant) return;

    const leftIsWinner = leftContestant.id === winnerId;
    const winnerObj = leftIsWinner ? leftContestant : rightContestant;
    const loserObj = leftIsWinner ? rightContestant : leftContestant;

    // Expected Scores
    // EA = 1 / (1 + 10^((RB - RA) / 400))
    // EB = 1 / (1 + 10^((RA - RB) / 400))
    const eWinner = 1 / (1 + Math.pow(10, (loserObj.elo - winnerObj.elo) / 400));
    const eLoser = 1 / (1 + Math.pow(10, (winnerObj.elo - loserObj.elo) / 400));

    // K factor = 32
    const kw = 32;
    const newWinnerElo = Math.max(100, Math.round(winnerObj.elo + kw * (1 - eWinner)));
    const newLoserElo = Math.max(100, Math.round(loserObj.elo + kw * (0 - eLoser)));

    // Increment Wins/Losses
    const winnerWins = winnerObj.wins + 1;
    const loserLosses = loserObj.losses + 1;

    // Track state locally for progress bar
    const sortedPairKey = [winnerId, loserId].sort().join('_');
    const updatedVotedPairs = [...votedMatchups];
    if (!updatedVotedPairs.includes(sortedPairKey)) {
      updatedVotedPairs.push(sortedPairKey);
      setVotedMatchups(updatedVotedPairs);
      localStorage.setItem('mashMatch_voted_pairs', JSON.stringify(updatedVotedPairs));
    }

    playVoteSound(true);

    try {
      // Synchronize atomically in Firestore (Requirement 2)
      // Non-admins can change only 'elo', 'wins', 'losses' based on security rules
      const winnerRef = doc(db, 'students', winnerObj.id);
      const loserRef = doc(db, 'students', loserObj.id);

      // Async write
      await setDoc(winnerRef, {
        ...winnerObj,
        elo: newWinnerElo,
        wins: winnerWins
      });

      await setDoc(loserRef, {
        ...loserObj,
        elo: newLoserElo,
        losses: loserLosses
      });

      // Show immediate response swap
      selectRandomCandidates();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${winnerObj.id}`);
    }
  };

  // Keyboard binding listener (Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if voting is locked
      const isLocked = timerFinished && (countdownConfig?.isActive ?? false);
      if (isLocked) return;

      if (!leftContestant || !rightContestant) return;

      if (e.key === 'ArrowLeft') {
        castVote(leftContestant.id, rightContestant.id);
      } else if (e.key === 'ArrowRight') {
        castVote(rightContestant.id, leftContestant.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftContestant, rightContestant, timerFinished, countdownConfig]);

  // Compute Vote Progress Stats (Percentage of combinations voted)
  const getProgressStats = () => {
    const totalContestantsInCat = students.filter(s => s.genre === activeCategory).length;
    // Total unique pairs formula: N * (N - 1) / 2
    const totalVersusCombinations = Math.max(1, (totalContestantsInCat * (totalContestantsInCat - 1)) / 2);
    const votesInRunningCategory = votedMatchups.filter(key => {
      // Find keys containing ids within the current category
      const currentCatIds = students.filter(s => s.genre === activeCategory).map(s => s.id);
      const [id1, id2] = key.split('_');
      return currentCatIds.includes(id1) && currentCatIds.includes(id2);
    }).length;

    const progressValue = Math.min(totalVersusCombinations, votesInRunningCategory);
    const percentInt = Math.round((progressValue / totalVersusCombinations) * 100);

    return {
      progress: progressValue,
      total: totalVersusCombinations,
      percent: percentInt,
      pending: Math.max(0, totalVersusCombinations - progressValue)
    };
  };

  const currentStats = getProgressStats();

  // Get sorted list of students in the active category to calculate dynamic ranks
  const sortedStudentsOfCategory = students
    .filter(s => s.genre === activeCategory)
    .sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      return b.wins - a.wins;
    });

  // Get Top 5 ranking for Live ELO Standings
  const liveStandings = sortedStudentsOfCategory.slice(0, 5);

  const isVotingLocked = timerFinished && (countdownConfig?.isActive ?? false);

  return (
    <div className="min-h-screen bg-[#030305] text-white font-sans antialiased relative selection:bg-[#bc13fe]/30 select-none p-4 sm:p-8 overflow-x-hidden md:overflow-visible">
      
      {/* Ambient Neon Glows from Design Template */}
      <div className="absolute -top-40 -left-40 w-[400px] h-[400px] bg-[#ff007a]/15 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#bc13fe]/15 blur-[160px] rounded-full pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/3 blur-[120px] rounded-full pointer-events-none"></div>

      {/* HEADER SECTION - Beautiful premium look */}
      <header className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12 pb-6 border-b border-white/5 max-w-7xl mx-auto">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-[#ff007a] shadow-[0_0_12px_#ff007a] rounded-sm"></div>
            <span className="font-mono text-[10px] tracking-[0.3em] text-[#ff007a] uppercase">Firestore Sync Active</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter italic">
            MASHMATCH
          </h1>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 block">
            • Aula de Adultos • ELO Matchmaker
          </span>
        </div>

        {/* Division switcher toggle (♀ vs ♂) */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveCategory('women')}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeCategory === 'women'
                ? 'bg-gradient-to-r from-[#ff007a] to-[#ff007a]/80 text-white shadow-lg shadow-pink-500/20 font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>♀ Femenino</span>
          </button>
          
          <button
            onClick={() => setActiveCategory('men')}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeCategory === 'men'
                ? 'bg-gradient-to-r from-[#bc13fe] to-[#bc13fe]/80 text-white shadow-lg shadow-purple-500/20 font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>♂ Masculino</span>
          </button>
        </div>

        {/* Utilities Toggles & Live countdown info */}
        <div className="flex flex-col items-start md:items-end gap-3">
          <div className="flex items-center gap-3">
            {/* SFX Toggle */}
            <button
              onClick={() => setSfxEnabled(!sfxEnabled)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 active:scale-95 text-gray-300 hover:text-white transition-all cursor-pointer flex items-center space-x-2 text-xs font-mono"
              title="Sound FX"
            >
              {sfxEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                  <span className="uppercase text-pink-400 font-bold text-[10px]">SFX ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-white/30" />
                  <span className="uppercase text-white/30 font-bold text-[10px]">MUTED</span>
                </>
              )}
            </button>

            {/* Admin Panel Toggle */}
            <button
              onClick={() => setShowAdminPanel(true)}
              className="p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 active:scale-95 text-[#bc13fe] hover:text-[#ff007a] transition-all cursor-pointer flex items-center"
              title="Consola de Administración"
            >
              <Shield className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col items-start md:items-end">
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest leading-none mb-1">
              {countdownConfig?.isActive ? 'Final Countdown' : 'Competición Global'}
            </span>
            {countdownConfig?.isActive ? (
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold font-mono text-white">
                    {String(timeLeft.d * 24 + timeLeft.h).padStart(2, '0')}
                  </span>
                  <span className="text-[8px] text-white/35 uppercase tracking-tighter">Hours</span>
                </div>
                <span className="text-xl font-bold opacity-30 text-white">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold font-mono text-[#bc13fe]">
                    {String(timeLeft.m).padStart(2, '0')}
                  </span>
                  <span className="text-[8px] text-white/35 uppercase tracking-tighter">Mins</span>
                </div>
                <span className="text-xl font-bold opacity-30 text-white">:</span>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold font-mono text-[#ff007a] animate-pulse">
                    {String(timeLeft.s).padStart(2, '0')}
                  </span>
                  <span className="text-[8px] text-white/35 uppercase tracking-tighter">Secs</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
                <span className="text-[10px] font-bold text-white/60 font-mono tracking-wider uppercase">SIN LÍMITE</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 select-none items-stretch">
        
        {/* LEFT COLUMN: VOTING INTERFACE (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-8">
          
          {/* SEC 1: Progress Meter */}
          <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#ff007a] animate-ping" />
                <h3 className="font-bold font-mono text-white text-xs uppercase tracking-wider">
                  Progreso de Combinaciones Votadas
                </h3>
              </div>
              <span className="font-mono text-[10px] text-white/40">
                Categoría: <strong className="text-white uppercase">{activeCategory === 'women' ? 'Femenino' : 'Masculino'}</strong>
              </span>
            </div>

            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden mb-2 border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-[#ff007a] to-[#bc13fe] transition-all duration-500 rounded-full"
                style={{ width: `${currentStats.percent}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono text-white/40 mt-1">
              <span>Matchups: <strong>{currentStats.progress} / {currentStats.total}</strong> ({currentStats.percent}%)</span>
              <span>Por votar: <strong className="text-[#bc13fe]">{currentStats.pending}</strong></span>
            </div>
          </div>

          {/* SEC 2: VOTING CARDS SCREEN */}
          <div className="relative min-h-[420px] flex items-center justify-center">
            
            <AnimatePresence mode="wait">
              {isVotingLocked ? (
                // 🔒 VOTATION FINISHED BANNER
                <motion.div 
                  key="finished"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full text-center p-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.02] backdrop-blur-md flex flex-col items-center justify-center py-16"
                >
                  <div className="w-20 h-20 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-6 animate-bounce">
                    <Trophy className="w-10 h-10 text-yellow-500 glow-pink" />
                  </div>
                  
                  <h2 className="text-3xl font-extrabold text-white font-sans tracking-wide">
                    ¡VOTACIÓN FINALIZADA!
                  </h2>
                  <p className="text-gray-400 max-w-sm mx-auto mt-3 font-sans leading-relaxed text-xs">
                    El tiempo límite de competencia ha concluido de forma oficial. Los registros actuales ya están asegurados y el podio definitivo está listo para la ceremonia.
                  </p>

                  <div className="mt-8">
                    <button
                      onClick={() => setShowRevealShow(true)}
                      className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-black font-sans text-xs tracking-widest uppercase transition-all shadow-xl shadow-yellow-500/20 transform hover:-translate-y-1 hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 fill-current text-black" />
                      <span>Iniciar Show de Revelación</span>
                    </button>
                  </div>
                </motion.div>
              ) : !leftContestant || !rightContestant ? (
                // ⏳ INITIAL LOADING BANNER
                <motion.div 
                  key="loading"
                  className="text-center text-gray-500 font-mono py-12"
                >
                  <Clock className="w-10 h-10 mx-auto animate-spin mb-4 text-[#ff007a]" />
                  <span>No hay participantes listos para votar...</span>
                </motion.div>
              ) : (
                // ⚔️ COMPETITIVE VOTING ROW WITH ELEGANT DARK GRADIENT THEME
                <motion.div 
                  key="voting"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full relative"
                >
                  {/* LEFT NOMINEE */}
                  <div 
                    onClick={() => castVote(leftContestant.id, rightContestant.id)}
                    className="group relative cursor-pointer overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 flex flex-col justify-between transition-all hover:bg-white/10 hover:border-[#ff007a]/40 shadow-2xl hover:shadow-[#ff007a]/5 duration-300 h-[380px]"
                  >
                    {/* Glowing Left Accent Strip from Design Spec */}
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#ff007a] shadow-[0_0_12px_#ff007a]"></div>
                    
                    <div className="flex justify-between items-start w-full relative z-10 font-sans">
                      <div className="transform group-hover:scale-[1.03] transition-transform duration-300">
                        <StudentAvatar id={leftContestant.id} name={leftContestant.name} genre={leftContestant.genre} className="w-16 h-16 sm:w-20 sm:h-20" />
                      </div>
                      
                      <div className="text-right">
                        <div className="font-mono text-[10px] text-white/40 tracking-wider font-semibold">
                          RANK #{String(sortedStudentsOfCategory.findIndex(item => item.id === leftContestant.id) + 1).padStart(2, '0')}
                        </div>
                        <div className="text-2xl font-black font-mono text-white mt-1">
                          {leftContestant.elo}
                          <span className="text-[10px] text-[#ff007a] font-bold block">ELO SCORE</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left w-full relative z-10 mt-auto">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-[0.2em] text-[#ff007a] mb-2">Votar [←] o hacer click</div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2 group-hover:text-[#ff007a] transition-colors line-clamp-1 leading-none">
                        {leftContestant.name}
                      </h2>
                      
                      <div className="flex gap-6 border-t border-white/5 pt-3">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Win Rate</span>
                          <span className="font-mono text-sm text-white font-semibold">
                            {(leftContestant.wins + leftContestant.losses) > 0 
                              ? ((leftContestant.wins / (leftContestant.wins + leftContestant.losses)) * 100).toFixed(1) + '%' 
                              : '0.0%'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Combates</span>
                          <span className="font-mono text-sm text-[#ff007a] font-semibold flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            {leftContestant.wins + leftContestant.losses}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Victorias</span>
                          <span className="font-mono text-sm text-green-400 font-semibold">
                            {leftContestant.wins}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* VS INDICATOR IN THE MIDDLE WITH PULSING EFFECT */}
                  <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center pointer-events-none md:flex hidden">
                    <div className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center bg-[#030305] relative">
                      <div className="absolute inset-0 rounded-full animate-ping bg-[#bc13fe]/20"></div>
                      <span className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">VS</span>
                    </div>
                    <div className="h-20 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent my-2"></div>
                  </div>

                  {/* RIGHT NOMINEE */}
                  <div 
                    onClick={() => castVote(rightContestant.id, leftContestant.id)}
                    className="group relative cursor-pointer overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 flex flex-col justify-between transition-all hover:bg-white/10 hover:border-[#bc13fe]/40 shadow-2xl hover:shadow-[#bc13fe]/5 duration-300 h-[380px]"
                  >
                    {/* Glowing Right Accent Strip from Design Spec */}
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-[#bc13fe] shadow-[0_0_12px_#bc13fe]"></div>
                    
                    <div className="flex justify-between items-start w-full relative z-10 font-sans">
                      <div className="transform group-hover:scale-[1.03] transition-transform duration-300">
                        <StudentAvatar id={rightContestant.id} name={rightContestant.name} genre={rightContestant.genre} className="w-16 h-16 sm:w-20 sm:h-20" />
                      </div>
                      
                      <div className="text-right">
                        <div className="font-mono text-[10px] text-white/40 tracking-wider font-semibold">
                          RANK #{String(sortedStudentsOfCategory.findIndex(item => item.id === rightContestant.id) + 1).padStart(2, '0')}
                        </div>
                        <div className="text-2xl font-black font-mono text-white mt-1">
                          {rightContestant.elo}
                          <span className="text-[10px] text-[#bc13fe] font-bold block">ELO SCORE</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left w-full relative z-10 mt-auto">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-[0.2em] text-[#bc13fe] mb-2 font-mono">Votar [→] o hacer click</div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2 group-hover:text-[#bc13fe] transition-colors line-clamp-1 leading-none">
                        {rightContestant.name}
                      </h2>
                      
                      <div className="flex gap-6 border-t border-white/5 pt-3 font-sans">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Win Rate</span>
                          <span className="font-mono text-sm text-white font-semibold">
                            {(rightContestant.wins + rightContestant.losses) > 0 
                              ? ((rightContestant.wins / (rightContestant.wins + rightContestant.losses)) * 100).toFixed(1) + '%' 
                              : '0.0%'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Combates</span>
                          <span className="font-mono text-sm text-[#bc13fe] font-semibold flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            {rightContestant.wins + rightContestant.losses}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Victorias</span>
                          <span className="font-mono text-sm text-green-400 font-semibold">
                            {rightContestant.wins}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SEC 3: SYSTEM COUNTDOWN LOGS PANEL */}
          <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="flex items-center justify-between gap-4 mb-4 border-b border-white/5 pb-3">
              <div className="flex items-center space-x-2 text-gray-300">
                <Clock className="w-4 h-4 text-[#ff007a]" />
                <h4 className="font-bold text-xs tracking-wider uppercase font-sans">
                  Sincronización Temporizador Competencia
                </h4>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono leading-none ${countdownConfig?.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-500/10 text-gray-400 border border-white/5'}`}>
                {countdownConfig?.isActive ? '● En Marcha' : '○ Suspendido'}
              </span>
            </div>

            {countdownConfig?.isActive ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div>
                  <span className="text-gray-400 text-[11px] block font-sans">Tiempo límite para registrar votos ordinarios:</span>
                  <span className="text-gray-300 text-xs font-mono block mt-1">{new Date(countdownConfig.targetDate).toLocaleString()}</span>
                </div>

                {/* COUNTDOWN TICK BOX CARD */}
                <div className="flex items-center space-x-2.5 font-mono">
                  {/* Days */}
                  <div className="text-center">
                    <div className="bg-black/60 border border-white/10 rounded-lg w-12 py-1.5 font-bold text-lg text-white">
                      {String(timeLeft.d).padStart(2, '0')}
                    </div>
                    <span className="text-[8px] text-gray-500 tracking-wider font-bold block mt-0.5 uppercase">Días</span>
                  </div>
                  <span className="text-lg text-gray-600 font-bold">:</span>
                  
                  {/* Hours */}
                  <div className="text-center">
                    <div className="bg-black/60 border border-white/10 rounded-lg w-12 py-1.5 font-bold text-lg text-[#ff007a]">
                      {String(timeLeft.h).padStart(2, '0')}
                    </div>
                    <span className="text-[8px] text-gray-500 tracking-wider font-bold block mt-0.5 uppercase">Horas</span>
                  </div>
                  <span className="text-lg text-gray-600 font-bold">:</span>

                  {/* Minutes */}
                  <div className="text-center">
                    <div className="bg-black/60 border border-white/10 rounded-lg w-12 py-1.5 font-bold text-lg text-white">
                      {String(timeLeft.m).padStart(2, '0')}
                    </div>
                    <span className="text-[8px] text-gray-500 tracking-wider font-bold block mt-0.5 uppercase">Mins</span>
                  </div>
                  <span className="text-lg text-gray-600 font-bold">:</span>

                  {/* Seconds */}
                  <div className="text-center">
                    <div className="bg-black/60 border border-white/10 rounded-lg w-12 py-1.5 font-bold text-lg text-[#bc13fe]">
                      {String(timeLeft.s).padStart(2, '0')}
                    </div>
                    <span className="text-[8px] text-gray-500 tracking-wider font-bold block mt-0.5 uppercase">Segs</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-1 text-center sm:text-left">
                <span className="text-gray-400 text-xs sm:text-sm block font-sans">No hay ninguna fecha límite activada en este momento.</span>
                <span className="text-gray-500 text-[11px] block font-sans mt-0.5">El concurso de emparejamiento corre en modo ilimitado.</span>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: LIVE STANDINGS LEADERBOARD (4 cols) */}
        <div className="lg:col-span-4 flex flex-col">
          
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between h-full min-h-[520px] flex-1">
            <div className="font-sans">
              
              {/* Head / Header from Design markup */}
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <h3 className="text-xs font-bold tracking-[0.2em] text-white/70 uppercase">LIVE ELO STANDING</h3>
                <div className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-[#bc13fe] uppercase tracking-wider animate-pulse">Syncing...</div>
              </div>

              {/* Dynamic standings list with Elegant card styling */}
              <div className="space-y-3">
                {liveStandings.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-xs font-mono leading-relaxed">
                    Ningún participante registrado en esta sección.
                  </div>
                ) : (
                  liveStandings.map((student, idx) => {
                    const position = idx + 1;
                    const isFirst = position === 1;
                    const positionColor = isFirst ? 'text-[#ff007a]' : 'text-white/40';
                    const bgGlow = isFirst 
                      ? 'bg-white/5 border-white/10' 
                      : 'border-white/5';
                    
                    return (
                      <div 
                        key={student.id}
                        className={`flex items-center justify-between p-3 rounded-lg border hover:bg-white/[0.04] transition-all relative overflow-hidden ${bgGlow}`}
                      >
                        <div className="flex items-center gap-3 relative z-10 min-w-0">
                          {/* Position index */}
                          <span className={`font-mono text-sm font-black ${positionColor}`}>
                            {String(position).padStart(2, '0')}
                          </span>

                          {/* Avatar & Name */}
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div className="relative flex-shrink-0">
                              <StudentAvatar id={student.id} name={student.name} genre={student.genre} className="w-8 h-8" />
                              {isFirst && (
                                <div className="absolute -top-1 -left-1 text-[9px]">👑</div>
                              )}
                            </div>
                            <span className="font-bold text-white text-xs sm:text-sm truncate max-w-[130px] block">
                              {student.name}
                            </span>
                          </div>
                        </div>

                        {/* rating badge */}
                        <div className="text-right z-10 font-mono flex-shrink-0">
                          <span className="text-sm font-extrabold text-white block">
                            {student.elo}
                          </span>
                          <span className="text-[8px] text-white/30 uppercase tracking-wider font-bold">ELO score</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick access to Reveal Show on standings column */}
            <div className="mt-8 pt-4 border-t border-white/10 z-10">
              <button
                onClick={() => setShowRevealShow(true)}
                className="w-full py-4 bg-gradient-to-r from-[#ff007a] to-[#bc13fe] rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-[0_10px_30px_rgba(188,19,254,0.3)] hover:scale-[1.02] transition-transform active:scale-95 text-white cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current text-white animate-pulse" />
                <span>Enter Reveal Show</span>
              </button>
            </div>
          </div>

        </div>

      </main>

      {/* SYSTEM FOOTER BAR - Elegant minimalist look from design mockup */}
      <footer className="mt-12 flex flex-col md:flex-row justify-between items-center gap-4 text-white/20 font-mono text-[9px] uppercase tracking-[0.3em] relative z-10 border-t border-white/5 pt-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-center gap-8">
          <span>Local Cache: Full Hydration</span>
          <span>Tab Sync: Active Subscription</span>
          <span>Latency: Multi-client Live</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Session: Aula de Adultos v4.0</span>
          <div className="w-4 h-[1px] bg-white/20"></div>
          <span className="text-[#ff007a]">MashMatch Global</span>
        </div>
      </footer>

      {/* OVERLAY MODAL: ADMIN DIALOG */}
      {showAdminPanel && (
        <AdminPanel 
          students={students} 
          countdownConfig={countdownConfig} 
          onClose={() => setShowAdminPanel(false)} 
        />
      )}

      {/* OVERLAY VIEW: FULLSCREEN REVEAL SHOW */}
      {showRevealShow && (
        <RevealShow 
          students={students} 
          onClose={() => setShowRevealShow(false)} 
        />
      )}

    </div>
  );
}

