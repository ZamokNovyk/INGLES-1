/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db, handleFirestoreError, auth, storage } from './firebase';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  increment,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { Student, CountdownConfig, OperationType } from './types';
import { DEFAULT_SEED_STUDENTS, getSpanishTimestamp, normalizeNameId } from './defaultStudents';
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

// Cache to hold object URLs for downloaded sound files to ensure single download per session
const crushSoundCache: Record<string, string> = {};
let remainingCrushSoundKeys: string[] = [];

export default function App() {
  // 1. Core States
  const [students, setStudents] = useState<Student[]>([]);
  const [countdownConfig, setCountdownConfig] = useState<CountdownConfig | null>(null);
  const [activeCategory, setActiveCategory] = useState<'women' | 'men'>('women');

  // Voting Pairs (IDs only, referenced dynamically from student list to maintain structural stability)
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  // Derivamos los concursantes activos en base a sus IDs para reflejar actualizaciones en tiempo real sin cambiar de versus
  const leftContestant = students.find(s => s.id === leftId) || null;
  const rightContestant = students.find(s => s.id === rightId) || null;

  // Stats / Progress
  const [votedMatchups, setVotedMatchups] = useState<string[]>(() => {
    const saved = localStorage.getItem('mashMatch_voted_pairs');
    return saved ? JSON.parse(saved) : [];
  });

  const [votedCrushes, setVotedCrushes] = useState<string[]>(() => {
    const saved = localStorage.getItem('mashMatch_crushes_voted');
    return saved ? JSON.parse(saved) : [];
  });

  const [leaderboardTab, setLeaderboardTab] = useState<'elo' | 'crush' | 'coronas'>('elo');

  // Keep references to current students and voted matchups to avoid triggering matchmaking updates when ELO or vote counts change in real-time
  const studentsRef = React.useRef<Student[]>([]);
  const votedMatchupsRef = React.useRef<string[]>([]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    votedMatchupsRef.current = votedMatchups;
  }, [votedMatchups]);

  // Countdown timer states
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number }>({ d: 0, h: 0, m: 0, s: 0 });
  const [timerFinished, setTimerFinished] = useState<boolean>(false);

  // UI state overlays
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [showRevealShow, setShowRevealShow] = useState<boolean>(false);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(true);
  const [votingInProgress, setVotingInProgress] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(3);

  // Reset visible leaderboard count when changing gender categories
  useEffect(() => {
    setVisibleCount(3);
  }, [activeCategory]);

  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Listen to Auth State to identify if the logged-in user is an admin
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const adminDocRef = doc(db, 'INGLES1.Estudiantes', 'registro', 'admin', user.uid);
          const adminDocSnap = await getDoc(adminDocRef);
          if (adminDocSnap.exists()) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        } catch (error) {
          console.error('Error verifying admin status:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Pre-load and cache all crush sounds from Firebase Storage on mount to ensure zero lag latency on play
  useEffect(() => {
    const preloadSounds = async () => {
      try {
        console.log('Preloading all crush sounds from Firebase Storage...');
        const crushFolderRef = ref(storage, 'crush');
        const listResult = await listAll(crushFolderRef);
        
        if (listResult.items.length === 0) {
          console.log('No sounds found in /crush folder to preload');
          return;
        }

        await Promise.all(
          listResult.items.map(async (item) => {
            const soundKey = item.name;
            try {
              const downloadUrl = await getDownloadURL(item);
              let audioUrl = downloadUrl;

              if ('caches' in window) {
                try {
                  const cache = await caches.open('mashmatch-audio-cache');
                  let cachedResponse = await cache.match(downloadUrl);

                  if (!cachedResponse) {
                    const response = await fetch(downloadUrl);
                    await cache.put(downloadUrl, response.clone());
                    cachedResponse = response;
                  }

                  const blob = await cachedResponse.blob();
                  audioUrl = URL.createObjectURL(blob);
                } catch (cacheErr) {
                  console.warn('Cache API pre-caching error for list item:', cacheErr);
                }
              }

              // Save in global cache to execute instantly
              crushSoundCache[soundKey] = audioUrl;

              // Pre-warm audio component
              const audioObj = new Audio(audioUrl);
              audioObj.preload = 'auto';
            } catch (err) {
              console.warn(`Failed to preload sound: ${soundKey}`, err);
            }
          })
        );
        console.log('Successfully pre-cached crush sounds:', Object.keys(crushSoundCache));
      } catch (error) {
        console.warn('Failed to list or preload crush sounds on start-up:', error);
      }
    };

    preloadSounds();
  }, []);

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

    // Phase B: Optimize data load by doing a SINGLE batch load of all students on startup
    const checkAndSeedAndFetch = async () => {
      try {
        let hombresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'hombres'));
        let mujeresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'mujeres'));
        
        if (hombresSnap.empty && mujeresSnap.empty) {
          console.log('Database empty, seeding default students...');
          const seedPromises = DEFAULT_SEED_STUDENTS.map(student => {
            const pathSegment = student.género; // 'hombres' or 'mujeres'
            return setDoc(doc(db, 'INGLES1.Estudiantes', 'generos', pathSegment, student.id), {
              nombre: student.nombre,
              género: student.género,
              elo: student.elo,
              votos_ganados: student.votos_ganados,
              votos_perdidos: student.votos_perdidos,
              perfilPhotoUrl: student.perfilPhotoUrl,
              actualizadoEn: getSpanishTimestamp()
            });
          });
          await Promise.all(seedPromises);
          console.log('Seeded database with new roster successfully.');
          
          hombresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'hombres'));
          mujeresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'mujeres'));
        }

        const list: Student[] = [];
        hombresSnap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            name: data.nombre || '',
            genre: 'men',
            elo: data.elo !== undefined ? Number(data.elo) : 1200,
            wins: data.votos_ganados !== undefined ? Number(data.votos_ganados) : 0,
            losses: data.votos_perdidos !== undefined ? Number(data.votos_perdidos) : 0,
            perfilPhotoUrl: data.perfilPhotoUrl || '',
            actualizadoEn: data.actualizadoEn || '',
            coronas: data.coronas !== undefined ? Number(data.coronas) : 0,
            crushes: data.crushes !== undefined ? Number(data.crushes) : 0,
          });
        });

        mujeresSnap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            name: data.nombre || '',
            genre: 'women',
            elo: data.elo !== undefined ? Number(data.elo) : 1200,
            wins: data.votos_ganados !== undefined ? Number(data.votos_ganados) : 0,
            losses: data.votos_perdidos !== undefined ? Number(data.votos_perdidos) : 0,
            perfilPhotoUrl: data.perfilPhotoUrl || '',
            actualizadoEn: data.actualizadoEn || '',
            coronas: data.coronas !== undefined ? Number(data.coronas) : 0,
            crushes: data.crushes !== undefined ? Number(data.crushes) : 0,
          });
        });

        setStudents(list);
        localStorage.setItem('mashMatch_cached_students', JSON.stringify(list));
      } catch (e) {
        console.error('Failure seeding or fetching students on startup', e);
      }
    };
    checkAndSeedAndFetch();

    // Setup an optimized Live update listener that ONLY listens to the Top 10 of each genre (minimizing read amplification)
    const handleTopSnapshotUpdate = (snapshot: any, categoryGenre: 'men' | 'women') => {
      const topMap = new Map<string, Student>();
      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        topMap.set(docSnap.id, {
          id: docSnap.id,
          name: data.nombre || '',
          genre: categoryGenre,
          elo: data.elo !== undefined ? Number(data.elo) : 1200,
          wins: data.votos_ganados !== undefined ? Number(data.votos_ganados) : 0,
          losses: data.votos_perdidos !== undefined ? Number(data.votos_perdidos) : 0,
          perfilPhotoUrl: data.perfilPhotoUrl || '',
          actualizadoEn: data.actualizadoEn || '',
          coronas: data.coronas !== undefined ? Number(data.coronas) : 0,
          crushes: data.crushes !== undefined ? Number(data.crushes) : 0,
        });
      });

      setStudents((prev) => {
        const prevMap = new Map<string, Student>();
        prev.forEach(s => prevMap.set(s.id, s));

        // Sync or overwrite the items in Top 10
        topMap.forEach((student, id) => {
          prevMap.set(id, student);
        });

        const nextList = Array.from(prevMap.values());
        localStorage.setItem('mashMatch_cached_students', JSON.stringify(nextList));
        return nextList;
      });
    };

    const hombresTopQuery = collection(db, 'INGLES1.Estudiantes', 'generos', 'hombres');

    const mujeresTopQuery = collection(db, 'INGLES1.Estudiantes', 'generos', 'mujeres');

    const unsubscribeHombres = onSnapshot(
      hombresTopQuery,
      (snapshot) => {
        handleTopSnapshotUpdate(snapshot, 'men');
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'INGLES1.Estudiantes/generos/hombres (top 10)');
      }
    );

    const unsubscribeMujeres = onSnapshot(
      mujeresTopQuery,
      (snapshot) => {
        handleTopSnapshotUpdate(snapshot, 'women');
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'INGLES1.Estudiantes/generos/mujeres (top 10)');
      }
    );

    // Phase C: Attach live Firestore Config snapshot listening
    const unsubscribeConfig = onSnapshot(
      doc(db, 'INGLES1.Estudiantes', 'configuracion', 'config', 'countdown'),
      (docSnap) => {
        if (docSnap.exists()) {
          const config = docSnap.data() as CountdownConfig;
          setCountdownConfig(config);
          
          if (config.lastResetAt) {
            const localLastReset = localStorage.getItem('mashMatch_last_reset_at');
            if (localLastReset !== config.lastResetAt) {
              setVotedMatchups([]);
              localStorage.setItem('mashMatch_voted_pairs', JSON.stringify([]));
              localStorage.setItem('mashMatch_last_reset_at', config.lastResetAt);
            }
          }
        } else {
          // Base config document fallback
          const defaultCountdown: CountdownConfig = {
            id: 'countdown',
            targetDate: new Date(Date.now() + 1000 * 3600 * 48).toISOString(), // 48h limit
            isActive: false,
            lastResetAt: new Date().toISOString()
          };
          setDoc(doc(db, 'INGLES1.Estudiantes', 'configuracion', 'config', 'countdown'), defaultCountdown)
            .then(() => {
              setCountdownConfig(defaultCountdown);
              localStorage.setItem('mashMatch_last_reset_at', defaultCountdown.lastResetAt || '');
            })
            .catch(err => console.warn(err));
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'INGLES1.Estudiantes/configuracion/config/countdown');
      }
    );

    return () => {
      unsubscribeHombres();
      unsubscribeMujeres();
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
    const currentStudents = studentsRef.current;
    const currentVoted = votedMatchupsRef.current;

    // Filter candidates by category
    const filtered = currentStudents.filter(s => s.genre === activeCategory);
    if (filtered.length < 2) {
      setLeftId(null);
      setRightId(null);
      return;
    }

    // Generate all unvoted pairs in this category
    const unvotedPairs: [Student, Student][] = [];
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const pairKey = [filtered[i].id, filtered[j].id].sort().join('_');
        if (!currentVoted.includes(pairKey)) {
          unvotedPairs.push([filtered[i], filtered[j]]);
        }
      }
    }

    if (unvotedPairs.length > 0) {
      // Select a random unvoted pair
      const randomIdx = Math.floor(Math.random() * unvotedPairs.length);
      const [candidateA, candidateB] = unvotedPairs[randomIdx];
      
      // Randomize left and right placement
      if (Math.random() > 0.5) {
        setLeftId(candidateA.id);
        setRightId(candidateB.id);
      } else {
        setLeftId(candidateB.id);
        setRightId(candidateA.id);
      }
    } else {
      // If all pairs are voted, we set ids to null to let the UI present the Volver a votar congratulations screen.
      setLeftId(null);
      setRightId(null);
    }
  }, [activeCategory]);

  // Select candidates on load or when category changes
  useEffect(() => {
    const currentStudentsTemp = studentsRef.current;
    if (currentStudentsTemp.length > 0) {
      const currentLeft = currentStudentsTemp.find(s => s.id === leftId);
      const currentRight = currentStudentsTemp.find(s => s.id === rightId);
      
      const hasNoContestants = !leftId || !rightId || !currentLeft || !currentRight;
      const categoryMismatch = (currentLeft && currentLeft.genre !== activeCategory) || 
                               (currentRight && currentRight.genre !== activeCategory);
      
      // Only select if there are no contestants, or they belong to the wrong category.
      // ELO or wins modifications will update live in the cards, but will never trigger a pair swap.
      const stats = getProgressStats();
      if ((hasNoContestants || categoryMismatch) && stats.pending > 0) {
        selectRandomCandidates();
      }
    }
  }, [students.length, activeCategory, leftId, rightId, selectRandomCandidates]);

  // 5. Atomic ELO Voting & Expected Score logic calculation (Requirement 2)
  const castVote = async (winnerId: string, loserId: string) => {
    const isLocked = timerFinished && (countdownConfig?.isActive ?? false);
    if (isLocked || votingInProgress) return; // Prevent double voting or key jamming

    if (!leftContestant || !rightContestant) return;

    setVotingInProgress(true);

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

    // Check if the Top 1 student in their category changed (new claimant)
    const genre = winnerObj.genre;
    const sameGenreStudents = students.filter(s => s.genre === genre);
    const sortedSameGenreBefore = [...sameGenreStudents].sort((a, b) => b.elo - a.elo);
    const previousTopStudent = sortedSameGenreBefore[0] || null;

    const updatedGenreStudents = sameGenreStudents.map(s => {
      if (s.id === winnerObj.id) {
        return { ...s, elo: newWinnerElo };
      }
      if (s.id === loserObj.id) {
        return { ...s, elo: newLoserElo };
      }
      return s;
    });
    const sortedSameGenreAfter = [...updatedGenreStudents].sort((a, b) => b.elo - a.elo);
    const newTopStudent = sortedSameGenreAfter[0] || null;

    // Determine who became the new top student
    const leaderChanged = previousTopStudent && newTopStudent && (previousTopStudent.id !== newTopStudent.id);

    // If the winner newly took the top spot, they get +1 crown
    let winnerCoronas = winnerObj.coronas || 0;
    if (newTopStudent && newTopStudent.id === winnerObj.id && (!previousTopStudent || previousTopStudent.id !== winnerObj.id)) {
      winnerCoronas = (winnerObj.coronas || 0) + 1;
    }

    // Is there a passive new leader? (Someone other than the winner who became Top 1 because the former leader lost)
    const passiveLeaderId = (leaderChanged && newTopStudent && newTopStudent.id !== winnerObj.id) ? newTopStudent.id : null;
    const passiveLeaderObj = passiveLeaderId ? sameGenreStudents.find(s => s.id === passiveLeaderId) : null;
    const passiveLeaderCoronas = passiveLeaderObj ? (passiveLeaderObj.coronas || 0) + 1 : 0;

    // Track state locally for progress bar
    const sortedPairKey = [winnerId, loserId].sort().join('_');
    const updatedVotedPairs = [...votedMatchups];
    if (!updatedVotedPairs.includes(sortedPairKey)) {
      updatedVotedPairs.push(sortedPairKey);
      setVotedMatchups(updatedVotedPairs);
      localStorage.setItem('mashMatch_voted_pairs', JSON.stringify(updatedVotedPairs));
    }

    // Update local student stats immediately in client-side state for zero lag & zero read cost
    setStudents(prev => {
      const nextStudents = prev.map(s => {
        if (s.id === winnerObj.id) {
          return {
            ...s,
            elo: newWinnerElo,
            wins: winnerWins,
            coronas: winnerCoronas,
            actualizadoEn: getSpanishTimestamp()
          };
        }
        if (s.id === loserObj.id) {
          return {
            ...s,
            elo: newLoserElo,
            losses: loserLosses,
            actualizadoEn: getSpanishTimestamp()
          };
        }
        if (passiveLeaderId && s.id === passiveLeaderId) {
          return {
            ...s,
            coronas: passiveLeaderCoronas,
            actualizadoEn: getSpanishTimestamp()
          };
        }
        return s;
      });
      localStorage.setItem('mashMatch_cached_students', JSON.stringify(nextStudents));
      return nextStudents;
    });

    playVoteSound(true);

    try {
      // Synchronize atomically in Firestore (Requirement 2)
      const winnerGenrePath = winnerObj.genre === 'men' ? 'hombres' : 'mujeres';
      const loserGenrePath = loserObj.genre === 'men' ? 'hombres' : 'mujeres';

      const winnerRef = doc(db, 'INGLES1.Estudiantes', 'generos', winnerGenrePath, winnerObj.id);
      const loserRef = doc(db, 'INGLES1.Estudiantes', 'generos', loserGenrePath, loserObj.id);

      const timestampStr = getSpanishTimestamp();

      // Async write
      await setDoc(winnerRef, {
        nombre: winnerObj.name,
        género: winnerGenrePath,
        elo: newWinnerElo,
        votos_ganados: winnerWins,
        votos_perdidos: winnerObj.losses,
        perfilPhotoUrl: winnerObj.perfilPhotoUrl || '',
        actualizadoEn: timestampStr,
        coronas: winnerCoronas
      });

      await setDoc(loserRef, {
        nombre: loserObj.name,
        género: loserGenrePath,
        elo: newLoserElo,
        votos_ganados: loserObj.wins,
        votos_perdidos: loserLosses,
        perfilPhotoUrl: loserObj.perfilPhotoUrl || '',
        actualizadoEn: timestampStr,
        coronas: loserObj.coronas || 0
      });

      if (passiveLeaderId && passiveLeaderObj) {
        const passiveRef = doc(db, 'INGLES1.Estudiantes', 'generos', winnerGenrePath, passiveLeaderId);
        await setDoc(passiveRef, {
          nombre: passiveLeaderObj.name,
          género: winnerGenrePath,
          elo: passiveLeaderObj.elo,
          votos_ganados: passiveLeaderObj.wins,
          votos_perdidos: passiveLeaderObj.losses,
          perfilPhotoUrl: passiveLeaderObj.perfilPhotoUrl || '',
          actualizadoEn: timestampStr,
          coronas: passiveLeaderCoronas
        });
      }

      // Increment general and gender-specific votes atomically
      const votesDocRef = doc(db, 'INGLES1.Estudiantes', 'configuracion', 'votos', 'resumen');
      await setDoc(votesDocRef, {
        voto_general: increment(1),
        voto_hombres: winnerGenrePath === 'hombres' ? increment(1) : increment(0),
        voto_mujeres: winnerGenrePath === 'mujeres' ? increment(1) : increment(0)
      }, { merge: true });

      // Show immediate response swap
      selectRandomCandidates();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `INGLES1.Estudiantes/generos/${winnerObj.genre === 'men' ? 'hombres' : 'mujeres'}/${winnerObj.id}`);
    } finally {
      setVotingInProgress(false);
    }
  };

  const handleAdminAdjustment = async (student: Student, type: 'crowns', amount: number) => {
    if (!isAdmin) return;
    try {
      const studentRef = doc(
        db, 
        'INGLES1.Estudiantes', 
        'generos', 
        student.genre === 'men' ? 'hombres' : 'mujeres', 
        student.id
      );
      
      const currentCrowns = student.coronas || 0;
      const newCrowns = Math.max(0, currentCrowns + amount);
      
      setStudents(prev => {
        const nextStudents = prev.map(s => {
          if (s.id === student.id) {
            return { ...s, coronas: newCrowns };
          }
          return s;
        });
        localStorage.setItem('mashMatch_cached_students', JSON.stringify(nextStudents));
        return nextStudents;
      });

      await updateDoc(studentRef, {
        coronas: newCrowns,
        actualizadoEn: getSpanishTimestamp()
      });
    } catch (error) {
      console.error('Error updating crowns:', error);
    }
  };

  const handleMakeCrush = async (studentId: string, categoryGenre: 'men' | 'women') => {
    if (votedCrushes.includes(studentId)) return;

    const nextCrushes = [...votedCrushes, studentId];
    setVotedCrushes(nextCrushes);
    localStorage.setItem('mashMatch_crushes_voted', JSON.stringify(nextCrushes));

    // Play random custom sound from Firebase Storage (cached locally) or fallback synth
    if (sfxEnabled) {
      try {
        const cachedKeys = Object.keys(crushSoundCache);
        let audioUrl = '';

        if (cachedKeys.length > 0) {
          // If the list of unplayed keys is empty, refill it to start a new randomized cycle
          if (remainingCrushSoundKeys.length === 0) {
            remainingCrushSoundKeys = [...cachedKeys];
          }

          // Pick a random key from the remaining unplayed keys
          const randomIndex = Math.floor(Math.random() * remainingCrushSoundKeys.length);
          const chosenKey = remainingCrushSoundKeys[randomIndex];

          // Remove the selected key so it is not repeated in this cycle
          remainingCrushSoundKeys.splice(randomIndex, 1);

          audioUrl = crushSoundCache[chosenKey];
        } else {
          // Fallback context: if not fully preloaded yet (e.g. extremely fast click on initial boot), load on-the-fly
          const crushFolderRef = ref(storage, 'crush');
          const listResult = await listAll(crushFolderRef);

          if (listResult.items.length === 0) {
            throw new Error('No sounds found in /crush folder');
          }

          const randomItem = listResult.items[Math.floor(Math.random() * listResult.items.length)];
          const soundKey = randomItem.name;
          const downloadUrl = await getDownloadURL(randomItem);
          audioUrl = downloadUrl;

          if ('caches' in window) {
            try {
              const cache = await caches.open('mashmatch-audio-cache');
              let cachedResponse = await cache.match(downloadUrl);

              if (!cachedResponse) {
                const response = await fetch(downloadUrl);
                await cache.put(downloadUrl, response.clone());
                cachedResponse = response;
              }

              const blob = await cachedResponse.blob();
              audioUrl = URL.createObjectURL(blob);
              crushSoundCache[soundKey] = audioUrl;
            } catch (cacheErr) {
              console.warn('Cache API error on on-the-fly load:', cacheErr);
              audioUrl = downloadUrl;
            }
          }
        }

        if (audioUrl) {
          const audio = new Audio(audioUrl);
          await audio.play();
        } else {
          throw new Error('No audio URL resolved');
        }

      } catch (soundErr) {
        console.warn('Could not load storage sound, playing beautiful default synth beep:', soundErr);
        // Beautiful synthetic cute heart click sound fallback
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
        } catch (e) {}
      }
    }

    // Update locally
    setStudents(prev => {
      const nextStudents = prev.map(s => {
        if (s.id === studentId) {
          return { ...s, crushes: (s.crushes || 0) + 1 };
        }
        return s;
      });
      localStorage.setItem('mashMatch_cached_students', JSON.stringify(nextStudents));
      return nextStudents;
    });

    try {
      const genrePath = categoryGenre === 'men' ? 'hombres' : 'mujeres';
      const docRef = doc(db, 'INGLES1.Estudiantes', 'generos', genrePath, studentId);
      await updateDoc(docRef, {
        crushes: increment(1),
        actualizadoEn: getSpanishTimestamp()
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `INGLES1.Estudiantes/generos/${categoryGenre === 'men' ? 'hombres' : 'mujeres'}/${studentId}`);
    }
  };

  const resetVotingProgress = async () => {
    try {
      // Increment general counter in database:
      const votesDocRef = doc(db, 'INGLES1.Estudiantes', 'configuracion', 'votos', 'resumen');
      await setDoc(votesDocRef, {
        voto_general: increment(1)
      }, { merge: true });

      // Reset local storage / state Progress for the activeCategory
      const otherCategoryIds = students.filter(s => s.genre !== activeCategory).map(s => s.id);
      const cleanedMatchups = votedMatchups.filter(key => {
        const [id1, id2] = key.split('_');
        return otherCategoryIds.includes(id1) && otherCategoryIds.includes(id2);
      });
      
      setVotedMatchups(cleanedMatchups);
      localStorage.setItem('mashMatch_voted_pairs', JSON.stringify(cleanedMatchups));

      // Trigger matchmaking select
      setTimeout(() => {
        selectRandomCandidates();
      }, 100);
    } catch (err: any) {
      console.error('Error resetting progress:', err);
    }
  };

  // Keyboard binding listener (Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if voting is locked
      const isLocked = timerFinished && (countdownConfig?.isActive ?? false);
      if (isLocked || votingInProgress) return;

      if (!leftContestant || !rightContestant) return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        castVote(leftContestant.id, rightContestant.id);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        castVote(rightContestant.id, leftContestant.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftContestant, rightContestant, timerFinished, countdownConfig, votingInProgress]);

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

  const sortedStudentsForLeaderboard = leaderboardTab === 'elo'
    ? sortedStudentsOfCategory
    : leaderboardTab === 'crush'
      ? [...students]
          .filter(s => s.genre === activeCategory)
          .sort((a, b) => {
            const crushB = b.crushes || 0;
            const crushA = a.crushes || 0;
            if (crushB !== crushA) return crushB - crushA;
            return b.elo - a.elo;
          })
      : [...students]
          .filter(s => s.genre === activeCategory)
          .sort((a, b) => {
            const coronasB = b.coronas || 0;
            const coronasA = a.coronas || 0;
            if (coronasB !== coronasA) return coronasB - coronasA;
            return b.elo - a.elo;
          });

  // Get visible ranking for Live Standings based on visibleCount state
  const liveStandings = sortedStudentsForLeaderboard.slice(0, visibleCount);

  const isVotingLocked = timerFinished && (countdownConfig?.isActive ?? false);

  return (
    <div className="min-h-screen bg-[#030305] text-white font-sans antialiased relative selection:bg-[#bc13fe]/30 select-none p-4 sm:p-6 pb-8 overflow-x-hidden md:overflow-visible">
      
      {/* Ambient Neon Glows from Design Template */}
      <div className="absolute -top-40 -left-40 w-[400px] h-[400px] bg-[#ff007a]/15 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#bc13fe]/15 blur-[160px] rounded-full pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/3 blur-[120px] rounded-full pointer-events-none"></div>

      {/* HEADER SECTION - Beautiful premium look */}
      <header className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pb-3 border-b border-white/5 max-w-7xl mx-auto">
        <div className="flex flex-col gap-1 items-start">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter italic select-none">
              MASHMATCH
            </h1>
            {/* Admin Panel Toggle */}
            <button
              onClick={() => setShowAdminPanel(true)}
              className="p-2 sm:p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 active:scale-95 text-[#bc13fe] hover:text-[#ff007a] transition-all cursor-pointer flex items-center shadow-lg"
              title="Consola de Administración"
            >
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Division switcher toggle (♀ vs ♂) */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveCategory('women')}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeCategory === 'women'
                ? 'bg-gradient-to-r from-[#ff007a] to-[#ff007a]/80 text-white shadow-lg shadow-pink-500/20 font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>♀ Femenino</span>
          </button>
          
          <button
            onClick={() => setActiveCategory('men')}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeCategory === 'men'
                ? 'bg-gradient-to-r from-[#bc13fe] to-[#bc13fe]/80 text-white shadow-lg shadow-purple-500/20 font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>♂ Masculino</span>
          </button>
        </div>

        {/* Live countdown info */}
        {countdownConfig?.isActive && (
          <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
            <span className="font-mono text-[9px] text-white/40 uppercase tracking-widest leading-none">
              Termina en:
            </span>
            <div className="flex gap-2">
              <div className="flex items-center">
                <span className="text-sm font-bold font-mono text-white">
                  {String(timeLeft.d * 24 + timeLeft.h).padStart(2, '0')}
                </span>
                <span className="text-[7px] text-white/35 uppercase ml-0.5">h</span>
              </div>
              <span className="text-sm font-bold opacity-30 text-white">:</span>
              <div className="flex items-center">
                <span className="text-sm font-bold font-mono text-[#bc13fe]">
                  {String(timeLeft.m).padStart(2, '0')}
                </span>
                <span className="text-[7px] text-white/35 uppercase ml-0.5">m</span>
              </div>
              <span className="text-sm font-bold opacity-30 text-white">:</span>
              <div className="flex items-center">
                <span className="text-sm font-bold font-mono text-[#ff007a] animate-pulse">
                  {String(timeLeft.s).padStart(2, '0')}
                </span>
                <span className="text-[7px] text-white/35 uppercase ml-0.5">s</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10 select-none items-stretch">
        
        {/* LEFT COLUMN: VOTING INTERFACE (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-start space-y-4">
          
          {/* SEC 1: Progress Meter */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 relative overflow-hidden shadow-lg">
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

          {/* SEC 2: VOTING CARDS SCREEN WITH DYNAMIC TITLE */}
          <div className="flex flex-col space-y-3 w-full animate-fade-in">
            {!isVotingLocked && leftContestant && rightContestant && (
              <div className="text-center py-2 px-4 bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-md relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-r ${activeCategory === 'women' ? 'from-pink-500/5 to-transparent' : 'from-purple-500/5 to-transparent'} pointer-events-none`} />
                <h2 className="text-[15px] sm:text-xl md:text-2xl font-black tracking-tight select-none uppercase">
                  {activeCategory === 'women' ? (
                    <span className="bg-gradient-to-r from-pink-400 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,0,122,0.35)] font-black">
                      ¿Quién es la más bonita? 🌸
                    </span>
                  ) : (
                    <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-[#bc13fe] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(188,19,254,0.35)] font-black">
                      ¿Quién es el más guapo? ⚡
                    </span>
                  )}
                </h2>

              </div>
            )}

            <div className="relative min-h-[300px] sm:min-h-[340px] flex items-center justify-center">
              <AnimatePresence mode="wait">
              {isVotingLocked ? (
                (() => {
                  const firstPlace = sortedStudentsOfCategory[0];
                  const secondPlace = sortedStudentsOfCategory[1];
                  const thirdPlace = sortedStudentsOfCategory[2];
                  return (
                    // 🔒 VOTATION FINISHED - DISPLAY BEAUTIFUL 3D PODIUM OF WINNERS
                    <motion.div 
                      key="finished-podium"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="w-full rounded-3xl border border-yellow-500/20 bg-linear-to-b from-yellow-500/[0.02] to-black p-4 sm:p-6 md:p-8 backdrop-blur-md flex flex-col items-center"
                    >
                      <div className="text-center max-w-lg mx-auto mb-6">
                        <div className="inline-flex p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 mb-3 text-yellow-500 font-extrabold tracking-widest text-xs uppercase animate-pulse">
                          🏆 GANADORES OFICIALES DEL CERTAMEN
                        </div>
                        <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter text-white uppercase leading-tight bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
                          PODIO DE GANADORES
                        </h2>
                        <p className="text-gray-400 text-xs mt-2 font-sans">
                          La cuenta regresiva ha expirado. El sistema ha consolidado las posiciones definitivas para la categoría <strong className="text-white uppercase font-black">{activeCategory === 'women' ? 'Femenino ♀' : 'Masculino ♂'}</strong>.
                        </p>
                      </div>

                      {/* 3D / Layered Podium container */}
                      <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-4 items-end justify-center mb-8 pt-8 px-2">
                        
                        {/* SECOND PLACE (SILVER) - Left Column */}
                        {secondPlace ? (
                          <div className="flex flex-col items-center order-2 sm:order-1 mt-6 sm:mt-0">
                            <div className="relative mb-3 group">
                              <StudentAvatar id={secondPlace.id} name={secondPlace.name} genre={secondPlace.genre} perfilPhotoUrl={secondPlace.perfilPhotoUrl} className="w-20 h-20 border-2 border-slate-400/40 shadow-lg shadow-slate-500/5 group-hover:scale-105 transition-all duration-300" />
                              <div className="absolute -top-2.5 -left-2.5 w-8 h-8 rounded-full bg-slate-400 text-black font-black text-xs flex items-center justify-center border-2 border-[#110c1a] shadow-lg">
                                2
                              </div>
                            </div>
                            <span className="font-bold text-white text-sm truncate max-w-[150px]" title={secondPlace.name}>{secondPlace.name}</span>
                            <span className="text-[10px] uppercase font-mono text-slate-400 font-bold tracking-widest mb-2 mt-0.5">{activeCategory === 'women' ? 'Subcampeona' : 'Subcampeón'}</span>
                            
                            {/* Pedestal */}
                            <div className="w-full bg-zinc-805/30 border border-zinc-700/30 rounded-xl p-3 flex flex-col items-center justify-center h-24 md:h-28 shadow-xl relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-500/5 to-transparent pointer-events-none" />
                              <span className="text-lg font-black font-mono text-white">{secondPlace.elo}</span>
                              <span className="text-[9px] uppercase font-mono tracking-widest text-zinc-500 block">ELO SCORE</span>
                              <span className="text-[10px] font-mono text-zinc-400 font-bold mt-1.5">{secondPlace.wins} V</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center order-2 sm:order-1">
                            <div className="w-full bg-white/[0.01] border border-dashed border-white/10 rounded-xl p-4 text-center text-gray-600 text-xs font-mono h-28 flex items-center justify-center">
                              Sin subcampeón(a)
                            </div>
                          </div>
                        )}

                        {/* FIRST PLACE (GOLD) - Center Column */}
                        {firstPlace ? (
                          <div className="flex flex-col items-center order-1 sm:order-2">
                            <div className="relative mb-4 group scale-105">
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl animate-bounce" style={{ animationDuration: '3s' }}>👑</div>
                              <StudentAvatar id={firstPlace.id} name={firstPlace.name} genre={firstPlace.genre} perfilPhotoUrl={firstPlace.perfilPhotoUrl} className="w-24 h-24 border-3 border-yellow-400 shadow-xl shadow-yellow-500/10 group-hover:scale-105 transition-all duration-300" />
                              <div className="absolute -top-2 -left-2 w-9 h-9 rounded-full bg-yellow-400 text-black font-black text-sm flex items-center justify-center border-2 border-[#110c1a] shadow-lg">
                                1
                              </div>
                            </div>
                            <span className="font-extrabold text-white text-base truncate max-w-[180px] drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)]" title={firstPlace.name}>{firstPlace.name}</span>
                            <span className="text-xs uppercase font-extrabold font-mono text-yellow-400 tracking-widest mb-3 mt-1 animate-pulse">{activeCategory === 'women' ? 'Campeona 🥇' : 'Campeón 🥇'}</span>
                            
                            {/* Pedestal (taller) */}
                            <div className="w-full bg-yellow-950/20 border-2 border-yellow-500/40 rounded-2xl p-4 flex flex-col items-center justify-center h-32 md:h-38 shadow-2xl relative overflow-hidden ring-4 ring-yellow-500/10">
                              <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/10 to-transparent pointer-events-none" />
                              <span className="text-2xl font-black font-mono text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)]">{firstPlace.elo}</span>
                              <span className="text-[10px] uppercase font-mono tracking-widest text-yellow-500/70 block font-bold">Puntuación ELO</span>
                              <span className="text-xs font-mono text-yellow-200/80 font-black mt-2">{firstPlace.wins} V</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center order-1 sm:order-2">
                            <div className="w-full bg-white/[0.01] border border-dashed border-white/10 rounded-xl p-4 text-center text-gray-600 text-xs font-mono h-32 flex items-center justify-center">
                              Sin campeón(a)
                            </div>
                          </div>
                        )}

                        {/* THIRD PLACE (BRONZE) - Right Column */}
                        {thirdPlace ? (
                          <div className="flex flex-col items-center order-3 mt-6 sm:mt-0">
                            <div className="relative mb-3 group">
                              <StudentAvatar id={thirdPlace.id} name={thirdPlace.name} genre={thirdPlace.genre} perfilPhotoUrl={thirdPlace.perfilPhotoUrl} className="w-20 h-20 border-2 border-amber-700/40 shadow-lg shadow-amber-800/5 group-hover:scale-105 transition-all duration-300" />
                              <div className="absolute -top-2.5 -left-2.5 w-8 h-8 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center border-2 border-[#110c1a] shadow-lg">
                                3
                              </div>
                            </div>
                            <span className="font-bold text-white text-sm truncate max-w-[150px]" title={thirdPlace.name}>{thirdPlace.name}</span>
                            <span className="text-[10px] uppercase font-mono text-amber-600 font-bold tracking-widest mb-2 mt-0.5">3er Lugar</span>
                            
                            {/* Pedestal */}
                            <div className="w-full bg-amber-951/20 border border-amber-800/30 rounded-xl p-3 flex flex-col items-center justify-center h-20 md:h-24 shadow-xl relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-t from-amber-700/5 to-transparent pointer-events-none" />
                              <span className="text-lg font-black font-mono text-white">{thirdPlace.elo}</span>
                              <span className="text-[9px] uppercase font-mono tracking-widest text-amber-600 block">ELO SCORE</span>
                              <span className="text-[10px] font-mono text-zinc-400 font-bold mt-1.5">{thirdPlace.wins} V</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center order-3">
                            <div className="w-full bg-white/[0.01] border border-dashed border-white/10 rounded-xl p-4 text-center text-gray-600 text-xs font-mono h-24 flex items-center justify-center">
                              Sin 3er lugar
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Dynamic action buttons */}
                      <div className="mt-4 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md justify-center">
                        <button
                          onClick={() => {
                            // Switch category gender to inspect both podiums easily
                            setActiveCategory(activeCategory === 'women' ? 'men' : 'women');
                          }}
                          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold font-sans text-xs tracking-wider uppercase transition-all cursor-pointer text-center"
                        >
                          Ver {activeCategory === 'women' ? 'Masculino ♂' : 'Femenino ♀'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })()
              ) : currentStats.pending === 0 && students.filter(s => s.genre === activeCategory).length > 1 ? (
                // 🎉 CONGRATULATIONS / RESET COMBINATIONS LOOP (Volver a votar)
                <motion.div
                  key="voted-all"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="w-full rounded-3xl border border-[#bc13fe]/20 bg-linear-to-b from-[#bc13fe]/5 to-black p-6 sm:p-10 backdrop-blur-md flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[180px] text-pink-500/5 select-none pointer-events-none font-sans">💖</div>
                  
                  <div className="inline-flex p-3 rounded-2xl bg-[#bc13fe]/10 border border-[#bc13fe]/20 mb-4 text-[#bc13fe] text-3xl animate-bounce">
                    🎉
                  </div>
                  <h3 className="text-xl sm:text-3xl font-black tracking-tight text-white uppercase mb-2">
                    ¡Votación Completada!
                  </h3>
                  <p className="text-gray-400 text-xs sm:text-sm max-w-md mx-auto mb-6 leading-relaxed">
                    Has completado con éxito todas las combinaciones posibles de enfrentamientos para la categoría <strong className="text-white uppercase font-black">{activeCategory === 'women' ? 'Femenina ♀' : 'Masculina ♂'}</strong>.
                  </p>
                  
                  <button
                    onClick={resetVotingProgress}
                    className="px-8 py-3.5 rounded-full bg-gradient-to-r from-[#ff007a] to-[#bc13fe] hover:brightness-110 active:scale-95 text-xs sm:text-sm font-black tracking-widest uppercase text-white shadow-xl hover:shadow-[0_0_25px_rgba(255,0,122,0.35)] transition-all cursor-pointer"
                  >
                    Volver a votar
                  </button>
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
                  className="grid grid-cols-2 gap-4 sm:gap-6 md:gap-10 w-full relative"
                >
                  {/* LEFT NOMINEE */}
                  <div 
                    className={`group relative overflow-hidden rounded-[28px] bg-[#110c1a]/60 backdrop-blur-xl border border-white/5 p-4 sm:p-6 md:p-8 flex flex-col justify-between transition-all duration-300 h-[340px] xs:h-[390px] sm:h-[450px] ${
                      votingInProgress 
                        ? 'opacity-50 pointer-events-none' 
                        : 'hover:border-[#ff007a]/40 hover:shadow-[0_0_30px_rgba(255,0,122,0.15)]'
                    }`}
                  >
                    {/* Pill Header Row */}
                    <div className="flex justify-between items-center w-full relative z-10">
                      <div className="px-3 py-1 rounded-full bg-black/60 border border-[#ff007a]/20 font-mono text-[9px] sm:text-[10px] md:text-xs font-black select-none text-[#ff007a] tracking-wider">
                        VOTAR <span className="text-[#ff007a]/70">[A]</span>
                      </div>
                    </div>

                    {/* Center Avatar Block with glowing ring */}
                    <div className="flex flex-col justify-center items-center w-full my-2 xs:my-4 sm:my-5 relative z-10">
                      <div className="relative rounded-full p-2 border-2 border-[#ff007a]/20 group-hover:border-[#ff007a]/60 group-hover:scale-[1.03] transition-all duration-300 shadow-[0_0_15px_rgba(255,0,122,0.1)] group-hover:shadow-[0_0_25px_rgba(255,0,122,0.25)]">
                        <StudentAvatar 
                          id={leftContestant.id} 
                          name={leftContestant.name} 
                          genre={leftContestant.genre} 
                          perfilPhotoUrl={leftContestant.perfilPhotoUrl} 
                          className="w-14 h-14 xs:w-18 xs:h-18 sm:w-24 sm:h-24 md:w-28 md:h-28" 
                        />
                      </div>

                      {/* Mi Crush Button */}
                      {!votedCrushes.includes(leftContestant.id) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMakeCrush(leftContestant.id, activeCategory);
                          }}
                          className="mt-3 px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border border-white/10 text-[10px] md:text-xs font-black tracking-wider uppercase text-white shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1 hover:shadow-pink-500/20"
                        >
                          💖 Mi Crush
                        </button>
                      ) : (
                        <span className="mt-3 text-[10px] md:text-xs font-bold text-pink-400 flex items-center gap-1 select-none font-mono">
                          💖 Es tu crush
                        </span>
                      )}
                    </div>

                    {/* Name and Match Subtitle */}
                    <div className="text-center w-full relative z-10 flex-col flex items-center justify-center mt-auto">
                      <h2 className="text-xs xs:text-sm sm:text-lg md:text-xl font-black text-white group-hover:text-[#ff007a] transition-all duration-300 leading-tight select-none px-1">
                        {leftContestant.name}
                      </h2>
                    </div>

                    {/* Custom Action button - looks like outlined/outline normally, solid on hover! */}
                    <div className="w-full relative z-10 mt-3 xs:mt-5 sm:mt-6">
                      <button
                        type="button"
                        onClick={() => !votingInProgress && castVote(leftContestant.id, rightContestant.id)}
                        className="w-full py-2 px-4 xs:py-2.5 sm:py-3.5 rounded-full border border-white/5 bg-white/[0.01] text-white/30 text-[10px] sm:text-xs md:text-sm font-black tracking-widest uppercase transition-all duration-300 group-hover:bg-[#ff007a] group-hover:text-white group-hover:border-transparent group-hover:shadow-[0_6px_18px_rgba(255,0,122,0.45)] cursor-pointer select-none"
                      >
                        {votingInProgress ? 'ESPERA...' : 'VOTAR'}
                      </button>
                    </div>
                  </div>

                  {/* VS INDICATOR IN THE MIDDLE WITH PULSING EFFECT - absolute centerpiece */}
                  <div className="absolute left-1/2 top-[42%] transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center pointer-events-none select-none">
                    <div className="w-11 h-11 xs:w-13 xs:h-13 sm:w-16 sm:h-16 rounded-full border-2 border-pink-500/30 flex items-center justify-center bg-[#0d0713] relative shadow-[0_0_20px_rgba(255,0,122,0.5)]">
                      <div className="absolute inset-0 rounded-full animate-ping bg-[#ff007a]/15 opacity-60"></div>
                      <span className="text-xs xs:text-sm sm:text-base md:text-lg font-black italic tracking-tighter text-white uppercase drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">vs</span>
                    </div>
                  </div>

                  {/* RIGHT NOMINEE */}
                  <div 
                    className={`group relative overflow-hidden rounded-[28px] bg-[#110c1a]/60 backdrop-blur-xl border border-white/5 p-4 sm:p-6 md:p-8 flex flex-col justify-between transition-all duration-300 h-[340px] xs:h-[390px] sm:h-[450px] ${
                      votingInProgress 
                        ? 'opacity-50 pointer-events-none' 
                        : 'hover:border-[#bc13fe]/40 hover:shadow-[0_0_30px_rgba(188,19,254,0.15)]'
                    }`}
                  >
                    {/* Pill Header Row */}
                    <div className="flex justify-between items-center w-full relative z-10">
                      <div className="px-3 py-1 rounded-full bg-black/60 border border-[#bc13fe]/20 font-mono text-[9px] sm:text-[10px] md:text-xs font-black select-none text-[#bc13fe] tracking-wider">
                        VOTAR <span className="text-[#bc13fe]/70">[D]</span>
                      </div>
                    </div>

                    {/* Center Avatar Block with glowing ring */}
                    <div className="flex flex-col justify-center items-center w-full my-2 xs:my-4 sm:my-5 relative z-10">
                      <div className="relative rounded-full p-2 border-2 border-[#bc13fe]/20 group-hover:border-[#bc13fe]/60 group-hover:scale-[1.03] transition-all duration-300 shadow-[0_0_15px_rgba(188,19,254,0.1)] group-hover:shadow-[0_0_25px_rgba(188,19,254,0.25)]">
                        <StudentAvatar 
                          id={rightContestant.id} 
                          name={rightContestant.name} 
                          genre={rightContestant.genre} 
                          perfilPhotoUrl={rightContestant.perfilPhotoUrl} 
                          className="w-14 h-14 xs:w-18 xs:h-18 sm:w-24 sm:h-24 md:w-28 md:h-28" 
                        />
                      </div>

                      {/* Mi Crush Button */}
                      {!votedCrushes.includes(rightContestant.id) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMakeCrush(rightContestant.id, activeCategory);
                          }}
                          className="mt-3 px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border border-white/10 text-[10px] md:text-xs font-black tracking-wider uppercase text-white shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1 hover:shadow-pink-500/20"
                        >
                          💖 Mi Crush
                        </button>
                      ) : (
                        <span className="mt-3 text-[10px] md:text-xs font-bold text-pink-400 flex items-center gap-1 select-none font-mono">
                          💖 Es tu crush
                        </span>
                      )}
                    </div>

                    {/* Name and Match Subtitle */}
                    <div className="text-center w-full relative z-10 flex-col flex items-center justify-center mt-auto">
                      <h2 className="text-xs xs:text-sm sm:text-lg md:text-xl font-black text-white group-hover:text-[#bc13fe] transition-all duration-300 leading-tight select-none px-1">
                        {rightContestant.name}
                      </h2>
                    </div>

                    {/* Custom Action button - looks like outlined/outline normally, solid on hover! */}
                    <div className="w-full relative z-10 mt-3 xs:mt-5 sm:mt-6">
                      <button
                        type="button"
                        onClick={() => !votingInProgress && castVote(rightContestant.id, leftContestant.id)}
                        className="w-full py-2 px-4 xs:py-2.5 sm:py-3.5 rounded-full border border-white/5 bg-white/[0.01] text-white/30 text-[10px] sm:text-xs md:text-sm font-black tracking-widest uppercase transition-all duration-300 group-hover:bg-[#bc13fe] group-hover:text-white group-hover:border-transparent group-hover:shadow-[0_6px_18px_rgba(188,19,254,0.45)] cursor-pointer select-none"
                      >
                        {votingInProgress ? 'ESPERA...' : 'VOTAR'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>

        </div>

        {/* RIGHT COLUMN: LIVE STANDINGS LEADERBOARD (4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          
          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 sm:p-5 shadow-2xl relative overflow-hidden flex flex-col justify-start h-fit min-h-[250px] flex-grow">
            <div className="font-sans">
              
              {/* Head / Header from Design markup */}
              <div className="flex flex-col mb-5 border-b border-white/5 pb-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold tracking-[0.2em] text-white/70 uppercase">TABLA DE POSICIONES</h3>
                  <div className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-[#bc13fe] uppercase tracking-wider animate-pulse">Sincronizado</div>
                </div>

                {/* Switcher tabs */}
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 font-sans relative">
                  <button
                    id="btn-tab-elos"
                    onClick={() => setLeaderboardTab('elo')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                      leaderboardTab === 'elo'
                        ? 'bg-gradient-to-r from-[#ff007a] to-[#bc13fe] text-white shadow-lg font-black'
                        : 'text-white/55 hover:text-white'
                    }`}
                  >
                    🏆 Elos
                  </button>
                  <button
                    id="btn-tab-crush"
                    onClick={() => setLeaderboardTab('crush')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                      leaderboardTab === 'crush'
                        ? 'bg-gradient-to-r from-[#ff007a] to-[#bc13fe] text-white shadow-lg font-black'
                        : 'text-white/55 hover:text-white'
                    }`}
                  >
                    💖 Crush
                  </button>
                  <button
                    id="btn-tab-coronas"
                    onClick={() => setLeaderboardTab('coronas')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                      leaderboardTab === 'coronas'
                        ? 'bg-gradient-to-r from-[#ff007a] to-[#bc13fe] text-white shadow-lg font-black'
                        : 'text-white/55 hover:text-white'
                    }`}
                  >
                    👑 Coronas
                  </button>
                </div>
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
                    const isSecond = position === 2;
                    const isThird = position === 3;
                    
                    let positionColor = 'text-white/40';
                    if (isFirst) {
                      positionColor = 'text-[#ff007a]';
                    } else if (isSecond) {
                      positionColor = 'text-[#bc13fe]';
                    } else if (isThird) {
                      positionColor = 'text-[#00f0ff]';
                    }

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
                              <StudentAvatar id={student.id} name={student.name} genre={student.genre} perfilPhotoUrl={student.perfilPhotoUrl} className="w-8 h-8" />
                              {isFirst && (
                                <div className="absolute -top-1 -left-1 text-[9px]">👑</div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-white text-xs sm:text-sm truncate max-w-[130px] block leading-tight">
                                {student.name}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                {leaderboardTab !== 'crush' && (
                                  student.coronas !== undefined && student.coronas > 0 ? (
                                    <span className="text-[10px] text-yellow-400 font-extrabold flex items-center gap-0.5 select-none font-sans">
                                      👑 {student.coronas}
                                    </span>
                                  ) : (
                                    isAdmin && (
                                      <span className="text-[10px] text-white/20 flex items-center gap-0.5 select-none font-sans">
                                        👑 0
                                      </span>
                                    )
                                  )
                                )}
                                {isAdmin && (
                                  <div className="flex items-center gap-1 select-none">
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleAdminAdjustment(student, 'crowns', -1);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center rounded bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 border border-rose-500/20 text-[10px] font-black cursor-pointer leading-none"
                                      title="Quitar corona"
                                    >
                                      -
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleAdminAdjustment(student, 'crowns', 1);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center rounded bg-yellow-500/10 hover:bg-yellow-500/20 active:scale-95 text-yellow-400 border border-yellow-500/20 text-[10px] font-black cursor-pointer leading-none"
                                      title="Agregar corona"
                                    >
                                      +
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
 
                        {/* rating badge */}
                        <div className="text-right z-10 font-mono flex-shrink-0">
                          <span className="text-sm font-extrabold text-white flex items-center justify-end gap-1">
                            {leaderboardTab === 'elo' ? (
                              <span>{student.elo}</span>
                            ) : leaderboardTab === 'crush' ? (
                              <>
                                <span className="text-pink-500 animate-pulse select-none">💖</span>
                                <span>{student.crushes || 0}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-yellow-400 animate-pulse select-none">👑</span>
                                <span>{student.coronas || 0}</span>
                              </>
                            )}
                          </span>
                          <span className="text-[8px] text-white/30 uppercase tracking-wider font-bold block">
                            {leaderboardTab === 'elo' ? 'ELO score' : leaderboardTab === 'crush' ? 'Crushes 😍' : 'Coronas 👑'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* "Ver más" button to increment visible profiles by 4 */}
              {visibleCount < sortedStudentsForLeaderboard.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setVisibleCount((prev) => prev + 4)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-white/20 rounded-xl text-xs font-bold font-sans tracking-widest uppercase text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Plus className="w-4 h-4 text-slate-400" />
                    <span>Ver más</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SEC 3: SYSTEM COUNTDOWN LOGS PANEL */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex-shrink-0">
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

      </main>



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

