import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Role, RolePermission } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { 
  User, 
  UserPlus, 
  Trash2, 
  Key, 
  Shield, 
  Plus, 
  Save, 
  Layers, 
  CheckSquare, 
  Square 
} from 'lucide-react';

interface UserItem {
  id: number;
  username: string;
  role: string;
}

interface UsersProps {
  currentUser: { username: string; role: string };
  activeTab?: 'users' | 'roles';
}

const MODULE_LABELS: Record<string, string> = {
  pos: 'Acesso ao PDV (Ponto de Venda)',
  dashboard: 'Painel / Dashboard',
  products: 'Produtos & Estoque',
  categories: 'Categorias & Subcategorias',
  adjustments: 'Histórico de Ajustes',
  logs: 'Log de Auditoria Global',
  customers: 'Clientes & Limite de Fiado',
  payable: 'Contas a Pagar & Fornecedores',
  cash_sessions: 'Sessões de Caixa (Abertura/Fechamento)',
  sales: 'Histórico de Vendas & Transações',
  terminals: 'Configuração de Caixas (PDVs)',
  users: 'Gerenciamento de Usuários & Cargos',
  employees: 'Recursos Humanos (Funcionários / RH)',
  promotions: 'Promoções & Ofertas',
  fiscal: 'Módulo Fiscal (NFC-e & Relatórios)',
  invoice: 'Entrada por Nota Fiscal (NF-e)',
  inventory: 'Balanço & Auditoria de Estoque'
};

