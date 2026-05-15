import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, CheckCircle, Dumbbell, Plus, Loader2, TrendingUp, Trash2, 
  Flame, Info, CalendarDays, ChevronLeft, ChevronRight as ChevronRightIcon, 
  Play, Pause, RotateCcw, Clock, Apple, Edit2, Save, X, BarChart2, Trophy,
  LayoutDashboard
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// === CONFIGURACIÓN DE FIREBASE Y APP ===
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
let app, auth, db;
if (firebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const safeAppId = String(rawAppId).replace(/\//g, '-'); 

const apiKey = ""; 

// === HELPERS DE SEGURIDAD Y FECHAS ===
const safeRender = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const getLocalTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('loading'); 
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);

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

  useEffect(() => {
    if (!auth) {
      setUser({ uid: 'local-user' });
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Error de autenticación:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const processLoadedData = async (data) => {
      if (!data.userData) {
        setStep('onboarding');
        return;
      }

      let currentData = { ...data };
      const today = getLocalTodayStr();
      const lastDate = currentData.userData?.lastActiveDate;

      if (lastDate && lastDate !== today && currentData.aiPlan) {
        const history = currentData.workoutHistory || {};
        const exercises = currentData.aiPlan?.exercises || [];
        
        let allDone = true;
        let completedCount = 0;
        if (exercises.length > 0) {
            exercises.forEach(ex => {
                const track = currentData.workoutTracking?.[ex.id];
                if (!track || !track.completed) allDone = false;
                if (track?.completed) completedCount++;
            });
        }
        
        const ratio = exercises.length > 0 ? completedCount / exercises.length : (allDone ? 1 : 0);
        history[lastDate] = { ratio, active: ratio > 0 };

        let newStreak = currentData.streak || 0;
        const msInDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.round((new Date(today).setHours(0,0,0,0) - new Date(lastDate).setHours(0,0,0,0)) / msInDay);

        if (daysDiff === 1) {
            if (exercises.length > 0 && allDone) newStreak++;
            else if (exercises.length > 0 && !allDone) newStreak = 0;
        } else if (daysDiff > 1) {
            newStreak = 0;
        }

        currentData.workoutHistory = history;
        currentData.streak = newStreak;
        currentData.userData.lastActiveDate = today;
        currentData.workoutTracking = {}; 
        
        if (daysDiff === 1 && allDone && exercises.length > 0) setShowStreakModal(true);

        setUserData(currentData.userData);
        setWorkoutHistory(history);
        setStreak(newStreak);
        await saveData(currentData);
        generateAIPlan(true, currentData); 

      } else {
        setUserData(currentData.userData);
        if (currentData.workoutHistory) setWorkoutHistory(currentData.workoutHistory);
        if (currentData.aiPlan) { setAiPlan(currentData.aiPlan); setStep('dashboard'); } else setStep('onboarding');
        if (currentData.schedule) setSchedule(currentData.schedule);
        if (currentData.workoutTracking) setWorkoutTracking(currentData.workoutTracking);
        if (currentData.streak !== undefined) setStreak(currentData.streak);
      }
    };

    if (db && user.uid !== 'local-user') {
      const docRef = doc(db, 'artifacts', safeAppId, 'users', user.uid, 'profiles', 'fitness');
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) processLoadedData(docSnap.data());
        else setStep('onboarding');
      });
      return () => unsubscribe();
    } else {
      const savedData = localStorage.getItem('fitnessAppLocalData');
      if (savedData) processLoadedData(JSON.parse(savedData));
      else setStep('onboarding');
    }
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
        const today = getLocalTodayStr();
        if (userData.lastActiveDate && today !== userData.lastActiveDate && step === 'dashboard') {
            window.location.reload(); 
        }
    }, 60000);
    return () => clearInterval(interval);
  }, [userData.lastActiveDate, step]);

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

  const saveData = async (dataToUpdate) => {
    if (!user) return;
    try {
      if (db && user.uid !== 'local-user') {
        const docRef = doc(db, 'artifacts', safeAppId, 'users', user.uid, 'profiles', 'fitness');
        await setDoc(docRef, dataToUpdate, { merge: true });
      } else {
        const currentData = JSON.parse(localStorage.getItem('fitnessAppLocalData') || '{}');
        localStorage.setItem('fitnessAppLocalData', JSON.stringify({ ...currentData, ...dataToUpdate }));
      }
    } catch (err) {
      console.error("Error guardando datos:", err);
    }
  };

  const generateAIPlan = async (isUpdate = false, overrideData = null) => {
    setIsLoading(true); 
    setError('');

    const dataToUse = overrideData || { userData, aiPlan, workoutTracking, streak, workoutHistory };
    const uData = dataToUse.userData;

    let prompt = '';
    if (!isUpdate) {
      prompt = `Actúa como entrenador personal y nutriólogo deportivo. 
      Cliente: ${uData.name}, ${uData.age} años, ${uData.weight}kg, ${uData.height}cm.
      Meta: ${uData.goal}. Exp: ${uData.experience}. Días: ${uData.daysPerWeek}.
      Dieta/Lesiones: ${uData.dietaryPreferences} / ${uData.injuries}.
      Detalles: ${uData.trainingDescription}.
      Genera: Un mensaje motivacional intenso, un "weeklySplit" (ej. "Pecho", "Descanso"), rutina detallada para HOY (con descansos en segundos, ej: 60) y plan de dieta.`;
    } else {
      const completedStats = Object.values(dataToUse.workoutTracking || {}).filter(w => w.completed).length;
      prompt = `Ayer completé ${completedStats} ejercicios. Pesos: ${JSON.stringify(dataToUse.workoutTracking)}.
      Genera mi rutina para HOY basada en mi meta (${uData.goal}). Dame un mensaje corto y muy motivador por mi progreso. Mantén el formato estricto JSON.`;
    }

    const systemInstruction = "Eres un coach experto. Responde estrictamente en JSON válido.";

    if (!apiKey) {
      setTimeout(async () => {
        const mockPlan = {
          coachMessage: isUpdate ? "La disciplina supera al talento. Tu racha lo demuestra. ¡A darle hoy!" : "Sin excusas. Tu viaje hacia tu mejor versión empieza hoy.",
          weeklySplit: { "Lunes": "Pecho/Tríceps", "Martes": "Espalda/Bíceps", "Miércoles": "Descanso Activo", "Jueves": "Pierna Completa", "Viernes": "Hombros", "Sábado": "Cardio HIIT", "Domingo": "Descanso" },
          exercises: [
              { id: "e1", name: "Flexiones (Push-ups)", sets: 4, reps: "10-15", recommendedWeight: "Corporal", restSeconds: 60, instructions: "Baja controlado hasta que el pecho casi toque el suelo." },
              { id: "e2", name: "Sentadillas Búlgaras", sets: 3, reps: "10 por pierna", recommendedWeight: "Mancuernas 10kg", restSeconds: 90, instructions: "El peso debe recaer en el talón de la pierna frontal." }
          ],
          dietPlan: [{ meal: "Desayuno", food: "Avena cocida con proteína." }, { meal: "Comida", food: "200g pollo, arroz y brócoli." }]
        };
        const initialTracking = {};
        mockPlan.exercises.forEach(ex => initialTracking[ex.id] = { completed: false, weightUsed: '', completedSets: 0 });
        
        const todayStr = getLocalTodayStr();
        setAiPlan(mockPlan); setWorkoutTracking(initialTracking); setStep('dashboard');
        
        await saveData({ 
            ...dataToUse, 
            aiPlan: mockPlan, 
            workoutTracking: initialTracking,
            userData: { ...uData, lastActiveDate: todayStr } 
        });
        setIsLoading(false);
      }, 1500);
      return;
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { 
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                coachMessage: { type: "STRING" },
                weeklySplit: { type: "OBJECT", additionalProperties: { type: "STRING" } },
                exercises: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, name: { type: "STRING" }, sets: { type: "INTEGER" }, reps: { type: "STRING" }, recommendedWeight: { type: "STRING" }, restSeconds: { type: "INTEGER" }, instructions: { type: "STRING" } } } },
                dietPlan: { type: "ARRAY", items: { type: "OBJECT", properties: { meal: { type: "STRING" }, food: { type: "STRING" } } } }
              }
            }
          } 
        })
      });
      
      const result = await response.json();
      const planStr = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!planStr) throw new Error("Respuesta vacía");
      
      const plan = JSON.parse(planStr);
      const initialTracking = {};
      plan.exercises.forEach(ex => initialTracking[ex.id] = { completed: false, weightUsed: '', completedSets: 0 });
      
      if (isUpdate && dataToUse.aiPlan?.weeklySplit && !plan.weeklySplit) {
        plan.weeklySplit = dataToUse.aiPlan.weeklySplit;
      }

      const todayStr = getLocalTodayStr();
      setAiPlan(plan); setWorkoutTracking(initialTracking); setStep('dashboard');
      
      await saveData({ 
          ...dataToUse, 
          aiPlan: plan, 
          workoutTracking: initialTracking, 
          userData: { ...uData, lastActiveDate: todayStr } 
      });
    } catch (err) {
      console.error(err);
      setError("Error conectando. Revisa tu conexión o API Key.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSchedule = () => {
    if (newScheduleItem.time && newScheduleItem.activity) {
      const newItems = [...schedule, { ...newScheduleItem, id: Date.now(), notified: false }];
      newItems.sort((a, b) => a.time.localeCompare(b.time));
      setSchedule(newItems);
      setNewScheduleItem({ time: '', activity: '' });
      saveData({ schedule: newItems });
    }
  };

  const deleteScheduleItem = (id) => {
    const newItems = schedule.filter(item => item.id !== id);
    setSchedule(newItems);
    saveData({ schedule: newItems });
  };

  const saveScheduleEdit = () => {
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

  const toggleExerciseCompletely = (id, totalSets) => {
    if (!workoutTracking[id]) return;
    const isDone = !workoutTracking[id].completed;
    const newTracking = { 
        ...workoutTracking, 
        [id]: { ...workoutTracking[id], completed: isDone, completedSets: isDone ? totalSets : 0 } 
    };
    setWorkoutTracking(newTracking);
    saveData({ workoutTracking: newTracking });
    if(isTimerRunning) setIsTimerRunning(false);
  };

  const completeSet = (id, totalSets, restSeconds) => {
      const currentSets = workoutTracking[id]?.completedSets || 0;
      const nextSet = currentSets + 1;
      const isNowCompleted = nextSet >= totalSets;

      const newTracking = {
          ...workoutTracking,
          [id]: { ...workoutTracking[id], completedSets: nextSet, completed: isNowCompleted }
      };

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
  
  const renderWeeklyProgress = () => {
    const days = [];
    const dayNamesShort = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
                <div style={{ height: `${Math.max(data.ratio * 100, 5)}%` }} className={`w-full ${data.active && data.ratio === 1 ? 'bg-lime-400' : (data.ratio > 0 ? 'bg-lime-400/50' : 'bg-zinc-700')} rounded-md transition-all duration-1000 ${data.isToday && data.ratio !== 1 ? 'animate-pulse' : ''}`}></div>
            </div>
            <span className={`text-[10px] font-black ${data.isToday ? 'text-lime-400' : 'text-zinc-500'}`}>{data.day}</span>
        </div>
    ));
  };

  if (step === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><Loader2 className="animate-spin text-lime-400" size={48}/></div>;
  }

  if (step === 'onboarding') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 py-10">
        <div className="bg-zinc-900 rounded-[2rem] shadow-2xl shadow-lime-400/5 max-w-2xl w-full p-6 md:p-8 border border-zinc-800 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-lime-400/10 rounded-full blur-[80px]"></div>
          
          <div className="flex items-center justify-center mb-6 text-lime-400"><Activity size={48} strokeWidth={2.5} /></div>
          <h1 className="text-2xl md:text-4xl font-black text-center text-white mb-2 tracking-tight">Sin Excusas</h1>
          <p className="text-zinc-400 text-center mb-8 font-medium">Diseñemos el plan perfecto para ti.</p>
          
          <form onSubmit={(e) => { e.preventDefault(); setUserData({...userData, lastActiveDate: getLocalTodayStr()}); generateAIPlan(); }} className="space-y-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4 bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800/50">
                <h3 className="font-black text-white uppercase tracking-wider text-xs">Datos Personales</h3>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Nombre</label>
                  <input required className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all placeholder:text-zinc-600" placeholder="Ej. Alex" value={userData.name} onChange={e => setUserData({...userData, name: e.target.value})} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Edad</label><input required type="number" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.age} onChange={e => setUserData({...userData, age: e.target.value})} /></div>
                  <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Peso(kg)</label><input required type="number" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.weight} onChange={e => setUserData({...userData, weight: e.target.value})} /></div>
                  <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Alt(cm)</label><input required type="number" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.height} onChange={e => setUserData({...userData, height: e.target.value})} /></div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Lesiones previas</label>
                  <input type="text" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all placeholder:text-zinc-600" placeholder="Ninguna" value={userData.injuries} onChange={e => setUserData({...userData, injuries: e.target.value})} />
                </div>
              </div>

              <div className="space-y-4 bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800/50">
                <h3 className="font-black text-white uppercase tracking-wider text-xs">Objetivos</h3>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Meta principal</label>
                  <select className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white font-medium transition-all" value={userData.goal} onChange={e => setUserData({...userData, goal: e.target.value})}>
                    <option value="muscle">Ganar Masa Muscular</option>
                    <option value="weight_loss">Perder Grasa</option>
                    <option value="endurance">Acondicionamiento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Experiencia</label>
                  <select className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white font-medium transition-all" value={userData.experience} onChange={e => setUserData({...userData, experience: e.target.value})}>
                    <option value="beginner">Principiante</option>
                    <option value="intermediate">Intermedio</option>
                    <option value="advanced">Avanzado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Días a la semana</label>
                  <input required type="number" min="1" max="7" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all" value={userData.daysPerWeek} onChange={e => setUserData({...userData, daysPerWeek: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/50 p-5 rounded-2xl border border-zinc-800/50">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Detalles Adicionales</label>
              <textarea rows="2" className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none text-white transition-all placeholder:text-zinc-600 resize-none" placeholder="Ej. Entreno en casa con mancuernas..." value={userData.trainingDescription} onChange={e => setUserData({...userData, trainingDescription: e.target.value})} ></textarea>
            </div>

            {error && <p className="text-red-400 text-sm text-center font-bold bg-red-950/50 border border-red-900/50 p-3 rounded-xl">{error}</p>}
            
            <button disabled={isLoading} type="submit" className="w-full bg-lime-400 text-zinc-950 font-black text-lg py-4 md:py-5 rounded-2xl hover:bg-lime-300 transition-all flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(163,230,53,0.15)] hover:shadow-[0_0_30px_rgba(163,230,53,0.3)] hover:-translate-y-1">
              {isLoading ? <Loader2 className="animate-spin text-zinc-950" size={24} /> : 'Generar Plan Ahora'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading && step !== 'onboarding') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-lime-400 mb-6" size={64}/>
        <h2 className="text-2xl font-black text-white uppercase text-center tracking-widest">Calculando...</h2>
        <p className="text-zinc-500 mt-2 text-center font-medium">Ajustando cargas basadas en tu rendimiento.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 pb-24 md:pb-8 font-sans selection:bg-lime-400/30">
      
      {/* Modal de Racha */}
      {showStreakModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-[2rem] p-8 max-w-sm w-full text-center animate-bounce-short border border-zinc-800 shadow-[0_0_50px_rgba(249,115,22,0.1)]">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(249,115,22,0.4)]">
                <Flame size={48} className="text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-3xl font-black mb-2 uppercase text-white tracking-tight">¡Misión Cumplida!</h2>
            <p className="font-medium text-zinc-400 mb-6">Ayer dominaste el entrenamiento. Tu racha sube a:<span className="text-orange-500 font-black text-3xl block mt-3 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">{streak} Días 🔥</span></p>
            <button onClick={() => setShowStreakModal(false)} className="w-full bg-white text-black py-4 rounded-xl font-black uppercase tracking-wider hover:bg-zinc-200 transition-colors">Ver Rutina de Hoy</button>
          </div>
        </div>
      )}

      {/* Desktop Nav */}
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="hidden md:flex gap-4">
           <button onClick={() => setStep('dashboard')} className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-3 border ${step === 'dashboard' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-transparent border-transparent text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/50'}`}><LayoutDashboard size={20}/> Vista Principal</button>
           <button onClick={() => setStep('calendar')} className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-3 border ${step === 'calendar' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-transparent border-transparent text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/50'}`}><CalendarDays size={20}/> Calendario</button>
        </div>

        <header className="bg-zinc-900 rounded-[2rem] p-6 md:p-8 shadow-2xl shadow-black flex flex-col md:flex-row justify-between items-center gap-6 border border-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-lime-400/5 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="flex items-center gap-5 w-full md:w-auto relative z-10">
              <div className="bg-lime-400/10 p-4 rounded-2xl text-lime-400 border border-lime-400/20"><Trophy size={32} strokeWidth={2.5} /></div>
              <div className="flex-1">
                <h1 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight line-clamp-1">{safeRender(userData.name)}</h1>
                <p className="text-zinc-500 text-sm md:text-base font-bold tracking-widest uppercase mt-1">{currentDate.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              </div>
          </div>
          <div className="flex items-center gap-4 bg-zinc-950 text-orange-500 px-6 py-4 rounded-2xl font-bold border border-zinc-800 w-full md:w-auto justify-center relative z-10 shadow-inner">
            <Flame size={28} className={streak > 0 ? 'fill-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]' : ''}/> 
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 leading-none mb-1">Racha Activa</span>
                <span className="text-2xl font-black leading-none">{streak} Días</span>
            </div>
          </div>
        </header>

        {/* CALENDAR */}
        {step === 'calendar' && (
          <div className="bg-zinc-900 rounded-[2rem] p-6 md:p-8 border border-zinc-800 overflow-x-auto relative">
             <div className="flex justify-between items-center mb-8 min-w-[300px]">
                <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                <div className="flex gap-3">
                  <button onClick={() => {const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d);}} className="p-3 bg-zinc-950 text-zinc-400 rounded-xl hover:bg-zinc-800 hover:text-white transition-colors border border-zinc-800"><ChevronLeft size={24}/></button>
                  <button onClick={() => {const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d);}} className="p-3 bg-zinc-950 text-zinc-400 rounded-xl hover:bg-zinc-800 hover:text-white transition-colors border border-zinc-800"><ChevronRightIcon size={24}/></button>
                </div>
             </div>
             
             <div className="grid grid-cols-7 gap-2 md:gap-3 min-w-[500px] md:min-w-[600px]">
                {dayNames.map(day => (<div key={day} className="text-center font-black text-zinc-600 text-[10px] md:text-xs py-2 uppercase tracking-widest">{day.substring(0,3)}</div>))}
                {Array.from({ length: getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => (<div key={`empty-${i}`} className="p-2 bg-zinc-950/50 rounded-2xl"></div>))}
                {Array.from({ length: getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
                  const isToday = new Date().toDateString() === dateObj.toDateString();
                  
                  const splitInfo = aiPlan?.weeklySplit?.[dayNames[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]] || 'Descanso';
                  const isRest = safeRender(splitInfo).toLowerCase().includes('descanso');

                  return (
                    <div key={dayNum} className={`p-3 md:p-4 rounded-2xl border min-h-[90px] md:min-h-[110px] flex flex-col transition-all ${isToday ? 'border-lime-400 bg-lime-400/10 shadow-[0_0_15px_rgba(163,230,53,0.1)]' : 'border-zinc-800 bg-zinc-950'}`}>
                      <span className={`font-black text-lg md:text-xl ${isToday ? 'text-lime-400' : 'text-zinc-300'}`}>{dayNum}</span>
                      <span className={`text-[9px] md:text-[10px] font-bold mt-2 leading-snug uppercase tracking-wider line-clamp-2 ${isRest ? 'text-zinc-600' : (isToday ? 'text-lime-300' : 'text-zinc-400')}`}>{safeRender(splitInfo)}</span>
                    </div>
                  );
                })}
             </div>
          </div>
        )}

        {/* DASHBOARD */}
        {step === 'dashboard' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
            <div className="xl:col-span-1 space-y-6 md:space-y-8">
              
              {/* Progress */}
              <div className="bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-zinc-800">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-white uppercase tracking-wider text-sm flex items-center gap-2"><BarChart2 className="text-lime-400"/> Actividad</h3>
                  <span className="text-xs font-bold text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">7 DÍAS</span>
                </div>
                <div className="flex items-end justify-between h-32 gap-1 md:gap-2">
                    {renderWeeklyProgress()}
                </div>
              </div>

              {/* Coach Message */}
              <div className="bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-zinc-800 relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 opacity-5"><Activity size={140} /></div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-lime-400 mb-4 flex items-center gap-2"><Info size={16}/> IA Coach</h3>
                <p className="text-base md:text-lg font-medium text-zinc-300 relative z-10 leading-relaxed">"{safeRender(aiPlan?.coachMessage) || "¡Es hora de construir tu mejor versión!"}"</p>
              </div>

              {/* Nutrition */}
              <div className="bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-zinc-800">
                <h3 className="font-black text-white uppercase tracking-wider text-sm mb-6 flex items-center gap-2"><Apple className="text-lime-400"/> Nutrición</h3>
                <div className="space-y-4">
                  {aiPlan?.dietPlan?.map((d, i) => (
                    <div key={i} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                      <p className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-1.5">{safeRender(d.meal) || 'Comida'}</p>
                      <p className="text-sm font-medium text-zinc-300 leading-snug">{safeRender(d.food) || ''}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agenda */}
              <div className="bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-zinc-800 hidden xl:block">
                <h3 className="font-black text-white uppercase tracking-wider text-sm mb-6 flex items-center gap-2"><Clock className="text-lime-400"/> Agenda</h3>
                <div className="space-y-3 mb-5">
                  {schedule.length === 0 && <p className="text-zinc-600 text-sm font-medium">Día libre.</p>}
                  {schedule.map(item => (
                    <div key={item.id} className="p-3 bg-zinc-950 rounded-xl group border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                      {editingScheduleId === item.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input type="time" className="p-2 border border-zinc-700 rounded-lg focus:border-lime-400 w-24 text-sm font-bold bg-zinc-900 text-white outline-none" value={editScheduleItem.time} onChange={e => setEditScheduleItem({...editScheduleItem, time: e.target.value})} />
                            <input type="text" className="p-2 border border-zinc-700 rounded-lg focus:border-lime-400 flex-1 text-sm bg-zinc-900 text-white outline-none" value={editScheduleItem.activity} onChange={e => setEditScheduleItem({...editScheduleItem, activity: e.target.value})} />
                          </div>
                          <div className="flex justify-end gap-2 mt-1">
                            <button onClick={() => setEditingScheduleId(null)} className="p-1.5 text-zinc-500 hover:text-zinc-300 bg-zinc-800 rounded"><X size={14}/></button>
                            <button onClick={saveScheduleEdit} className="p-1.5 text-lime-400 hover:text-lime-300 bg-zinc-800 rounded"><Save size={14}/></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-white bg-zinc-800 px-2.5 py-1 rounded-lg text-xs">{safeRender(item.time)}</span>
                            <span className="text-zinc-400 text-sm font-bold line-clamp-1">{safeRender(item.activity)}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {setEditingScheduleId(item.id); setEditScheduleItem({ time: item.time, activity: item.activity })}} className="text-zinc-600 hover:text-lime-400 p-1"><Edit2 size={14}/></button>
                            <button onClick={() => deleteScheduleItem(item.id)} className="text-zinc-600 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-950 p-1.5 rounded-xl flex gap-2 border border-zinc-800 focus-within:border-lime-400 transition-colors">
                  <input type="time" className="p-2 bg-transparent text-sm font-bold outline-none w-20 text-zinc-300" value={newScheduleItem.time} onChange={e => setNewScheduleItem({...newScheduleItem, time: e.target.value})} />
                  <div className="w-px bg-zinc-800 my-2"></div>
                  <input type="text" placeholder="Añadir..." className="flex-1 p-2 bg-transparent text-sm font-bold outline-none placeholder:text-zinc-600 text-zinc-300" value={newScheduleItem.activity} onChange={e => setNewScheduleItem({...newScheduleItem, activity: e.target.value})} />
                  <button onClick={handleAddSchedule} className="bg-lime-400 text-black p-2 rounded-lg hover:bg-lime-300 transition-colors"><Plus size={16}/></button>
                </div>
              </div>

            </div>

            <div className="xl:col-span-2 space-y-6 md:space-y-8">
              <div className="bg-zinc-900 p-5 md:p-8 rounded-[2rem] border border-zinc-800">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                  <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight flex items-center gap-3"><Dumbbell className="text-lime-400" size={32} strokeWidth={2.5}/> Entrenamiento</h2>
                  {aiPlan?.weeklySplit && (
                    <div className="bg-zinc-950 px-5 py-3 rounded-2xl border border-zinc-800 flex flex-col items-start sm:items-end w-full sm:w-auto">
                      <span className="text-[9px] uppercase font-black tracking-widest text-zinc-500 mb-1">Foco de Hoy</span>
                      <span className="text-sm md:text-base font-black text-lime-400 uppercase">{safeRender(aiPlan.weeklySplit[dayNames[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]] || 'Entrenamiento')}</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4 md:space-y-5">
                  {aiPlan?.exercises?.length === 0 && (
                      <div className="text-center py-16 border-2 border-dashed border-zinc-800 rounded-3xl">
                          <p className="text-zinc-500 font-bold uppercase tracking-widest">Día de recuperación. ¡Recarga energía!</p>
                      </div>
                  )}
                  
                  {aiPlan?.exercises?.map((ex) => {
                    const done = workoutTracking[ex.id]?.completed;
                    const open = expandedExercise === ex.id;
                    const totalSets = parseInt(safeRender(ex.sets)) || 1;
                    const completedSets = workoutTracking[ex.id]?.completedSets || 0;

                    return (
                      <div key={ex.id} className={`rounded-3xl transition-all duration-300 overflow-hidden border ${done ? 'bg-zinc-950/80 border-zinc-800 opacity-60' : (open ? 'bg-zinc-800/40 border-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.05)]' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700')}`}>
                        
                        <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 cursor-pointer" onClick={() => !done && setExpandedExercise(open ? null : ex.id)}>
                          
                          <div className="flex items-center gap-4 flex-1">
                              <button onClick={(e) => { e.stopPropagation(); toggleExerciseCompletely(ex.id, totalSets); }} className={`shrink-0 transition-transform ${done ? 'scale-100' : 'hover:scale-110'}`}>
                                <CheckCircle size={32} strokeWidth={2.5} className={done ? 'text-lime-400 fill-lime-400/20' : 'text-zinc-700'} />
                              </button>
                              <div className="flex-1">
                                <h4 className={`font-black text-lg md:text-2xl tracking-tight uppercase ${done ? 'line-through text-zinc-500' : 'text-white'}`}>{safeRender(ex.name) || 'Ejercicio'}</h4>
                                <div className="flex flex-wrap gap-2 mt-2">
                                   <span className="text-[10px] md:text-xs font-black text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 uppercase tracking-widest">{totalSets} Series x {safeRender(ex.reps)}</span>
                                   <span className="text-[10px] md:text-xs font-black text-lime-400 bg-lime-400/10 px-3 py-1.5 rounded-lg border border-lime-400/20 uppercase tracking-widest">{safeRender(ex.recommendedWeight)}</span>
                                </div>
                              </div>
                          </div>

                          {/* Barra Visual de Series */}
                          <div className="w-full md:w-32 flex gap-1.5 items-center justify-center pt-4 md:pt-0">
                             {Array.from({ length: totalSets }).map((_, i) => (
                                <div key={i} className={`h-1.5 md:h-2 flex-1 rounded-full transition-colors ${i < completedSets ? 'bg-lime-400' : 'bg-zinc-800'}`} />
                             ))}
                          </div>

                        </div>
                        
                        {open && !done && (
                          <div className="bg-zinc-950/50 p-5 md:p-6 border-t border-zinc-800 flex flex-col lg:flex-row gap-6">
                             
                             <div className="flex-1 space-y-6">
                                <div>
                                    <h4 className="text-[10px] font-black text-lime-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Info size={14}/> Instrucción</h4>
                                    <p className="text-sm text-zinc-300 font-medium leading-relaxed">{safeRender(ex.instructions)}</p>
                                </div>
                                
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                                    <div className="bg-zinc-900 p-2 rounded-xl flex items-center gap-3 border border-zinc-800 flex-1">
                                        <input type="text" placeholder="Ej. 15kg" className="w-full bg-transparent p-2 text-sm font-bold text-center outline-none text-white placeholder:text-zinc-600 focus:text-lime-400" value={workoutTracking[ex.id]?.weightUsed || ''} onChange={(e) => { const n = {...workoutTracking, [ex.id]: {...workoutTracking[ex.id], weightUsed: e.target.value}}; setWorkoutTracking(n); saveData({workoutTracking: n}); }}/>
                                        <span className="text-[10px] font-black text-zinc-500 uppercase pr-3">Usados</span>
                                    </div>
                                    
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); completeSet(ex.id, totalSets, ex.restSeconds); }}
                                        className="bg-lime-400 text-black hover:bg-lime-300 px-6 py-4 rounded-xl font-black text-xs md:text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(163,230,53,0.2)] hover:shadow-[0_0_25px_rgba(163,230,53,0.4)]"
                                    >
                                        Serie {completedSets + 1} Lista
                                    </button>
                                </div>
                             </div>

                             {/* Temporizador */}
                             {ex.restSeconds && (
                                 <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col items-center justify-center w-full lg:w-48 shrink-0 relative overflow-hidden">
                                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Descanso</span>
                                     <div className={`text-5xl font-black font-mono tracking-tighter mb-6 ${timeLeft > 0 && timeLeft <= 10 ? 'text-orange-500 animate-pulse drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]' : 'text-white'}`}>
                                         {Math.floor((timeLeft > 0 ? timeLeft : ex.restSeconds) / 60)}:{((timeLeft > 0 ? timeLeft : ex.restSeconds) % 60).toString().padStart(2, '0')}
                                     </div>
                                     <div className="flex gap-2 w-full">
                                         {isTimerRunning ? (
                                             <button onClick={() => setIsTimerRunning(false)} className="flex-1 py-3 bg-orange-500 text-white rounded-xl flex justify-center hover:bg-orange-600 transition shadow-[0_0_15px_rgba(249,115,22,0.3)]"><Pause size={20} strokeWidth={3}/></button>
                                         ) : (
                                             <button onClick={() => { setTimeLeft(timeLeft > 0 ? timeLeft : ex.restSeconds); setIsTimerRunning(true); }} className="flex-1 py-3 bg-lime-400 text-black rounded-xl flex justify-center hover:bg-lime-300 transition shadow-[0_0_15px_rgba(163,230,53,0.3)]"><Play size={20} className="ml-1" strokeWidth={3}/></button>
                                         )}
                                         <button onClick={() => {setIsTimerRunning(false); setTimeLeft(ex.restSeconds);}} className="p-3 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 hover:text-white transition border border-zinc-700"><RotateCcw size={20} strokeWidth={2.5}/></button>
                                     </div>
                                 </div>
                             )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 text-center">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                        Tu progreso se evaluará y actualizará a medianoche.
                    </p>
                </div>
              </div>

              {/* Agenda (Mobile only) */}
              <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800 xl:hidden">
                <h3 className="font-black text-white uppercase tracking-wider text-sm mb-6 flex items-center gap-2"><Clock className="text-lime-400"/> Agenda</h3>
                <div className="space-y-3 mb-5">
                  {schedule.length === 0 && <p className="text-zinc-600 text-sm font-medium">Día libre.</p>}
                  {schedule.map(item => (
                    <div key={item.id} className="p-3 bg-zinc-950 rounded-xl group border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                      {editingScheduleId === item.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input type="time" className="p-2 border border-zinc-700 rounded-lg focus:border-lime-400 w-24 text-sm font-bold bg-zinc-900 text-white outline-none" value={editScheduleItem.time} onChange={e => setEditScheduleItem({...editScheduleItem, time: e.target.value})} />
                            <input type="text" className="p-2 border border-zinc-700 rounded-lg focus:border-lime-400 flex-1 text-sm bg-zinc-900 text-white outline-none" value={editScheduleItem.activity} onChange={e => setEditScheduleItem({...editScheduleItem, activity: e.target.value})} />
                          </div>
                          <div className="flex justify-end gap-2 mt-1">
                            <button onClick={() => setEditingScheduleId(null)} className="p-1.5 text-zinc-500 hover:text-zinc-300 bg-zinc-800 rounded"><X size={14}/></button>
                            <button onClick={saveScheduleEdit} className="p-1.5 text-lime-400 hover:text-lime-300 bg-zinc-800 rounded"><Save size={14}/></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-white bg-zinc-800 px-2.5 py-1 rounded-lg text-xs">{safeRender(item.time)}</span>
                            <span className="text-zinc-400 text-sm font-bold line-clamp-1">{safeRender(item.activity)}</span>
                          </div>
                          <div className="flex gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {setEditingScheduleId(item.id); setEditScheduleItem({ time: item.time, activity: item.activity })}} className="text-zinc-600 hover:text-lime-400 p-1"><Edit2 size={14}/></button>
                            <button onClick={() => deleteScheduleItem(item.id)} className="text-zinc-600 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-950 p-1.5 rounded-xl flex gap-2 border border-zinc-800 focus-within:border-lime-400 transition-colors">
                  <input type="time" className="p-2 bg-transparent text-sm font-bold outline-none w-20 text-zinc-300" value={newScheduleItem.time} onChange={e => setNewScheduleItem({...newScheduleItem, time: e.target.value})} />
                  <div className="w-px bg-zinc-800 my-2"></div>
                  <input type="text" placeholder="Añadir..." className="flex-1 p-2 bg-transparent text-sm font-bold outline-none placeholder:text-zinc-600 text-zinc-300" value={newScheduleItem.activity} onChange={e => setNewScheduleItem({...newScheduleItem, activity: e.target.value})} />
                  <button onClick={handleAddSchedule} className="bg-lime-400 text-black p-2 rounded-lg hover:bg-lime-300 transition-colors"><Plus size={16}/></button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Navegación Bottom Bar (Mobile only) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800 z-[90] flex justify-around items-center p-2 pb-safe">
         <button onClick={() => setStep('dashboard')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${step === 'dashboard' ? 'text-lime-400' : 'text-zinc-600'}`}>
            <LayoutDashboard size={24} strokeWidth={step === 'dashboard' ? 2.5 : 2}/>
            <span className="text-[9px] font-black mt-1.5 uppercase tracking-widest">Actividad</span>
         </button>
         <button onClick={() => setStep('calendar')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${step === 'calendar' ? 'text-lime-400' : 'text-zinc-600'}`}>
            <CalendarDays size={24} strokeWidth={step === 'calendar' ? 2.5 : 2}/>
            <span className="text-[9px] font-black mt-1.5 uppercase tracking-widest">Calendario</span>
         </button>
      </div>

    </div>
  );
}