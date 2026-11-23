import React, { useState, useEffect, useCallback, startTransition } from "react";
import http from "../../http-common";
import toast from "react-hot-toast";
import BrokersTable from "./BrokersTable";
import StockExchangeTable from "./StockExchangeTable";
import AddStockForm from "./AddStockForm";
import StocksManagementTable from "./StocksManagementTable";

const PERMISSION_ITEMS = [
    {
        key: "canViewPortfolio",
        label: "Mijn Portfolio & Belasting Calculator",
        desc: "Toegang tot eigen portfolio (Common, Diversification, Dividends, Growth, Transactions, Taxes).",
        icon: "ph-briefcase"
    },
    {
        key: "canViewStrategyBuilder",
        label: "Hoofdtab: Strategie Builder",
        desc: "Toegang tot de Strategie Builder pagina (actieve strategieën kiezen, ontwerpen en backtesten).",
        icon: "ph-sliders-horizontal"
    },
    {
        key: "canViewAnalysis",
        label: "Hoofdtab: Aandelen Analyse & Ontdekken",
        desc: "Toegang tot de Analyse pagina met koersgrafieken, MACD en aandelencatalogus.",
        icon: "ph-chart-line-up"
    },
    {
        key: "canViewDashboard",
        label: "Hoofdtab: Watchlist & Markt Dashboard",
        desc: "Toegang tot het algemene dashboard met watchlist en laatste marktsignalen.",
        icon: "ph-squares-four"
    },
    {
        key: "canUseStockStrategy",
        label: "Portfolio Tab: Strategie Assistent (Losse Aandelen & Crypto)",
        desc: "Toont de Strategie Assistent deeltab in Portfolio met persoonlijke koop/verkoopkansen en Koopkans-Radar.",
        icon: "ph-sparkle"
    },
    {
        key: "canUseEtfStrategy",
        label: "Portfolio Tab: Strategie Assistent (ETF DCA Module)",
        desc: "Toegang tot het maandelijkse ETF aankoopschema en MACD dip-buy signalen.",
        icon: "ph-trend-up"
    },
    {
        key: "canReceiveStrategyAlerts",
        label: "Automatische Strategie Meldingen (Belletje rechtsboven)",
        desc: "Toont het notificatie-belletje rechtsboven wanneer er een koop- of verkoopsignaal klaarstaat.",
        icon: "ph-bell-ringing"
    },
    {
        key: "canViewScreener",
        label: "Beheertool: Aandelen Screener",
        desc: "Toegang tot de geavanceerde aandelen screener.",
        icon: "ph-funnel"
    },
    {
        key: "canViewFormulas",
        label: "Geheime DCF-Formules & Intrinsieke Waarde Berekening",
        desc: "LET OP: Laat dit UIT voor normale rollen zodat je intrinsieke waarde-formules niet gekopieerd kunnen worden.",
        icon: "ph-lock-key"
    },
    {
        key: "canEditSystemData",
        label: "Systeemdata & SEC Berekeningen Beheren",
        desc: "Toegang tot SEC data-import, ruwe berekeningstabellen en systeeminstellingen.",
        icon: "ph-database"
    }
];

const DEFAULT_FALLBACK_ROLES = [
    {
        role_key: "starter",
        role_name: "📊 Nieuwe Belegger (Enkel Portfolio)",
        description: "Nieuwe gebruikers kunnen in het begin alleen hun eigen portfolio, transacties, dividenden en belastingen bijhouden (zonder Strategie Builder, Analyse of Dashboard).",
        is_system: true,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: false,
            canUseStockStrategy: false,
            canUseEtfStrategy: false,
            canViewStrategyBuilder: false,
            canViewAnalysis: false,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
            canReceiveStrategyAlerts: false,
        }
    },
    {
        role_key: "pro",
        role_name: "⚡ Portfolio + Strategie Advies (Black-Box)",
        description: "Gebruiker houdt eigen portfolio bij én krijgt koop/verkoop-advies, meldingen en inzage in Aandelen Analyse & Strategie Builder, zonder DCF-formules.",
        is_system: true,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canViewStrategyBuilder: true,
            canViewAnalysis: true,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
            canReceiveStrategyAlerts: true,
        }
    },
    {
        role_key: "admin",
        role_name: "👑 Beheerder (Volledige Toegang)",
        description: "Volledige toegang tot alle pagina's, formules en het beheerderspaneel.",
        is_system: true,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canViewStrategyBuilder: true,
            canViewAnalysis: true,
            canViewScreener: true,
            canViewFormulas: true,
            canEditSystemData: true,
            canReceiveStrategyAlerts: true,
        }
    }
];

const ADMIN_TABS = [
    { id: "users", label: "Gebruikers & Uitnodigen", icon: "ph-users-three" },
    { id: "roles", label: "Rollen & Rechten", icon: "ph-shield-check" },
    { id: "preview", label: "Gebruikersweergave", icon: "ph-eye" },
    { id: "stocks", label: "Aandelen Database", icon: "ph-chart-line-up" },
    { id: "brokers", label: "Brokers & Beurzen", icon: "ph-bank" },
    { id: "system", label: "Systeemacties", icon: "ph-gear-six" }
];

