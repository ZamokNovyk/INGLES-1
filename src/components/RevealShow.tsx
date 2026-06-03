import React, { useState, useEffect, useRef } from 'react';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { motion, AnimatePresence } from 'motion/react';
import { 
  playIntroSweep, 
  playThirdPlaceChime, 
  playSecondPlaceArpeggio, 
  playChampionFanfare 
} from '../utils/audio';
import { 
  Trophy, 
  Lock, 
  ChevronRight, 
  ChevronLeft, 
  RotateCcw, 
  Play, 
  Pause, 
  X, 
  Volume2, 
  Sparkles 
} from 'lucide-react';

interface RevealShowProps {
  students: Student[];
  onClose: () => void;
}

export const RevealShow: React.FC<RevealShowProps> = ({ students, onClose }) => {
  // We need to calculate top 3 women and top 3 men sorted by ELO descending, breaking ties with wins
  const getTop3 = (genre: 'women' | 'men'): Student[] => {
    return students
      .filter(s => s.genre === genre)
      .sort((a, b) => {
        if (b.elo !== a.elo) return b.elo - a.elo;
        return b.wins - a.wins; // tie breaker
      })
      .slice(0, 3);
  };

  const top3Women = getTop3('women');
  const top3Men = getTop3('men');

  // step: 
  // 0 -> Locked Intro
  // 1 -> Reveal 3rd Place
  // 2 -> Reveal 2nd Place
  // 3 -> Reveal 1st Place / Champion
  const [step, setStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(4); // 4 seconds auto play

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Play sound on step change
  useEffect(() => {
    if (step === 0) {
      playIntroSweep();
    } else if (step === 1) {
      playThirdPlaceChime();
    } else if (step === 2) {
      playSecondPlaceArpeggio();
    } else if (step === 3) {
      playChampionFanfare();
    }
  }, [step]);

  // Autoplay progression timer
  useEffect(() => {
    if (isPlaying) {
      setTimeRemaining(4);
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setStep((s) => {
              if (s >= 3) {
                setIsPlaying(false);
                return 3;
              }
              return s + 1;
            });
            return 4;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, step]);

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
      setTimeRemaining(4);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setTimeRemaining(4);
    }
  };

  const handleRestart = () => {
    setStep(0);
    setIsPlaying(false);
    setTimeRemaining(4);
  };

  // Determine which ranks to show based on step
  // Step 1 reveals 3rd place (index 2)
  // Step 2 reveals 2nd place (index 1)
  // Step 3 reveals 1st place (index 0)
  const isRankRevealed = (rankIndex: number): boolean => {
    if (rankIndex === 2) return step >= 1;
    if (rankIndex === 1) return step >= 2;
    if (rankIndex === 0) return step >= 3;
    return false;
  };

  // Safe contestant card lookup (protecting against out-of-bound)
  const renderContestantCard = (student: Student | undefined, position: number, isRevealed: boolean) => {
    const medalEmoji = position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉';
    const podiumColor = position === 1 
      ? 'from-yellow-400/20 to-amber-500/10 border-yellow-500/40 shadow-yellow-500/10' 
      : position === 2 
        ? 'from-slate-300/20 to-slate-400/10 border-slate-400/30' 
        : 'from-amber-700/20 to-amber-800/10 border-amber-800/35';

    if (!student) {
      return (
        <div className="rounded-3xl glass-panel p-6 flex flex-col items-center justify-center border-dashed border-white/20 h-64">
          <span className="text-gray-500 font-mono text-sm">Sin Participantes</span>
        </div>
      );
    }

    return (
      <div className="relative h-72">
        <AnimatePresence mode="wait">
          {!isRevealed ? (
            // LOCKED SCREEN
            <motion.div 
              key="locked"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.05, opacity: 0 }}
              className="absolute inset-0 rounded-3xl glass-panel border border-white/10 flex flex-col items-center justify-center p-6 bg-black/60 shadow-inner"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-white/40 animate-pulse" />
              </div>
              <span className="font-mono text-xs uppercase tracking-widest text-[#bc13fe]">Posición {position}</span>
              <span className="text-gray-500 text-sm mt-1">Sujeto Bloqueado</span>
            </motion.div>
          ) : (
            // REVEALED CARD
            <motion.div
              key="revealed"
              initial={{ y: 50, scale: 0.9, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className={`absolute inset-0 rounded-3xl bg-linear-to-b ${podiumColor} border-2 p-6 flex flex-col items-center text-center relative overflow-hidden`}
            >
              {/* Champion Glittering effect */}
              {position === 1 && (
                <>
                  <div className="absolute inset-0 bg-radial from-amber-500/10 to-transparent pointer-events-none" />
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                    className="absolute -top-10 -right-10 w-24 h-24 bg-yellow-500/5 blur-xl pointer-events-none" 
                  />
                  <div className="absolute top-3 right-4">
                    <Sparkles className="w-5 h-5 text-yellow-400 animate-bounce" />
                  </div>
                </>
              )}

              {/* Medal Badge */}
              <div className="absolute top-4 left-4 font-mono text-xl bg-black/30 w-10 h-10 rounded-full flex items-center justify-center border border-white/10">
                {medalEmoji}
              </div>

              {/* Avatar */}
              <div className="mb-4 relative">
                <StudentAvatar id={student.id} name={student.name} genre={student.genre} className="w-24 h-24 shadow-xl" />
                {position === 1 && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full shadow-lg">
                    CROWN 👑
                  </div>
                )}
              </div>

              {/* Identity */}
              <h4 className="text-lg font-bold font-sans text-white truncate max-w-full leading-tight">
                {student.name}
              </h4>
              
              <span className="text-xs font-mono text-white/50 block mt-1 uppercase tracking-wider">
                {student.genre === 'women' ? 'Sección Femenina ♀' : 'Sección Masculina ♂'}
              </span>

              {/* Statistics */}
              <div className="mt-auto pt-3 border-t border-white/5 w-full grid grid-cols-2 gap-2 text-center">
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">MATCHMAKER ELO</span>
                  <span className={`text-sm font-mono font-bold ${position === 1 ? 'text-yellow-400 font-extrabold' : 'text-white'}`}>
                    {student.elo} PTS
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">HISTORIAL (V/D)</span>
                  <span className="text-sm font-mono font-semibold text-gray-300">
                    {student.wins}W / {student.losses}L
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between p-4 sm:p-8 bg-[#030305]/95 overflow-hidden">
      
      {/* Background glow glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ff007a]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#bc13fe]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Controls */}
      <div className="relative flex items-center justify-between z-10 w-full max-w-6xl mx-auto border-b border-white/10 pb-4">
        <div>
          <span className="tracking-widest font-mono text-xs text-[#bc13fe] uppercase block font-semibold">Podio de Honor Revelación</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-400 animate-bounce glow-pink" />
            SHOW DE CAMPEONES
          </h2>
        </div>

        <div className="flex items-center space-x-3">
          <Volume2 className="w-5 h-5 text-gray-400" />
          <button
            onClick={onClose}
            className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/15 text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Show Area */}
      <div className="my-auto w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 z-10">
        
        {/* DIVISION WOMEN */}
        <div className="space-y-4">
          <h3 className="text-center font-sans font-bold text-xl text-[#ff007a] tracking-widest uppercase py-2 bg-[#ff007a]/10 rounded-2xl border border-[#ff007a]/20">
            SECCIÓN FEMENINA ♀
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 3rd Place */}
            {renderContestantCard(top3Women[2], 3, isRankRevealed(2))}
            {/* 2nd Place */}
            {renderContestantCard(top3Women[1], 2, isRankRevealed(1))}
            {/* 1st Place */}
            {renderContestantCard(top3Women[0], 1, isRankRevealed(0))}
          </div>
        </div>

        {/* DIVISION MEN */}
        <div className="space-y-4">
          <h3 className="text-center font-sans font-bold text-xl text-[#bc13fe] tracking-widest uppercase py-2 bg-[#bc13fe]/10 rounded-2xl border border-[#bc13fe]/20">
            SECCIÓN MASCULINA ♂
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 3rd Place */}
            {renderContestantCard(top3Men[2], 3, isRankRevealed(2))}
            {/* 2nd Place */}
            {renderContestantCard(top3Men[1], 2, isRankRevealed(1))}
            {/* 1st Place */}
            {renderContestantCard(top3Men[0], 1, isRankRevealed(0))}
          </div>
        </div>

      </div>

      {/* Bottom Timeline & AutoPlay Controls */}
      <div className="relative z-10 w-full max-w-2xl mx-auto glass-panel border border-white/10 rounded-3xl p-6 mb-4 flex flex-col items-center">
        {/* Step Indicator */}
        <div className="flex items-center space-x-2 md:space-x-4 mb-4">
          {[0, 1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => {
                setStep(s);
                setIsPlaying(false);
              }}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs transition-all border ${
                step === s 
                  ? 'bg-gradient-to-r from-[#ff007a] to-[#bc13fe] text-white border-transparent shadow-lg shadow-purple-500/25' 
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {s === 0 ? '🔒 Inicio' : s === 1 ? '🥉 3er Lugar' : s === 2 ? '🥈 2do Lugar' : '🥇 Campeones'}
            </button>
          ))}
        </div>

        {/* Timed progress bar */}
        {isPlaying && (
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-5">
            <motion.div 
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 4, ease: "linear" }}
              key={step} // refresh transition on step change
              className="h-full bg-linear-to-r from-[#ff007a] to-[#bc13fe]"
            />
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="p-3.5 rounded-full bg-white/5 hover:bg-white/10 text-white disabled:text-gray-600 border border-white/10 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Autoplay Toggle */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center space-x-2 px-6 py-3.5 rounded-2xl font-bold font-sans transition-all text-sm shadow-xl cursor-pointer ${
              isPlaying 
                ? 'bg-amber-500 text-black shadow-amber-500/10' 
                : 'bg-white hover:bg-gray-100 text-black shadow-white/10'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current text-black" />
                <span>Pausar Auto ({timeRemaining}s)</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-black" />
                <span>Auto-Reproducir</span>
              </>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={step === 3}
            className="p-3.5 rounded-full bg-white/5 hover:bg-white/10 text-white disabled:text-gray-600 border border-white/10 transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            onClick={handleRestart}
            className="p-3.5 rounded-full bg-white/5 hover:bg-rose-500/20 text-gray-300 hover:text-rose-400 border border-white/10 transition-all cursor-pointer"
            title="Empezar desde el inicio"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

    </div>
  );
};
