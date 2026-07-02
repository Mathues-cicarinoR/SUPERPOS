import { useEffect, useState } from 'react';
import { api, type Inventory as Inventario } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { RefreshCw, History, FileText, Plus, Trash2, X } from 'lucide-react';

/**
 * Componente de Balanço de Estoque (Inventário)
 * Permite gerenciar sessões de auditoria física de estoque, bipar códigos de barra
 * e reconciliar as diferenças encontradas diretamente no banco de dados.
 */
export default function InventoryBalance() {
  const [carregando, setCarregando] = useState(false);
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [inventarioSelecionado, setInventarioSelecionado] = useState<Inventario | null>(null);
  
  // Estados para criação de novo balanço
  const [modalNovoInventarioAberto, setModalNovoInventarioAberto] = useState(false);
  const [nomeNovoInventario, setNomeNovoInventario] = useState('');
  const [preCarregarTodosProdutos, setPreCarregarTodosProdutos] = useState(true);

  // Estados da sessão de contagem ativa
  const [entradaItemEscaneado, setEntradaItemEscaneado] = useState('');
  const [modoLeitura, setModoLeitura] = useState<'add' | 'increment' | 'set'>('add');
  const [quantidadeLeitura, setQuantidadeLeitura] = useState('1');
  const [termoBuscaInventario, setTermoBuscaInventario] = useState('');
  const [itemInventarioEditando, setItemInventarioEditando] = useState<{ id: number; counted_qty: string } | null>(null);

  // Usuário atualmente logado
  const [usuarioAtual] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Busca todas as sessões de balanço cadastradas
  const buscarInventarios = async () => {
    setCarregando(true);
    try {
      const lista = await api.getInventories();
      setInventarios(lista);
    } catch (error_: any) {
      toast.error('Erro ao buscar inventários: ' + error_.message);
    } finally {
      setCarregando(false);
    }
  };

  // Busca os detalhes e itens de um balanço específico
  const buscarDetalhesInventario = async (id: number) => {
    setCarregando(true);
    try {
      const detalhes = await api.getInventoryDetails(id);
      setInventarioSelecionado(detalhes);
    } catch (error_: any) {
      toast.error('Erro ao carregar detalhes do inventário: ' + error_.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    buscarInventarios();
  }, []);

  // Cria um novo inventário
  const lidarComCriacaoInventario = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!nomeNovoInventario.trim()) {
      toast.warning('Informe o nome/identificação do inventário.');
      return;
    }
    try {
      const resposta = await api.createInventory({
        name: nomeNovoInventario.trim(),
        operator_name: usuarioAtual.username,
        populate_all: preCarregarTodosProdutos
      });
      toast.success('Sessão de inventário criada com sucesso!');
      setModalNovoInventarioAberto(false);
      setNomeNovoInventario('');
      buscarInventarios();
      buscarDetalhesInventario(resposta.id);
    } catch (error_: any) {
      toast.error('Erro ao criar inventário: ' + error_.message);
    }
  };

  // Adiciona ou bipa um item dentro da sessão ativa
  const lidarComLeituraOuAdicaoItem = async (e?: React.SubmitEvent) => {
    if (e) e.preventDefault();
    if (!inventarioSelecionado || !entradaItemEscaneado.trim()) return;

    try {
      const qtd = (modoLeitura === 'increment' || modoLeitura === 'set') ? Number.parseFloat(quantidadeLeitura) : undefined;
      await api.scanOrAddInventoryItem(inventarioSelecionado.id, {
        barcode_or_sku: entradaItemEscaneado.trim(),
        counted_qty: qtd,
        mode: modoLeitura
      });
      toast.success(`Item bipeado/adicionado!`);
      setEntradaItemEscaneado('');
      buscarDetalhesInventario(inventarioSelecionado.id);
    } catch (error_: any) {
      toast.error(error_.message || 'Produto não cadastrado ou não encontrado.');
    }
  };

  // Edita manualmente a quantidade contada de um item
  const lidarComAtualizacaoQuantidadeItem = async (itemId: number, qtd: number) => {
    if (!inventarioSelecionado) return;
    try {
      await api.updateInventoryItemQty(inventarioSelecionado.id, itemId, qtd);
      const detalhes = await api.getInventoryDetails(inventarioSelecionado.id);
      setInventarioSelecionado(detalhes);
    } catch (error_: any) {
      toast.error('Erro ao atualizar quantidade: ' + error_.message);
    }
  };

  // Remove um item do balanço ativo
  const lidarComExclusaoItem = async (itemId: number) => {
    if (!inventarioSelecionado) return;
    const confirmacao = await confirmService.show({
      title: 'Remover Item',
      message: 'Deseja realmente remover este item deste inventário?',
      type: 'warning'
    });
    if (!confirmacao) return;
    try {
      await api.deleteInventoryItem(inventarioSelecionado.id, itemId);
      buscarDetalhesInventario(inventarioSelecionado.id);
      toast.success('Item removido do inventário.');
    } catch (error_: any) {
      toast.error('Erro ao remover item: ' + error_.message);
    }
  };

  // Finaliza a sessão e aplica as correções fiscais/físicas de estoque
  const lidarComFinalizacaoInventario = async () => {
    if (!inventarioSelecionado) return;
    const confirmacaoFinalizacao = await confirmService.show({
      title: 'Finalizar Inventário',
      message: `ATENÇÃO:\n\nIsso irá concluir o inventário "${inventarioSelecionado.name}" e ATUALIZARÁ o estoque de todos os produtos listados no banco de dados para os valores contados.\n\nEsta ação é irreversível. Deseja prosseguir?`,
      confirmText: 'Concluir & Aplicar',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    if (!confirmacaoFinalizacao) return;

    setCarregando(true);
    try {
      const resposta = await api.finalizeInventory(inventarioSelecionado.id);
      if (resposta.success) {
        toast.success('Inventário finalizado e estoque atualizado com sucesso!');
        setInventarioSelecionado(null);
        buscarInventarios();
      }
    } catch (error_: any) {
      toast.error('Erro ao finalizar inventário: ' + error_.message);
    } finally {
      setCarregando(false);
    }
  };

  // Exclui uma sessão de inventário sem alterar o estoque físico
  const lidarComExclusaoInventario = async (id: number) => {
    const confirmacao = await confirmService.show({
      title: 'Excluir Balanço',
      message: 'Deseja realmente excluir esta sessão de inventário? Os dados contados serão perdidos e o estoque não será alterado.',
      type: 'danger'
    });
    if (!confirmacao) return;
    try {
      await api.deleteInventory(id);
      toast.success('Inventário excluído.');
      buscarInventarios();
    } catch (error_: any) {
      toast.error('Erro ao excluir inventário: ' + error_.message);
    }
  };

  const renderizarLinhasTabelaInventario = () => {
    if (carregando && inventarios.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="text-center py-4 text-muted">Buscando balanços...</td>
        </tr>
      );
    }

    if (inventarios.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="text-center py-4 text-muted">Nenhum balanço cadastrado.</td>
        </tr>
      );
    }

    return inventarios.map(inv => (
      <tr key={inv.id} className="table-row">
        <td className="font-semibold text-white">{inv.name}</td>
        <td>{new Date(inv.created_at).toLocaleString('pt-BR')}</td>
        <td className="text-center">
          {inv.status === 'completed' ? (
            <span className="badge success text-xs py-1">Concluído</span>
          ) : (
            <span className="badge warning text-xs py-1">Em Andamento</span>
          )}
        </td>
        <td>{inv.operator_name}</td>
        <td>{inv.completed_at ? new Date(inv.completed_at).toLocaleString('pt-BR') : '-'}</td>
        <td className="text-center">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => buscarDetalhesInventario(inv.id)}
              className={`btn py-0 px-3 text-xs ${inv.status === 'completed' ? 'btn-secondary' : 'btn-primary'}`}
              style={{ padding: '4px 12px', fontSize: '11px' }}
            >
              {inv.status === 'completed' ? 'Visualizar' : 'Contar Itens'}
            </button>
            <button
              onClick={() => lidarComExclusaoInventario(inv.id)}
              className="btn-icon btn-delete"
              title="Deletar Balanço"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      </tr>
    ));
  };

  const obterDescricaoModoLeitura = () => {
    if (modoLeitura === 'add') {
      return '* Modo bipagem rápida: adiciona 1 unidade (ou 0,1 kg para itens pesáveis) a cada escaneamento.';
    }
    if (modoLeitura === 'increment') {
      return `* Modo somar: adiciona ${quantidadeLeitura || '0'} à contagem existente do produto ao bipar.`;
    }
    return `* Modo definir: substitui a contagem total do produto por ${quantidadeLeitura || '0'} ao bipar.`;
  };

  return (
    <div className="space-y-4">
      {inventarioSelecionado === null ? (
        /* VISUALIZAÇÃO EM LISTA DE BALANÇOS */
        <>
          {/* Cartões rápidos de métricas */}
          <div className="dashboard-grid mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="glass-card flex items-center gap-3 p-4" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400" style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <RefreshCw size={24} />
              </div>
              <div>
                <h4 className="text-xs text-muted font-bold uppercase" style={{ margin: 0, fontSize: '11px' }}>Balanços Realizados</h4>
                <p className="text-xl font-bold text-white" style={{ margin: 0, fontSize: '20px' }}>{inventarios.length}</p>
              </div>
            </div>
            <div className="glass-card flex items-center gap-3 p-4" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-400" style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <History size={24} />
              </div>
              <div>
                <h4 className="text-xs text-muted font-bold uppercase" style={{ margin: 0, fontSize: '11px' }}>Em Andamento</h4>
                <p className="text-xl font-bold text-white" style={{ margin: 0, fontSize: '20px' }}>
                  {inventarios.filter(i => i.status !== 'completed').length}
                </p>
              </div>
            </div>
            <div className="glass-card flex items-center gap-3 p-4" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="p-3 rounded-lg bg-green-500/10 text-green-400" style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <FileText size={24} />
              </div>
              <div>
                <h4 className="text-xs text-muted font-bold uppercase" style={{ margin: 0, fontSize: '11px' }}>Concluídos</h4>
                <p className="text-xl font-bold text-white" style={{ margin: 0, fontSize: '20px' }}>
                  {inventarios.filter(i => i.status === 'completed').length}
                </p>
              </div>
            </div>
          </div>

          {/* Barra de título e ação de criação */}
          <div className="flex-between mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', paddingBottom: '10px' }}>
            <h3 className="text-lg font-bold text-white m-0">Sessões de Balanço de Estoque</h3>
            <button className="btn btn-primary flex-center gap-2" onClick={() => setModalNovoInventarioAberto(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              Novo Balanço
            </button>
          </div>

          {/* Tabela de inventários cadastrados */}
          <div className="glass-card p-0 overflow-hidden">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Identificação / Nome</th>
                    <th>Data de Início</th>
                    <th className="text-center">Status</th>
                    <th>Operador</th>
                    <th>Finalizado Em</th>
                    <th className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {renderizarLinhasTabelaInventario()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* SESSÃO DE CONTAGEM / DETALHES DE INVENTÁRIO */
        <>
          <div className="flex-between mb-4 border-b border-gray-800 pb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
            <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="btn btn-secondary py-1 px-3 text-xs" onClick={() => setInventarioSelecionado(null)}>
                ← Voltar para Lista
              </button>
              <div>
                <h2 className="text-xl font-bold text-white m-0" style={{ fontSize: '1.25rem' }}>{inventarioSelecionado.name}</h2>
                <p className="text-xs text-muted" style={{ margin: 0 }}>
                  Iniciado em {new Date(inventarioSelecionado.created_at).toLocaleString('pt-BR')} por <span className="font-bold text-blue-400">{inventarioSelecionado.operator_name}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {inventarioSelecionado.status === 'completed' ? (
                <span className="badge success text-xs font-bold py-1.5 px-3">CONCLUÍDO / APLICADO</span>
              ) : (
                <>
                  <span className="badge warning text-xs font-bold py-1.5 px-3">EM ANDAMENTO</span>
                  <button className="btn btn-success py-1.5 px-4 text-xs font-bold" onClick={lidarComFinalizacaoInventario}>
                    Concluir & Ajustar Estoque
                  </button>
                </>
              )}
            </div>
          </div>

          {inventarioSelecionado.status !== 'completed' && (
            /* ÁREA DE BIPAGEM RÁPIDA */
            <div className="glass-card mb-4" style={{ borderLeft: '4px solid #3b82f6', padding: '16px' }}>
              <h4 className="text-xs font-bold uppercase text-blue-400 mb-2" style={{ margin: '0 0 8px 0', fontSize: '11px' }}>Bipar Código de Barras / SKU</h4>
              <form onSubmit={lidarComLeituraOuAdicaoItem} className="flex flex-col gap-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Escaneie o código do produto ou digite o código interno (SKU) e aperte Enter..."
                    value={entradaItemEscaneado}
                    onChange={(e) => setEntradaItemEscaneado(e.target.value)}
                    className="input-field flex-1 font-semibold text-lg text-white"
                    style={{ flex: 1, fontSize: '1.1rem' }}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary px-5 font-bold">
                    Bipar / Adicionar
                  </button>
                </div>

                <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/5 flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="text-xs font-bold text-muted uppercase">Opção de Entrada:</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={modoLeitura}
                      onChange={(e) => {
                        const val = e.target.value as 'add' | 'increment' | 'set';
                        setModoLeitura(val);
                      }}
                      className="input-field select-field py-1 px-3 text-xs w-48 font-semibold"
                      style={{ width: '190px' }}
                    >
                      <option value="add">Somar +1 (Bipagem rápida)</option>
                      <option value="increment">Somar quantidade específica...</option>
                      <option value="set">Definir quantidade total...</option>
                    </select>
                  </div>

                  {(modoLeitura === 'increment' || modoLeitura === 'set') && (
                    <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor="scan-qty-input" className="text-xs text-muted font-semibold">Qtd:</label>
                      <input
                        id="scan-qty-input"
                        type="number"
                        step="any"
                        value={quantidadeLeitura}
                        onChange={(e) => setQuantidadeLeitura(e.target.value)}
                        className="input-field py-1 px-2 text-xs w-20 text-center font-bold"
                        style={{ width: '80px', textAlign: 'center' }}
                        required
                      />
                    </div>
                  )}
                </div>
              </form>
              <p className="text-xs text-muted mt-1.5 mb-0" style={{ margin: '6px 0 0 0', fontSize: '11px' }}>
                {obterDescricaoModoLeitura()}
              </p>
            </div>
          )}

          {/* TABELA DE ITENS CONTADOS */}
          <div className="glass-card p-0 overflow-hidden">
            <div className="p-3 border-b border-gray-800 bg-gray-900/20 flex-between gap-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="card-title text-base font-bold text-white m-0">Itens Contados no Balanço</h3>
              <div className="w-64" style={{ width: '256px' }}>
                <input
                  type="text"
                  placeholder="Filtrar por nome ou código..."
                  value={termoBuscaInventario}
                  onChange={(e) => setTermoBuscaInventario(e.target.value)}
                  className="input-field py-1 px-3 text-xs"
                />
              </div>
            </div>

            <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="table" style={{ minWidth: '950px' }}>
                <thead>
                  <tr>
                    <th>Produto / SKU</th>
                    <th>Cód. Barras</th>
                    <th className="text-center">Estoque Atual (Esperado)</th>
                    <th className="text-center" style={{ width: '160px' }}>Estoque Contado</th>
                    <th className="text-center">Diferença</th>
                    <th className="text-center">Última Leitura</th>
                    {inventarioSelecionado.status !== 'completed' && <th className="text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtrados = (inventarioSelecionado.items || []).filter(item => {
                      const query = termoBuscaInventario.toLowerCase();
                      return (
                        item.product_name?.toLowerCase().includes(query) ||
                        item.product_barcode?.toLowerCase().includes(query) ||
                        item.product_code?.toLowerCase().includes(query)
                      );
                    });

                    if (filtrados.length === 0) {
                      return (
                        <tr>
                          <td colSpan={inventarioSelecionado.status === 'completed' ? 6 : 7} className="text-center py-4 text-muted">
                            Nenhum produto listado ou encontrado no filtro.
                          </td>
                        </tr>
                      );
                    }

                    return filtrados.map(item => {
                      const diff = item.difference;
                      const diffText = diff > 0 ? `+${diff}` : `${diff}`;
                      
                      let diffClass = 'text-muted';
                      if (diff > 0) {
                        diffClass = 'text-success font-bold';
                      } else if (diff < 0) {
                        diffClass = 'text-danger font-bold';
                      }

                      return (
                        <tr key={item.id} className="table-row">
                          <td>
                            <div className="font-semibold text-white">{item.product_name}</div>
                            <div className="text-xs text-muted">SKU: {item.product_code}</div>
                          </td>
                          <td className="text-monospace text-xs">{item.product_barcode}</td>
                          <td className="text-center font-bold text-muted">{item.expected_qty} {item.product_unit}</td>
                          <td className="text-center">
                            {inventarioSelecionado.status === 'completed' ? (
                              <span className="font-bold text-white">{item.counted_qty} {item.product_unit}</span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary py-0 px-2 text-xs"
                                  onClick={() => lidarComAtualizacaoQuantidadeItem(item.id, Math.max(0, item.counted_qty - 1))}
                                  style={{ padding: '2px 8px' }}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={itemInventarioEditando?.id === item.id ? itemInventarioEditando.counted_qty : item.counted_qty}
                                  onChange={(e) => setItemInventarioEditando({ id: item.id, counted_qty: e.target.value })}
                                  onBlur={() => {
                                    if (itemInventarioEditando?.id === item.id) {
                                      const val = Number.parseFloat(itemInventarioEditando.counted_qty);
                                      if (!Number.isNaN(val) && val >= 0) {
                                        lidarComAtualizacaoQuantidadeItem(item.id, val);
                                      }
                                    }
                                    setItemInventarioEditando(null);
                                  }}
                                  className="input-field text-center font-bold"
                                  style={{ width: '70px', padding: '2px 4px', margin: 0 }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary py-0 px-2 text-xs"
                                  onClick={() => lidarComAtualizacaoQuantidadeItem(item.id, item.counted_qty + 1)}
                                  style={{ padding: '2px 8px' }}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </td>
                          <td className={`text-center font-bold ${diffClass}`}>{diffText} {item.product_unit}</td>
                          <td className="text-center text-xs text-muted">
                            {item.counted_at ? new Date(item.counted_at).toLocaleTimeString('pt-BR') : '-'}
                          </td>
                          {inventarioSelecionado.status !== 'completed' && (
                            <td className="text-center">
                              <button
                                onClick={() => lidarComExclusaoItem(item.id)}
                                className="btn-icon btn-delete"
                                title="Remover Item"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal para criar novo balanço */}
      {modalNovoInventarioAberto && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content animate-slide-up" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>Novo Balanço / Inventário</h3>
              <button className="btn-icon" onClick={() => setModalNovoInventarioAberto(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={lidarComCriacaoInventario} className="modal-form">
              <div className="form-group mb-3">
                <label htmlFor="new-inventory-name-input" className="font-bold">Identificação / Nome do Balanço</label>
                <input
                  id="new-inventory-name-input"
                  type="text"
                  required
                  placeholder="Ex: Balanço Mensal Julho"
                  value={nomeNovoInventario}
                  onChange={(e) => setNomeNovoInventario(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="form-group mb-3">
                <label htmlFor="new-inventory-operator-input" className="font-bold">Nome do Operador / Auditor</label>
                <input
                  id="new-inventory-operator-input"
                  type="text"
                  disabled
                  value={usuarioAtual.username}
                  className="input-field opacity-60"
                />
              </div>

              <div className="form-group mb-4 flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="populate_all_cb"
                  checked={preCarregarTodosProdutos}
                  onChange={(e) => setPreCarregarTodosProdutos(e.target.checked)}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
                <label htmlFor="populate_all_cb" className="font-bold cursor-pointer select-none text-sm text-white">
                  Pré-carregar todos os produtos em estoque
                </label>
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNovoInventarioAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Iniciar Balanço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
