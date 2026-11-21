import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import http from '../../http-common';

const STATUS_TABS = [
    { key: 'proposed',    label: 'Voorgesteld',      color: 'amber',   dot: 'bg-amber-400',   adminOnly: false },
    { key: 'planned',     label: 'Op de planning',   color: 'blue',    dot: 'bg-blue-500',    adminOnly: false },
    { key: 'in_progress', label: 'In ontwikkeling',  color: 'indigo',  dot: 'bg-indigo-500',  adminOnly: false },
    { key: 'completed',   label: 'Afgewerkt',        color: 'emerald', dot: 'bg-emerald-500', adminOnly: false },
    { key: 'pending',     label: 'Ter goedkeuring',  color: 'orange',  dot: 'bg-orange-400',  adminOnly: true  },
    { key: 'rejected',    label: 'Afgekeurd',        color: 'red',     dot: 'bg-red-400',     adminOnly: true  },
];

const TAB_ACTIVE_STYLES = {
    amber:   'border-amber-500 text-amber-800',
    blue:    'border-blue-600 text-blue-800',
    indigo:  'border-indigo-600 text-indigo-900',
    emerald: 'border-emerald-600 text-emerald-800',
    orange:  'border-orange-500 text-orange-800',
    red:     'border-red-500 text-red-800',
};

const CATEGORY_BADGE = {
    'Dashboard':        'bg-sky-50 text-sky-700 border border-sky-200',
    'Portfolio':        'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'Analyse':          'bg-cyan-50 text-cyan-700 border border-cyan-200',
    'Strategie Studio': 'bg-purple-50 text-purple-700 border border-purple-200',
    'Screener':         'bg-indigo-50 text-indigo-700 border border-indigo-200',
    'Belastingen':      'bg-amber-50 text-amber-800 border border-amber-200',
    'Beheerder':        'bg-rose-50 text-rose-700 border border-rose-200',
    'Algemeen':         'bg-gray-100 text-gray-700 border border-gray-200',
};

const getCategoryBadgeColor = (cat) => CATEGORY_BADGE[cat] || CATEGORY_BADGE['Algemeen'];
const ALL_CATEGORIES = ['Algemeen', 'Dashboard', 'Portfolio', 'Analyse', 'Strategie Studio', 'Screener', 'Belastingen', 'Beheerder'];

const fmtDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const FeedbackModal = ({ show, onCancel }) => {
    const userId = Number(localStorage.getItem('userID')) || 0;
    const role = localStorage.getItem('role') || 'user';
    const isAdmin = userId === 1 || role === 'admin';

    const [ideas, setIdeas]           = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [catFilter, setCatFilter]   = useState('');
    const [activeTab, setActiveTab]   = useState('proposed');
    const [isLoading, setIsLoading]   = useState(false);

    // New-idea form
    const [showForm, setShowForm]         = useState(false);
    const [newTitle, setNewTitle]         = useState('');
    const [newDesc, setNewDesc]           = useState('');
    const [newCat, setNewCat]             = useState('Algemeen');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Categories
    const categories = isAdmin
        ? ALL_CATEGORIES
        : ALL_CATEGORIES.filter(c => c !== 'Beheerder');

    const visibleTabs = STATUS_TABS.filter(t => isAdmin || !t.adminOnly);

    // ── Fetch ────────────────────────────────────────────────────────────────
    const fetchIdeas = useCallback(async () => {
        if (!show) return;
        setIsLoading(true);
        try {
            const res = await http.get('/ideas');
            setIdeas(res.data || []);
        } catch (err) {
            console.error('Fout bij ophalen van feedback/ideeën:', err);
            toast.error('Kon feedback & ideeën niet ophalen.', { id: 'ideas-fetch-err' });
        } finally {
            setIsLoading(false);
        }
    }, [show]);

    useEffect(() => {
        if (show) {
            fetchIdeas();
        }
    }, [show, fetchIdeas]);

    // ── Filter ───────────────────────────────────────────────────────────────
    const filteredIdeas = useMemo(() => {
        return ideas.filter(idea => {
            if (idea.category === 'Beheerder' && !isAdmin) return false;
            if ((idea.status === 'rejected' || idea.status === 'pending') && !isAdmin && Number(idea.created_by) !== userId) {
                return false;
            }
            if (catFilter && idea.category !== catFilter) return false;
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return (
                (idea.title       && idea.title.toLowerCase().includes(q)) ||
                (idea.description && idea.description.toLowerCase().includes(q)) ||
                (idea.category    && idea.category.toLowerCase().includes(q)) ||
                (idea.creator_name && idea.creator_name.toLowerCase().includes(q))
            );
        });
    }, [ideas, searchTerm, catFilter, isAdmin, userId]);

    // ── Groeperen & sorteren ──────────────────────────────────────────────────
    const grouped = useMemo(() => {
        const g = { proposed: [], planned: [], in_progress: [], completed: [], pending: [], rejected: [] };
        filteredIdeas.forEach(idea => {
            const key = g[idea.status] !== undefined ? idea.status : 'proposed';
            g[key].push(idea);
        });
        ['planned', 'in_progress'].forEach(k => {
            g[k].sort((a, b) => {
                if (a.planned_date && b.planned_date) return a.planned_date.localeCompare(b.planned_date);
                if (a.planned_date) return -1;
                if (b.planned_date) return 1;
                return (b.likes_count || 0) - (a.likes_count || 0);
            });
        });
        ['proposed', 'completed', 'pending', 'rejected'].forEach(k => {
            g[k].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
        });
        return g;
    }, [filteredIdeas]);

    const totalMatches = filteredIdeas.length;
    const activeIdeas  = grouped[activeTab] || [];

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleVote = async (ideaId) => {
        // Optimistic UI update
        setIdeas(prev => prev.map(idea => {
            if (idea.id !== ideaId) return idea;
            const liked = idea.has_liked ? 0 : 1;
            return { ...idea, has_liked: liked, likes_count: (idea.likes_count || 0) + (liked ? 1 : -1) };
        }));

        try {
            const res = await http.post(`/ideas/${ideaId}/like`);
            setIdeas(prev => prev.map(idea =>
                idea.id === ideaId ? { ...idea, likes_count: res.data.likes_count, has_liked: res.data.has_liked } : idea
            ));
        } catch (err) {
            fetchIdeas();
            toast.error('Stemmen mislukt.');
        }
    };

    const handleSubmitIdea = async (e) => {
        e.preventDefault();
        if (!newTitle.trim()) {
            toast.error('Titel is een verplicht veld.');
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await http.post('/ideas', {
                title: newTitle.trim(),
                description: newDesc.trim(),
                category: newCat
            });
            const newIdea = res.data;
            setIdeas(prev => [newIdea, ...prev]);
            setNewTitle('');
            setNewDesc('');
            setNewCat('Algemeen');
            setShowForm(false);
            if (isAdmin) {
                setActiveTab('proposed');
                toast.success('Idee direct voorgesteld!');
            } else {
                setActiveTab('proposed');
                toast.success('Bedankt voor je feedback! Je idee is ingediend.');
            }
        } catch (err) {
            console.error('Fout bij indienen idee:', err);
            toast.error('Fout bij het opslaan van je feedback/idee.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStatusChange = async (ideaId, newStatus) => {
        setIdeas(prev => prev.map(idea => idea.id === ideaId ? { ...idea, status: newStatus } : idea));
        try {
            await http.put(`/ideas/${ideaId}/status`, { status: newStatus });
            toast.success(`Status gewijzigd naar ${newStatus}.`);
        } catch (err) {
            fetchIdeas();
            toast.error('Status bijwerken mislukt.');
        }
    };

    const handleEditIdea = async (ideaId, title, description, category, planned_date) => {
        setIdeas(prev => prev.map(idea => idea.id === ideaId ? { ...idea, title, description, category, planned_date } : idea));
        try {
            await http.put(`/ideas/${ideaId}`, { title, description, category, planned_date });
            toast.success('Idee succesvol bijgewerkt.');
        } catch (err) {
            fetchIdeas();
            toast.error('Idee bijwerken mislukt.');
        }
    };

    const handleDeleteIdea = async (ideaId) => {
        if (!window.confirm('Weet je zeker dat je dit idee/feedback wilt verwijderen?')) return;
        setIdeas(prev => prev.filter(idea => idea.id !== ideaId));
        try {
            await http.delete(`/ideas/${ideaId}`);
            toast.success('Idee verwijderd.');
        } catch (err) {
            fetchIdeas();
            toast.error('Verwijderen mislukt.');
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4" onClick={onCancel}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 text-white flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                            <i className="ph-fill ph-lightbulb text-amber-300 text-2xl"></i>
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2">
                                Roadmap &amp; Ideeën
                            </h2>
                            <p className="text-[11px] sm:text-xs text-indigo-100 mt-0.5">
                                Bekijk de planning, stem op je favorieten of stel een nieuw idee/feedback voor.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <span className="hidden sm:inline-flex text-[10px] font-bold bg-amber-400/20 text-amber-200 border border-amber-400/40 px-2.5 py-1 rounded-full items-center gap-1">
                                👑 Beheerder
                            </span>
                        )}
                        <button onClick={onCancel} className="text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors focus:outline-none" title="Sluiten">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Toolbar ── */}
                <div className="px-6 pt-4 pb-0 border-b border-gray-100 bg-gray-50/70 flex-shrink-0">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-grow">
                            <div className="relative flex-grow max-w-sm">
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
                                </svg>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Zoek in alle ideeën..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white transition-all"
                                />
                            </div>
                            <select
                                value={catFilter}
                                onChange={e => setCatFilter(e.target.value)}
                                className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white text-gray-700 cursor-pointer transition-all"
                            >
                                <option value="">Alle categorieën</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {searchTerm && (
                                <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                                    {totalMatches} resultaten
                                </span>
                            )}
                        </div>

                        <button
                            onClick={() => setShowForm(!showForm)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                                showForm
                                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                            }`}
                        >
                            {showForm ? (
                                'Annuleren'
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/>
                                    </svg>
                                    Idee voorstellen
                                </>
                            )}
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 -mb-px overflow-x-auto select-none no-scrollbar">
                        {visibleTabs.map(tab => {
                            const count = grouped[tab.key]?.length ?? 0;
                            const isActive = activeTab === tab.key;
                            const hasPendingBadge = tab.key === 'pending' && count > 0 && !isActive;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all outline-none whitespace-nowrap ${
                                        isActive
                                            ? `${TAB_ACTIVE_STYLES[tab.color]} bg-white shadow-sm rounded-t-lg`
                                            : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${tab.dot}`}/>
                                    {tab.label}
                                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isActive ? 'bg-gray-100 text-gray-800' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                        {count}
                                    </span>
                                    {hasPendingBadge && (
                                        <span className="absolute -top-0.5 right-1 w-2 h-2 bg-orange-500 rounded-full border border-white animate-pulse"/>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-3 bg-gray-50/30">

                    {/* New idea form */}
                    {showForm && (
                        <form onSubmit={handleSubmitIdea} className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4 sm:p-5 flex-shrink-0 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
                            <h4 className="text-xs font-extrabold text-blue-900 mb-3 flex items-center gap-1.5">
                                <i className="ph-fill ph-lightbulb text-blue-600 text-base"></i>
                                Nieuw Idee of Feedback Voorstellen
                                {!isAdmin && (
                                    <span className="ml-2 text-[9px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                                        Wacht op goedkeuring voor openbare publicatie
                                    </span>
                                )}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Titel *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Wat wil je toevoegen of verbeteren in PortfolioVR?"
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Categorie / Module</label>
                                    <select
                                        value={newCat}
                                        onChange={e => setNewCat(e.target.value)}
                                        className="w-full text-xs px-2.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Toelichting / Beschrijving</label>
                                <textarea
                                    placeholder="Beschrijf je feedback of wens zo duidelijk mogelijk..."
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    rows="3"
                                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-3.5 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    Annuleren
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Versturen...' : 'Idee indienen'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Admin: ter goedkeuring banner */}
                    {isAdmin && activeTab === 'pending' && activeIdeas.length > 0 && (
                        <div className="flex items-start gap-2 px-3.5 py-2.5 bg-orange-50 border border-orange-200 rounded-xl flex-shrink-0">
                            <i className="ph-fill ph-info text-orange-500 text-lg flex-shrink-0 mt-0.5"></i>
                            <p className="text-[11px] text-orange-800 font-medium leading-relaxed">
                                Deze ingediende feedback wacht op jouw goedkeuring. Wijzig de status naar <strong>Voorgesteld</strong> om deze zichtbaar te maken voor alle gebruikers, of wijs het idee af.
                            </p>
                        </div>
                    )}

                    {/* Sortering info planned/in_progress */}
                    {(activeTab === 'planned' || activeTab === 'in_progress') && activeIdeas.length > 0 && (
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-xl flex-shrink-0">
                            <i className="ph-fill ph-calendar text-blue-500 text-base flex-shrink-0"></i>
                            <p className="text-[11px] text-blue-700 font-medium">
                                Gesorteerd op geplande opleverdatum — vroegste datum bovenaan. Ideeën zonder datum staan onderaan.
                            </p>
                        </div>
                    )}

                    {/* Ideas list */}
                    {isLoading && ideas.length === 0 ? (
                        <div className="flex-grow flex items-center justify-center py-20">
                            <div className="flex flex-col items-center gap-2 text-gray-400">
                                <svg className="w-7 h-7 animate-spin text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                </svg>
                                <span className="text-xs italic text-gray-500">Ideeënlijst laden...</span>
                            </div>
                        </div>
                    ) : activeIdeas.length === 0 ? (
                        <div className="flex-grow flex flex-col items-center justify-center py-16 text-gray-400">
                            <i className="ph-fill ph-lightbulb text-gray-300 text-5xl mb-3"></i>
                            <p className="text-sm font-semibold text-gray-600">
                                {searchTerm ? 'Geen resultaten gevonden voor deze zoekopdracht' : 'Nog geen ideeën in deze status'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                Klik op "+ Idee voorstellen" om als eerste feedback of een functie toe te voegen!
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {activeIdeas.map(idea => (
                                <IdeaRow
                                    key={idea.id}
                                    idea={idea}
                                    userId={userId}
                                    isAdmin={isAdmin}
                                    categories={categories}
                                    showPlannedDate={activeTab === 'planned' || activeTab === 'in_progress'}
                                    onVote={handleVote}
                                    onStatusChange={handleStatusChange}
                                    onEdit={handleEditIdea}
                                    onDelete={handleDeleteIdea}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Idea Row ────────────────────────────────────────────────────────────────
const IdeaRow = ({ idea, userId, isAdmin, categories, showPlannedDate, onVote, onStatusChange, onEdit, onDelete }) => {
    const [expanded, setExpanded]   = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(idea.title);
    const [editDesc, setEditDesc]   = useState(idea.description || '');
    const [editCat, setEditCat]     = useState(idea.category);
    const [editDate, setEditDate]   = useState(idea.planned_date || '');
    const [isSaving, setIsSaving]   = useState(false);

    const isAuthor = Number(idea.created_by) === userId;
    const canModify = isAdmin || isAuthor;

    useEffect(() => {
        setEditTitle(idea.title);
        setEditDesc(idea.description || '');
        setEditCat(idea.category);
        setEditDate(idea.planned_date || '');
    }, [idea.title, idea.description, idea.category, idea.planned_date]);

    const descLong  = idea.description && idea.description.length > 140;
    const descShown = descLong && !expanded ? idea.description.slice(0, 140) + '…' : idea.description;

    const createdDate = new Date(idea.created_at).toLocaleDateString('nl-BE', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const handleSaveEdit = async () => {
        if (!editTitle.trim()) return;
        setIsSaving(true);
        await onEdit(idea.id, editTitle.trim(), editDesc.trim(), editCat, editDate || null);
        setIsSaving(false);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditTitle(idea.title);
        setEditDesc(idea.description || '');
        setEditCat(idea.category);
        setEditDate(idea.planned_date || '');
        setIsEditing(false);
    };

    const isRejected = idea.status === 'rejected';
    const isPending  = idea.status === 'pending';

    // ── Inline edit form ─────────────────────────────────────────────────────
    if (isEditing) {
        return (
            <div className="bg-amber-50/80 border-2 border-amber-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-extrabold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="ph-fill ph-pencil-simple text-amber-600 text-sm"></i>
                        Idee bewerken — <span className="font-semibold text-amber-900">{idea.title}</span>
                    </span>
                    <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-600 p-1 rounded focus:outline-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Titel *</label>
                        <input
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Categorie</label>
                        <select
                            value={editCat}
                            onChange={e => setEditCat(e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none bg-white cursor-pointer"
                        >
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                <div className="mb-3">
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Beschrijving</label>
                    <textarea
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        rows="3"
                        className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none resize-none bg-white"
                    />
                </div>

                {isAdmin && (
                    <div className="mb-4">
                        <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                            Geplande datum
                            <span className="ml-1 font-normal normal-case text-gray-400">(optioneel — zichtbaar voor gebruikers)</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none bg-white cursor-pointer"
                            />
                            {editDate && (
                                <button type="button" onClick={() => setEditDate('')} className="text-[10px] text-gray-400 hover:text-red-500 underline">
                                    Wissen
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Annuleren
                    </button>
                    <button
                        onClick={handleSaveEdit}
                        disabled={isSaving || !editTitle.trim()}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                    >
                        {isSaving ? 'Opslaan...' : 'Wijzigingen opslaan'}
                    </button>
                </div>
            </div>
        );
    }

    // ── Normal card ──────────────────────────────────────────────────────────
    return (
        <div className={`bg-white rounded-xl border px-4 py-3 shadow-sm hover:shadow-md transition-all duration-150 ${
            isRejected
                ? 'border-red-100 opacity-60'
                : isPending
                ? 'border-orange-200 bg-orange-50/20'
                : 'border-gray-200 hover:border-gray-300'
        }`}>
            <div className="flex items-start gap-3">

                {/* Vote button */}
                <button
                    onClick={() => onVote(idea.id)}
                    title={idea.has_liked ? "Stem intrekken" : "Stem op dit idee"}
                    className={`flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border-2 transition-all font-extrabold text-sm ${
                        idea.has_liked
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200 scale-105'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600 active:scale-95'
                    }`}
                >
                    <svg className={`w-4 h-4 ${idea.has_liked ? 'fill-white' : 'fill-none stroke-current'}`} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/>
                    </svg>
                    <span className="text-xs leading-none mt-0.5">{idea.likes_count ?? 0}</span>
                </button>

                {/* Content */}
                <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${getCategoryBadgeColor(idea.category)}`}>
                            {idea.category}
                        </span>
                        {isPending && (
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                                In afwachting
                            </span>
                        )}
                        <h5 className={`text-xs sm:text-sm font-bold leading-snug ${isRejected ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {idea.title}
                        </h5>
                    </div>

                    {/* Beschrijving — uitklapbaar */}
                    {idea.description && (
                        <div className="mb-1">
                            <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed whitespace-pre-line">{descShown}</p>
                            {descLong && (
                                <button
                                    onClick={() => setExpanded(!expanded)}
                                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 focus:outline-none mt-0.5"
                                >
                                    {expanded ? '▲ Minder tonen' : '▼ Meer tonen'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Geplande datum badge */}
                    {idea.planned_date && showPlannedDate && (
                        <div className="flex items-center gap-1 mt-1 text-blue-600">
                            <i className="ph-fill ph-calendar text-xs"></i>
                            <span className="text-[10px] font-semibold">Gepland: {fmtDate(idea.planned_date)}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-gray-400">
                            Door <strong className="text-gray-600 font-semibold">{idea.creator_name || 'Gebruiker'}</strong> · {createdDate}
                        </span>
                    </div>
                </div>

                {/* Rechts: controls */}
                <div className="flex-shrink-0 flex flex-col items-end gap-2 ml-2">
                    {/* Status dropdown — alleen voor admin */}
                    {isAdmin && (
                        <select
                            value={idea.status}
                            onChange={e => onStatusChange(idea.id, e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-[10px] font-bold rounded-lg py-1 px-2 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                        >
                            <option value="pending">Ter goedkeuring</option>
                            <option value="proposed">Voorgesteld</option>
                            <option value="planned">Op de planning</option>
                            <option value="in_progress">In ontwikkeling</option>
                            <option value="completed">Afgewerkt</option>
                            <option value="rejected">Afgekeurd</option>
                        </select>
                    )}

                    {/* Bewerken & verwijderen */}
                    {canModify && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsEditing(true)}
                                title="Bewerk idee"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors focus:outline-none"
                            >
                                <i className="ph-fill ph-pencil-simple text-xs"></i>
                                Bewerken
                            </button>
                            <button
                                onClick={() => onDelete(idea.id)}
                                title="Verwijder idee"
                                className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all focus:outline-none"
                            >
                                <i className="ph-fill ph-trash text-sm"></i>
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FeedbackModal;
