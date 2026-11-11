import React, { useState, useEffect } from "react";
import http from "../../http-common";
import toast from "react-hot-toast";
import BrokersTable from "./BrokersTable";
import StockExchangeTable from "./StockExchangeTable";
import AddStockForm from "./AddStockForm";
import AvailableBalance from "../dashboard/AvailableBalance";
import StocksManagementTable from "./StocksManagementTable";

const STRATEGY_MODE_PRESETS = {
    portfolio_only: {
        label: "📊 Enkel Portfolio Tracking",
        description: "Gebruiker kan enkel zijn eigen portefeuille, transacties, dividenden en belastingen bijhouden (geen strategie of meldingen).",
        badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
        permissions: {
            canViewDashboard: false,
            canViewPortfolio: true,
            canUseStockStrategy: false,
            canUseEtfStrategy: false,
            canReceiveStrategyAlerts: false,
            canViewAnalysis: true,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
        }
    },
    arne_advies: {
        label: "⚡ Portfolio + Arne's Advies (Black-Box)",
        description: "Gebruiker houdt eigen portfolio bij én krijgt koop/verkoop-advies en meldingen op basis van jouw strategie, zonder dat je DCF-formules of screener gekopieerd kunnen worden.",
        badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
        permissions: {
            canViewDashboard: true,
            canViewPortfolio: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canReceiveStrategyAlerts: true,
            canViewAnalysis: true,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
        }
    },
    full_access: {
        label: "👑 Volledige Toegang",
        description: "Volledige inzage in alle pagina's, strategieën, screener, backtest en DCF-formules.",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
        permissions: {
            canViewDashboard: true,
            canViewPortfolio: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canReceiveStrategyAlerts: true,
            canViewAnalysis: true,
            canViewScreener: true,
            canViewFormulas: true,
            canEditSystemData: true,
        }
    }
};

const PERMISSION_ITEMS = [
    {
        key: "canViewPortfolio",
        label: "Mijn Portfolio & Belasting Calculator",
        desc: "Toegang tot eigen transacties, grafieken, dividenden en Belgische TOB/meerwaardebelasting.",
        icon: "ph-briefcase"
    },
    {
        key: "canViewDashboard",
        label: "Watchlist & Markt Dashboard",
        desc: "Toegang tot het algemene dashboard met watchlist en laatste marktsignalen.",
        icon: "ph-squares-four"
    },
    {
        key: "canUseStockStrategy",
        label: "Strategie Assistent: Losse Aandelen (Black-Box Advies)",
        desc: "Toont persoonlijke koop-, verkoop- en rotatiesignalen op basis van jouw Score 5/5 strategie.",
        icon: "ph-diamonds-four"
    },
    {
        key: "canUseEtfStrategy",
        label: "Strategie Assistent: ETF DCA Module",
        desc: "Toegang tot het maandelijkse ETF aankoopschema en herbalanceringsadvies.",
        icon: "ph-chart-line-up"
    },
    {
        key: "canReceiveStrategyAlerts",
        label: "Automatische Strategie Meldingen (Belletje)",
        desc: "Stuur meldingen rechtsboven wanneer er een koop- of verkoopsignaal voor deze gebruiker klaarstaat.",
        icon: "ph-bell-ringing"
    },
    {
        key: "canViewAnalysis",
        label: "Aandelen Analyse & Koersgrafieken",
        desc: "Toegang tot de koers- en MACD-grafieken per aandeel.",
        icon: "ph-chart-bar"
    },
    {
        key: "canViewScreener",
        label: "Aandelen Screener & Strategie Backtest",
        desc: "Toegang tot de screener en historische strategie-backtester.",
        icon: "ph-funnel"
    },
    {
        key: "canViewFormulas",
        label: "Geheime DCF-Formules & Intrinsieke Waardes Zichtbaar",
        desc: "LET OP: Zet dit UIT om te voorkomen dat de gebruiker jouw intrinsieke waarde-berekening en groeiformules kan zien.",
        icon: "ph-lock-key"
    },
    {
        key: "canEditSystemData",
        label: "Systeemdata & SEC Berekeningen Beheren",
        desc: "Toegang tot SEC data-import, ruwe berekeningstabellen en systeeminstellingen.",
        icon: "ph-database"
    }
];

