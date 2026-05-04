/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Twitter, Sparkles, RefreshCcw, Copy, Check, Twitter as TwitterIcon, Clock, Trash2, ChevronRight, LogOut, LogIn, User, Menu, X as CloseIcon } from 'lucide-react';
import { generateTweetIdeas, type TweetRequest, type GenerationResult, type TweetIdea } from './services/geminiService';
import { cn } from './lib/utils';
import { auth, loginWithGoogle, logout, db } from './lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  deleteDoc, 
  doc, 
  getDocs,
  setDoc
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface HistoryItem {
  id: string;
  timestamp: number;
  request: TweetRequest;
  result: GenerationResult;
}

function TweetCard({ idea, index }: { idea: TweetIdea; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(idea.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass-card-dark bg-[#111] border border-border-subtle rounded-lg p-5 flex flex-col justify-between group h-full relative"
    >
      <div className="flex items-start justify-between mb-4">
        <span className={cn(
          "text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded",
          idea.type === 'Hook' && "bg-blue-500/10 text-blue-400",
          idea.type === 'Story' && "bg-purple-500/10 text-purple-400",
          idea.type === 'Lesson' && "bg-green-500/10 text-green-400",
          idea.type === 'Thread-start' && "bg-yellow-500/10 text-yellow-400"
        )}>
          {idea.type}
        </span>
        <button
          onClick={handleCopy}
          className="text-text-muted hover:text-white transition-colors p-1"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      
      <p className="text-sm leading-relaxed text-white/90">
        {idea.content}
      </p>

      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-[#333] font-mono">
          {index + 1 < 10 ? `0${index + 1}` : index + 1}
        </span>
        <TwitterIcon className="w-3 h-3 text-[#222]" />
      </div>
    </motion.div>
  );
}

export default function App() {
  const [formData, setFormData] = useState<TweetRequest>({
    role: '',
    topic: '',
    tone: 'friendly',
  });
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Engines Active");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(() => {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    return !key || key === 'AI Studio free tier';
  });
  const [error, setError] = useState<string | null>(null);
  const [isPlatformDetected, setIsPlatformDetected] = useState(false);

  const handleOpenKeySelection = async () => {
    console.log("Triggering API Key selection dialog...");
    if (window.aistudio?.openSelectKey) {
      try {
        setError(null);
        await window.aistudio.openSelectKey();
        console.log("Dialog closed. Assuming success and reloading...");
        // Use a slight delay before reload to ensure platform state syncs
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        console.error("Failed to open key selection:", err);
        setError("Failed to open the key selection dialog. Error: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      console.warn("Platform interface not found on window.aistudio");
      setError("Platform interface (window.aistudio) not detected. If you are in AI Studio, please refresh the page. If the button is unresponsive, try adding a key manually in the Secrets panel.");
    }
  };

  // Connection and Platform Test
  useEffect(() => {
    let checkCount = 0;
    const checkPlatform = async () => {
      // Check multiple times as it might take a moment to be injected
      if (window.aistudio) {
        setIsPlatformDetected(true);
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (hasKey) {
            setApiKeyMissing(false);
          }
        } catch (e) {
          console.warn("Error checking for selected API key:", e);
        }
      } else if (checkCount < 10) {
        checkCount++;
        setTimeout(checkPlatform, 200);
      }
    };
    checkPlatform();
    const testConnection = async () => {
      try {
        await getDocs(query(collection(db, 'test-connection'), limit(1)));
        setDbReady(true);
      } catch (error) {
        console.warn("Initial database check:", error);
        setDbReady(true); 
      }
    };
    testConnection();
  }, []);

  // Auth State Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      
      if (u) {
        // Update user profile in Firestore
        try {
          await setDoc(doc(db, 'users', u.uid), {
            email: u.email,
            displayName: u.displayName || null,
            photoURL: u.photoURL || null,
            lastLogin: serverTimestamp(),
          }, { merge: true });
        } catch (error) {
          console.error("Error updating user profile:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync History (Local or Firestore)
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Local Storage History for Unauthenticated Users
      const saved = localStorage.getItem('founder_tweet_history');
      if (saved) {
        try {
          setHistory(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse local history');
        }
      }
      return;
    }

    // Firestore History for Authenticated Users
    const historyPath = `users/${user.uid}/history`;
    const q = query(
      collection(db, historyPath),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: HistoryItem[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp?.toMillis() || Date.now(),
          request: data.request,
          result: data.result,
        };
      });
      setHistory(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, historyPath);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  // Persist local history if not logged in
  useEffect(() => {
    if (!user && !authLoading) {
      localStorage.setItem('founder_tweet_history', JSON.stringify(history));
    }
  }, [history, user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.role || !formData.topic) return;

    setLoading(true);
    setLoadingMessage("Engines Active");
    setResult(null);
    setError(null);
    setMobileMenuOpen(false);

    const maxRetries = 3;
    let attempt = 0;

    const executeRequest = async () => {
      try {
        const data = await generateTweetIdeas(formData);
        setResult(data);
        
        const newHistoryData = {
          timestamp: user ? serverTimestamp() : Date.now(),
          request: { ...formData },
          result: data,
        };

        if (user) {
          const historyPath = `users/${user.uid}/history`;
          try {
            await addDoc(collection(db, historyPath), {
              ...newHistoryData,
              userId: user.uid
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, historyPath);
          }
        } else {
          const newHistoryItem: HistoryItem = {
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
            request: { ...formData },
            result: data,
          };
          setHistory(prev => [newHistoryItem, ...prev].slice(0, 10));
        }
        setLoading(false);
      } catch (err) {
        console.error(`Attempt ${attempt + 1} failed:`, err);
        
        let displayError = "An unexpected error occurred";
        let isHighDemand = false;
        
        if (err instanceof Error) {
          displayError = err.message;
          try {
            if (displayError.trim().startsWith('{')) {
              const parsed = JSON.parse(displayError);
              if (parsed.error?.message) {
                displayError = parsed.error.message;
              }
              if (parsed.error?.code === 503 || displayError.toLowerCase().includes("high demand")) {
                isHighDemand = true;
              }
            } else if (displayError.toLowerCase().includes("high demand")) {
              isHighDemand = true;
            }
          } catch (e) {
            if (displayError.toLowerCase().includes("high demand")) {
              isHighDemand = true;
            }
          }
        }

        if (isHighDemand && attempt < maxRetries) {
          attempt++;
          setLoadingMessage(`High demand. Retrying in 15s... (Attempt ${attempt}/${maxRetries})`);
          setTimeout(executeRequest, 15000); // 15s retry
          return;
        }
        
        setError(displayError);
        setLoading(false);
      }
    };

    executeRequest();
  };

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear your history?')) return;

    if (user) {
      const historyPath = `users/${user.uid}/history`;
      try {
        const q = query(collection(db, historyPath));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, historyPath, d.id)));
        await Promise.all(deletePromises);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, historyPath);
      }
    } else {
      setHistory([]);
    }
  };

  const deleteSingleHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (user) {
      const historyPath = `users/${user.uid}/history`;
      try {
        await deleteDoc(doc(db, historyPath, id));
      } catch (error) {
        console.error('Delete failed:', error);
      }
    } else {
      setHistory(prev => prev.filter(item => item.id !== id));
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setFormData(item.request);
    setResult(item.result);
    setMobileMenuOpen(false);
  };

  const handleCopyAll = () => {
    if (result) {
      const allText = result.ideas.map(i => `[${i.type}] ${i.content}`).join('\n\n');
      navigator.clipboard.writeText(allText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg-main font-sans overflow-x-hidden">
      {apiKeyMissing && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-4 text-[10px] text-amber-500 font-medium">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            <span>
              {isPlatformDetected 
                ? "Gemini API Key needs configuration. Please select a project with billing or provide a key." 
                : "Gemini API Key missing. Please configure it in the Secrets panel."}
            </span>
          </div>
          {isPlatformDetected && (
            <button 
              onClick={handleOpenKeySelection}
              className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded text-[9px] uppercase tracking-wider cursor-pointer transition-colors"
            >
              Configure
            </button>
          )}
        </div>
      )}
      {/* Header Navigation */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-border-subtle bg-bg-main z-50 sticky top-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1 mr-1 text-text-muted hover:text-white"
          >
            {mobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="w-7 h-7 md:w-8 md:h-8 bg-white rounded flex items-center justify-center shrink-0">
            <span className="text-black font-bold text-base md:text-lg leading-none">X</span>
          </div>
          <h1 className="text-sm md:text-lg font-medium tracking-tight truncate">
            GhostWriter <span className="text-text-muted font-normal hidden sm:inline">/ Founder Edition</span>
          </h1>
        </div>
        <div className="flex gap-2 md:gap-4 items-center">
          {user ? (
            <div className="flex items-center gap-2 md:gap-3 lg:pr-4 lg:border-r border-border-subtle">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest truncate max-w-[100px]">{user.displayName?.split(' ')[0] || 'Founder'}</p>
                <button onClick={() => logout()} className="text-[10px] text-red-500/80 hover:text-red-500 flex items-center gap-1 ml-auto">
                  Logout <LogOut className="w-2.5 h-2.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="profile" className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-text-muted" />
                  </div>
                )}
                {/* Mobile Logout Button */}
                <button 
                  onClick={() => logout()} 
                  className="sm:hidden p-1.5 text-red-500/80 hover:text-red-500"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => loginWithGoogle()}
              className="flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs rounded border border-border-accent hover:bg-white hover:text-black transition-all shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 relative h-[calc(100vh-65px-45px)] lg:h-[calc(100vh-65px-45px)] overflow-hidden">
        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="mobile-sidebar-overlay"
            />
          )}
        </AnimatePresence>

        {/* Sidebar Controls */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 md:w-96 xl:w-[400px] border-r border-border-subtle bg-bg-surface p-6 flex flex-col gap-8 overflow-y-auto shrink-0 transition-transform duration-300 lg:relative lg:translate-x-0 lg:z-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="lg:hidden flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#444]">Navigation</h2>
            <button onClick={() => setMobileMenuOpen(false)}>
              <CloseIcon className="w-5 h-5 text-text-muted transition-colors hover:text-white" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label className="sidebar-label">Founder Role</label>
              <input
                type="text"
                placeholder="AI Startup Founder..."
                className="input-field-dark"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="sidebar-label">Initial Topic / Idea</label>
              <textarea
                placeholder="Just raised $2.5M Seed round..."
                className="input-field-dark min-h-[140px] leading-relaxed resize-none"
                value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="sidebar-label">Selected Tone</label>
              <div className="flex flex-wrap gap-2">
                {(['friendly', 'like a story', 'emotional'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormData({ ...formData, tone: t })}
                    className={cn(
                      "px-3 py-1 text-[10px] rounded-full transition-all border capitalize",
                      formData.tone === t 
                        ? "bg-white/10 text-white border-white/20 font-bold" 
                        : "border-border-subtle text-text-muted hover:text-white"
                    )}
                  >
                    {t.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-white w-full py-2.5 mt-4 flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCcw className="w-4 h-4 animate-spin text-black" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  Generate Ideas
                </>
              )}
            </button>
          </form>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold leading-none">Recent</span>
            </div>
            
            {!user ? (
              <button 
                onClick={() => loginWithGoogle()}
                className="text-left p-3 rounded bg-bg-input/30 border border-dashed border-border-subtle hover:border-white/20 transition-all text-[10px] text-text-muted italic group"
              >
                <span className="group-hover:text-white transition-colors">Login to view history</span>
              </button>
            ) : (
              history.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {history.map((item) => (
                    <div key={item.id} className="group flex items-stretch gap-0">
                      <button
                        onClick={() => loadFromHistory(item)}
                        className="flex-1 text-left p-3 rounded-l bg-bg-input/50 border-y border-l border-border-subtle hover:border-white/20 transition-all cursor-pointer"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider truncate">
                            {item.request.role}
                          </span>
                          <p className="text-[10px] text-text-muted line-clamp-1 italic">
                            {item.request.topic}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => deleteSingleHistoryItem(e, item.id)}
                        className="px-3 rounded-r bg-bg-input/50 border-y border-r border-[#1a1a1a] hover:border-red-500/30 hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-all shrink-0 flex items-center justify-center group-hover:border-border-subtle"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-[#333] italic px-1">No recent architectures found.</p>
              )
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-border-subtle flex flex-col gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-bg-input to-bg-main border border-border-accent">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1 italic font-mono">Current Engine</p>
              <p className="text-xs font-semibold">Gemini 3 Flash</p>
            </div>
          </div>
        </aside>

        {/* Main Output Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-bg-main scroll-smooth">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs text-center max-w-2xl mx-auto"
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CloseIcon className="w-4 h-4 shrink-0" />
                  <span className="font-bold uppercase tracking-widest text-[10px]">Generation Failed</span>
                </div>
                <p className="opacity-80">{error}</p>
                {error.toLowerCase().includes("high demand") && (
                  <p className="mt-2 text-[10px] font-bold text-amber-500 animate-pulse">
                    This is a temporary service limit. Please wait 30 seconds and try again.
                  </p>
                )}
                {(apiKeyMissing || error.includes("API key not valid")) && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <p className="text-[10px] italic">
                      Note: If you are on the free tier, the platform usually handles the key. If it's failing, you might need to select a project with billing or provide a manual key.
                    </p>
                    <button
                      onClick={handleOpenKeySelection}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Select/Configure API Key
                    </button>
                    <p className="text-[9px] opacity-60">
                      Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-white">aistudio.google.com/app/apikey</a> to get a key.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {!result && !loading && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto"
              >
                <div className="w-12 h-12 bg-bg-surface border border-border-accent rounded-full flex items-center justify-center mb-6">
                  <Twitter className="w-5 h-5 text-text-muted" />
                </div>
                <h2 className="text-xl md:text-2xl font-light mb-2">Ready to ghostwrite.</h2>
                <p className="text-text-muted text-xs md:text-sm leading-relaxed">
                  Enter your stats on the left. We'll architect a narrative that positions you as a leading voice on X.
                </p>
              </motion.div>
            )}

            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center"
              >
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/50">{loadingMessage}</p>
                {loadingMessage.includes("Retrying") && (
                  <p className="mt-2 text-[10px] text-amber-500/60 transition-pulse animate-pulse">Taking a bit longer due to server traffic...</p>
                )}
              </motion.div>
            )}

            {result && !loading && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-5xl mx-auto space-y-8"
              >
                <header className="mb-10 text-center lg:text-left">
                  <h2 className="text-lg md:text-2xl font-light mb-2 text-white/60 px-4">
                    {result.header || "Tweet Architecture"}
                  </h2>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted px-4">Optimized for engagement and authority.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-2">
                  {result.ideas.map((idea, index) => (
                    <TweetCard key={index} idea={idea} index={index} />
                  ))}
                </div>

                <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 border-t border-border-subtle pt-12 mb-8">
                   <button 
                    onClick={handleCopyAll}
                    className="flex items-center gap-2 px-6 md:px-8 py-3 rounded-full bg-white text-black text-sm font-semibold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5 w-full sm:w-auto justify-center"
                  >
                    {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedAll ? 'Copied' : 'Export Full Narrative'}
                  </button>
                  <button 
                    onClick={() => {setResult(null); setFormData({role: '', topic: '', tone: 'friendly'})}}
                    className="text-[10px] uppercase font-bold tracking-widest text-text-muted hover:text-white"
                  >
                    Discard & Restart
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom Info Bar */}
      <footer className="px-4 md:px-8 py-3 bg-[#080808] border-t border-border-subtle flex flex-wrap justify-between items-center gap-4 shrink-0">
        <div className="flex gap-4 md:gap-6 text-[8px] md:text-[10px] text-[#444] font-medium font-mono uppercase tracking-[0.15em]">
          <span className="flex items-center gap-1.5 md:gap-2">
            <span className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-white/20 animate-pulse" />
            Gemini Flash 3
          </span>
          <span className="hidden sm:inline">Founder-Tone v2.4</span>
          <span className="text-green-800 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-green-500" />
            System Ready
          </span>
        </div>
        <div className="text-[8px] md:text-[10px] text-text-muted font-mono uppercase tracking-widest">
          Designed for Impact
        </div>
      </footer>
    </div>
  );
}