function Settings() {
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem("adminActiveTab") || "users";
    });
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    const handleTabSelect = (tabId) => {
        startTransition(() => {
            setActiveTab(tabId);
            localStorage.setItem("adminActiveTab", tabId);
        });
    };

    useEffect(() => {
        const handleToggleDrawer = () => setMobileDrawerOpen(prev => !prev);
        window.addEventListener("togglePortfolioDrawer", handleToggleDrawer);
        return () => window.removeEventListener("togglePortfolioDrawer", handleToggleDrawer);
    }, []);

    // Preview ("Bekijk als Gebruiker") state
    const [previewRoleKey, setPreviewRoleKey] = useState(() => localStorage.getItem("admin_preview_role") || "");

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // Gebruikers & Rollen states
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState(DEFAULT_FALLBACK_ROLES);
    const [selectedRoleForEdit, setSelectedRoleForEdit] = useState("starter");
    const [roleEditName, setRoleEditName] = useState("");
    const [roleEditDesc, setRoleEditDesc] = useState("");
    const [roleEditPerms, setRoleEditPerms] = useState(DEFAULT_FALLBACK_ROLES[0].permissions);
    const [savingRole, setSavingRole] = useState(false);

    // Nieuwe rol aanmaken modal
    const [showNewRoleModal, setShowNewRoleModal] = useState(false);
    const [newRoleName, setNewRoleName] = useState("");
    const [newRoleDesc, setNewRoleDesc] = useState("");
    const [newRolePerms, setNewRolePerms] = useState(DEFAULT_FALLBACK_ROLES[0].permissions);

    // Uitnodigen formulier (enkel Gebruikersnaam, E-mail, Wachtwoord en Rol!)
    const [regUsername, setRegUsername] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regRole, setRegRole] = useState("starter");
    const [sendInviteEmail, setSendInviteEmail] = useState(true);
    const [lastInviteSummary, setLastInviteSummary] = useState(null);
    const [regMessage, setRegMessage] = useState("");
    const [regError, setRegError] = useState("");

    // Geselecteerde gebruiker om rol/status/wachtwoord te wijzigen
    const [selectedUser, setSelectedUser] = useState(null);
    const [editRole, setEditRole] = useState("starter");
    const [editIsActive, setEditIsActive] = useState(true);
    const [editEmail, setEditEmail] = useState("");
    const [editNewPassword, setEditNewPassword] = useState("");
    const [savingAccess, setSavingAccess] = useState(false);

    const fetchUsersAndRoles = useCallback(async () => {
        try {
            const [usersRes, rolesRes] = await Promise.all([
                http.get("/auth/users"),
                http.get("/auth/roles").catch(() => ({ data: DEFAULT_FALLBACK_ROLES }))
            ]);
            setUsers(usersRes.data || []);
            if (rolesRes.data && rolesRes.data.length > 0) {
                setRoles(rolesRes.data);
                localStorage.setItem("all_roles_cache", JSON.stringify(rolesRes.data));
            }
        } catch (err) {
            console.error("Fout bij ophalen gebruikers en rollen:", err);
        }
    }, []);

    useEffect(() => {
        fetchUsersAndRoles();
    }, [fetchUsersAndRoles]);

    // Synchroniseer geselecteerde rol in het Rollen & Rechten tabblad
    useEffect(() => {
        const found = roles.find(r => r.role_key === selectedRoleForEdit) || roles[0];
        if (found) {
            setRoleEditName(found.role_name || "");
            setRoleEditDesc(found.description || "");
            setRoleEditPerms({
                ...DEFAULT_FALLBACK_ROLES[0].permissions,
                ...(found.permissions || {})
            });
        }
    }, [selectedRoleForEdit, roles]);

    // Luister naar externe wijzigingen van de preview-modus (bv. vanuit de balk bovenaan)
    useEffect(() => {
        const onPreviewChange = () => {
            setPreviewRoleKey(localStorage.getItem("admin_preview_role") || "");
        };
        window.addEventListener("adminPreviewChanged", onPreviewChange);
        return () => window.removeEventListener("adminPreviewChanged", onPreviewChange);
    }, []);

    const activatePreviewRole = (roleKey) => {
        if (!roleKey) {
            localStorage.removeItem("admin_preview_role");
            localStorage.removeItem("admin_preview_permissions");
            localStorage.removeItem("admin_preview_role_name");
            setPreviewRoleKey("");
            window.dispatchEvent(new Event("adminPreviewChanged"));
            toast.success("Teruggeschakeld naar je normale Beheerder-weergave!");
            return;
        }
        const roleObj = roles.find(r => r.role_key === roleKey) || DEFAULT_FALLBACK_ROLES[0];
        localStorage.setItem("admin_preview_role", roleObj.role_key);
        localStorage.setItem("admin_preview_role_name", roleObj.role_name);
        localStorage.setItem("admin_preview_permissions", JSON.stringify(roleObj.permissions));
        setPreviewRoleKey(roleObj.role_key);
        window.dispatchEvent(new Event("adminPreviewChanged"));
        toast.success(`Gebruikersweergave actief: je bekijkt de app nu als "${roleObj.role_name}"!`);
    };

    const handleRegisterUser = async (e) => {
        e.preventDefault();
        setRegMessage("");
        setRegError("");
        setLastInviteSummary(null);

        try {
            const response = await http.post("/auth/register", {
                username: regUsername,
                email: regEmail,
                password: regPassword,
                role: regRole,
                sendInviteEmail
            });
            setRegMessage(response.data.message);
            if (response.data.inviteSummary) {
                setLastInviteSummary(response.data.inviteSummary);
            }
            toast.success(`Account voor ${regUsername} aangemaakt!`);
            setRegUsername("");
            setRegEmail("");
            setRegPassword("");
            setRegRole("starter");
            fetchUsersAndRoles();
        } catch (err) {
            setRegError(err.response?.data?.message || "Fout bij het uitnodigen/aanmaken.");
        }
    };

    const handleCopyInvite = () => {
        if (!lastInviteSummary) return;
        const appUrl = window.location.origin;
        const text = `Hoi! Ik heb een persoonlijk account voor je aangemaakt op PortfolioVR (${appUrl}/login).\n\n👤 Gebruikersnaam: ${lastInviteSummary.username}\n🔑 Tijdelijk wachtwoord: ${lastInviteSummary.temporaryPassword}\n📧 Gekoppeld e-mailadres: ${lastInviteSummary.email}\n\nNa het inloggen kun je meteen je eigen wachtwoord kiezen!`;
        navigator.clipboard.writeText(text);
        toast.success("Uitnodigingstekst gekopieerd naar klembord!");
    };

    const openUserEditModal = (user) => {
        setSelectedUser(user);
        setEditRole(user.role || "starter");
        setEditIsActive(user.is_active !== false);
        setEditEmail(user.email || "");
        setEditNewPassword("");
    };

    const handleSaveUserAccess = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;
        setSavingAccess(true);
        try {
            const payload = {
                role: editRole,
                is_active: editIsActive,
                email: editEmail
            };
            if (editNewPassword && editNewPassword.trim().length > 0) {
                payload.newPassword = editNewPassword.trim();
            }
            const res = await http.put(`/auth/users/${selectedUser.id}/access`, payload);
            toast.success(res.data.message || "Gebruiker bijgewerkt!");
            setSelectedUser(null);
            fetchUsersAndRoles();
        } catch (err) {
            toast.error(err.response?.data?.message || "Fout bij opslaan van gebruiker.");
        } finally {
            setSavingAccess(false);
        }
    };

    const handleQuickRoleChange = async (user, nextRoleKey) => {
        try {
            const res = await http.put(`/auth/users/${user.id}/role`, { role: nextRoleKey });
            toast.success(res.data.message || "Rol aangepast!");
            fetchUsersAndRoles();
        } catch (err) {
            toast.error(err.response?.data?.message || "Kon rol niet wijzigen.");
        }
    };

    const handleDeleteUser = async (user) => {
        if (Number(user.id) === 1) return;
        if (!window.confirm(`Weet je zeker dat je gebruiker "${user.username}" en al zijn/haar gekoppelde portfolio-data definitief wilt verwijderen?`)) {
            return;
        }
        try {
            const res = await http.delete(`/auth/users/${user.id}`);
            toast.success(res.data.message || "Gebruiker verwijderd.");
            if (selectedUser?.id === user.id) setSelectedUser(null);
            fetchUsersAndRoles();
        } catch (err) {
            toast.error(err.response?.data?.message || "Kon gebruiker niet verwijderen.");
        }
    };

    // Rollen opslaan / aanmaken / verwijderen
    const handleSaveRolePermissions = async (e) => {
        e.preventDefault();
        if (!selectedRoleForEdit || selectedRoleForEdit === "admin") return;
        setSavingRole(true);
        try {
            const res = await http.put(`/auth/roles/${selectedRoleForEdit}`, {
                role_name: roleEditName,
                description: roleEditDesc,
                permissions: roleEditPerms
            });
            toast.success(res.data.message || "Rol en rechten opgeslagen!");
            await fetchUsersAndRoles();
            // Als deze rol momenteel in preview staat, werk de preview-rechten direct bij
            if (previewRoleKey === selectedRoleForEdit) {
                localStorage.setItem("admin_preview_permissions", JSON.stringify(roleEditPerms));
                localStorage.setItem("admin_preview_role_name", roleEditName);
                window.dispatchEvent(new Event("adminPreviewChanged"));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Fout bij opslaan van rol.");
        } finally {
            setSavingRole(false);
        }
    };

    const handleCreateNewRole = async (e) => {
        e.preventDefault();
        if (!newRoleName.trim()) return;
        setSavingRole(true);
        try {
            const res = await http.post("/auth/roles", {
                role_name: newRoleName.trim(),
                description: newRoleDesc.trim(),
                permissions: newRolePerms
            });
            toast.success(res.data.message || "Nieuwe rol aangemaakt!");
            setShowNewRoleModal(false);
            setNewRoleName("");
            setNewRoleDesc("");
            await fetchUsersAndRoles();
        } catch (err) {
            toast.error(err.response?.data?.message || "Kon rol niet aanmaken.");
        } finally {
            setSavingRole(false);
        }
    };

    const handleDeleteRole = async (roleObj) => {
        if (roleObj.is_system) return;
        if (!window.confirm(`Weet je zeker dat je de rol "${roleObj.role_name}" wilt verwijderen? Gebruikers met deze rol worden overgezet naar Nieuwe Belegger.`)) {
            return;
        }
        try {
            const res = await http.delete(`/auth/roles/${roleObj.role_key}`);
            toast.success(res.data.message || "Rol verwijderd.");
            setSelectedRoleForEdit("starter");
            await fetchUsersAndRoles();
        } catch (err) {
            toast.error(err.response?.data?.message || "Kon rol niet verwijderen.");
        }
    };

    const handleGenerateSellAlerts = async () => {
        if (!window.confirm("Weet je zeker dat je alle verkoopsignalen opnieuw wilt genereren op basis van de huidige waardeverdelingen?")) {
            return;
        }
        setLoading(true);
        setMessage("");
        setError("");
        try {
            const response = await http.post("/calculations/generate-sell-alerts");
            setMessage(response.data.message);
        } catch (err) {
            setError(err.response?.data?.message || "Er is een fout opgetreden bij het genereren van de signalen.");
        } finally {
            setLoading(false);
        }
    };

    const isOnline = (lastLoginDate) => {
        if (!lastLoginDate) return false;
        const lastLogin = new Date(lastLoginDate);
        const now = new Date();
        return (now - lastLogin) < (2 * 60 * 60 * 1000);
    };

    const activeRoleObj = roles.find(r => r.role_key === selectedRoleForEdit) || roles[0];
    const selectedInviteRoleObj = roles.find(r => r.role_key === regRole) || roles[0];

    return (
        <div className="font-sans text-gray-900 w-full">
            {/* Twee-koloms indeling exact zoals bij Portfolio - Common (Links zijmenu zonder kader, Rechts inhoud) */}
            <div className="flex flex-col md:flex-row items-start gap-4 lg:gap-5 w-full -mt-1">
                {/* Linkse deel: Deeltabs Navigatie (Desktop) - Zonder kader, op achtergrond, sticky en intern scrollbaar */}
                <aside className="hidden md:flex flex-col w-52 lg:w-56 shrink-0 sticky top-14 h-[calc(100vh-4.8rem)] max-h-[calc(100vh-4.8rem)] justify-between -ml-1 lg:-ml-2 pb-1">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-0.5 pr-1">
                        <div className="px-3 py-1 text-[11px] font-black uppercase tracking-wider text-gray-400">
                            Beheerpaneel
                        </div>
                        {ADMIN_TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleTabSelect(tab.id)}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-all text-left ${
                                        isActive
                                            ? "font-black text-blue-600 bg-blue-50/90 shadow-2xs"
                                            : "font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 truncate">
                                        <i className={`ph-fill ${tab.icon} text-lg ${isActive ? "text-blue-600" : "text-gray-400"}`}></i>
                                        <span className="truncate">{tab.label}</span>
                                    </div>
                                    {tab.id === "preview" && previewRoleKey && (
                                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Onderste vaste sectie in de zijbalk: Snelknop voor Gebruikersweergave (Preview) */}
                    <div className="shrink-0 mt-auto pt-2.5 border-t border-gray-200/80 space-y-2 pb-1">
                        <div className="px-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">
                                Live Weergave Testen
                            </span>
                            {previewRoleKey ? (
                                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                                    <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                                        <i className="ph-fill ph-eye text-amber-600 text-sm"></i>
                                        <span className="truncate">
                                            {roles.find(r => r.role_key === previewRoleKey)?.role_name || previewRoleKey}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => activatePreviewRole("")}
                                        className="w-full py-1.5 px-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                                    >
                                        <i className="ph-bold ph-arrow-counter-clockwise"></i>
                                        <span>Stop Weergave</span>
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => activatePreviewRole("starter")}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-xs"
                                    title="Bekijk de app exact zoals een nieuwe gebruiker"
                                >
                                    <i className="ph-bold ph-eye text-sm"></i>
                                    <span>Bekijk als Gebruiker</span>
                                </button>
                            )}
                        </div>
                        <div className="text-[10px] text-gray-400 text-center font-medium">
                            👑 Hoofdbeheerder (User #1)
                        </div>
                    </div>
                </aside>

                {/* Mobiele Deeltabs Drawer (als ☰ geklikt is) */}
                {mobileDrawerOpen && (
                    <div className="md:hidden fixed top-14 bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 flex">
                        <div className="w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col p-4 z-40 animate-slide-in overflow-y-auto min-h-0 border-r border-gray-200">
                            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3 shrink-0">
                                <span className="font-black text-gray-900 text-base">Beheerpaneel</span>
                                <button
                                    type="button"
                                    onClick={() => setMobileDrawerOpen(false)}
                                    className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                    <i className="ph-bold ph-x text-lg"></i>
                                </button>
                            </div>

                            <div className="space-y-1 shrink-0">
                                {ADMIN_TABS.map(tab => {
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => {
                                                handleTabSelect(tab.id);
                                                setMobileDrawerOpen(false);
                                            }}
                                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all text-left ${
                                                isActive
                                                    ? "font-black text-blue-600 bg-blue-50/90 shadow-2xs"
                                                    : "font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                            }`}
                                        >
                                            <i className={`ph-fill ${tab.icon} text-lg ${isActive ? "text-blue-600" : "text-gray-400"}`}></i>
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                                {previewRoleKey ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            activatePreviewRole("");
                                            setMobileDrawerOpen(false);
                                        }}
                                        className="w-full py-2.5 px-3 bg-amber-600 text-white rounded-xl text-xs font-black"
                                    >
                                        Stop Gebruikersweergave
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            activatePreviewRole("starter");
                                            setMobileDrawerOpen(false);
                                        }}
                                        className="w-full py-2.5 px-3 bg-indigo-600 text-white rounded-xl text-xs font-black"
                                    >
                                        👁️ Bekijk als Gebruiker
                                    </button>
                                )}
                            </div>
                        </div>
                        <div
                            className="flex-1 bg-black/40 backdrop-blur-xs cursor-pointer"
                            onClick={() => setMobileDrawerOpen(false)}
                        />
                    </div>
                )}

                {/* Rechtse deel: Inhoud van het geselecteerde Beheer-tabblad */}
                <div className="flex-1 min-w-0 w-full space-y-5 pb-10">
                    {/* Mobiele horizontale snelle tab-chips zodat je ook zonder ☰ snel kunt wisselen */}
                    <div className="md:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        {ADMIN_TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleTabSelect(tab.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                                        isActive
                                            ? "bg-blue-600 text-white shadow-2xs"
                                            : "bg-white text-gray-600 border border-gray-200"
                                    }`}
                                >
                                    <i className={`ph-fill ${tab.icon}`}></i>
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Top Header Card met directe "Bekijk als Gebruiker" schakelaar */}
                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                                    <i className="ph-fill ph-shield-check text-blue-600"></i>
                                    <span>Beheerderspaneel</span>
                                </h1>
                                <span className="text-[11px] font-extrabold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                                    👑 ArneVR
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Beheer gebruikersaccounts, stel algemene rechten per rol in en test met één klik wat andere gebruikers zien.
                            </p>
                        </div>

                        {/* Snelkiezer: Bekijk app als rol */}
                        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/80">
                            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5 px-1">
                                <i className="ph-fill ph-eye text-indigo-600 text-base"></i>
                                <span>Weergave testen:</span>
                            </span>
                            <select
                                value={previewRoleKey}
                                onChange={(e) => activatePreviewRole(e.target.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border outline-none transition-all cursor-pointer ${
                                    previewRoleKey
                                        ? "bg-amber-100 text-amber-950 border-amber-300 ring-2 ring-amber-400/30"
                                        : "bg-white text-gray-800 border-gray-300"
                                }`}
                            >
                                <option value="">👑 Normaal (Beheerder - Alles zichtbaar)</option>
                                {roles.filter(r => r.role_key !== "admin").map(r => (
                                    <option key={r.role_key} value={r.role_key}>
                                        👁️ Bekijk als: {r.role_name}
                                    </option>
                                ))}
                            </select>
                            {previewRoleKey && (
                                <button
                                    type="button"
                                    onClick={() => activatePreviewRole("")}
                                    className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-lg transition-colors"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ========================================================= */}
                    {/* TAB 1: GEBRUIKERS & UITNODIGEN                            */}
                    {/* ========================================================= */}
                    {activeTab === "users" && (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                            {/* Linkerkolom (2/3): Gebruikerstabel */}
                            <div className="xl:col-span-2 bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                                                <i className="ph-fill ph-users-three text-blue-600 text-xl"></i>
                                                <span>Geregistreerde Gebruikers</span>
                                            </h3>
                                            <p className="text-xs text-gray-500">
                                                Elke gebruiker heeft een volledig afgeschermd eigen portfolio. Rechten worden bepaald door de gekoppelde <strong>Rol</strong>.
                                            </p>
                                        </div>
                                        <span className="text-xs font-extrabold bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                                            {users.length} accounts
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-left">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-3.5 py-3 text-[11px] font-black text-gray-500 uppercase">Gebruiker</th>
                                                    <th className="px-3.5 py-3 text-[11px] font-black text-gray-500 uppercase">Gekoppelde Rol</th>
                                                    <th className="px-3.5 py-3 text-[11px] font-black text-gray-500 uppercase">Zichtbare Pagina&apos;s</th>
                                                    <th className="px-3.5 py-3 text-[11px] font-black text-gray-500 uppercase">Status</th>
                                                    <th className="px-3.5 py-3 text-right text-[11px] font-black text-gray-500 uppercase">Actie</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {users.map(user => {
                                                    const isDeveloper = Number(user.id) === 1;
                                                    const perms = user.permissions || {};

                                                    return (
                                                        <tr key={user.id} className={`hover:bg-slate-50/80 transition-colors ${user.is_active === false ? "opacity-60 bg-rose-50/30" : ""}`}>
                                                            <td className="px-3.5 py-3">
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                                                                        isDeveloper ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-blue-50 text-blue-700 border border-blue-100"
                                                                    }`}>
                                                                        {isDeveloper ? "👑" : (user.username || "U").slice(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                                                            <span>{user.username}</span>
                                                                            <span className="text-[10px] font-mono text-gray-400">#{user.id}</span>
                                                                            {user.must_change_password && (
                                                                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold" title="Gebruiker heeft tijdelijk wachtwoord nog niet gewijzigd">
                                                                                    Tijdelijk WW
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[11px] text-gray-500">{user.email}</div>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <td className="px-3.5 py-3">
                                                                {isDeveloper ? (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-900 border border-amber-200">
                                                                        👑 Hoofdbeheerder
                                                                    </span>
                                                                ) : (
                                                                    <select
                                                                        value={user.role || "starter"}
                                                                        onChange={(e) => handleQuickRoleChange(user, e.target.value)}
                                                                        className="px-2.5 py-1 text-xs font-bold bg-white border border-gray-300 rounded-lg text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                                                                    >
                                                                        {roles.map(r => (
                                                                            <option key={r.role_key} value={r.role_key}>
                                                                                {r.role_name}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                            </td>

                                                            <td className="px-3.5 py-3">
                                                                <div className="flex flex-wrap gap-1 text-[10px]">
                                                                    {perms.canViewPortfolio && (
                                                                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
                                                                            Portfolio
                                                                        </span>
                                                                    )}
                                                                    {(perms.canUseStockStrategy || perms.canUseEtfStrategy) && (
                                                                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                                                                            Assistent
                                                                        </span>
                                                                    )}
                                                                    {perms.canViewStrategyBuilder && (
                                                                        <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
                                                                            Strategie Builder
                                                                        </span>
                                                                    )}
                                                                    {perms.canViewAnalysis && (
                                                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                                                            Analyse
                                                                        </span>
                                                                    )}
                                                                    {perms.canViewDashboard && (
                                                                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                                                                            Dashboard
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            <td className="px-3.5 py-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className={`w-2 h-2 rounded-full ${isOnline(user.last_login) ? "bg-green-500" : "bg-gray-300"}`}></span>
                                                                    {user.is_active === false ? (
                                                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[11px] font-bold">
                                                                            Geblokkeerd
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[11px] font-bold">
                                                                            Actief
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            <td className="px-3.5 py-3 text-right">
                                                                {isDeveloper ? (
                                                                    <span className="text-xs text-gray-400 italic">Vast</span>
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openUserEditModal(user)}
                                                                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                                                                            title="Accountgegevens of wachtwoord aanpassen"
                                                                        >
                                                                            <i className="ph-bold ph-pencil-simple"></i>
                                                                            <span>Bewerken</span>
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

                                <div className="mt-5 p-3.5 bg-slate-50 text-slate-700 rounded-xl text-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 font-bold text-slate-800">
                                        <i className="ph-fill ph-lock-key text-base text-emerald-600"></i>
                                        <span>100% Portfolio Isolatie actief:</span>
                                    </div>
                                    <span className="text-[11px] text-slate-600">
                                        Elke ingelogde gebruiker kan uitsluitend zijn eigen transacties en holdings zien (op basis van het versleutelde sessie-token).
                                    </span>
                                </div>
                            </div>

                            {/* Rechterkolom (1/3): Nieuw Account Aanmaken (simpel: enkel Rol selecteren!) */}
                            <div className="bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90">
                                <h3 className="text-base sm:text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
                                    <i className="ph-fill ph-user-plus text-emerald-600 text-xl"></i>
                                    <span>Nieuw Account Aanmaken</span>
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">
                                    Maak een account aan (bijv. voor je vriendin). Je kiest enkel een <strong>Rol</strong>; alle rechten worden automatisch door die rol bepaald.
                                </p>

                                <form onSubmit={handleRegisterUser} className="space-y-3.5">
                                    {regMessage && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">{regMessage}</div>}
                                    {regError && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">{regError}</div>}

                                    {lastInviteSummary && (
                                        <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-xl space-y-2 text-xs">
                                            <div className="font-bold text-indigo-950 flex items-center justify-between gap-2">
                                                <span>🎟️ Gegevens voor {lastInviteSummary.username}</span>
                                                <button
                                                    type="button"
                                                    onClick={handleCopyInvite}
                                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-2xs shrink-0"
                                                >
                                                    <i className="ph-bold ph-copy"></i>
                                                    <span>Kopieer tekst</span>
                                                </button>
                                            </div>
                                            <div className="text-indigo-900 space-y-0.5 font-mono text-[11px] bg-white/90 p-2.5 rounded-lg border border-indigo-100">
                                                <div>Gebruikersnaam: <strong>{lastInviteSummary.username}</strong></div>
                                                <div>E-mailadres: <strong>{lastInviteSummary.email}</strong></div>
                                                <div>Tijdelijk wachtwoord: <strong>{lastInviteSummary.temporaryPassword}</strong></div>
                                                <div>Rol: <strong>{lastInviteSummary.role_name || lastInviteSummary.role}</strong></div>
                                            </div>
                                            <p className="text-[11px] text-indigo-700">
                                                💡 Bij de eerste keer inloggen krijgt {lastInviteSummary.username} direct een melding om zelf een nieuw wachtwoord te kiezen.
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Gebruikersnaam</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Bijv. voornaam vriendin"
                                            value={regUsername}
                                            onChange={(e) => setRegUsername(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">E-mailadres</label>
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
                                            Gebruikersrol
                                        </label>
                                        <select
                                            value={regRole}
                                            onChange={(e) => setRegRole(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-900 bg-white"
                                        >
                                            {roles.map(r => (
                                                <option key={r.role_key} value={r.role_key}>
                                                    {r.role_name}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedInviteRoleObj && (
                                            <div className="mt-1.5 p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-600 space-y-1">
                                                <div className="font-semibold text-gray-800">{selectedInviteRoleObj.description}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedRoleForEdit(selectedInviteRoleObj.role_key);
                                                        handleTabSelect("roles");
                                                    }}
                                                    className="text-blue-600 hover:underline font-bold inline-flex items-center gap-1"
                                                >
                                                    <span>Rechten van deze rol bekijken/aanpassen →</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                            Tijdelijk Wachtwoord <span className="text-gray-400 font-normal lowercase">(leeg = automatisch aanmaken)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={regPassword}
                                            onChange={(e) => setRegPassword(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Automatisch wachtwoord genereren..."
                                        />
                                    </div>

                                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                                        <input
                                            type="checkbox"
                                            checked={sendInviteEmail}
                                            onChange={(e) => setSendInviteEmail(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300"
                                        />
                                        <span>Stuur ook automatisch per e-mail (indien mailserver actief)</span>
                                    </label>

                                    <button
                                        type="submit"
                                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2"
                                    >
                                        <i className="ph-bold ph-user-plus"></i>
                                        <span>Account Aanmaken</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* TAB 2: ROLLEN & RECHTEN BEHEREN                           */}
                    {/* ========================================================= */}
                    {activeTab === "roles" && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                            {/* Linkerkolom: Lijst van rollen + Nieuwe Rol knop */}
                            <div className="bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-black text-gray-900">Gebruikersrollen</h3>
                                        <p className="text-xs text-gray-500">
                                            Iedereen met dezelfde rol krijgt automatisch dezelfde rechten.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewRoleName("");
                                            setNewRoleDesc("");
                                            setNewRolePerms(DEFAULT_FALLBACK_ROLES[0].permissions);
                                            setShowNewRoleModal(true);
                                        }}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-2xs flex items-center gap-1"
                                    >
                                        <i className="ph-bold ph-plus"></i>
                                        <span>Nieuwe Rol</span>
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {roles.map(role => {
                                        const isSelected = selectedRoleForEdit === role.role_key;
                                        return (
                                            <div
                                                key={role.role_key}
                                                onClick={() => setSelectedRoleForEdit(role.role_key)}
                                                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                                    isSelected
                                                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20"
                                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-black text-xs sm:text-sm text-gray-900">
                                                        {role.role_name}
                                                    </span>
                                                    <span className="text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full shrink-0">
                                                        {role.user_count || 0} gebruiker(s)
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                                                    {role.description}
                                                </p>
                                                <div className="mt-2.5 flex items-center justify-between">
                                                    <span className="text-[10px] font-mono text-gray-400">
                                                        Sleutel: {role.role_key}
                                                    </span>
                                                    {role.role_key !== "admin" && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                activatePreviewRole(role.role_key);
                                                            }}
                                                            className="text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                                        >
                                                            <i className="ph-bold ph-eye"></i>
                                                            <span>Test weergave</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Rechterkolom (2/3): Rechten en toegang voor de geselecteerde rol */}
                            <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90">
                                {activeRoleObj && (
                                    <form onSubmit={handleSaveRolePermissions} className="space-y-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-black text-gray-900">
                                                        Rechten voor rol: {activeRoleObj.role_name}
                                                    </h3>
                                                    {activeRoleObj.is_system && (
                                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                                            Systeemrol
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    Wanneer je deze rechten opslaat, gelden ze direct voor <strong>alle gebruikers</strong> met de rol <strong>{activeRoleObj.role_name}</strong>.
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {activeRoleObj.role_key !== "admin" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => activatePreviewRole(activeRoleObj.role_key)}
                                                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
                                                    >
                                                        <i className="ph-bold ph-eye"></i>
                                                        <span>Bekijk app als deze rol</span>
                                                    </button>
                                                )}
                                                {!activeRoleObj.is_system && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteRole(activeRoleObj)}
                                                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-extrabold flex items-center gap-1"
                                                    >
                                                        <i className="ph-bold ph-trash"></i>
                                                        <span>Verwijder rol</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Naam van de rol</label>
                                                <input
                                                    type="text"
                                                    disabled={activeRoleObj.role_key === "admin"}
                                                    value={roleEditName}
                                                    onChange={(e) => setRoleEditName(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Korte beschrijving</label>
                                                <input
                                                    type="text"
                                                    disabled={activeRoleObj.role_key === "admin"}
                                                    value={roleEditDesc}
                                                    onChange={(e) => setRoleEditDesc(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                                Toegang &amp; Zichtbare Onderdelen per Rol
                                            </label>
                                            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                                                {PERMISSION_ITEMS.map((item) => {
                                                    const checked = activeRoleObj.role_key === "admin" ? true : !!roleEditPerms[item.key];
                                                    const isSensitive = item.key === "canViewFormulas" || item.key === "canEditSystemData";
                                                    return (
                                                        <label
                                                            key={item.key}
                                                            className={`flex items-center justify-between p-3.5 cursor-pointer transition-colors ${
                                                                checked ? (isSensitive ? "bg-amber-50/50" : "bg-white") : "bg-gray-50/60"
                                                            } hover:bg-slate-50`}
                                                        >
                                                            <div className="flex items-start gap-3 pr-4">
                                                                <i className={`ph-fill ${item.icon} text-lg mt-0.5 ${checked ? "text-blue-600" : "text-gray-400"}`}></i>
                                                                <div>
                                                                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                                                                        <span>{item.label}</span>
                                                                        {item.key === "canViewFormulas" && !checked && (
                                                                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                                                                                🔒 Formules Beschermd
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[11px] text-gray-500 leading-snug">{item.desc}</div>
                                                                </div>
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                disabled={activeRoleObj.role_key === "admin"}
                                                                checked={checked}
                                                                onChange={() =>
                                                                    setRoleEditPerms(prev => ({
                                                                        ...prev,
                                                                        [item.key]: !prev[item.key]
                                                                    }))
                                                                }
                                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 shrink-0"
                                                            />
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {activeRoleObj.role_key !== "admin" && (
                                            <div className="flex items-center justify-end gap-3 pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={savingRole}
                                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    <i className="ph-bold ph-floppy-disk"></i>
                                                    <span>{savingRole ? "Opslaan..." : `Rechten voor "${roleEditName}" Opslaan`}</span>
                                                </button>
                                            </div>
                                        )}
                                    </form>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* TAB 3: GEBRUIKERSWEERGAVE TESTEN ("BEKIJK ALS GEBRUIKER") */}
                    {/* ========================================================= */}
                    {activeTab === "preview" && (
                        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-2xs border border-gray-200/90 space-y-5">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <i className="ph-fill ph-eye text-indigo-600 text-xl"></i>
                                    <span>Gebruikersweergave Testen (&ldquo;Bekijk als Gebruiker&rdquo;)</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                                    Schakel hieronder met één klik over naar de weergave van een specifieke rol. Je ziet de hele applicatie (navigatiebalk, tabbladen, grafieken en formulieren) exact zoals een gebruiker met die rol dat ziet. Het <strong>Beheerderspaneel</strong> blijft voor jou altijd bereikbaar zodat je de weergave weer kunt uitzetten.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {roles.filter(r => r.role_key !== "admin").map(role => {
                                    const isCurrentPreview = previewRoleKey === role.role_key;
                                    const perms = role.permissions || {};
                                    return (
                                        <div
                                            key={role.role_key}
                                            className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                                                isCurrentPreview
                                                    ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/30"
                                                    : "border-gray-200 bg-white hover:border-blue-300"
                                            }`}
                                        >
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-black text-sm text-gray-900">{role.role_name}</span>
                                                    {isCurrentPreview && (
                                                        <span className="text-[10px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                                                            Nu Actief
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 leading-relaxed">{role.description}</p>
                                                <div className="pt-2 flex flex-wrap gap-1 text-[10px]">
                                                    <span className={`px-2 py-0.5 rounded font-bold ${perms.canViewPortfolio ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-400 line-through"}`}>
                                                        Portfolio
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded font-bold ${perms.canViewStrategyBuilder ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-400 line-through"}`}>
                                                        Strategie Builder
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded font-bold ${perms.canViewAnalysis ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-400 line-through"}`}>
                                                        Analyse
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded font-bold ${perms.canViewDashboard ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-400 line-through"}`}>
                                                        Dashboard
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-gray-100">
                                                {isCurrentPreview ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => activatePreviewRole("")}
                                                        className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold transition-colors"
                                                    >
                                                        Weergave Uitzetten (Terug naar Admin)
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => activatePreviewRole(role.role_key)}
                                                        className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        <i className="ph-bold ph-eye"></i>
                                                        <span>Activeer deze Weergave</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* TAB 4: AANDELEN DATABASE                                  */}
                    {/* ========================================================= */}
                    {activeTab === "stocks" && (
                        <div className="bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90 space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-gray-900">Aandelen, ETF &amp; Crypto Database</h3>
                                    <p className="text-xs text-gray-500">
                                        Alle gekende instrumenten in de centrale catalogus. Wanneer een gebruiker een onbekend aandeel toevoegt in zijn portfolio, wordt deze automatisch via Yahoo Finance opgezocht en hier toegevoegd (zonder jouw persoonlijke Watchlist te vervuilen).
                                    </p>
                                </div>
                                <AddStockForm />
                            </div>
                            <StocksManagementTable />
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* TAB 5: BROKERS & BEURZEN                                  */}
                    {/* ========================================================= */}
                    {activeTab === "brokers" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <div className="bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90">
                                <BrokersTable />
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-2xs border border-gray-200/90">
                                <StockExchangeTable />
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* TAB 6: SYSTEEMACTIES                                      */}
                    {/* ========================================================= */}
                    {activeTab === "system" && (
                        <div className="bg-red-50 p-5 rounded-2xl shadow-2xs border border-red-200 space-y-4">
                            <h3 className="text-base sm:text-lg font-black text-red-900">Geavanceerde Systeemacties</h3>
                            <div className="bg-white p-5 rounded-xl border border-red-100 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 text-sm">Verkoopsignalen Genereren (Historie)</h4>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Loopt door de volledige historie van alle aandelenberekeningen. Als de waardeverdeling van een kwartaal lager is dan het voorgaande kwartaal, wordt er een verkoopsignaal aangemaakt.
                                    </p>
                                </div>
                                <button
                                    onClick={handleGenerateSellAlerts}
                                    disabled={loading}
                                    className="whitespace-nowrap px-4 py-2 bg-red-600 text-white text-xs font-extrabold rounded-xl shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                    {loading ? "Bezig met genereren..." : "Genereer Signalen"}
                                </button>
                            </div>
                            {message && <div className="p-3 bg-green-100 text-green-800 rounded-xl text-xs font-bold">{message}</div>}
                            {error && <div className="p-3 bg-red-200 text-red-900 rounded-xl text-xs font-bold">{error}</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Gebruiker Bewerken (Enkel Rol, Status, E-mail en Wachtwoord Reset) */}
            {selectedUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 space-y-4">
                        <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">
                                    Account Bewerken: {selectedUser.username}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Wijzig de gekoppelde rol, e-mail of stel een nieuw tijdelijk wachtwoord in.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedUser(null)}
                                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
                            >
                                <i className="ph-bold ph-x text-lg"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSaveUserAccess} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Gebruikersrol</label>
                                <select
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {roles.map(r => (
                                        <option key={r.role_key} value={r.role_key}>
                                            {r.role_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Account Status</label>
                                <select
                                    value={editIsActive ? "active" : "blocked"}
                                    onChange={(e) => setEditIsActive(e.target.value === "active")}
                                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold border border-gray-300 rounded-xl outline-none"
                                >
                                    <option value="active">🟢 Actief (Kan inloggen)</option>
                                    <option value="blocked">🔴 Geblokkeerd (Geen toegang)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">E-mailadres</label>
                                <input
                                    type="email"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-xl outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Nieuw Tijdelijk Wachtwoord (Optioneel)
                                </label>
                                <input
                                    type="text"
                                    value={editNewPassword}
                                    onChange={(e) => setEditNewPassword(e.target.value)}
                                    placeholder="Laat leeg om huidig wachtwoord te behouden"
                                    className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-xl outline-none"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Als je een nieuw wachtwoord invult, krijgt de gebruiker bij de volgende login een melding om zelf een nieuw wachtwoord te kiezen.
                                </p>
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
                                    className="px-5 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
                                >
                                    {savingAccess ? "Opslaan..." : "Wijzigingen Opslaan"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Nieuwe Rol Aanmaken */}
            {showNewRoleModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Nieuwe Gebruikersrol Aanmaken</h3>
                                <p className="text-xs text-gray-500">
                                    Kies een naam en vink aan welke onderdelen gebruikers met deze rol mogen zien.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNewRoleModal(false)}
                                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
                            >
                                <i className="ph-bold ph-x text-lg"></i>
                            </button>
                        </div>

                        <form onSubmit={handleCreateNewRole} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Rolnaam</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Bijv. Familie & Vrienden (Portfolio + Strategie)"
                                    value={newRoleName}
                                    onChange={(e) => setNewRoleName(e.target.value)}
                                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Beschrijving</label>
                                <input
                                    type="text"
                                    placeholder="Korte omschrijving van deze rol..."
                                    value={newRoleDesc}
                                    onChange={(e) => setNewRoleDesc(e.target.value)}
                                    className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                                {PERMISSION_ITEMS.map(item => {
                                    const checked = !!newRolePerms[item.key];
                                    return (
                                        <label key={item.key} className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50">
                                            <div className="pr-3">
                                                <div className="text-xs font-bold text-gray-900">{item.label}</div>
                                                <div className="text-[11px] text-gray-500">{item.desc}</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setNewRolePerms(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300"
                                            />
                                        </label>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowNewRoleModal(false)}
                                    className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                                >
                                    Annuleren
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingRole}
                                    className="px-5 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
                                >
                                    {savingRole ? "Aanmaken..." : "Rol Aanmaken"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Settings;