function Settings() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [users, setUsers] = useState([]);
    const [regUsername, setRegUsername] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regRole, setRegRole] = useState('user');
    const [regStrategyMode, setRegStrategyMode] = useState('arne_advies');
    const [sendInviteEmail, setSendInviteEmail] = useState(true);
    const [lastInviteSummary, setLastInviteSummary] = useState(null);
    const [regMessage, setRegMessage] = useState('');
    const [regError, setRegError] = useState('');

    // Geselecteerde gebruiker voor het rechten-beheerpaneel
    const [selectedUser, setSelectedUser] = useState(null);
    const [editRole, setEditRole] = useState('user');
    const [editMode, setEditMode] = useState('arne_advies');
    const [editPermissions, setEditPermissions] = useState(STRATEGY_MODE_PRESETS.arne_advies.permissions);
    const [editIsActive, setEditIsActive] = useState(true);
    const [editEmail, setEditEmail] = useState('');
    const [editNewPassword, setEditNewPassword] = useState('');
    const [savingAccess, setSavingAccess] = useState(false);

    // Genereren van verkoopsignalen
    const handleGenerateSellAlerts = async () => {
        if (!window.confirm("Weet je zeker dat je alle verkoopsignalen opnieuw wilt genereren op basis van de huidige waardeverdelingen? Dit overschrijft bestaande verkoopsignalen.")) {
            return;
        }

        setLoading(true);
        setMessage('');
        setError('');

        try {
            const response = await http.post('/calculations/generate-sell-alerts');
            setMessage(response.data.message);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Er is een fout opgetreden bij het genereren van de signalen.');
        } finally {
            setLoading(false);
        }
    };

    // --- Gebruikersbeheer Functionaliteit ---
    const fetchUsers = async () => {
        try {
            const res = await http.get('/auth/users');
            setUsers(res.data || []);
        } catch (err) {
            console.error("Fout bij ophalen gebruikers:", err);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleRegisterUser = async (e) => {
        e.preventDefault();
        setRegMessage('');
        setRegError('');
        setLastInviteSummary(null);
        
        try {
            const presetPerms = STRATEGY_MODE_PRESETS[regStrategyMode]?.permissions || STRATEGY_MODE_PRESETS.arne_advies.permissions;
            const response = await http.post('/auth/register', { 
                username: regUsername, 
                email: regEmail, 
                password: regPassword,
                role: regRole,
                strategy_mode: regStrategyMode,
                permissions: presetPerms,
                sendInviteEmail
            });
            setRegMessage(response.data.message);
            if (response.data.inviteSummary) {
                setLastInviteSummary(response.data.inviteSummary);
            }
            toast.success(`Uitnodiging / account voor ${regUsername} aangemaakt!`);
            setRegUsername('');
            setRegEmail('');
            setRegPassword('');
            setRegRole('user');
            setRegStrategyMode('arne_advies');
            fetchUsers();
        } catch (err) {
            setRegError(err.response?.data?.message || 'Fout bij het uitnodigen/aanmaken.');
        }
    };

    const handleCopyInvite = () => {
        if (!lastInviteSummary) return;
        const appUrl = window.location.origin;
        const text = `Hoi! Ik heb een persoonlijk account voor je aangemaakt op PortfolioVR (${appUrl}/login).\n\n👤 Gebruikersnaam: ${lastInviteSummary.username}\n🔑 Tijdelijk wachtwoord: ${lastInviteSummary.temporaryPassword}\n📧 Gekoppeld e-mailadres: ${lastInviteSummary.email}\n\nJe kunt direct inloggen met dit wachtwoord (of met je Google/Microsoft-account via ${lastInviteSummary.email}).`;
        navigator.clipboard.writeText(text);
        toast.success('Uitnodigingstekst gekopieerd naar klembord!');
    };

    const openUserAccessModal = (user) => {
        const mode = user.strategy_mode || 'arne_advies';
        const defaultPerms = STRATEGY_MODE_PRESETS[mode]?.permissions || STRATEGY_MODE_PRESETS.arne_advies.permissions;
        setSelectedUser(user);
        setEditRole(user.role || 'user');
        setEditMode(mode);
        setEditPermissions({
            ...defaultPerms,
            ...(user.permissions || {})
        });
        setEditIsActive(user.is_active !== false);
        setEditEmail(user.email || '');
        setEditNewPassword('');
    };

    const handlePresetSelect = (modeKey) => {
        setEditMode(modeKey);
        if (STRATEGY_MODE_PRESETS[modeKey]) {
            setEditPermissions({ ...STRATEGY_MODE_PRESETS[modeKey].permissions });
        }
    };

    const handlePermissionToggle = (permKey) => {
        setEditPermissions(prev => ({
            ...prev,
            [permKey]: !prev[permKey]
        }));
    };

    const handleSaveUserAccess = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;
        setSavingAccess(true);
        try {
            const payload = {
                role: editRole,
                strategy_mode: editMode,
                permissions: editPermissions,
                is_active: editIsActive,
                email: editEmail
            };
            if (editNewPassword && editNewPassword.trim().length > 0) {
                payload.newPassword = editNewPassword.trim();
            }
            const res = await http.put(`/auth/users/${selectedUser.id}/access`, payload);
            toast.success(res.data.message || 'Toegangsrechten opgeslagen!');
            setSelectedUser(null);
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Fout bij opslaan van toegangsrechten.');
        } finally {
            setSavingAccess(false);
        }
    };

    const handleDeleteUser = async (user) => {
        if (Number(user.id) === 1) return;
        if (!window.confirm(`Weet je zeker dat je gebruiker "${user.username}" en al zijn/haar gekoppelde portfolio-data definitief wilt verwijderen?`)) {
            return;
        }
        try {
            const res = await http.delete(`/auth/users/${user.id}`);
            toast.success(res.data.message || 'Gebruiker verwijderd.');
            if (selectedUser?.id === user.id) setSelectedUser(null);
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Kon gebruiker niet verwijderen.');
        }
    };

    const isOnline = (lastLoginDate) => {
        if (!lastLoginDate) return false;
        const lastLogin = new Date(lastLoginDate);
        const now = new Date();
        return (now - lastLogin) < (2 * 60 * 60 * 1000);
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Beheerderspaneel & Instellingen</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Alleen jij (User 1 • Ontwikkelaar) kan nieuwe accounts aanmaken en exact bepalen wat andere gebruikers kunnen zien en gebruiken.
                    </p>
                </div>
                <span className="text-xs font-extrabold text-indigo-800 bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-full shadow-2xs flex items-center gap-1.5">
                    <i className="ph-fill ph-crown text-amber-500 text-base"></i>
                    Ontwikkelaar (User 1)
                </span>
            </div>

            {/* Gebruikersbeheer & Toegangscontrole Sectie */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Lijst met bestaande gebruikers (2 kolommen breed op grote schermen) */}
                <div className="xl:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <i className="ph-fill ph-users-three text-blue-600 text-xl"></i>
                                    Geregistreerde Gebruikers & Rechten
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Publieke registratie is uitgeschakeld. Klik op <strong>Rechten & Toegang</strong> om per gebruiker functies aan of uit te zetten.
                                </p>
                            </div>
                            <span className="text-xs font-bold bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                                {users.length} accounts
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-left">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Gebruiker</th>
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Gebruiksmodus & Rechten</th>
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Laatste Login</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actie</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {users.map(user => {
                                        const isDeveloper = Number(user.id) === 1;
                                        const modeKey = isDeveloper ? 'full_access' : (user.strategy_mode || 'arne_advies');
                                        const modeInfo = STRATEGY_MODE_PRESETS[modeKey] || STRATEGY_MODE_PRESETS.arne_advies;
                                        const perms = user.permissions || modeInfo.permissions;

                                        return (
                                            <tr key={user.id} className={`hover:bg-slate-50/80 transition-colors ${user.is_active === false ? 'opacity-60 bg-rose-50/30' : ''}`}>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${
                                                            isDeveloper ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-blue-50 text-blue-700 border border-blue-100'
                                                        }`}>
                                                            {isDeveloper ? '👑' : (user.username || 'U').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                                                {user.username}
                                                                <span className="text-[10px] font-mono text-gray-400">#{user.id}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-500">{user.email}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3.5">
                                                    {isDeveloper ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-900 border border-amber-200">
                                                            👑 Ontwikkelaar • Alles Zichtbaar
                                                        </span>
                                                    ) : user.role === 'demo' ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                                            👁️ Demo Account (Alleen-lezen op User 1)
                                                        </span>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${modeInfo.badgeClass}`}>
                                                                {modeInfo.label}
                                                            </span>
                                                            <div className="flex flex-wrap gap-1 text-[10px] text-gray-500">
                                                                {perms.canViewPortfolio && <span className="bg-gray-100 px-1.5 py-0.5 rounded">Portfolio</span>}
                                                                {perms.canUseStockStrategy && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">Aandelen Advies</span>}
                                                                {perms.canUseEtfStrategy && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">ETF DCA</span>}
                                                                {perms.canViewFormulas ? (
                                                                    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold">Formules Zichtbaar</span>
                                                                ) : (
                                                                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">🔒 Formules Verborgen</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3.5">
                                                    {user.is_active === false ? (
                                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-xs font-bold">
                                                            Geblokkeerd
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                                                            Actief
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3.5 text-xs text-gray-600">
                                                    <div className="flex items-center">
                                                        <span className={`w-2 h-2 rounded-full mr-2 ${isOnline(user.last_login) ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-gray-300'}`}></span>
                                                        {user.last_login ? new Date(user.last_login).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' }) : 'Nog nooit'}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3.5 text-right">
                                                    {isDeveloper ? (
                                                        <span className="text-xs text-gray-400 italic">Hoofdaccount</span>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => openUserAccessModal(user)}
                                                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 transition-colors flex items-center gap-1"
                                                            >
                                                                <i className="ph-bold ph-sliders-horizontal"></i>
                                                                <span>Rechten & Toegang</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteUser(user)}
                                                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                                title="Gebruiker verwijderen"
                                                            >
                                                                <i className="ph-bold ph-trash text-sm"></i>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Demo Account Infobalk */}
                    <div className="mt-5 p-3.5 bg-blue-50/80 text-blue-900 rounded-xl text-xs border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-blue-800">
                            <i className="ph-fill ph-info text-base text-blue-600"></i>
                            <span>Demo Account (alleen-lezen weergave):</span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-blue-700">
                            <span>Login: <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-bold">demo</code></span>
                            <span>Wachtwoord: <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-bold">Demo1234!</code></span>
                            <span>OTP: <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-bold">000000</code></span>
                        </div>
                    </div>
                </div>

                {/* Gebruiker Uitnodigen & Aanmaken Formulier */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <i className="ph-fill ph-paper-plane-tilt text-emerald-600 text-xl"></i>
                        Gebruiker Uitnodigen
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                        Nieuwe gebruikers kunnen zelf géén account aanmaken. Nodig hier je vriendin of broers uit; zij kunnen daarna inloggen met het wachtwoord of direct met hun Google/Microsoft-account op dat e-mailadres.
                    </p>

                    <form onSubmit={handleRegisterUser} className="space-y-3.5">
                        {regMessage && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">{regMessage}</div>}
                        {regError && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">{regError}</div>}

                        {lastInviteSummary && (
                            <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-xl space-y-2 text-xs">
                                <div className="font-bold text-indigo-950 flex items-center justify-between">
                                    <span>🎟️ Uitnodiging klaar voor {lastInviteSummary.username}</span>
                                    <button
                                        type="button"
                                        onClick={handleCopyInvite}
                                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-2xs"
                                    >
                                        <i className="ph-bold ph-copy"></i>
                                        Kopieer voor WhatsApp/Mail
                                    </button>
                                </div>
                                <div className="text-indigo-900 space-y-0.5 font-mono text-[11px] bg-white/80 p-2 rounded-lg border border-indigo-100">
                                    <div>Gebruiker: <strong>{lastInviteSummary.username}</strong></div>
                                    <div>E-mail: <strong>{lastInviteSummary.email}</strong></div>
                                    <div>Wachtwoord: <strong>{lastInviteSummary.temporaryPassword}</strong></div>
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Gebruikersnaam</label>
                            <input
                                type="text"
                                required
                                placeholder="Bijv. broer_naam of vriendin"
                                value={regUsername}
                                onChange={(e) => setRegUsername(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">E-mailadres (voor uitnodiging & Google/Microsoft login)</label>
                            <input
                                type="email"
                                required
                                placeholder="naam@gmail.com"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                Tijdelijk Wachtwoord <span className="text-gray-400 font-normal lowercase">(leeg laten = automatisch genereren)</span>
                            </label>
                            <input
                                type="text"
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Automatisch wachtwoord genereren..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Wat mag deze gebruiker zien?</label>
                            <select
                                value={regStrategyMode}
                                onChange={(e) => setRegStrategyMode(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-gray-800"
                            >
                                <option value="arne_advies">⚡ Portfolio + Arne's Advies (Black-Box, formules verborgen)</option>
                                <option value="portfolio_only">📊 Enkel Portfolio Tracking (Geen strategie)</option>
                                <option value="full_access">👑 Volledige Toegang (Alles zichtbaar)</option>
                            </select>
                            <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                                {STRATEGY_MODE_PRESETS[regStrategyMode]?.description}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Account Type</label>
                            <select
                                value={regRole}
                                onChange={(e) => setRegRole(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="user">Standaard Gebruiker (Eigen Portfolio)</option>
                                <option value="demo">Demo Account (Alleen-lezen op User 1)</option>
                                <option value="admin">Beheerder (Admin)</option>
                            </select>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                            <input
                                type="checkbox"
                                checked={sendInviteEmail}
                                onChange={(e) => setSendInviteEmail(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300"
                            />
                            <span>Stuur ook direct een uitnodigingsmail naar dit e-mailadres</span>
                        </label>

                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2"
                        >
                            <i className="ph-bold ph-paper-plane-tilt"></i>
                            <span>Uitnodigen & Account Aanmaken</span>
                        </button>
                    </form>
                </div>
            </div>

            {/* Modal voor Gedetailleerd Rechten & Toegang Beheer per Gebruiker */}
            {selectedUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between border-b border-gray-100 pb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-extrabold text-gray-900">
                                        Toegang & Rechten: {selectedUser.username}
                                    </h3>
                                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                        User #{selectedUser.id}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Stel hieronder in welke onderdelen en strategie-modules <strong>{selectedUser.username}</strong> mag zien en gebruiken.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedUser(null)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
                            >
                                <i className="ph-bold ph-x text-lg"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSaveUserAccess} className="space-y-5">
                            {/* 1. Snelle Modus Presets */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                    1. Kies een Gebruiksmodus (Preset)
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    {Object.entries(STRATEGY_MODE_PRESETS).map(([key, preset]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => handlePresetSelect(key)}
                                            className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                                editMode === key
                                                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                                            }`}
                                        >
                                            <div className="font-bold text-xs text-gray-900">{preset.label}</div>
                                            <p className="text-[10px] text-gray-500 mt-1 leading-normal">{preset.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Individuele Rechten Schakelaars */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                    2. Specifieke Rechten & Zichtbaarheid (Maatwerk)
                                </label>
                                <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                                    {PERMISSION_ITEMS.map((item) => {
                                        const checked = !!editPermissions[item.key];
                                        const isSensitive = item.key === 'canViewFormulas' || item.key === 'canEditSystemData';
                                        return (
                                            <label
                                                key={item.key}
                                                className={`flex items-center justify-between p-3.5 cursor-pointer transition-colors ${
                                                    checked ? (isSensitive ? 'bg-amber-50/50' : 'bg-white') : 'bg-gray-50/60'
                                                } hover:bg-slate-50`}
                                            >
                                                <div className="flex items-start gap-3 pr-4">
                                                    <i className={`ph-fill ${item.icon} text-lg mt-0.5 ${checked ? 'text-indigo-600' : 'text-gray-400'}`}></i>
                                                    <div>
                                                        <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                                            {item.label}
                                                            {item.key === 'canViewFormulas' && !checked && (
                                                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                                                                    🔒 Strategie Beschermd
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-gray-500 leading-snug">{item.desc}</div>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => handlePermissionToggle(item.key)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 shrink-0"
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. Account Status, Rol & Wachtwoord Reset */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Account Status</label>
                                    <select
                                        value={editIsActive ? 'active' : 'blocked'}
                                        onChange={(e) => setEditIsActive(e.target.value === 'active')}
                                        className="w-full px-3 py-2 text-xs font-bold border border-gray-300 rounded-xl outline-none"
                                    >
                                        <option value="active">🟢 Actief (Kan inloggen)</option>
                                        <option value="blocked">🔴 Geblokkeerd (Geen toegang)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Systeemrol</label>
                                    <select
                                        value={editRole}
                                        onChange={(e) => setEditRole(e.target.value)}
                                        className="w-full px-3 py-2 text-xs font-bold border border-gray-300 rounded-xl outline-none"
                                    >
                                        <option value="user">Standaard Gebruiker (Eigen Portfolio)</option>
                                        <option value="demo">Demo (Alleen-lezen op User 1)</option>
                                        <option value="admin">Beheerder (Admin)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">E-mailadres</label>
                                    <input
                                        type="email"
                                        value={editEmail}
                                        onChange={(e) => setEditEmail(e.target.value)}
                                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nieuw Wachtwoord (Optioneel)</label>
                                    <input
                                        type="password"
                                        value={editNewPassword}
                                        onChange={(e) => setEditNewPassword(e.target.value)}
                                        placeholder="Laat leeg om niet te wijzigen"
                                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setSelectedUser(null)}
                                    className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                                >
                                    Annuleren
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingAccess}
                                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm disabled:opacity-50"
                                >
                                    {savingAccess ? 'Opslaan...' : 'Rechten Opslaan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financiën Sectie */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <AvailableBalance />
            </div>

            {/* Brokers & Beurzen Sectie */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <BrokersTable />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <StockExchangeTable />
                </div>
            </div>

            {/* Aandelen Database Beheer */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Aandelen Database</h3>
                        <p className="text-sm text-gray-500">Beheer alle gekende aandelen, tickers en ISIN codes.</p>
                    </div>
                    <AddStockForm />
                </div>
                <StocksManagementTable />
            </div>

            {/* Geavanceerde Acties */}
            <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Geavanceerde Acties</h3>
                <div className="bg-white p-5 rounded-lg border border-red-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex-1">
                        <h4 className="font-bold text-gray-800">Verkoopsignalen Genereren (Historie)</h4>
                        <p className="text-sm text-gray-600 mt-1">
                            Deze actie loopt door de volledige historie van alle aandelenberekeningen. Als de waardeverdeling van een kwartaal lager is dan het voorgaande kwartaal, wordt er een 'Verkoopsignaal' aangemaakt in de database. Overschrijft bestaande signalen.
                        </p>
                    </div>
                    <button 
                        onClick={handleGenerateSellAlerts} 
                        disabled={loading}
                        className="whitespace-nowrap px-5 py-2.5 bg-red-600 text-white font-medium rounded-lg shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors focus:ring-4 focus:ring-red-200"
                    >
                        {loading ? 'Bezig met genereren...' : 'Genereer Signalen'}
                    </button>
                </div>
                {message && <div className="mt-3 p-3 bg-green-100 text-green-800 rounded text-sm">{message}</div>}
                {error && <div className="mt-3 p-3 bg-red-200 text-red-900 rounded text-sm">{error}</div>}
            </div>
        </div>
    );
}

export default Settings;
