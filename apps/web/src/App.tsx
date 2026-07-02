import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LayoutGrid, ShoppingCart, Package, Users as UsersIcon, RefreshCw, AlertTriangle, Wifi, WifiOff, LogOut, User, CircleDollarSign, Landmark, UserPlus, ArrowLeft, SlidersHorizontal, History, FileText, FolderTree, Settings2, Shield, Printer, CreditCard, Briefcase, Flame, Database, Sparkles, Map } from 'lucide-react';
import { api, connectionService } from './services/api';
import type { CashSession } from './services/api';
import { toast, type ToastEvent } from './services/toast';
import { confirmService, type ConfirmOptions } from './services/confirm';

// Real Pages
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Portal from './pages/Portal';
import Users from './pages/Users';
import CashFlow from './pages/CashFlow';
import Payable from './pages/Payable';
import Employees from './pages/Employees';
import Promotions from './pages/Promotions';
import InvoiceEntry from './pages/InvoiceEntry';
import Categories from './pages/Categories';
import StockAdjustments from './pages/StockAdjustments';
import InventoryBalance from './pages/InventoryBalance';
import SystemLogs from './pages/SystemLogs';
import FiscalModule from './pages/FiscalModule';
import FiscalReport from './pages/FiscalReport';
import PrinterSettings from './pages/PrinterSettings';
import PaymentMethods from './pages/PaymentMethods';
import BackupSettings from './pages/BackupSettings';
import AIRecommendations from './pages/AIRecommendations';
import StoreLayout from './pages/StoreLayout';

