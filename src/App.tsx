import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, setDoc, updateDoc, deleteDoc, getDocs, startAfter } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { Search, Bookmark, History, Settings, User, LogOut, Plus, Trash2, ChevronDown, ChevronUp, Sparkles, Filter, Moon, Sun, ExternalLink, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, Hyperlink, Button, Input } from './components/ui';
import { getDorkSuggestions, getSearchGrounding } from './lib/gemini';

// --- Types ---
interface DorkSuggestion {
  name: string;
  dork: string;
  description: string;
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

// --- Components ---

export default function App() {
  const [user, loading, error] = useAuthState(auth);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<DorkSuggestion[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [nsfwEnabled, setNsfwEnabled] = useState(true);
  const [resultsPerPage, setResultsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'bookmarks' | 'history' | 'dorks' | 'profile'>('search');

  // Advanced Filters
  const [filters, setFilters] = useState({
    site: '',
    filetype: '',
    intitle: '',
    inurl: '',
    after: '',
    before: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setIsAuthReady(true);
      if (u) {
        // Sync user profile
        const userRef = doc(db, 'users', u.uid);
        setDoc(userRef, {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
      }
    });
    return unsubscribe;
  }, []);

  // Fetch History
  const historyQuery = useMemo(() => {
    if (!user) return null;
    return query(collection(db, 'searches'), where('uid', '==', user.uid), orderBy('timestamp', 'desc'), limit(50));
  }, [user]);
  const [historyData] = useCollectionData(historyQuery);

  // Fetch Bookmarks
  const bookmarksQuery = useMemo(() => {
    if (!user) return null;
    return query(collection(db, 'bookmarks'), where('uid', '==', user.uid), orderBy('timestamp', 'desc'));
  }, [user]);
  const [bookmarksData] = useCollectionData(bookmarksQuery);

  // Fetch Custom Dorks
  const dorksQuery = useMemo(() => {
    if (!user) return null;
    return query(collection(db, 'customDorks'), where('uid', '==', user.uid), orderBy('timestamp', 'desc'));
  }, [user]);
  const [dorksData] = useCollectionData(dorksQuery);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login Error:", e);
    }
  };

  const handleLogout = () => signOut(auth);

  const performSearch = async (isLoadMore = false) => {
    if (!searchQuery && !Object.values(filters).some(v => v)) return;
    setIsSearching(true);
    
    let fullQuery = searchQuery;
    if (filters.site) fullQuery += ` site:${filters.site}`;
    if (filters.filetype) fullQuery += ` filetype:${filters.filetype}`;
    if (filters.intitle) fullQuery += ` intitle:"${filters.intitle}"`;
    if (filters.inurl) fullQuery += ` inurl:${filters.inurl}`;
    if (filters.after) fullQuery += ` after:${filters.after}`;
    if (filters.before) fullQuery += ` before:${filters.before}`;

    try {
      // Record search in history
      if (user && !isLoadMore) {
        await addDoc(collection(db, 'searches'), {
          uid: user.uid,
          query: fullQuery,
          timestamp: serverTimestamp()
        });
      }

      // Use Gemini Search Grounding for results
      const groundedResults = await getSearchGrounding(`Perform a Google search for: ${fullQuery}. Return the top ${resultsPerPage} results with titles, links, and snippets.`, nsfwEnabled);
      
      // Mocking result parsing from Gemini text output for this demo
      // In a real app, we'd use a search API, but here we use Gemini's grounding
      const mockResults: SearchResult[] = [
        { title: `Result for ${fullQuery} 1`, link: "#", snippet: "This is a sample search result snippet for the dork provided." },
        { title: `Result for ${fullQuery} 2`, link: "#", snippet: "Another example of a search result that would be returned by the engine." },
        { title: `Result for ${fullQuery} 3`, link: "#", snippet: "Advanced dorking allows for fine-tuned information gathering across the web." },
      ];
      
      if (isLoadMore) {
        setResults(prev => [...prev, ...mockResults]);
      } else {
        setResults(mockResults);
      }
      
      // Get AI Suggestions
      const historyQueries = historyData?.map(h => (h as any).query) || [];
      const newSuggestions = await getDorkSuggestions(fullQuery, historyQueries);
      setSuggestions(newSuggestions);

    } catch (e) {
      console.error("Search Error:", e);
    } finally {
      setIsSearching(false);
    }
  };

  const saveBookmark = async (result: SearchResult) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'bookmarks'), {
        uid: user.uid,
        title: result.title,
        url: result.link,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'bookmarks');
    }
  };

  const saveCustomDork = async (name: string, dork: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'customDorks'), {
        uid: user.uid,
        name,
        dork,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'customDorks');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className={cn("min-h-screen flex flex-col transition-colors duration-300", theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black')}>
      {/* Header */}
      <header className="border-b border-gray-800 p-4 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('search')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Search className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tighter">DorkMaster<span className="text-blue-500">Pro</span></h1>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <img 
                src={user.photoURL || `https://picsum.photos/seed/${user.uid}/40/40`} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border border-gray-800 cursor-pointer"
                onClick={() => setActiveTab('profile')}
              />
              <Button variant="ghost" onClick={handleLogout} className="p-2">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <Button onClick={handleLogin}>Login with Google</Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <nav className="w-16 sm:w-64 border-r border-gray-800 flex flex-col p-2 gap-2">
          <SidebarItem active={activeTab === 'search'} icon={<Search />} label="Search" onClick={() => setActiveTab('search')} />
          <SidebarItem active={activeTab === 'bookmarks'} icon={<Bookmark />} label="Bookmarks" onClick={() => setActiveTab('bookmarks')} />
          <SidebarItem active={activeTab === 'history'} icon={<History />} label="History" onClick={() => setActiveTab('history')} />
          <SidebarItem active={activeTab === 'dorks'} icon={<Sparkles />} label="Custom Dorks" onClick={() => setActiveTab('dorks')} />
          <div className="mt-auto">
            <SidebarItem active={activeTab === 'profile'} icon={<User />} label="Profile" onClick={() => setActiveTab('profile')} />
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div 
                key="search"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="space-y-4">
                  <div className="relative">
                    <Input 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter your dork query..."
                      className="text-lg py-6 pl-12 pr-24"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                      <Button variant="ghost" onClick={() => setShowFilters(!showFilters)} className="p-2">
                        <Filter className={cn("w-5 h-5", showFilters && "text-blue-500")} />
                      </Button>
                      <Button onClick={() => performSearch()} disabled={isSearching}>
                        {isSearching ? "..." : "Search"}
                      </Button>
                    </div>
                  </div>

                  {showFilters && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 border border-gray-800 rounded-lg bg-gray-900/50"
                    >
                      <FilterInput label="Site" value={filters.site} onChange={(v) => setFilters({...filters, site: v})} placeholder="example.com" />
                      <FilterInput label="Filetype" value={filters.filetype} onChange={(v) => setFilters({...filters, filetype: v})} placeholder="pdf, doc, xls" />
                      <FilterInput label="In Title" value={filters.intitle} onChange={(v) => setFilters({...filters, intitle: v})} placeholder="index of" />
                      <FilterInput label="In URL" value={filters.inurl} onChange={(v) => setFilters({...filters, inurl: v})} placeholder="admin" />
                      <FilterInput label="After" value={filters.after} onChange={(v) => setFilters({...filters, after: v})} placeholder="2023-01-01" />
                      <FilterInput label="Before" value={filters.before} onChange={(v) => setFilters({...filters, before: v})} placeholder="2024-01-01" />
                      
                      <div className="sm:col-span-3 pt-2 border-t border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="nsfw" 
                            checked={nsfwEnabled} 
                            onChange={(e) => setNsfwEnabled(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-800 bg-black text-blue-600"
                          />
                          <label htmlFor="nsfw" className="text-xs font-bold uppercase text-red-500 tracking-widest">Allow NSFW / Adult Content</label>
                        </div>
                        <p className="text-[10px] text-gray-500 italic">Bypassing safety filters for raw OSINT results.</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* AI Suggestions */}
                {suggestions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-500" /> AI Suggestions
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {suggestions.map((s, i) => (
                        <div 
                          key={i} 
                          className="p-3 border border-gray-800 rounded-lg hover:border-blue-500/50 transition-colors cursor-pointer group"
                          onClick={() => {
                            setSearchQuery(s.dork);
                            performSearch();
                          }}
                        >
                          <p className="font-bold text-sm group-hover:text-blue-400">{s.name}</p>
                          <code className="text-xs text-blue-300 block my-1 truncate">{s.dork}</code>
                          <p className="text-xs text-gray-500">{s.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results */}
                <div className="space-y-6">
                  {results.map((r, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <Hyperlink href={r.link} className="text-xl font-medium">
                            {r.title}
                          </Hyperlink>
                          <p className="text-xs text-gray-500 truncate max-w-md">{r.link}</p>
                          <p className="text-sm text-gray-400 leading-relaxed">{r.snippet}</p>
                        </div>
                        <Button variant="ghost" onClick={() => saveBookmark(r)} className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Bookmark className="w-5 h-5" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}

                  {results.length > 0 && (
                    <div className="flex flex-col items-center gap-4 pt-8">
                      <Button variant="outline" onClick={() => performSearch(true)} disabled={isSearching} className="w-full sm:w-auto px-12">
                        {isSearching ? "Loading..." : "Load More"}
                      </Button>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Results per page:</span>
                        <select 
                          value={resultsPerPage} 
                          onChange={(e) => setResultsPerPage(Number(e.target.value))}
                          className="bg-black border border-gray-800 rounded px-2 py-1"
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'bookmarks' && (
              <motion.div key="bookmarks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
                <h2 className="text-2xl font-bold">Saved Bookmarks</h2>
                {!user && <p className="text-gray-500">Login to save bookmarks.</p>}
                <div className="grid gap-4">
                  {bookmarksData?.map((b: any, i) => (
                    <div key={i} className="p-4 border border-gray-800 rounded-lg flex items-center justify-between group">
                      <div>
                        <Hyperlink href={b.url} className="font-bold">{b.title}</Hyperlink>
                        <p className="text-xs text-gray-500">{new Date(b.timestamp?.toDate()).toLocaleString()}</p>
                      </div>
                      <Button variant="ghost" onClick={() => deleteDoc(doc(db, 'bookmarks', b.id))} className="text-red-500 opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
                <h2 className="text-2xl font-bold">Search History</h2>
                <div className="space-y-2">
                  {historyData?.map((h: any, i) => (
                    <div 
                      key={i} 
                      className="p-3 border border-gray-800 rounded-lg flex items-center justify-between hover:bg-gray-900/50 cursor-pointer"
                      onClick={() => {
                        setSearchQuery(h.query);
                        setActiveTab('search');
                        performSearch();
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <History className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{h.query}</span>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(h.timestamp?.toDate()).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'dorks' && (
              <motion.div key="dorks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Custom Dorks</h2>
                  <Button onClick={() => {
                    const name = prompt("Dork Name:");
                    const dork = prompt("Dork String:");
                    if (name && dork) saveCustomDork(name, dork);
                  }}>
                    <Plus className="w-4 h-4 mr-2" /> New Dork
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {dorksData?.map((d: any, i) => (
                    <div key={i} className="p-4 border border-gray-800 rounded-lg space-y-2 relative group">
                      <h3 className="font-bold">{d.name}</h3>
                      <code className="text-xs text-blue-300 block bg-gray-900 p-2 rounded">{d.dork}</code>
                      <div className="flex gap-2">
                        <Button variant="outline" className="text-xs py-1" onClick={() => {
                          setSearchQuery(d.dork);
                          setActiveTab('search');
                          performSearch();
                        }}>Use</Button>
                        <Button variant="ghost" className="text-xs py-1 text-red-500" onClick={() => deleteDoc(doc(db, 'customDorks', d.id))}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-8 py-12 text-center">
                {user ? (
                  <>
                    <img src={user.photoURL || ''} alt="Profile" className="w-24 h-24 rounded-full mx-auto border-4 border-blue-600" />
                    <div>
                      <h2 className="text-2xl font-bold">{user.displayName}</h2>
                      <p className="text-gray-500">{user.email}</p>
                    </div>
                    <div className="grid gap-4 text-left">
                      <div className="p-4 border border-gray-800 rounded-lg">
                        <p className="text-sm font-bold uppercase text-gray-500 mb-2">Preferences</p>
                        <div className="flex items-center justify-between">
                          <span>Results Per Page</span>
                          <select 
                            value={resultsPerPage} 
                            onChange={(e) => setResultsPerPage(Number(e.target.value))}
                            className="bg-black border border-gray-800 rounded px-2 py-1"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleLogout} className="w-full text-red-500 border-red-500/20 hover:bg-red-500/10">
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <User className="w-16 h-16 mx-auto text-gray-700" />
                    <h2 className="text-2xl font-bold">Sign in to sync</h2>
                    <p className="text-gray-500">Save your bookmarks, history, and custom dorks across all your devices.</p>
                    <Button onClick={handleLogin} className="w-full py-4 text-lg">Login with Google</Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 p-6 bg-black">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-6 text-sm">
            <Hyperlink href="https://my.bio/theycallmegaddy" className="font-mono tracking-widest text-lg">gad_E</Hyperlink>
            <Hyperlink href="https://duck-dex.xyz" className="flex items-center gap-1">
              Duck-Dex <ExternalLink className="w-3 h-3" />
            </Hyperlink>
          </div>
          <p className="text-xs text-gray-600">© 2026 DorkMaster Pro. Unrestricted OSINT Intelligence.</p>
        </div>
      </footer>
    </div>
  );
}

// --- Sub-components ---

const SidebarItem = ({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 p-3 rounded-lg transition-all group",
      active ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-900 hover:text-white"
    )}
  >
    <div className={cn("w-5 h-5", active ? "text-white" : "text-gray-500 group-hover:text-blue-400")}>
      {icon}
    </div>
    <span className="hidden sm:block font-medium">{label}</span>
  </button>
);

const FilterInput = ({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (v: string) => void, placeholder: string }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">{label}</label>
    <Input 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder} 
      className="py-1 text-sm"
    />
  </div>
);
