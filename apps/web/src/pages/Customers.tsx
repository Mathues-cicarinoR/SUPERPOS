import { useEffect, useState } from 'react';
import { api, type Customer } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { Search, Plus, Edit2, Trash2, X, DollarSign, Award, CreditCard } from 'lucide-react';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<Customer | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [debtLimit, setDebtLimit] = useState('');
  
  // Payment field
  const [payAmount, setPayAmount] = useState('');

  const fetchCustomers = async (query = '') => {
    setLoading(true);
    try {
      const res = await api.getCustomers(query);
      setCustomers(res);
    } catch (e: any) {
      toast.error('Erro ao carregar clientes: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSearch = (e: React.SubmitEvent) => {
    e.preventDefault();
    fetchCustomers(searchTerm);
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setCpf('');
    setEmail('');
    setPhone('');
    setDebtLimit('200');
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setCpf(customer.cpf || '');
    setEmail(customer.email || '');
    setPhone(customer.phone || '');
    setDebtLimit(customer.debt_limit.toString());
    setIsModalOpen(true);
  };

  const openPayModal = (customer: Customer) => {
    setSelectedCustomerForPayment(customer);
    setPayAmount(customer.current_debt.toString());
    setIsPayModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (id === 1) {
      toast.warning('O Consumidor Final padrão não pode ser excluído.');
      return;
    }
    const confirm = await confirmService.show({
      title: 'Excluir Cliente',
      message: 'Deseja realmente excluir este cliente?',
      type: 'danger'
    });
    if (!confirm) return;
    try {
      const res = await api.deleteCustomer(id);
      if (res.success) {
        toast.success(res.message);
        fetchCustomers(searchTerm);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir cliente.');
    }
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!name) {
      toast.warning('Nome é obrigatório.');
      return;
    }

    const payload = {
      name,
      cpf: cpf || null,
      email: email || null,
      phone: phone || null,
      debt_limit: Number.parseFloat(debtLimit || '0'),
    };

    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, payload);
        toast.success('Perfil do cliente atualizado!');
      } else {
        await api.createCustomer(payload);
        toast.success('Cliente cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      fetchCustomers(searchTerm);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar cliente.');
    }
  };

  const handlePaymentSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!selectedCustomerForPayment || !payAmount) return;

    const amount = Number.parseFloat(payAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.warning('Insira um valor de pagamento válido.');
      return;
    }

    try {
      await api.payCustomerDebt(selectedCustomerForPayment.id, amount);
      toast.success(`Pagamento de R$ ${amount.toFixed(2)} registrado com sucesso!`);
      setIsPayModalOpen(false);
      fetchCustomers(searchTerm);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar pagamento.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const renderCustomersContent = () => {
    if (loading) {
      return (
        <div className="flex-center py-5">
          <div className="spinner"></div>
        </div>
      );
    }

    if (customers.length === 0) {
      return <div className="glass-card empty-message py-5">Nenhum cliente encontrado.</div>;
    }

    return (
      <div className="customers-grid">
        {customers.map((customer) => {
          const debtPercentage = customer.debt_limit > 0 
            ? Math.min(100, (customer.current_debt / customer.debt_limit) * 100)
            : 0;

          const isExceeded = customer.current_debt > customer.debt_limit;
          const isStandard = customer.id === 1;

          let debtColorClass = 'text-success';
          if (isExceeded) {
            debtColorClass = 'text-danger';
          } else if (customer.current_debt > 0) {
            debtColorClass = 'text-warning';
          }

          let progressBgClass = 'bg-primary';
          if (isExceeded) {
            progressBgClass = 'bg-danger';
          } else if (customer.current_debt > customer.debt_limit * 0.8) {
            progressBgClass = 'bg-warning';
          }

          return (
            <div key={customer.id} className="glass-card customer-card">
              <div className="customer-card-header">
                <div>
                  <h3 className="customer-name">{customer.name}</h3>
                  {customer.cpf && <span className="customer-meta-badge">CPF: {customer.cpf}</span>}
                </div>
                {isStandard && <span className="badge info">Consumidor Padrão</span>}
              </div>

              <div className="customer-card-body mt-3">
                <div className="customer-contact-info">
                  {customer.phone && <p>📞 {customer.phone}</p>}
                  {customer.email && <p>✉️ {customer.email}</p>}
                </div>

                {/* Loyalty Points */}
                {!isStandard && (
                  <div className="loyalty-points-wrapper mt-3 flex-between">
                    <div className="flex-center gap-2">
                      <Award size={18} className="text-warning" />
                      <span>Fidelidade</span>
                    </div>
                    <span className="font-semibold text-warning">{customer.loyalty_points} pts</span>
                  </div>
                )}

                {/* Fiado status */}
                {!isStandard && (
                  <div className="debt-limit-wrapper mt-3">
                    <div className="flex-between text-sm mb-1">
                      <div className="flex-center gap-1 text-muted">
                        <CreditCard size={16} />
                        <span>Dívida de Fiado:</span>
                      </div>
                      <span className={`font-semibold ${debtColorClass}`}>
                        {formatCurrency(customer.current_debt)} / {formatCurrency(customer.debt_limit)}
                      </span>
                    </div>
                    <div className="item-progress-bar">
                      <div 
                        className={`item-progress ${progressBgClass}`}
                        style={{ width: `${debtPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="customer-card-actions mt-4 pt-3 " style={{ marginTop: '10px' }}>
                {!isStandard && customer.current_debt > 0 && (
                  <button 
                    className="btn btn-success flex-center gap-1"
                    onClick={() => openPayModal(customer)}
                  >
                    <DollarSign size={16} />
                    Abater Dívida
                  </button>
                )}
                
                <div className="flex-center gap-2 ml-auto">
                  <button
                    className="btn-icon btn-edit"
                    onClick={() => openEditModal(customer)}
                    title="Editar Perfil"
                  >
                    <Edit2 size={16} />
                  </button>
                  {!isStandard && (
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDelete(customer.id)}
                      disabled={customer.current_debt > 0}
                      title={customer.current_debt > 0 ? 'Não é possível excluir clientes com dívidas' : 'Excluir Cliente'}
                      style={customer.current_debt > 0 ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="customers-page animate-fade-in">
      <div className="flex-between">
        <div>
          <h2 className="section-title">Clientes e Contas Fiadas</h2>
          <p className="section-subtitle">Gerencie os cadastros de clientes, acompanhe os pontos de fidelidade e gerencie limites de fiado.</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} />
          Cadastrar Cliente
        </button>
      </div>

      {/* Search Bar */}
      <div className="glass-card table-actions py-3">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar cliente por nome, CPF ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field search-input"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Filtrar
          </button>
          {searchTerm && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchTerm('');
                fetchCustomers('');
              }}
            >
              Limpar
            </button>
          )}
        </form>
      </div>

      {/* Customers Cards/Grid */}
      {renderCustomersContent()}

      {/* CRUD Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content animate-slide-up">
            <div className="modal-header">
              <h3>{editingCustomer ? 'Editar Cadastro de Cliente' : 'Cadastrar Novo Cliente'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="customer-name-input">Nome Completo *</label>
                <input
                  id="customer-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo do cliente"
                  className="input-field"
                />
              </div>

              <div className="form-row">
                <div className="form-group col-6">
                  <label htmlFor="customer-cpf-input">CPF</label>
                  <input
                    id="customer-cpf-input"
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="input-field"
                  />
                </div>
                <div className="form-group col-6">
                  <label htmlFor="customer-phone-input">Telefone</label>
                  <input
                    id="customer-phone-input"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group col-8">
                  <label htmlFor="customer-email-input">E-mail</label>
                  <input
                    id="customer-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@dominio.com"
                    className="input-field"
                  />
                </div>
                <div className="form-group col-4">
                  <label htmlFor="customer-debt-limit-input">Limite de Fiado (R$)</label>
                  <input
                    id="customer-debt-limit-input"
                    type="number"
                    step="1"
                    value={debtLimit}
                    onChange={(e) => setDebtLimit(e.target.value)}
                    placeholder="200"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-actions mt-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCustomer ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Debt Modal */}
      {isPayModalOpen && selectedCustomerForPayment && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content modal-sm animate-slide-up">
            <div className="modal-header">
              <h3>Abater Dívida - Fiado</h3>
              <button className="btn-icon" onClick={() => setIsPayModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="modal-form">
              <div className="text-center mb-4">
                <p className="text-muted">Cliente</p>
                <h4 className="font-semibold text-lg">{selectedCustomerForPayment.name}</h4>
                <div className="mt-2 text-2xl font-bold text-danger">
                  Dívida Atual: {formatCurrency(selectedCustomerForPayment.current_debt)}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="customer-pay-amount-input">Valor Pago pelo Cliente (R$) *</label>
                <input
                  id="customer-pay-amount-input"
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  max={selectedCustomerForPayment.current_debt}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input-field text-center font-bold text-xl py-3"
                  style={{ color: 'var(--success)' }}
                />
                <p className="text-muted text-xs mt-1 text-center">
                  O valor digitado será subtraído do saldo devedor atual.
                </p>
              </div>

              <div className="form-actions mt-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsPayModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success">
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