function App() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);
  const [isOnline, setIsOnline] = useState(connectionService.getIsOnline());
  
  // Confirmation Modal state
  const [confirmConfig, setConfirmConfig] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  // Auth state
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : null;
  });

  // User permissions state
  const [userPermissions, setUserPermissions] = useState<any[]>(() => {
    const local = localStorage.getItem('superpos_user_permissions');
    return local ? JSON.parse(local) : [];
  });

  const hasPermission = (moduleName: string, type: 'view' | 'write' = 'view') => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const perm = userPermissions.find((p: any) => p.module_name === moduleName);
    if (!perm) return false;
    return type === 'view' ? perm.can_view === 1 : perm.can_write === 1;
  };

  useEffect(() => {
    const loadPermissions = async () => {
      if (currentUser) {
        try {
          const perms = await api.getRolePermissions(currentUser.role);
          setUserPermissions(perms);
          localStorage.setItem('superpos_user_permissions', JSON.stringify(perms));
        } catch (e) {
          console.error("Erro ao carregar permissões do usuário:", e);
        }
      } else {
        setUserPermissions([]);
        localStorage.removeItem('superpos_user_permissions');
      }
    };
    loadPermissions();
  }, [currentUser]);
  
  // Cash Session state
  const [activeSession, setActiveSession] = useState<CashSession | null>(() => {
    const local = localStorage.getItem('superpos_active_cash_session');
    return local ? JSON.parse(local) : null;
  });

  // Login inputs
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [initialFloat, setInitialFloat] = useState('100.00');
  const [pdvName, setPdvName] = useState('Caixa 01');
  const [terminalsList, setTerminalsList] = useState<string[]>(['Caixa 01', 'Caixa 02']);
  const [cashLoading, setCashLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 1. Subscribe to connection status
    const unsubscribeConn = connectionService.subscribe((status) => {
      setIsOnline(status);
    });

    // 2. Subscribe to toast notifications
    const unsubscribeToast = toast.subscribe((newToast) => {
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 3000);
    });

    // Subscribe to custom confirm dialogs
    const unsubscribeConfirm = confirmService.subscribe((options, resolve) => {
      setConfirmConfig({ options, resolve });
    });

    // 3. Keep active cash session in sync with server
    const syncSession = async () => {
      if (currentUser && connectionService.getIsOnline()) {
        try {
          const session = await api.getActiveCashSession();
          setActiveSession(session);
        } catch (e) {
          console.error("Erro ao sincronizar sessão de caixa:", e);
        }
      }
    };
    const fetchTerminals = async () => {
      if (currentUser && connectionService.getIsOnline()) {
        try {
          const terms = await api.getTerminals();
          if (terms && terms.length > 0) {
            const names = terms.map(t => t.name);
            setTerminalsList(names);
            if (!names.includes(pdvName)) {
              setPdvName(names[0]);
            }
          }
        } catch (e) {
          console.error("Erro ao carregar caixas:", e);
        }
      }
    };
    syncSession();
    fetchTerminals();

    return () => {
      unsubscribeConn();
      unsubscribeToast();
      unsubscribeConfirm();
    };
  }, [currentUser]);

  // Route protection rules on path change
  useEffect(() => {
    if (!currentUser) {
      if (location.pathname !== '/login') {
        navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      }
      return;
    }

    if (currentUser.role === 'cashier') {
      // Cashier is strictly locked to POS
      if (location.pathname !== '/pos') {
        navigate('/pos');
      }
    } else {
      // Manager/Admin redirect default
      if (location.pathname === '/login') {
        navigate('/');
      }
    }
  }, [location.pathname, currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass) {
      toast.warning('Preencha os campos de usuário e senha.');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await api.login(loginUser.trim(), loginPass);
      if (res.success && res.user) {
        setCurrentUser(res.user);
        localStorage.setItem('superpos_current_user', JSON.stringify(res.user));
        toast.success(`Bem-vindo, ${res.user.username}!`);
        
        const params = new URLSearchParams(window.location.search);
        const redirectPath = params.get('redirect');
        
        if (redirectPath) {
          navigate(redirectPath);
        } else if (res.user.role === 'admin' || res.user.role === 'manager') {
          navigate('/'); // portal
        } else {
          navigate('/pos');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fazer login.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('superpos_current_user');
    setActiveSession(null);
    localStorage.removeItem('superpos_active_cash_session');
    toast.success('Sessão encerrada.');
    navigate('/login');
  };

  const handleOpenCashSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setCashLoading(true);
    try {
      const floatVal = parseFloat(initialFloat) || 0.0;
      const session = await api.openCashSession(currentUser.username, floatVal, pdvName);
      setActiveSession(session);
      toast.success('Caixa aberto com sucesso! Bom turno.');
      navigate('/pos');
    } catch (err: any) {
      toast.error('Erro ao abrir caixa: ' + err.message);
    } finally {
      setCashLoading(false);
    }
  };

  const handleCloseCashSession = async (finalCashReported: number, finalCardReported: number, managerPassword?: string) => {
    setCashLoading(true);
    try {
      await api.closeCashSession(finalCashReported, finalCardReported, managerPassword);
      setActiveSession(null);
      toast.success('Caixa fechado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao fechar caixa: ' + err.message);
    } finally {
      setCashLoading(false);
    }
  };



  const renderConfirmModal = () => {
    if (!confirmConfig) return null;
    return (
      <div className="modal-backdrop" style={{ zIndex: 9999 }}>
        <div className="glass-card modal-content animate-slide-up" style={{ maxWidth: '480px' }}>
          <div className="modal-header">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <AlertTriangle className={confirmConfig.options.type === 'danger' ? 'text-danger' : confirmConfig.options.type === 'warning' ? 'text-warning' : 'text-primary'} size={20} />
              {confirmConfig.options.title || 'Confirmação'}
            </h3>
          </div>
          <div className="py-2 text-sm text-gray-200 whitespace-pre-line leading-relaxed">
            {confirmConfig.options.message}
          </div>
          <div className="modal-actions mt-4 flex justify-end gap-2 border-t border-gray-800 pt-3">
            <button
              type="button"
              className="btn btn-secondary py-1.5 px-4 text-xs font-semibold"
              onClick={() => {
                confirmConfig.resolve(false);
                setConfirmConfig(null);
              }}
            >
              {confirmConfig.options.cancelText || 'Cancelar'}
            </button>
            <button
              type="button"
              className={`btn py-1.5 px-4 text-xs font-bold ${
                confirmConfig.options.type === 'danger'
                  ? 'btn-danger'
                  : confirmConfig.options.type === 'warning'
                  ? 'btn-warning'
                  : 'btn-primary'
              }`}
              onClick={() => {
                confirmConfig.resolve(true);
                setConfirmConfig(null);
              }}
            >
              {confirmConfig.options.confirmText || 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 1. Render Login Screen if not logged in
  if (!currentUser) {
    return (
      <div className="auth-screen">
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-card ${t.type} animate-slide-in`}>
              {t.type === 'error' && <AlertTriangle size={18} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
        <div className="auth-card animate-fade-in">
          <div className="auth-header">
            <div className="auth-logo-icon">
              <ShoppingCart size={32} />
            </div>
            <h2 className="auth-title">SuperPOS</h2>
            <p className="auth-subtitle">Controle de Caixa & Estoque</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="block text-xs text-muted mb-2 font-bold uppercase">Usuário</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: operador1, gerente"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-2 font-bold uppercase">Senha</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-full py-3 mt-2" disabled={authLoading}>
              {authLoading ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        </div>
        {renderConfirmModal()}
      </div>
    );
  }

  // 2. Render Open Cash Session Screen if session is not open, but only for POS or cashier
  const needsCashSession = currentUser.role === 'cashier' || location.pathname === '/pos';
  if (!activeSession && needsCashSession) {
    return (
      <div className="cash-session-screen">
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-card ${t.type} animate-slide-in`}>
              {t.type === 'error' && <AlertTriangle size={18} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
        <div className="cash-session-card animate-fade-in">
          <div className="cash-session-header">
            <div className="auth-logo-icon" style={{ background: 'linear-gradient(135deg, var(--success), #10b981)' }}>
              <RefreshCw size={32} />
            </div>
            <h2 className="auth-title">Abertura de Caixa</h2>
            <p className="auth-subtitle font-semibold">Operador ativo: {currentUser.username}</p>
          </div>
          <form onSubmit={handleOpenCashSession} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="block text-xs text-muted mb-2 font-bold uppercase">Terminal (PDV)</label>
              <select
                className="input-field select-field"
                value={pdvName}
                onChange={(e) => setPdvName(e.target.value)}
                required
              >
                {terminalsList.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2 font-bold uppercase">Fundo de Caixa Inicial (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input-field font-bold text-center text-lg"
                placeholder="100.00"
                value={initialFloat}
                onChange={(e) => setInitialFloat(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-success w-full py-3 mt-2" disabled={cashLoading}>
              {cashLoading ? 'Abrindo...' : 'Abrir Caixa'}
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full py-2"
              onClick={handleLogout}
            >
              Sair / Trocar Conta
            </button>
          </form>
        </div>
        {renderConfirmModal()}
      </div>
    );
  }

  // 3. Conditional Layouts based on Path
  const isPOSPage = location.pathname === '/pos';
  const isPortalPage = location.pathname === '/' || location.pathname === '/portal';

  if (isPOSPage) {
    return (
      <div className="pos-fullscreen-container">
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-card ${t.type} animate-slide-in`}>
              {t.type === 'error' && <AlertTriangle size={18} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
        <POS 
          currentUser={currentUser} 
          activeSession={activeSession!} 
          onLogout={handleLogout}
          onCloseCashSession={handleCloseCashSession} 
        />
        {renderConfirmModal()}
      </div>
    );
  }

  if (isPortalPage) {
    return (
      <>
        <Portal 
          currentUser={currentUser}
          onLogout={handleLogout}
        />
        {renderConfirmModal()}
      </>
    );
  }

  // 4. Render Admin Area (only accessible to manager on /admin/*)
  return (
    <div className="app-container">
      {/* Toast Notifications Panel */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card ${t.type} animate-slide-in`}>
            {t.type === 'error' && <AlertTriangle size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <ShoppingCart size={28} color="var(--accent-blue)" />
          <span>SuperPOS</span>
        </div>
        
        <nav className="nav-links">
          {hasPermission('dashboard') && (
            <NavLink to="/admin" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutGrid size={20} />
              Dashboard
            </NavLink>
          )}

          {hasPermission('dashboard') && (
            <NavLink to="/admin/ai-insights" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Sparkles size={20} className="text-yellow-400" style={{ color: '#fbbf24' }} />
              Insights da IA
            </NavLink>
          )}

          {/* ESTOQUE */}
          {(hasPermission('products') || hasPermission('promotions') || hasPermission('invoice') || hasPermission('categories') || hasPermission('adjustments') || hasPermission('inventory')) && (
            <div className="nav-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <NavLink 
                to="/admin/products" 
                className={() => {
                  const active = ['/admin/products', '/admin/products/invoice', '/admin/products/categories', '/admin/products/adjustments', '/admin/products/inventory', '/admin/products/promotions', '/admin/products/layout'].includes(location.pathname);
                  return `nav-link ${active ? 'active' : ''}`;
                }}
              >
                <Package size={20} />
                Estoque
              </NavLink>
              <div className="sub-nav-links" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', marginBottom: '8px' }}>
                {hasPermission('products') && (
                  <NavLink 
                    to="/admin/products" 
                    end 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <SlidersHorizontal size={14} />
                    Produtos & Estoque
                  </NavLink>
                )}
                {hasPermission('promotions') && (
                  <NavLink 
                    to="/admin/products/promotions" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <Flame size={14} />
                    Promoções Relâmpago
                  </NavLink>
                )}
                {hasPermission('invoice') && (
                  <NavLink 
                    to="/admin/products/invoice" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <FileText size={14} />
                    Entrada por Nota Fiscal
                  </NavLink>
                )}
                {hasPermission('categories') && (
                  <NavLink 
                    to="/admin/products/categories" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <FolderTree size={14} />
                    Estrutura Mercadológica
                  </NavLink>
                )}
                {hasPermission('adjustments') && (
                  <NavLink 
                    to="/admin/products/adjustments" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <History size={14} />
                    Histórico de Ajustes
                  </NavLink>
                )}
                {hasPermission('inventory') && (
                  <NavLink 
                    to="/admin/products/inventory" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <RefreshCw size={14} />
                    Balanço / Auditoria
                  </NavLink>
                )}
                {hasPermission('products') && (
                  <NavLink 
                    to="/admin/products/layout" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <Map size={14} />
                    Layout do Mercado
                  </NavLink>
                )}
              </div>
            </div>
          )}

          {/* FINANCEIRO */}
          {(hasPermission('cash_sessions') || hasPermission('sales') || hasPermission('payable') || hasPermission('customers')) && (
            <div className="nav-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <NavLink 
                to="/admin/cash-flow" 
                className={() => {
                  const active = ['/admin/cash-flow', '/admin/cash-flow/sales', '/admin/payable', '/admin/customers'].includes(location.pathname);
                  return `nav-link ${active ? 'active' : ''}`;
                }}
              >
                <CircleDollarSign size={20} />
                Financeiro
              </NavLink>
              <div className="sub-nav-links" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', marginBottom: '8px' }}>
                {hasPermission('cash_sessions') && (
                  <NavLink 
                    to="/admin/cash-flow" 
                    end 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <SlidersHorizontal size={14} />
                    Sessões de Caixa
                  </NavLink>
                )}
                {hasPermission('sales') && (
                  <NavLink 
                    to="/admin/cash-flow/sales" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <FileText size={14} />
                    Vendas & Transações
                  </NavLink>
                )}
                {hasPermission('payable') && (
                  <NavLink 
                    to="/admin/payable" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <Landmark size={14} />
                    Contas a Pagar
                  </NavLink>
                )}
                {hasPermission('customers') && (
                  <NavLink 
                    to="/admin/customers" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <UsersIcon size={14} />
                    Clientes / Fiado
                  </NavLink>
                )}
              </div>
            </div>
          )}

          {/* FISCAL */}
          {hasPermission('fiscal') && (
            <div className="nav-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <NavLink 
                to="/admin/products/fiscal" 
                className={() => {
                  const active = ['/admin/products/fiscal', '/admin/products/fiscal-report'].includes(location.pathname);
                  return `nav-link ${active ? 'active' : ''}`;
                }}
              >
                <FileText size={20} />
                Fiscal
              </NavLink>
              <div className="sub-nav-links" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', marginBottom: '8px' }}>
                <NavLink 
                  to="/admin/products/fiscal" 
                  className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                  style={({ isActive }) => ({
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                    background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    transition: 'all 0.2s ease',
                    textDecoration: 'none'
                  })}
                >
                  <SlidersHorizontal size={14} />
                  Módulo Fiscal
                </NavLink>
                <NavLink 
                  to="/admin/products/fiscal-report" 
                  className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                  style={({ isActive }) => ({
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                    background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    transition: 'all 0.2s ease',
                    textDecoration: 'none'
                  })}
                >
                  <FileText size={14} />
                  Relatório de Notas
                </NavLink>
              </div>
            </div>
          )}

          {/* USUARIOS */}
          {hasPermission('users') && (
            <div className="nav-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <NavLink 
                to="/admin/users" 
                className={() => {
                  const active = ['/admin/users', '/admin/users/roles'].includes(location.pathname);
                  return `nav-link ${active ? 'active' : ''}`;
                }}
              >
                <UserPlus size={20} />
                Usuários
              </NavLink>
              <div className="sub-nav-links" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', marginBottom: '8px' }}>
                <NavLink 
                  to="/admin/users" 
                  end 
                  className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                  style={({ isActive }) => ({
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                    background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    transition: 'all 0.2s ease',
                    textDecoration: 'none'
                  })}
                >
                  <User size={14} />
                  Lista de Usuários
                </NavLink>
                <NavLink 
                  to="/admin/users/roles" 
                  className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                  style={({ isActive }) => ({
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                    background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    transition: 'all 0.2s ease',
                    textDecoration: 'none'
                  })}
                >
                  <Shield size={14} />
                  Controle de Permissões
                </NavLink>
              </div>
            </div>
          )}

          {/* RECURSOS HUMANOS */}
          {hasPermission('employees') && (
            <div className="nav-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <NavLink 
                to="/admin/employees" 
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Briefcase size={20} />
                Recursos Humanos (RH)
              </NavLink>
            </div>
          )}

          {/* ADMINISTRATIVO */}
          {(hasPermission('terminals') || hasPermission('logs') || hasPermission('products')) && (
            <div className="nav-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <NavLink 
                to="/admin/cash-flow/terminals" 
                className={() => {
                  const active = ['/admin/cash-flow/terminals', '/admin/products/logs', '/admin/settings/printer', '/admin/settings/payments', '/admin/settings/backup'].includes(location.pathname);
                  return `nav-link ${active ? 'active' : ''}`;
                }}
              >
                <Settings2 size={20} />
                Administrativo
              </NavLink>
              <div className="sub-nav-links" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', marginBottom: '8px' }}>
                {hasPermission('terminals') && (
                  <NavLink 
                    to="/admin/cash-flow/terminals" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <Settings2 size={14} />
                    Configurar Caixas
                  </NavLink>
                )}
                {hasPermission('logs') && (
                  <NavLink 
                    to="/admin/products/logs" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <History size={14} />
                    Logs do Sistema
                  </NavLink>
                )}
                {hasPermission('products') && (
                  <NavLink 
                    to="/admin/settings/printer" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <Printer size={14} />
                    Configurar Impressora
                  </NavLink>
                )}
                {hasPermission('products') && (
                  <NavLink 
                    to="/admin/settings/payments" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <CreditCard size={14} />
                    Formas de Pagamento
                  </NavLink>
                )}
                {hasPermission('products') && (
                  <NavLink 
                    to="/admin/settings/backup" 
                    className={({ isActive }) => `sub-nav-link ${isActive ? 'sub-active' : ''}`}
                    style={({ isActive }) => ({
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)',
                      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease',
                      textDecoration: 'none'
                    })}
                  >
                    <Database size={14} />
                    Backup do Sistema
                  </NavLink>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Connection status footer in sidebar */}
        <div className="sidebar-footer" style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            className="btn btn-secondary w-full flex-center gap-2 text-xs py-2"
            style={{ marginTop: '10px' }}
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={12} />
            Portal de Entrada
          </button>
          <div className="flex-center gap-2 p-2 rounded text-xs" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '10px' }}>
            <User size={14} className="text-primary" />
            <span className="font-semibold text-ellipsis overflow-hidden">
              {currentUser.username} ({currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'manager' ? 'Gerente' : 'Operador'})
            </span>
          </div>
          <button 
            className="btn btn-secondary w-full flex-center gap-2 text-xs py-2"
            onClick={handleLogout}
          >
            <LogOut size={12} />
            Sair
          </button>
          <div className={`connection-indicator ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isOnline ? 'API Conectada' : 'Sem Conexão'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Sistema de Ponto de Venda</h1>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '4px' }}>
              Painel Administrativo da Gerência | Banco SQLite
            </p>
          </div>

        </header>

        {/* Routes Configuration */}
        <Routes>
          <Route path="/admin" element={hasPermission('dashboard') ? <Dashboard /> : (currentUser.role === 'cashier' ? <Navigate to="/pos" replace /> : <Navigate to="/" replace />)} />
          <Route path="/admin/ai-insights" element={hasPermission('dashboard') ? <AIRecommendations /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products" element={hasPermission('products') ? <Products /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/promotions" element={hasPermission('promotions') ? <Promotions /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/invoice" element={hasPermission('invoice') ? <InvoiceEntry onNavigateToFiscalSettings={() => navigate('/admin/products/fiscal')} /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/categories" element={hasPermission('categories') ? <Categories /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/adjustments" element={hasPermission('adjustments') ? <StockAdjustments /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/inventory" element={hasPermission('inventory') ? <InventoryBalance /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/layout" element={hasPermission('products') ? <StoreLayout /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/logs" element={hasPermission('logs') ? <SystemLogs /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/fiscal" element={hasPermission('fiscal') ? <FiscalModule /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/products/fiscal-report" element={hasPermission('fiscal') ? <FiscalReport /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/settings/printer" element={hasPermission('products') ? <PrinterSettings /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/settings/payments" element={hasPermission('products') ? <PaymentMethods /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/settings/backup" element={hasPermission('products') ? <BackupSettings /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/customers" element={hasPermission('customers') ? <Customers /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/cash-flow" element={hasPermission('cash_sessions') ? <CashFlow activeTab="sessions" /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/cash-flow/sales" element={hasPermission('sales') ? <CashFlow activeTab="transactions" /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/cash-flow/terminals" element={hasPermission('terminals') ? <CashFlow activeTab="terminals" /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/payable" element={hasPermission('payable') ? <Payable /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/employees" element={hasPermission('employees') ? <Employees /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/users" element={hasPermission('users') ? <Users currentUser={currentUser} activeTab="users" /> : <Navigate to="/admin" replace />} />
          <Route path="/admin/users/roles" element={hasPermission('users') ? <Users currentUser={currentUser} activeTab="roles" /> : <Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
      {renderConfirmModal()}
    </div>
  );
}

export default App;