export default function Users({ currentUser, activeTab: propActiveTab = 'users' }: UsersProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>(propActiveTab);

  // Users Tab State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('');
  const [userFormLoading, setUserFormLoading] = useState(false);

  // Roles Tab State
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [roleFormLoading, setRoleFormLoading] = useState(false);
  const [permissionsState, setPermissionsState] = useState<RolePermission[]>([]);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  useEffect(() => {
    setActiveTab(propActiveTab);
  }, [propActiveTab]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
      loadRoles();
    } else if (activeTab === 'roles') {
      loadRoles();
    }
  }, [activeTab]);

  // Loaders
  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await api.getUsers();
      setUsers(res);
    } catch (e: any) {
      toast.error('Erro ao carregar usuários: ' + e.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadRoles = async () => {
    setRolesLoading(true);
    try {
      const res = await api.getRoles();
      setRoles(res);
      // Auto-select first role if none selected on roles tab
      if (res.length > 0 && !selectedRole) {
        handleSelectRole(res[0]);
      } else if (selectedRole) {
        const updated = res.find(r => r.id === selectedRole.id);
        if (updated) handleSelectRole(updated);
      }
      // Set default new user role to cashier or first available
      if (res.length > 0 && !newRole) {
        const defaultRole = res.find(r => r.name === 'cashier') || res[0];
        setNewRole(defaultRole.name);
      }
    } catch (e: any) {
      toast.error('Erro ao carregar cargos: ' + e.message);
    } finally {
      setRolesLoading(false);
    }
  };

  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    setPermissionsState(role.permissions || []);
  };

  // User Actions
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword || !newRole) {
      toast.warning('Preencha todos os campos do formulário.');
      return;
    }
    setUserFormLoading(true);
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole
      });
      toast.success(`Usuário ${newUsername} criado com sucesso!`);
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuário.');
    } finally {
      setUserFormLoading(false);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (username === currentUser.username) {
      toast.error('Você não pode excluir o seu próprio usuário enquanto está logado.');
      return;
    }
    const confirm = await confirmService.show({
      title: 'Excluir Usuário',
      message: `Deseja realmente excluir o usuário "${username}"?`,
      type: 'danger'
    });
    if (!confirm) return;

    try {
      const res = await api.deleteUser(id);
      if (res.success) {
        toast.success('Usuário excluído!');
        loadUsers();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir usuário.');
    }
  };

  // Role Actions
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    setRoleFormLoading(true);
    try {
      const created = await api.createRole(newRoleName.trim(), newRoleDesc, currentUser.username);
      toast.success(`Cargo "${newRoleName.toLowerCase()}" criado com sucesso!`);
      setNewRoleName('');
      setNewRoleDesc('');
      await loadRoles();
      handleSelectRole(created);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar cargo.');
    } finally {
      setRoleFormLoading(false);
    }
  };

  const handleDeleteRole = async (id: number, name: string) => {
    if (['admin', 'manager', 'cashier'].includes(name)) {
      toast.error('Cargos padrão do sistema não podem ser removidos.');
      return;
    }
    const confirm = await confirmService.show({
      title: 'Excluir Cargo',
      message: `Deseja realmente excluir o cargo "${name}"?`,
      type: 'danger'
    });
    if (!confirm) return;

    try {
      await api.deleteRole(id, currentUser.username);
      toast.success('Cargo removido.');
      setSelectedRole(null);
      loadRoles();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover cargo.');
    }
  };

  // Permissions Toggles
  const handleTogglePermission = (moduleName: string, type: 'view' | 'write') => {
    setPermissionsState(prev => 
      prev.map(perm => {
        if (perm.module_name === moduleName) {
          return {
            ...perm,
            can_view: type === 'view' ? (perm.can_view ? 0 : 1) : perm.can_view,
            can_write: type === 'write' ? (perm.can_write ? 0 : 1) : perm.can_write
          };
        }
        return perm;
      })
    );
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setPermissionsSaving(true);
    try {
      await api.updateRolePermissions(selectedRole.id, permissionsState, currentUser.username);
      toast.success('Permissões do cargo salvas com sucesso!');
      
      // Update local storage if current user logged in is affected by the changed role
      if (currentUser.role === selectedRole.name) {
        localStorage.setItem('superpos_user_permissions', JSON.stringify(permissionsState));
      }
      
      loadRoles();
    } catch (e: any) {
      toast.error('Erro ao salvar permissões: ' + e.message);
    } finally {
      setPermissionsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* USER LIST & CREATION TAB */}
      {activeTab === 'users' && (
        <div className="grid-2col-1-2">
          {/* Create User Form */}
          <div className="glass-card">
            <h3 className="panel-title mb-4 flex-center gap-2">
              <UserPlus size={20} className="text-primary" />
              Novo Usuário
            </h3>
            
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="block text-xs text-muted mb-2 font-bold uppercase">Nome de Usuário (Login)</label>
                <input 
                  type="text"
                  placeholder="ex: pedro_caixa"
                  className="input-field"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="block text-xs text-muted mb-2 font-bold uppercase">Senha</label>
                <div className="search-input-wrapper">
                  <Key size={16} className="search-icon" />
                  <input 
                    type="password"
                    placeholder="••••••••"
                    className="input-field search-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="block text-xs text-muted mb-2 font-bold uppercase">Perfil / Cargo</label>
                <div className="search-input-wrapper">
                  <Shield size={16} className="search-icon" />
                  <select 
                    className="input-field search-input select-field"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    required
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.name}>{r.name.toUpperCase()} ({r.description || 'Sem descrição'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" className="btn btn-primary w-full py-2.5 mt-2" disabled={userFormLoading}>
                {userFormLoading ? 'Criando...' : 'Cadastrar Usuário'}
              </button>
            </form>
          </div>

          {/* Users List */}
          <div className="glass-card flex flex-col" style={{ height: 'fit-content' }}>
            <h3 className="panel-title mb-4 flex-center gap-2">
              <User size={20} className="text-primary" />
              Operadores e Administradores Cadastrados
            </h3>

            {usersLoading ? (
              <div className="text-center py-5 text-muted">Carregando lista de usuários...</div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome de Usuário</th>
                      <th>Perfil / Cargo</th>
                      <th className="text-center" style={{ width: '100px' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="table-row">
                        <td className="font-semibold">{u.username}</td>
                        <td>
                          <span className={`badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'manager' ? 'badge-info' : 'badge-secondary'}`}>
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-center">
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            disabled={u.username === currentUser.username}
                            title={u.username === currentUser.username ? 'Você está logado com esta conta' : 'Excluir usuário'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ROLES & PERMISSIONS TAB */}
      {activeTab === 'roles' && (
        <div className="grid-2col-1-15">
          {/* Create and select roles */}
          <div className="flex flex-col gap-4">
            {/* Create Role Form */}
            <div className="glass-card">
              <h3 className="panel-title mb-4 flex-center gap-2">
                <Plus size={20} className="text-primary" />
                Criar Novo Cargo
              </h3>

              <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="block text-xs text-muted mb-2 font-bold uppercase">Nome do Cargo</label>
                  <input
                    type="text"
                    placeholder="Ex: estoquista, fiscal"
                    className="input-field"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="block text-xs text-muted mb-2 font-bold uppercase">Descrição</label>
                  <input
                    type="text"
                    placeholder="Descrição sumária das funções..."
                    className="input-field"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary w-full py-2 flex-center gap-2" disabled={roleFormLoading}>
                  <Layers size={16} />
                  {roleFormLoading ? 'Criando...' : 'Cadastrar Cargo'}
                </button>
              </form>
            </div>

            {/* List of Roles */}
            <div className="glass-card">
              <h3 className="panel-title mb-4 flex-center gap-2">
                <Shield size={20} className="text-primary" />
                Selecione um Cargo
              </h3>

              {rolesLoading ? (
                <div className="text-center py-4 text-muted">Carregando cargos...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {roles.map(r => {
                    const isSelected = selectedRole?.id === r.id;
                    const isSystem = ['admin', 'manager', 'cashier'].includes(r.name);
                    return (
                      <div 
                        key={r.id}
                        className={`flex-between p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-primary bg-primary-10' 
                            : 'border-transparent bg-white-05 hover:bg-white-10'
                        }`}
                        onClick={() => handleSelectRole(r)}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <span className="font-bold block uppercase text-sm" style={{ color: 'var(--text-bright)' }}>{r.name}</span>
                          <span className="text-xs text-muted block" style={{ textAlign: 'left' }}>{r.description || 'Sem descrição cadastrada'}</span>
                        </div>
                        
                        {!isSystem && (
                          <button
                            type="button"
                            className="btn-icon text-danger p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(r.id, r.name);
                            }}
                            title="Excluir Cargo"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Module Permissions Configurator */}
          <div className= "glass-card">
            {selectedRole ? (
              <>
                <div className="flex-between mb-4 pb-2 " style={{paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <h3 className="text-lg font-bold flex-center uppercase" style={{ marginBottom: '3px'}}>
                      <Shield size={20} className="text-primary" />
                      Permissões de {selectedRole.name}
                    </h3>
                    <p className="text-xs text-muted mt-1">{selectedRole.description || 'Configure os módulos acessíveis'}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-success flex-center gap-2 py-2 px-4"
                    onClick={handleSavePermissions}
                    disabled={permissionsSaving}
                  >
                    <Save size={16} />
                    {permissionsSaving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>

                <div className="flex flex-col gap-3" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
                  {permissionsState.map((perm) => (
                    <div 
                      key={perm.module_name} 
                      className="p-3 rounded-lg flex-between gap-2"
                      style={{padding: '7px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}
                    >
                      <span className="font-semibold text-sm">
                        {MODULE_LABELS[perm.module_name] || perm.module_name}
                      </span>
                      
                      <div className="flex-center gap-4">
                        <label className="flex-center gap-2 text-xs font-semibold cursor-pointer select-none">
                          <button
                            type="button"
                            className="btn-icon p-0 text-primary"
                            onClick={() => handleTogglePermission(perm.module_name, 'view')}
                          >
                            {perm.can_view ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          Visualizar
                        </label>

                        <label className="flex-center gap-2 text-xs font-semibold cursor-pointer select-none">
                          <button
                            type="button"
                            className="btn-icon p-0 text-primary"
                            onClick={() => handleTogglePermission(perm.module_name, 'write')}
                          >
                            {perm.can_write ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          Modificar
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-5 text-muted">
                Selecione um cargo à esquerda para configurar suas permissões por módulo.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
