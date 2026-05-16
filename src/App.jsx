import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, CheckCircle, Dumbbell, Plus, Loader2, TrendingUp, Trash2, 
  Flame, Info, CalendarDays, ChevronLeft, ChevronRight as ChevronRightIcon, 
  Play, Pause, RotateCcw, Clock, Apple, Edit2, Save, X, BarChart2, Trophy,
  LayoutDashboard, Mail, Lock, LogOut, Bell
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// ==========================================
// 2. CONFIGURACIÓN DE IA (GEMINI)
// ==========================================
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// ==========================================
// 3. FUNCIONES DE PROTECCIÓN Y SOPORTE (ESTILO CLÁSICO)
// ==========================================
const getDbPath = function(uid) {
  return "users/" + uid;
};

const safeRender = function(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const getLocalTodayStr = function() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return year + "-" + month + "-" + day;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('loading'); 
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const timerRef = useRef(null);

  // Estados con inicialización explícita limpia
  const [userData, setUserData] = useState({
    name: '', age: '', weight: '', height: '',
    goal: 'muscle', experience: 'beginner', daysPerWeek: 3,
    dietaryPreferences: '', injuries: '', trainingDescription: '',
    lastActiveDate: ''
  });
  const [aiPlan, setAiPlan] = useState(null);
  const [schedule, setSchedule] = useState([
    { id: 1, time: '08:00', activity: 'Desayuno pre-entreno', notified: false },
    { id: 2, time: '18:00', activity: 'Hora de Entrenar', notified: false },
  ]);
  const [workoutTracking, setWorkoutTracking] = useState({});
  const [workoutHistory, setWorkoutHistory] = useState({}); 
  const [streak, setStreak] = useState(0);

  const [newScheduleItem, setNewScheduleItem] = useState({ time: '', activity: '' });
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [editScheduleItem, setEditScheduleItem] = useState({ time: '', activity: '' });
  const [currentDate, setCurrentDate] = useState(new Date());

  // Permisos de notificación sin async/await nativo complejo en root
  const requestNotificationPermission = function() {
    if ("Notification" in window) {
      Notification.requestPermission().then(function(permission) {
        if (permission === "granted") {
          setNotificationsEnabled(true);
        }
      }).catch(function(e) { console.log(e); });
    }
  };

  // Manejo de autenticación limpio
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (Notification.permission === 'granted') setNotificationsEnabled(true);
      } else {
        setUser(null);
        setStep('auth');
        setEmail('');
        setPassword('');
        setUserData({ name: '', age: '', weight: '', height: '', goal: 'muscle', experience: 'beginner', daysPerWeek: 3, dietaryPreferences: '', injuries: '', trainingDescription: '', lastActiveDate: '' });
        setAiPlan(null);
        setWorkoutTracking({});
        setWorkoutHistory({});
        setStreak(0);
        setSchedule([{ id: 1, time: '08:00', activity: 'Desayuno pre-entreno', notified: false }, { id: 2, time: '18:00', activity: 'Hora de Entrenar', notified: false }]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = function(e) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const safeEmail = email.trim();

    if (authMode === 'login') {
      signInWithEmailAndPassword(auth, safeEmail, password)
        .catch(function(err) { handleAuthError(err); })
        .finally(function() { setIsLoading(false); });
    } else {
      createUserWithEmailAndPassword(auth, safeEmail, password)
        .catch(function(err) { handleAuthError(err); })
        .finally(function() { setIsLoading(false); });
    }
  };

  const handleAuthError = function(err) {
    if (err.code === 'auth/invalid-email') setError('El correo no tiene un formato válido.');
    else if (err.code === 'auth/email-already-in-use') setError('Este correo ya está registrado.');
    else if (err.code === 'auth/weak-password') setError('La contraseña debe tener al menos 6 caracteres.');
    else if (err.code === 'auth/invalid-credential') setError('Correo o contraseña incorrectos.');
    else setError('Error al conectar. Verifica tus datos.');
  };

  // Guardado seguro en base de datos
  const saveData = function(dataToUpdate) {
    if (!user) return;
    const docRef = doc(db, getDbPath(user.uid));
    setDoc(docRef, dataToUpdate, { merge: true }).catch(function(err) {
      console.error("Error guardando datos:", err);
    });
  };

  // Escucha en tiempo real libre de bucles de renderizado
  useEffect(() => {
    if (!user) return;
    
    const docRef = doc(db, getDbPath(user.uid));
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.userData || !data.userData.name) {
          setStep('onboarding');
          return;
        }

        const today = getLocalTodayStr();
        const lastDate = data.userData.lastActiveDate;

        if (lastDate && lastDate !== today && data.aiPlan) {
          const history = data.workoutHistory ? { ...data.workoutHistory } : {};
          const exercises = data.aiPlan.exercises ? data.aiPlan.exercises : [];
          
          let allDone = true;
          let completedCount = 0;
          
          for (let i = 0; i < exercises.length; i++) {
            const track = data.workoutTracking ? data.workoutTracking[exercises[i].id] : null;
            if (!track || !track.completed) allDone = false;
            if (track && track.completed) completedCount++;
          }
          
          const ratio = exercises.length > 0 ? completedCount / exercises.length : (allDone ? 1 : 0);
          history[lastDate] = { ratio: ratio, active: ratio > 0 };

          let newStreak = data.streak || 0;
          const msInDay = 24 * 60 * 60 * 1000;
          const daysDiff = Math.round((new Date(today).setHours(0,0,0,0) - new Date(lastDate).setHours(0,0,0,0)) / msInDay);

          if (daysDiff === 1) {
              if (exercises.length > 0 && allDone) newStreak++;
              else if (exercises.length > 0 && !allDone) newStreak = 0;
          } else if (daysDiff > 1) {
              newStreak = 0;
          }

          const updatedData = {
            userData: { ...data.userData, lastActiveDate: today },
            workoutHistory: history,
            streak: newStreak,
            workoutTracking: {},
            aiPlan: data.aiPlan,
            schedule: data.schedule || []
          };

          if (daysDiff === 1 && allDone && exercises.length > 0) setShowStreakModal(true);

          setUserData(updatedData.userData);
          setWorkoutHistory(history);
          setStreak(newStreak);
          setWorkoutTracking({});
          
          const docRefSync = doc(db, getDbPath(user.uid));
          setDoc(docRefSync, updatedData, { merge: true }).then(function() {
             generateAIPlan(true, updatedData);
          });

        } else {
          setUserData(data.userData);
          if (data.workoutHistory) setWorkoutHistory(data.workoutHistory);
          if (data.aiPlan) { setAiPlan(data.aiPlan); setStep('dashboard'); } else setStep('onboarding');
          if (data.schedule) setSchedule(data.schedule);
          if (data.workoutTracking) setWorkoutTracking(data.workoutTracking);
          if (data.streak !== undefined) setStreak(data.streak);
        }
      } else {
        setStep('onboarding');
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Temporizadores adaptados
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play();
      } catch(e){}
    }
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, isTimerRunning]);

  // Generación de plan con estructuración clásica compatible
  const generateAIPlan = function(isUpdate, overrideData) {
    setIsLoading(true); 
    setError('');

    const dataToUse = overrideData ? overrideData : { userData: userData, aiPlan: aiPlan, workoutTracking: workoutTracking, streak: streak, workoutHistory: workoutHistory };
    const uData = dataToUse.userData;

    let userPrompt = '';
    if (!isUpdate) {
      userPrompt = "¡NUEVO CLIENTE!\nPerfil: " + uData.name + ", " + uData.age + " años, " + uData.weight + "kg, " + uData.height + "cm. Meta: " + uData.goal + ". Exp: " + uData.experience + ". Entrena: " + uData.daysPerWeek + " días.\nRESTRICCIONES OBLIGATORIAS:\nLesiones: " + (uData.injuries || 'Ninguna') + "\nEquipo/Preferencias: " + (uData.trainingDescription || 'Entrenamiento libre');
    } else {
      let completedStats = 0;
      if (dataToUse.workoutTracking) {
        const trackingValues = Object.values(dataToUse.workoutTracking);
        for(let j=0; j<trackingValues.length; j++) {
          if (trackingValues[j].completed) completedStats++;
        }
      }
      userPrompt = "Ayer completé " + completedStats + " ejercicios. Pesos: " + JSON.stringify(dataToUse.workoutTracking) + ".\nEquipo: " + uData.trainingDescription + ". Lesiones: " + uData.injuries + ". Meta: " + uData.goal + ".\nGenera mi rutina para HOY respetando mi equipo y lesiones. Dame un mensaje reconociendo mi progreso.";
    }

    const fullPrompt = "ERES EL MEJOR COACH Y NUTRIÓLOGO DE ÉLITE.\nTU REGLA DE ORO OBLIGATORIA: DEBES ADAPTARTE 100% A LAS RESTRICCIONES, LESIONES Y EQUIPO DEL USUARIO.\nUsa un tono motivador en español.\n\n" + userPrompt + "\n\nDEVUELVE EXACTAMENTE ESTA ESTRUCTURA JSON:\n{\n  \"coachMessage\": \"Mensaje\",\n  \"weeklySplit\": {\"Lunes\": \"Pecho\", \"Martes\": \"Espalda\", \"Miércoles\": \"Descanso\", \"Jueves\": \"Piernas\", \"Viernes\": \"Hombros\", \"Sábado\": \"Cardio\", \"Domingo\": \"Descanso\"},\n  \"exercises\": [{\"id\": \"e1\", \"name\": \"Ejercicio\", \"sets\": 3, \"reps\": \"10\", \"recommendedWeight\": \"10kg\", \"restSeconds\": 60, \"instructions\": \"Biomecánica\"}],\n  \"dietPlan\": [{\"meal\": \"Desayuno\", \"food\": \"Comida\"}]\n}";

    if (!apiKey || apiKey === "TU_LLAVE_DE_GEMINI_AQUI" || apiKey === "") {
      setIsLoading(false);
      setError("Falta configurar la API Key de Gemini.");
      
      const mockPlan = {
        coachMessage: "Por favor, ingresa tu API Key de Gemini directamente en la variable 'apiKey' del código para activar la inteligencia artificial.",
        weeklySplit: { "Lunes": "Prueba", "Martes": "Prueba", "Miércoles": "Prueba", "Jueves": "Prueba", "Viernes": "Prueba", "Sábado": "Prueba", "Domingo": "Descanso" },
        exercises: [{ id: "e1", name: "RUTINA DE PRUEBA (FALTA API KEY)", sets: 1, reps: "1", recommendedWeight: "Ninguno", restSeconds: 10, instructions: "Pega tu llave de Gemini en el código." }],
        dietPlan: [{ meal: "Aviso", food: "Configura la llave de Gemini." }]
      };
      
      const initialTracking = {};
      initialTracking["e1"] = { completed: false, weightUsed: '', completedSets: 0 };
      
      setAiPlan(mockPlan); 
      setWorkoutTracking(initialTracking); 
      setStep('dashboard');
      
      saveData({ aiPlan: mockPlan, workoutTracking: initialTracking, userData: { ...uData, lastActiveDate: getLocalTodayStr() } });
      return;
    }
// 1. URL usando el modelo exacto de tu curl (gemini-flash-latest)
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
    
    const payload = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };

    // 2. Fetch adaptado exactamente a los headers de tu curl
    fetch(url, { 
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey // Pasamos la llave de forma segura por el header
      }, 
      body: JSON.stringify(payload) 
    })
      .then(function(res) { 
        if (!res.ok) {
          throw new Error("Error en el servidor: " + res.status);
        }
        return res.json(); 
      })
      .then(function(data) {
        if (data.candidates && data.candidates.length > 0) {
          let responseStr = data.candidates[0].content.parts[0].text;
          
          // === FILTRO DE SEGURIDAD PARA LIMPIAR EL JSON ===
          // Encuentra la primera '{' y la última '}' para ignorar cualquier texto basura exterior
          const firstBrace = responseStr.indexOf('{');
          const lastBrace = responseStr.lastIndexOf('}');
          
          if (firstBrace !== -1 && lastBrace !== -1) {
            responseStr = responseStr.substring(firstBrace, lastBrace + 1);
          }
          // ===============================================

          // Ahora el parseo no fallará aunque la IA mande texto extra
          const plan = JSON.parse(responseStr);
          const initialTracking = {};
          
          if (plan.exercises) {
            for(let k=0; k<plan.exercises.length; k++) {
              initialTracking[plan.exercises[k].id] = { completed: false, weightUsed: '', completedSets: 0 };
            }
          }
          
          setAiPlan(plan); 
          setWorkoutTracking(initialTracking); 
          setStep('dashboard');
          saveData({ aiPlan: plan, workoutTracking: initialTracking, userData: { ...uData, lastActiveDate: getLocalTodayStr() } });
        } else {
          setError("Respuesta vacía de la IA.");
        }
      })
      .catch(function(err) {
        console.error(err);
        setError("Error de conexión con Gemini. Revisa la consola.");
      })
      .finally(function() { setIsLoading(false); });
  };

  // Métodos de control con asignación explícita antigua limpia
  const handleAddSchedule = function() {
    if (newScheduleItem.time && newScheduleItem.activity) {
      const newItems = schedule.concat([{ id: Date.now(), time: newScheduleItem.time, activity: newScheduleItem.activity, notified: false }]);
      newItems.sort((a, b) => a.time.localeCompare(b.time));
      setSchedule(newItems);
      setNewScheduleItem({ time: '', activity: '' });
      saveData({ schedule: newItems });
    }
  };

  const deleteScheduleItem = function(id) {
    const newItems = schedule.filter(item => item.id !== id);
    setSchedule(newItems);
    saveData({ schedule: newItems });
  };

  const saveScheduleEdit = function() {
    if (editScheduleItem.time && editScheduleItem.activity) {
      const updatedSchedule = schedule.map(item => 
        item.id === editingScheduleId ? { ...item, time: editScheduleItem.time, activity: editScheduleItem.activity, notified: false } : item
      );
      updatedSchedule.sort((a, b) => a.time.localeCompare(b.time));
      setSchedule(updatedSchedule);
      setEditingScheduleId(null);
      saveData({ schedule: updatedSchedule });
    }
  };

  const toggleExerciseCompletely = function(id, totalSets) {
    if (!workoutTracking[id]) return;
    const isDone = !workoutTracking[id].completed;
    const newTracking = { ...workoutTracking };
    newTracking[id] = { ...workoutTracking[id], completed: isDone, completedSets: isDone ? totalSets : 0 };
    setWorkoutTracking(newTracking);
    saveData({ workoutTracking: newTracking });
    if(isTimerRunning) setIsTimerRunning(false);
  };

  const completeSet = function(id, totalSets, restSeconds) {
      const currentSets = workoutTracking[id] ? (workoutTracking[id].completedSets || 0) : 0;
      const nextSet = currentSets + 1;
      const isNowCompleted = nextSet >= totalSets;

      const newTracking = { ...workoutTracking };
      newTracking[id] = { ...workoutTracking[id], completedSets: nextSet, completed: isNowCompleted };

      setWorkoutTracking(newTracking);
      saveData({ workoutTracking: newTracking });

      if (!isNowCompleted && restSeconds) {
          setTimeLeft(restSeconds);
          setIsTimerRunning(true);
      } else if (isNowCompleted) {
          setIsTimerRunning(false);
      }
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => { let day = new Date(year, month, 1).getDay(); return day === 0 ? 6 : day - 1; };
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  
  const renderWeeklyProgress = function() {
    const days = [];
    const dayNamesShort = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
        const record = workoutHistory[dateStr];
        
        days.push({
            day: dayNamesShort[d.getDay()],
            ratio: record ? record.ratio : 0,
            active: record ? record.active : false,
            isToday: i === 0
        });
    }

    return days.map((data, idx) => (
        <div key={idx} className="flex flex-col items-center flex-1 gap-2">
            <div className="w-full bg-zinc-800 rounded-lg h-full flex items-end overflow-hidden p-[2px]">
                <div style={{ height: Math.max(data.ratio * 100, 5) + "%" }} className={"w-full " + (data.active && data.ratio === 1 ? 'bg-lime-400' : (data.ratio > 0 ? 'bg-lime-400/50' : 'bg-zinc-700')) + " rounded-md transition-all duration-1000 " + (data.isToday && data.ratio !== 1 ? 'animate-pulse' : '')}></div>
            </div>
            <span className={"text-[10px] font-black " + (data.isToday ? 'text-lime-400' : 'text-zinc-500')}>{data.day}</span>
        </div>
    ));
  };

  if (step === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><Loader2 className="animate-spin text-lime-400" size={48}/></div>;
  }

  // PANTALLA 1: LOGIN / REGISTRO
  if (step === 'auth') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-800 w-full max-w-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/5 rounded-full blur-[50px]"></div>
          <div className="flex justify-center mb-6 text-lime-400 relative z-10"><Activity size={50} strokeWidth={2.5}/></div>
          <h2 className="text-3xl font-black text-white text-center mb-2 uppercase tracking-tighter relative z-10">
            {authMode === 'login' ? 'Bienvenido a VoltFit' : 'Crea tu cuenta'}
          </h2>
          <p className="text-zinc-500 text-center mb-8 font-medium relative z-10">Tu progreso sincronizado en la nube.</p>

          <form onSubmit={handleAuth} className="space-y-4 relative z-10">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18}/>
              <input
                type="email"
                placeholder="Correo electrónico"
                className="w-full bg-zinc-950 border border-zinc-800 p-4 pl-12 rounded-2xl text-white outline-none focus:border-lime-400 transition-all"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18}/>
              <input
                type="password"
                placeholder="Contraseña"
                className="w-full bg-zinc-950 border border-zinc-800 p-4 pl-12 rounded-2xl text-white outline-none focus:border-lime-400 transition-all"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm font-bold text-center bg-red-950/30 py-2 rounded-lg">{error}</p>}

            <button disabled={isLoading} className="w-full bg-lime-400 text-black font-black py-4 rounded-2xl hover:bg-lime-300 transition-all shadow-[0_0_20px_rgba(163,230,53,0.2)]">
              {isLoading ? <Loader2 className="animate-spin mx-auto"/> : (authMode === 'login' ? 'Entrar' : 'Empezar ahora')}
            </button>
          </form>

          <button onClick={() => {setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError('');}} className="w-full mt-6 text-zinc-500 font-bold text-sm hover:text-white transition-colors relative z-10">
            {authMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>
      </div>
    );
  }

  // PANTALLA 2: CUESTIONARIO INICIAL
  if (step === 'onboarding') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 py-10">
        <div className="bg-zinc-900 rounded-[2rem] shadow-2xl shadow-lime-400/5 max-w-2xl w-full p-6 md:p-8 border border-zinc-800 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-lime-400/10 rounded-full blur-[80px]"></div>
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <button onClick={() => signOut(auth)} className="text-zinc-500 hover:text-red-400 transition-colors"><LogOut size={20}/></button>
            <div className="flex items-center justify-center text-lime-400"><Activity size={48} strokeWidth={2.5} /></div>
            <div className="w-5"></div>
          </div>

          <h1 className="text-2xl md:text-4xl font-black text-center text-white mb-2 tracking-tight relative z-10">Sin Excusas</h1>
          <p className="text-zinc-400 text-center mb-8 font-medium relative z-10">Diseñemos el plan perfecto para ti.</p>
          
          <form onSubmit={(e) => { e.preventDefault(); const currentWithDate = { ...userData, lastActiveDate: getLocalTodayStr() }; setUserData(currentWithDate); generateAIPlan(false, { userData: currentWithDate }); }} className="space-y-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4 bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800/50">
                <h3 className="font-black text-white uppercase tracking-wider text-xs">Datos Personales</h3>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Nombre</label>
                  <input required className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" placeholder="Ej. Alex" value={userData.name} onChange={e => setUserData({...userData, name: e.target.value})} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Edad</label><input required type="number" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.age} onChange={e => setUserData({...userData, age: e.target.value})} /></div>
                  <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Peso(kg)</label><input required type="number" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.weight} onChange={e => setUserData({...userData, weight: e.target.value})} /></div>
                  <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Alt(cm)</label><input required type="number" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.height} onChange={e => setUserData({...userData, height: e.target.value})} /></div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Lesiones previas</label>
                  <input type="text" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" placeholder="Ninguna" value={userData.injuries} onChange={e => setUserData({...userData, injuries: e.target.value})} />
                </div>
              </div>

              <div className="space-y-4 bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800/50">
                <h3 className="font-black text-white uppercase tracking-wider text-xs">Objetivos</h3>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Meta principal</label>
                  <select className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white font-medium" value={userData.goal} onChange={e => setUserData({...userData, goal: e.target.value})}>
                    <option value="muscle">Ganar Masa Muscular</option>
                    <option value="weight_loss">Perder Grasa</option>
                    <option value="endurance">Acondicionamiento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Experiencia</label>
                  <select className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white font-medium" value={userData.experience} onChange={e => setUserData({...userData, experience: e.target.value})}>
                    <option value="beginner">Principiante</option>
                    <option value="intermediate">Intermedio</option>
                    <option value="advanced">Avanzado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Días a la semana</label>
                  <input required type="number" min="1" max="7" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white outline-none focus:border-lime-400" value={userData.daysPerWeek} onChange={e => setUserData({...userData, daysPerWeek: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800/50">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Detalles Adicionales (Importante)</label>
              <textarea rows="2" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 text-white resize-none" placeholder="Ej. Entreno en casa con mancuernas, solo tengo ligas..." value={userData.trainingDescription} onChange={e => setUserData({...userData, trainingDescription: e.target.value})} ></textarea>
            </div>

            {error && <p className="text-red-400 text-sm text-center font-bold bg-red-950/50 border border-red-900/50 p-3 rounded-xl">{error}</p>}
            
            <button disabled={isLoading} type="submit" className="w-full bg-lime-400 text-zinc-950 font-black text-lg py-4 rounded-2xl hover:bg-lime-300 transition-all flex justify-center items-center gap-2">
              {isLoading ? <Loader2 className="animate-spin text-zinc-950" size={24} /> : 'Generar Plan Ahora'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // PANTALLA 3: DASHBOARD / APLICACIÓN PRINCIPAL
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 pb-24 md:pb-8 font-sans selection:bg-lime-400/30">
      
      {showStreakModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-[2rem] p-8 max-w-sm w-full text-center border border-zinc-800">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Flame size={48} className="text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-3xl font-black mb-2 uppercase text-white">¡Misión Cumplida!</h2>
            <p className="font-medium text-zinc-400 mb-6">Ayer dominaste el entrenamiento. Tu racha sube a:<span className="text-orange-500 font-black text-3xl block mt-3">{streak} Días 🔥</span></p>
            <button onClick={() => setShowStreakModal(false)} className="w-full bg-white text-black py-4 rounded-xl font-black uppercase">Ver Rutina de Hoy</button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="hidden md:flex gap-4">
           <button onClick={() => setStep('dashboard')} className={"flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-3 border " + (step === 'dashboard' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-transparent border-transparent text-zinc-600')}><LayoutDashboard size={20}/> Vista Principal</button>
           <button onClick={() => setStep('calendar')} className={"flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-3 border " + (step === 'calendar' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-transparent border-transparent text-zinc-600')}><CalendarDays size={20}/> Calendario</button>
        </div>

        <header className="bg-zinc-900 rounded-[2rem] p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 border border-zinc-800 relative overflow-hidden">
          <div className="flex items-center justify-between w-full md:w-auto relative z-10">
            <div className="flex items-center gap-5">
                <div className="bg-lime-400/10 p-4 rounded-2xl text-lime-400 border border-lime-400/20"><Trophy size={32} strokeWidth={2.5} /></div>
                <div>
                  <h1 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight">{safeRender(userData.name)}</h1>
                  <p className="text-zinc-500 text-sm font-bold tracking-widest uppercase mt-1">{currentDate.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>
            <button onClick={() => signOut(auth)} className="md:hidden p-3 text-zinc-500 hover:text-red-400 bg-zinc-950 rounded-xl"><LogOut size={20}/></button>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-center relative z-10">
            {!notificationsEnabled && (
              <button onClick={requestNotificationPermission} className="bg-zinc-950 border border-zinc-800 text-zinc-400 p-4 rounded-2xl"><Bell size={24}/></button>
            )}
             <div className="flex items-center gap-4 bg-zinc-950 text-orange-500 px-6 py-4 rounded-2xl font-bold border border-zinc-800 flex-1 md:flex-auto justify-center">
              <Flame size={28} className={streak > 0 ? 'fill-orange-500' : ''}/> 
              <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Racha Activa</span>
                  <span className="text-2xl font-black">{streak} Días</span>
              </div>
             </div>
             <button onClick={() => signOut(auth)} className="hidden md:flex p-4 text-zinc-500 hover:text-red-400 bg-zinc-950 rounded-2xl border border-zinc-800"><LogOut size={24}/></button>
          </div>
        </header>

        {/* CONTENIDO SEGÚN PANTALLA ACTIVA */}
        {step === 'calendar' && (
          <div className="bg-zinc-900 rounded-[2rem] p-6 border border-zinc-800 overflow-x-auto">
             <div className="flex justify-between items-center mb-8 min-w-[300px]">
                <h2 className="text-2xl font-black text-white uppercase">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                <div className="flex gap-3">
                  <button onClick={() => {const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d);}} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-400"><ChevronLeft size={24}/></button>
                  <button onClick={() => {const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d);}} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-400"><ChevronRightIcon size={24}/></button>
                </div>
             </div>
             <div className="grid grid-cols-7 gap-2 min-w-[500px]">
                {dayNames.map(day => (<div key={day} className="text-center font-black text-zinc-600 text-[10px] py-2 uppercase tracking-widest">{day.substring(0,3)}</div>))}
                {Array.from({ length: getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => (<div key={"empty-" + i} className="p-2 bg-zinc-950/50 rounded-2xl"></div>))}
                {Array.from({ length: getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
                  const isToday = new Date().toDateString() === dateObj.toDateString();
                  const currentDayIndex = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
                  const splitInfo = aiPlan && aiPlan.weeklySplit ? aiPlan.weeklySplit[dayNames[currentDayIndex]] : 'Descanso';
                  const isRest = safeRender(splitInfo).toLowerCase().includes('descanso');

                  return (
                    <div key={dayNum} className={"p-3 rounded-2xl border min-h-[90px] flex flex-col " + (isToday ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-800 bg-zinc-950')}>
                      <span className={"font-black text-lg " + (isToday ? 'text-lime-400' : 'text-zinc-300')}>{dayNum}</span>
                      <span className={"text-[9px] font-bold mt-2 uppercase tracking-wider line-clamp-2 " + (isRest ? 'text-zinc-600' : (isToday ? 'text-lime-300' : 'text-zinc-400'))}>{safeRender(splitInfo)}</span>
                    </div>
                  );
                })}
             </div>
          </div>
        )}

        {step === 'dashboard' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-1 space-y-6">
              
              <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-white uppercase tracking-wider text-sm flex items-center gap-2"><BarChart2 className="text-lime-400"/> Actividad</h3>
                  <span className="text-xs font-bold text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">7 DÍAS</span>
                </div>
                <div className="flex items-end justify-between h-32 gap-1">{renderWeeklyProgress()}</div>
              </div>

              <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-lime-400 mb-4 flex items-center gap-2"><Info size={16}/> IA Coach</h3>
                <p className="text-base font-medium text-zinc-300 leading-relaxed">"{aiPlan ? safeRender(aiPlan.coachMessage) : "¡Es hora de construir tu mejor versión!"}"</p>
              </div>

              <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800">
                <h3 className="font-black text-white uppercase tracking-wider text-sm mb-6 flex items-center gap-2"><Apple className="text-lime-400"/> Nutrición</h3>
                <div className="space-y-4">
                  {aiPlan && aiPlan.dietPlan && aiPlan.dietPlan.map((d, i) => (
                    <div key={i} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                      <p className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-1.5">{safeRender(d.meal)}</p>
                      <p className="text-sm font-medium text-zinc-300">{safeRender(d.food)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agenda Desktop */}
              <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800 hidden xl:block">
                <h3 className="font-black text-white uppercase tracking-wider text-sm mb-6 flex items-center gap-2"><Clock className="text-lime-400"/> Agenda</h3>
                <div className="space-y-3 mb-5">
                  {schedule.map(item => (
                    <div key={item.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/50">
                      {editingScheduleId === item.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input type="time" className="p-2 bg-zinc-900 text-white rounded-lg border border-zinc-700 outline-none text-sm font-bold" value={editScheduleItem.time} onChange={e => setEditScheduleItem({...editScheduleItem, time: e.target.value})} />
                            <input type="text" className="p-2 bg-zinc-900 text-white rounded-lg border border-zinc-700 outline-none text-sm flex-1" value={editScheduleItem.activity} onChange={e => setEditScheduleItem({...editScheduleItem, activity: e.target.value})} />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingScheduleId(null)} className="p-1 text-zinc-500"><X size={14}/></button>
                            <button onClick={saveScheduleEdit} className="p-1 text-lime-400"><Save size={14}/></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-white bg-zinc-800 px-2.5 py-1 rounded-lg text-xs">{safeRender(item.time)}</span>
                            <span className="text-zinc-400 text-sm font-bold">{safeRender(item.activity)}</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => {setEditingScheduleId(item.id); setEditScheduleItem({ time: item.time, activity: item.activity })}} className="text-zinc-600"><Edit2 size={14}/></button>
                            <button onClick={() => deleteScheduleItem(item.id)} className="text-zinc-600"><Trash2 size={14}/></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-950 p-1.5 rounded-xl flex gap-2 border border-zinc-800">
                  <input type="time" className="bg-transparent text-sm font-bold outline-none text-zinc-300 w-20" value={newScheduleItem.time} onChange={e => setNewScheduleItem({...newScheduleItem, time: e.target.value})} />
                  <input type="text" placeholder="Añadir..." className="flex-1 bg-transparent text-sm font-bold outline-none text-zinc-300" value={newScheduleItem.activity} onChange={e => setNewScheduleItem({...newScheduleItem, activity: e.target.value})} />
                  <button onClick={handleAddSchedule} className="bg-lime-400 text-black p-2 rounded-lg"><Plus size={16}/></button>
                </div>
              </div>

            </div>

            <div className="xl:col-span-2 space-y-6">
              <div className="bg-zinc-900 p-5 md:p-8 rounded-[2rem] border border-zinc-800">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                  <h2 className="text-2xl font-black text-white uppercase flex items-center gap-3"><Dumbbell className="text-lime-400" size={32}/> Entrenamiento</h2>
                  {aiPlan && aiPlan.weeklySplit && (
                    <div className="bg-zinc-950 px-5 py-3 rounded-2xl border border-zinc-800 flex flex-col">
                      <span className="text-[9px] uppercase font-black text-zinc-500">Foco de Hoy</span>
                      <span className="text-sm font-black text-lime-400 uppercase">{safeRender(aiPlan.weeklySplit[dayNames[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]] || 'Entrenamiento')}</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  {aiPlan && aiPlan.exercises && aiPlan.exercises.map((ex) => {
                    const trackingData = workoutTracking[ex.id];
                    const done = trackingData ? trackingData.completed : false;
                    const open = expandedExercise === ex.id;
                    const totalSets = parseInt(safeRender(ex.sets)) || 1;
                    const completedSets = trackingData ? (trackingData.completedSets || 0) : 0;

                    return (
                      <div key={ex.id} className={"rounded-3xl border transition-all " + (done ? 'bg-zinc-950/80 border-zinc-800 opacity-60' : (open ? 'bg-zinc-800/40 border-lime-400' : 'bg-zinc-950 border-zinc-800'))}>
                        <div className="p-5 flex flex-col md:flex-row md:items-center gap-4 cursor-pointer" onClick={() => !done && setExpandedExercise(open ? null : ex.id)}>
                          <div className="flex items-center gap-4 flex-1">
                              <button onClick={(e) => { e.stopPropagation(); toggleExerciseCompletely(ex.id, totalSets); }}>
                                <CheckCircle size={32} strokeWidth={2.5} className={done ? 'text-lime-400 fill-lime-400/20' : 'text-zinc-700'} />
                              </button>
                              <div className="flex-1">
                                <h4 className={"font-black text-lg uppercase " + (done ? 'line-through text-zinc-500' : 'text-white')}>{safeRender(ex.name)}</h4>
                                <div className="flex flex-wrap gap-2 mt-2">
                                   <span className="text-[10px] font-black text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">{safeRender(totalSets)} Series x {safeRender(ex.reps)}</span>
                                   <span className="text-[10px] font-black text-lime-400 bg-lime-400/10 px-3 py-1.5 rounded-lg border border-lime-400/20">{safeRender(ex.recommendedWeight)}</span>
                                </div>
                              </div>
                          </div>
                          <div className="w-full md:w-32 flex gap-1.5 items-center justify-center">
                             {Array.from({ length: totalSets }).map((_, i) => (
                                <div key={i} className={"h-1.5 flex-1 rounded-full " + (i < completedSets ? 'bg-lime-400' : 'bg-zinc-800')} />
                             ))}
                          </div>
                        </div>
                        
                        {open && !done && (
                          <div className="bg-zinc-950/50 p-5 border-t border-zinc-800 flex flex-col lg:flex-row gap-6">
                             <div className="flex-1 space-y-6">
                                <div>
                                    <h4 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-3">Instrucción</h4>
                                    <p className="text-sm text-zinc-300 font-medium">{safeRender(ex.instructions)}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <div className="bg-zinc-900 p-2 rounded-xl flex items-center gap-3 border border-zinc-800 flex-1 w-full">
                                        <input type="text" placeholder="Ej. 15kg" className="w-full bg-transparent p-2 text-sm font-bold text-center outline-none text-white focus:text-lime-400" value={workoutTracking[ex.id] ? (workoutTracking[ex.id].weightUsed || '') : ''} onChange={(e) => { const n = {...workoutTracking}; n[ex.id] = {...n[ex.id], weightUsed: e.target.value}; setWorkoutTracking(n); saveData({workoutTracking: n}); }}/>
                                        <span className="text-[10px] font-black text-zinc-500 uppercase pr-3">Usados</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); completeSet(ex.id, totalSets, ex.restSeconds); }} className="bg-lime-400 text-black px-6 py-4 rounded-xl font-black text-xs uppercase w-full sm:w-auto">
                                        Serie {completedSets + 1} Lista
                                    </button>
                                </div>
                             </div>

                             {ex.restSeconds && (
                                 <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col items-center justify-center w-full lg:w-48 shrink-0">
                                     <span className="text-[10px] font-black text-zinc-500 uppercase">Descanso</span>
                                     <div className={"text-5xl font-black font-mono my-4 " + (timeLeft > 0 && timeLeft <= 10 ? 'text-orange-500 animate-pulse' : 'text-white')}>
                                         {Math.floor((timeLeft > 0 ? timeLeft : ex.restSeconds) / 60)}:{((timeLeft > 0 ? timeLeft : ex.restSeconds) % 60).toString().padStart(2, '0')}
                                     </div>
                                     <div className="flex gap-2 w-full">
                                         {isTimerRunning ? (
                                             <button onClick={() => setIsTimerRunning(false)} className="flex-1 py-3 bg-orange-500 text-white rounded-xl flex justify-center"><Pause size={20}/></button>
                                         ) : (
                                             <button onClick={() => { setTimeLeft(timeLeft > 0 ? timeLeft : ex.restSeconds); setIsTimerRunning(true); }} className="flex-1 py-3 bg-lime-400 text-black rounded-xl flex justify-center"><Play size={20}/></button>
                                         )}
                                         <button onClick={() => {setIsTimerRunning(false); setTimeLeft(ex.restSeconds);}} className="p-3 bg-zinc-800 text-zinc-400 rounded-xl border border-zinc-700"><RotateCcw size={20}/></button>
                                     </div>
                                 </div>
                             )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Agenda Mobile */}
              <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800 xl:hidden">
                <h3 className="font-black text-white uppercase text-sm mb-6 flex items-center gap-2"><Clock className="text-lime-400"/> Agenda</h3>
                <div className="space-y-3 mb-5">
                  {schedule.map(item => (
                    <div key={item.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/50">
                      {editingScheduleId === item.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input type="time" className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white font-bold text-sm" value={editScheduleItem.time} onChange={e => setEditScheduleItem({...editScheduleItem, time: e.target.value})} />
                            <input type="text" className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm flex-1" value={editScheduleItem.activity} onChange={e => setEditScheduleItem({...editScheduleItem, activity: e.target.value})} />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingScheduleId(null)} className="text-zinc-500"><X size={14}/></button>
                            <button onClick={saveScheduleEdit} className="text-lime-400"><Save size={14}/></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-white bg-zinc-800 px-2.5 py-1 rounded-lg text-xs">{safeRender(item.time)}</span>
                            <span className="text-zinc-400 text-sm font-bold">{safeRender(item.activity)}</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => {setEditingScheduleId(item.id); setEditScheduleItem({ time: item.time, activity: item.activity })}} className="text-zinc-600"><Edit2 size={14}/></button>
                            <button onClick={() => deleteScheduleItem(item.id)} className="text-zinc-600"><Trash2 size={14}/></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-950 p-1.5 rounded-xl flex gap-2 border border-zinc-800">
                  <input type="time" className="bg-transparent text-sm font-bold text-zinc-300 w-20 outline-none" value={newScheduleItem.time} onChange={e => setNewScheduleItem({...newScheduleItem, time: e.target.value})} />
                  <input type="text" placeholder="Añadir..." className="flex-1 bg-transparent text-sm font-bold text-zinc-300 outline-none" value={newScheduleItem.activity} onChange={e => setNewScheduleItem({...newScheduleItem, activity: e.target.value})} />
                  <button onClick={handleAddSchedule} className="bg-lime-400 text-black p-2 rounded-lg"><Plus size={16}/></button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Navegación Inferior Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800 z-[90] flex justify-around items-center p-2">
         <button onClick={() => setStep('dashboard')} className={"flex flex-col items-center p-3 " + (step === 'dashboard' ? 'text-lime-400' : 'text-zinc-600')}>
            <LayoutDashboard size={24}/>
            <span className="text-[9px] font-black mt-1 uppercase">Actividad</span>
         </button>
         <button onClick={() => setStep('calendar')} className={"flex flex-col items-center p-3 " + (step === 'calendar' ? 'text-lime-400' : 'text-zinc-600')}>
            <CalendarDays size={24}/>
            <span className="text-[9px] font-black mt-1 uppercase">Calendario</span>
         </button>
      </div>

    </div>
  );
}
