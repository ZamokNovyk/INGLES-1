import React, { useState } from 'react';
import { 
  auth, 
  db, 
  handleFirestoreError 
} from '../firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { Student, CountdownConfig, OperationType } from '../types';
import { DEFAULT_SEED_STUDENTS, getSpanishTimestamp, normalizeNameId } from '../defaultStudents';
import { getAvatarUrl } from '../utils';
import { 
  Shield, 
  Lock, 
  Unlock, 
  LogOut, 
  Calendar, 
  Plus, 
  RefreshCw, 
  RotateCcw, 
  Check, 
  AlertTriangle 
} from 'lucide-react';

interface AdminPanelProps {
  students: Student[];
  countdownConfig: CountdownConfig | null;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ students, countdownConfig, onClose }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Form states for new student
  const [newName, setNewName] = useState('');
  const [newGenre, setNewGenre] = useState<'women' | 'men'>('women');

  // Form states for Countdown
  const [targetDateInput, setTargetDateInput] = useState<string>('');
  const [countdownActive, setCountdownActive] = useState<boolean>(false);

  // Initialize form options if config exists
  React.useEffect(() => {
    if (countdownConfig) {
      // Format ISO target date for datetime-local input (YYYY-MM-DDThh:mm)
      if (countdownConfig.targetDate) {
        try {
          const date = new Date(countdownConfig.targetDate);
          const formatted = date.toISOString().slice(0, 16);
          setTargetDateInput(formatted);
        } catch (e) {
          console.warn('Could not parse target date: ', countdownConfig.targetDate);
        }
      }
      setCountdownActive(countdownConfig.isActive);
    }
  }, [countdownConfig]);

  // Auth Listener
  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserEmail(user.email);
        // Is bootstrapped email
        if (user.email === 'wikistars12@gmail.com') {
          setIsAdminLoggedIn(true);
        } else {
          setIsAdminLoggedIn(false);
          showStatus(`Iniciado como ${user.email}. No tienes permisos de administrador.`, true);
        }
      } else {
        setUserEmail(null);
        setIsAdminLoggedIn(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const showStatus = (text: string, error = false) => {
    setStatusMessage({ text, error });
    setTimeout(() => {
      setStatusMessage(null);
    }, 6000);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      showStatus('Autenticación completada con éxito.');
    } catch (error: any) {
      showStatus(`Error al autenticar: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setIsAdminLoggedIn(false);
      showStatus('Sesión cerrada correctamente.');
    } catch (error: any) {
      showStatus(`Error al salir: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  // 1. SAVE COUNTDOWN CONFIG (Requirement 7)
  const handleSaveCountdown = async () => {
    if (!isAdminLoggedIn) {
      showStatus('Debes iniciar sesión como wikistars12@gmail.com para cambiar configuraciones.', true);
      return;
    }
    if (!targetDateInput && countdownActive) {
      showStatus('Por favor selecciona una fecha límite válida.', true);
      return;
    }

    setLoading(true);
    const path = 'config/countdown';
    try {
      const isoString = targetDateInput ? new Date(targetDateInput).toISOString() : new Date().toISOString();
      await setDoc(doc(db, 'config', 'countdown'), {
        id: 'countdown',
        targetDate: isoString,
        isActive: countdownActive
      });
      showStatus('Configuración de cuenta regresiva guardada correctamente.');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, path);
      showStatus(`Firestore rechazó el cambio: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  // 2. NEW SEASON / RESET ELO & STATS (Requirement 7)
  const handleNewSeasonReset = async () => {
    if (!isAdminLoggedIn) {
      showStatus('Solo el administrador wikistars12@gmail.com puede reiniciar el concurso.', true);
      return;
    }

    const confirmReset = window.confirm(
      '¿Estás seguro de que quieres iniciar una NUEVA TEMPORADA?\n\nEsto restablecerá el ELO a 1200, victorias a 0 y derrotas de todos los participantes registrados, además de desactivar la cuenta regresiva temporal.'
    );

    if (!confirmReset) return;

    setLoading(true);
    try {
      // 1. Reset countdownconfig to inactive
      await setDoc(doc(db, 'config', 'countdown'), {
        id: 'countdown',
        targetDate: new Date().toISOString(),
        isActive: false
      });

      // 2. Loop & update all current students ELO & Wins & Losses
      const hombresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'hombres'));
      const mujeresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'mujeres'));
      const timestampStr = getSpanishTimestamp();

      const promises = [
        ...hombresSnap.docs.map(studentDoc => {
          return updateDoc(doc(db, 'INGLES1.Estudiantes', 'generos', 'hombres', studentDoc.id), {
            elo: 1200,
            votos_ganados: 0,
            votos_perdidos: 0,
            actualizadoEn: timestampStr
          });
        }),
        ...mujeresSnap.docs.map(studentDoc => {
          return updateDoc(doc(db, 'INGLES1.Estudiantes', 'generos', 'mujeres', studentDoc.id), {
            elo: 1200,
            votos_ganados: 0,
            votos_perdidos: 0,
            actualizadoEn: timestampStr
          });
        })
      ];

      await Promise.all(promises);
      showStatus('¡Nueva temporada iniciada con éxito! Todos los puntajes fueron restablecidos.');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, 'INGLES1.Estudiantes');
      showStatus(`Error durante el reinicio: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  // 3. FACTORY HARD-RESET (Requirement 7)
  const handleFactoryReset = async () => {
    if (!isAdminLoggedIn) {
      showStatus('Solo el administrador wikistars12@gmail.com puede ejecutar el Hard-Reset.', true);
      return;
    }

    const confirmReset = window.confirm(
      '⚡ ALERTA MÁXIMA ⚡\n\n¿Deseas ejecutar la RESTAURACIÓN DE EMERGENCIA?\n\nEsto ELIMINARÁ todos los estudiantes creados por usuarios y restablecerá la base de datos al conjunto estático original por defecto con el ELO base.'
    );

    if (!confirmReset) return;

    setLoading(true);
    try {
      // 1. Delete all student documents
      const hombresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'hombres'));
      const mujeresSnap = await getDocs(collection(db, 'INGLES1.Estudiantes', 'generos', 'mujeres'));
      
      const deletePromises = [
        ...hombresSnap.docs.map(stDoc => deleteDoc(doc(db, 'INGLES1.Estudiantes', 'generos', 'hombres', stDoc.id))),
        ...mujeresSnap.docs.map(stDoc => deleteDoc(doc(db, 'INGLES1.Estudiantes', 'generos', 'mujeres', stDoc.id)))
      ];
      await Promise.all(deletePromises);

      // 2. Setup default configurations
      await setDoc(doc(db, 'config', 'countdown'), {
        id: 'countdown',
        targetDate: new Date().toISOString(),
        isActive: false
      });

      // 3. Write default seed students
      const addPromises = DEFAULT_SEED_STUDENTS.map(student => {
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

      await Promise.all(addPromises);
      showStatus('Base de datos restaurada correctamente a los valores de fábrica de MashMatch.');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'INGLES1.Estudiantes');
      showStatus(`Error durante la restauración: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  // 4. ADD NEW REGISTERED STUDENT (Requirement 7)
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    if (!isAdminLoggedIn) {
      showStatus('Inicia sesión como wikistars12@gmail.com para registrar nuevos estudiantes.', true);
      return;
    }

    setLoading(true);
    const normalizedId = normalizeNameId(newName.trim());
    const genrePath = newGenre === 'men' ? 'hombres' : 'mujeres';

    try {
      await setDoc(doc(db, 'INGLES1.Estudiantes', 'generos', genrePath, normalizedId), {
        nombre: newName.trim(),
        género: genrePath,
        elo: 1200,
        votos_ganados: 0,
        votos_perdidos: 0,
        perfilPhotoUrl: getAvatarUrl(newName.trim(), newGenre),
        actualizadoEn: getSpanishTimestamp()
      });
      setNewName('');
      showStatus(`Estudiante "${newName.trim()}" agregado con éxito.`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, `INGLES1.Estudiantes/generos/${genrePath}/${normalizedId}`);
      showStatus(`Error al registrar estudiante: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-2xl overflow-y-auto max-h-[90vh] rounded-3xl glass-panel border border-white/10 p-6 sm:p-8 relative">
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors p-2"
        >
          ✕
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-8 h-8 text-[#bc13fe] glow-purple animate-pulse" />
          <h2 className="text-2xl font-bold font-sans text-white tracking-wide">
            Consola del Administrador
          </h2>
        </div>

        {/* Auth Module */}
        <div className="mb-8 p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-gray-400 text-sm block">Cuenta Activa Administrador:</span>
            {userEmail ? (
              <div className="flex items-center space-x-2 mt-1">
                {isAdminLoggedIn ? (
                  <Unlock className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Lock className="w-4 h-4 text-rose-500" />
                )}
                <span className={`font-mono text-sm font-semibold ${isAdminLoggedIn ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {userEmail}
                </span>
              </div>
            ) : (
              <span className="font-mono text-sm text-gray-500">Ninguna sesión iniciada</span>
            )}
          </div>

          <div>
            {userEmail ? (
              <button
                onClick={handleSignOut}
                disabled={loading}
                className="flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all font-semibold cursor-pointer text-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-[#bc13fe] hover:bg-[#bc13fe]/80 text-white font-semibold transition-all cursor-pointer text-sm font-sans shadow-lg shadow-purple-500/20"
              >
                <Shield className="w-4 h-4" />
                <span>Google Sign In Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* Non-Admin Warning Banner */}
        {userEmail && !isAdminLoggedIn && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start space-x-3 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <span>
              Has iniciado sesión, pero tu correo electrónico no es el habilitado en el backend como Administrador. Para poder realizar acciones de escritura real en la base de datos de Firebase, debes iniciar sesión con la cuenta: <strong className="font-mono text-white">wikistars12@gmail.com</strong>.
            </span>
          </div>
        )}

        {/* Global Feedback Panel */}
        {statusMessage && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${statusMessage.error ? 'bg-red-500/15 border border-red-500/30 text-red-300' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'}`}>
            {statusMessage.text}
          </div>
        )}

        {/* Admin Tools Grid (Locked if not admin) */}
        <div className={isAdminLoggedIn ? 'opacity-100 pointer-events-auto space-y-8' : 'opacity-40 pointer-events-none'}>
          
          {/* SEC 1: Countdown management */}
          <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 font-sans">
              <Calendar className="w-5 h-5 text-[#bc13fe]" />
              Gestión de Cuenta Regresiva de Votación
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1 font-mono uppercase tracking-wider">Fecha y Hora de Cierre (Local / UTC):</label>
                <input 
                  type="datetime-local" 
                  value={targetDateInput}
                  onChange={(e) => setTargetDateInput(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:border-[#bc13fe] focus:outline-none focus:ring-1 focus:ring-[#bc13fe] transition-all"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-white text-sm font-semibold block font-sans">Habilitar Bloqueo de Cuenta Regresiva</span>
                  <span className="text-gray-400 text-xs font-sans">Si se activa, la votación se detendrá al llegar a cero</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCountdownActive(!countdownActive)}
                  className={`w-14 h-8 rounded-full p-1 transition-all ${countdownActive ? 'bg-[#ff007a]' : 'bg-white/10'}`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white transition-all transform ${countdownActive ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <button
                onClick={handleSaveCountdown}
                disabled={loading}
                className="w-full mt-2 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all border border-white/10 text-sm hover:border-[#ff007a]/30 cursor-pointer flex items-center justify-center space-x-2"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Guardar Límite Temporal</span>
              </button>
            </div>
          </div>

          {/* SEC 2: Register New student */}
          <form onSubmit={handleAddStudent} className="p-5 rounded-2xl bg-white/5 border border-white/5">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#ff007a]" />
              Agregar Nuevo Participante (Estudiante)
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1 font-mono uppercase tracking-wider">Nombre Completo:</label>
                <input 
                  type="text" 
                  placeholder="Ej. Camila Diaz Perez" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-[#ff007a] focus:outline-none focus:ring-1 focus:ring-[#ff007a] transition-all"
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-2 font-mono uppercase tracking-wider">Categoría / Género:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewGenre('women')}
                    className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${newGenre === 'women' ? 'bg-[#ff007a]/20 border-[#ff007a] text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                  >
                    Femenino (♀)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewGenre('men')}
                    className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${newGenre === 'men' ? 'bg-[#bc13fe]/20 border-[#bc13fe] text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                  >
                    Masculino (♂)
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !newName.trim()}
                className="w-full py-3 bg-[#ff007a] hover:bg-[#ff007a]/90 text-white font-bold rounded-xl transition-all shadow-lg shadow-pink-500/20 text-sm cursor-pointer"
              >
                Registrar en Servidor
              </button>
            </div>
          </form>

          {/* SEC 3: Danger Zone */}
          <div className="p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20">
            <h3 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Zona de Peligro (Restablecimiento Completo)
            </h3>
            
            <p className="text-gray-400 text-sm mb-5 font-sans leading-relaxed">
              Estas acciones alteran de forma sustancial la persistencia y la base de datos de Firestore para todos los usuarios conectados. Úsese con precaución.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleNewSeasonReset}
                disabled={loading}
                className="flex items-center justify-center space-x-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-400 hover:text-amber-300 font-bold text-sm transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 flex-shrink-0" />
                <span className="text-left leading-tight">Iniciar Nueva Temporada <span className="block text-xs font-normal opacity-70">Reset ELO a 1200</span></span>
              </button>
              
              <button
                type="button"
                onClick={handleFactoryReset}
                disabled={loading}
                className="flex items-center justify-center space-x-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-400 hover:text-rose-300 font-bold text-sm transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 flex-shrink-0" />
                <span className="text-left leading-tight">Factory Hard-Reset <span className="block text-xs font-normal opacity-70">Recrear estudiantes semilla</span></span>
              </button>
            </div>
          </div>

        </div>

        {/* Lock Overlay if not logged in */}
        {!isAdminLoggedIn && (
          <div className="mt-8 text-center py-6 bg-white/2 rounded-2xl border border-white/5">
            <Lock className="w-10 h-10 mx-auto text-gray-500 mb-2" />
            <span className="text-gray-400 text-sm block font-sans">
              Consola protegida en la base de datos.
            </span>
            <span className="text-gray-500 text-xs block font-sans mt-1">
              Las funciones de cambio de base de datos están restringidas a la cuenta de administrador.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
