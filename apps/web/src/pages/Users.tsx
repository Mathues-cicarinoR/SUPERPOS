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

// Interface que define o formato de dados de um usuário vindo do backend
interface UserItem {
  id: number;
  username: string;
  role: string;
}

// Definição das propriedades do componente Users
interface UsersProps {
  currentUser: { username: string; role: string }; // Usuário atualmente logado no sistema
  activeTab?: 'users' | 'roles'; // Aba ativa por padrão (usuários ou cargos)
}

// Mapeamento descritivo dos nomes técnicos dos módulos para exibição na UI
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

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'badge-primary';
    case 'manager':
      return 'badge-info';
    default:
      return 'badge-secondary';
  }
}

export default function Users({ currentUser, activeTab: propActiveTab = 'users' }: Readonly<UsersProps>) {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>(propActiveTab);

  // Estado da aba de usuários
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('');
  const [userFormLoading, setUserFormLoading] = useState(false);

  // Estado da aba de cargos/perfis
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

  // Funções de carregamento de dados
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
      // Seleciona automaticamente o primeiro cargo se nenhum estiver selecionado
      if (res.length > 0 && !selectedRole) {
        handleSelectRole(res[0]);
      } else if (selectedRole) {
        const updated = res.find(r => r.id === selectedRole.id);
        if (updated) handleSelectRole(updated);
      }
      // Define o cargo padrão do novo usuário para operador de caixa ou o primeiro disponível
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

  // Ações de gerenciamento de usuários
  const handleCreateUser = async (e: React.SyntheticEvent) => {
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

  // Ações de gerenciamento de cargos
  const handleCreateRole = async (e: React.SyntheticEvent) => {
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

  // Alternadores de permissões
  const handleTogglePermission = (moduleName: string, type: 'view' | 'write') => {
    setPermissionsState(prev => 
      prev.map(perm => {
        if (perm.module_name === moduleName) {
          let can_view = perm.can_view;
          let can_write = perm.can_write;

          if (type === 'view') {
            can_view = perm.can_view ? 0 : 1;
          } else if (type === 'write') {
            can_write = perm.can_write ? 0 : 1;
          }

          return {
            ...perm,
            can_view,
            can_write
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
      
      // Atualiza o localStorage se o usuário logado atualmente for afetado pelo cargo modificado
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
      {/* ABA DE CADASTRO E LISTAGEM DE USUÁRIOS */}
      {activeTab === 'users' && (
        <div className="grid-2col-1-2">
          {/* Formulário de Cadastro de Novo Usuário */}
          <div className="glass-card">
            <h3 className="panel-title mb-4 flex-center gap-2">
              <UserPlus size={20} className="text-primary" />
              Novo Usuário
            </h3>
            
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="new-username" className="block text-xs text-muted mb-2 font-bold uppercase">Nome de Usuário (Login)</label>
                <input 

id="new-username"
                  type="text"
                  placeholder="ex: pedro_caixa"
                  className="input-field"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-password" className="block text-xs text-muted mb-2 font-bold uppercase">Senha</label>
                <div className="search-input-wrapper">
                  <Key size={16} className="search-icon" />
                  <input 
                    id="new-password"
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
                <label htmlFor="new-role" className="block text-xs text-muted mb-2 font-bold uppercase">Perfil / Cargo</label>
                <div className="search-input-wrapper">
                  <Shield size={16} className="search-icon" />
                  <select 
                    id="new-role"
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

          {/* Tabela de Listagem de Usuários */}
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
                          <span className={`badge ${getRoleBadgeClass(u.role)}`}>
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

      {/* ABA DE CARGOS E PERMISSÕES */}
      {activeTab === 'roles' && (
        <div className="grid-2col-1-15">
          {/* Coluna da esquerda: Criar e Selecionar Cargos */}
          <div className="flex flex-col gap-4">
            {/* Formulário de Cadastro de Novo Cargo */}
            <div className="glass-card">
              <h3 className="panel-title mb-4 flex-center gap-2">
                <Plus size={20} className="text-primary" />
                Criar Novo Cargo
              </h3>

              <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label htmlFor="new-role-name" className="block text-xs text-muted mb-2 font-bold uppercase">Nome do Cargo</label>
                  <input
                    id="new-role-name"
                    type="text"
                    placeholder="Ex: estoquista, fiscal"
                    className="input-field"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-role-desc" className="block text-xs text-muted mb-2 font-bold uppercase">Descrição</label>
                  <input
                    id="new-role-desc"
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

            {/* Lista de Cargos Cadastrados */}
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
                      <div key={r.id} className="relative group w-full" style={{ position: 'relative' }}>
                        {/* Botão para selecionar o cargo */}
                        <button
                          type="button"
                          className={`w-full text-left flex-between p-3 rounded-lg border transition-all ${
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
                          
                          {!isSystem && <div style={{ width: '24px', height: '24px' }} />}
                        </button>
                        
                        {/* Botão de Exclusão de Cargo (Elemento Irmão) */}
                        {!isSystem && (
                          <button
                            type="button"
                            className="btn-icon text-danger p-1"
                            style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              zIndex: 10
                            }}
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

          {/* Coluna da direita: Painel de Configuração de Permissões por Módulo */}
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
                          <span>Visualizar</span>
                        </label>

                        <label className="flex-center gap-2 text-xs font-semibold cursor-pointer select-none">
                          <button
                            type="button"
                            className="btn-icon p-0 text-primary"
                            onClick={() => handleTogglePermission(perm.module_name, 'write')}
                          >
                            {perm.can_write ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          <span>Modificar</span>
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
