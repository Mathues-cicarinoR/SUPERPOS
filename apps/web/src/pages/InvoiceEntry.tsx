import { useEffect, useState } from 'react';
import { api, type Product as Produto, type FiscalSettings as ConfiguracoesFiscais } from '../services/api';
import { toast } from '../services/toast';
import { FileText, Settings, DownloadCloud } from 'lucide-react';

// Função utilitária para analisar e extrair as informações fiscais e itens do XML da NF-e
const analisarXMLNFe = (textoXML: string) => {
  const parser = new DOMParser();
  const documentoXML = parser.parseFromString(textoXML, "application/xml");

  const erroParser = documentoXML.querySelector("parsererror");
  if (erroParser) {
    throw new Error("XML de Nota Fiscal inválido ou corrompido.");
  }

  let chave = '';
  const infoNFe = documentoXML.querySelector("infNFe");
  if (infoNFe) {
    chave = infoNFe.getAttribute("Id") || '';
    if (chave.startsWith('NFe')) chave = chave.substring(3);
  }
  if (!chave) {
    const chaveNFe = documentoXML.querySelector("chNFe");
    if (chaveNFe) chave = chaveNFe.textContent || '';
  }

  const numeroNota = documentoXML.querySelector("nNF")?.textContent || '';

  const emitente = documentoXML.querySelector("emit");
  const nomeFornecedor = emitente?.querySelector("xNome")?.textContent || '';
  const cnpjFornecedor = emitente?.querySelector("CNPJ")?.textContent || '';

  const duplicata = documentoXML.querySelector("dup");
  const dataVencimento = duplicata?.querySelector("dVenc")?.textContent || '';
  const valorTotal = Number.parseFloat(documentoXML.querySelector("total > ICMSTot > vNF")?.textContent || '0');

  const itens: any[] = [];
  const detalhes = documentoXML.querySelectorAll("det");
  detalhes.forEach(det => {
    const produto = det.querySelector("prod");
    if (produto) {
      let codigoBarras = produto.querySelector("cEAN")?.textContent || '';
      if (!codigoBarras || codigoBarras === 'SEMGTIN' || codigoBarras === 'SEM GTIN') {
        codigoBarras = 'NF-' + (produto.querySelector("cProd")?.textContent || Math.random().toString(36).substring(2, 11));
      }
      const nome = produto.querySelector("xProd")?.textContent || '';
      const quantidade = Number.parseFloat(produto.querySelector("qCom")?.textContent || '0');
      const precoCompra = Number.parseFloat(produto.querySelector("vUnCom")?.textContent || '0');
      const ncm = produto.querySelector("NCM")?.textContent || '';
      const cest = produto.querySelector("CEST")?.textContent || '';

      itens.push({
        barcode: codigoBarras,   // Mantido em inglês para compatibilidade com a API
        name: nome,             // Mantido em inglês para compatibilidade com a API
        quantity: quantidade,   // Mantido em inglês para compatibilidade com a API
        price_buy: precoCompra, // Mantido em inglês para compatibilidade com a API
        price_sell: precoCompra * 1.3, // Mantido em inglês para compatibilidade com a API
        ncm,
        cest
      });
    }
  });

  return {
    invoice_number: numeroNota,   // Mantido em inglês para compatibilidade com a API
    key: chave,                   // Mantido em inglês para compatibilidade com a API
    supplier_name: nomeFornecedor,// Mantido em inglês para compatibilidade com a API
    supplier_cnpj: cnpjFornecedor,// Mantido em inglês para compatibilidade com a API
    total_amount: valorTotal,     // Mantido em inglês para compatibilidade com a API
    due_date: dataVencimento,     // Mantido em inglês para compatibilidade com a API
    items: itens                  // Mantido em inglês para compatibilidade com a API
  };
};

interface ItemNota {
  barcode: string;
  name: string;
  quantity: number;
  price_buy: number;
  price_sell: number;
  ncm?: string;
  cest?: string;
}

interface ParcelaNota {
  due_date: string;
  amount: number;
}

interface DadosNotaFiscal {
  invoice_number: string;
  key: string;
  supplier_name: string;
  supplier_cnpj: string;
  total_amount: number;
  due_date: string;
  schedule_payment?: boolean;
  installment_count?: number;
  installments?: ParcelaNota[];
  items: ItemNota[];
}

const mapearItensNota = (itens: any[], produtos: Produto[]): ItemNota[] => {
  const mapaProdutos = new Map(produtos.map(p => [p.barcode, p]));
  return itens.map(item => {
    const produtoExistente = mapaProdutos.get(item.barcode);
    return {
      ...item,
      price_sell: produtoExistente ? produtoExistente.price_sell : item.price_sell
    };
  });
};

interface PropriedadesEntradaNota {
  onNavigateToFiscalSettings?: () => void;
}

/**
 * Componente de Entrada de Mercadoria via XML de NF-e
 * Permite processar arquivos XML de notas fiscais de fornecedores, fazer a associação automática
 * e dar entrada física nos estoques com precificação inteligente.
 */
export default function InvoiceEntry({ onNavigateToFiscalSettings }: Readonly<PropriedadesEntradaNota>) {
  // Lista de produtos cadastrados para conferência e sugestão de preço anterior
  const [produtos, setProdutos] = useState<Produto[]>([]);
  // Configurações fiscais carregadas (CNPJ, etc)
  const [configuracoesFiscais, setConfiguracoesFiscais] = useState<ConfiguracoesFiscais>({
    cnpj: '',
    razao_social: '',
    inscricao_estadual: '',
    environment: 2,
    state: 'PE',
    csc_id: '',
    csc_token: '',
    has_certificate: false,
    default_cfop: '5102',
    default_origin: '0',
    default_csosn: '102',
    default_cst_pis: '49',
    default_cst_cofins: '49',
    default_aliquot_icms: 18,
    default_aliquot_pis: 0,
    default_aliquot_cofins: 0
  });

  // Lista de notas encontradas via manifesto da SEFAZ
  const [notasRecebidas, setNotasRecebidas] = useState<any[]>([]);
  const [carregandoSincronizacao, setCarregandoSincronizacao] = useState(false);
  const [carregandoManifesto, setCarregandoManifesto] = useState<Record<string, boolean>>({});

  // Dados da nota atualmente selecionada/importada para revisão
  const [dadosNota, setDadosNota] = useState<DadosNotaFiscal | null>(null);
  const [carregandoNota, setCarregandoNota] = useState(false);

  // Usuário atualmente ativo para auditoria
  const [usuarioAtual] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Carrega produtos e configurações fiscais na montagem da tela
  const carregarDadosIniciais = async () => {
    try {
      const respostaProdutos = await api.getProducts();
      setProdutos(respostaProdutos);
      const configuracoes = await api.getFiscalSettings();
      setConfiguracoesFiscais(configuracoes);
    } catch (error_: any) {
      console.warn("Erro ao carregar dados da entrada de nota:", error_);
    }
  };

  useEffect(() => {
    carregarDadosIniciais();
  }, []);

  // Busca na SEFAZ PE as notas fiscais emitidas contra o CNPJ da empresa
  const lidarComSincronizacaoNotas = async () => {
    if (!configuracoesFiscais.cnpj) {
      toast.warning("Cadastre o CNPJ nas Configurações Fiscais antes de buscar notas.");
      if (onNavigateToFiscalSettings) onNavigateToFiscalSettings();
      return;
    }
    setCarregandoSincronizacao(true);
    try {
      const lista = await api.syncReceivedInvoices(configuracoesFiscais.cnpj);
      setNotasRecebidas(lista);
      toast.success(`Busca concluída! ${lista.length} notas localizadas contra o CNPJ ${configuracoesFiscais.cnpj}.`);
    } catch (error_: any) {
      toast.error(error_.message || "Erro ao buscar notas.");
    } finally {
      setCarregandoSincronizacao(false);
    }
  };

  // Faz a manifestação da ciência da operação e faz o download automático da nota do banco da SEFAZ
  const lidarComImportacaoSEFAZ = async (chave: string) => {
    setCarregandoManifesto(prev => ({ ...prev, [chave]: true }));
    try {
      const resposta = await api.manifestAndDownloadInvoice(configuracoesFiscais.cnpj, chave, 'ciencia');
      if (resposta.success && resposta.xml) {
        const dadosAnalisados = analisarXMLNFe(resposta.xml);
        // Sugere o preço de venda anterior caso o produto já exista no cadastro
        const itensAtualizados = mapearItensNota(dadosAnalisados.items, produtos);

        setDadosNota({
          ...dadosAnalisados,
          items: itensAtualizados,
          schedule_payment: true,
          installment_count: 1,
          installments: [{ due_date: dadosAnalisados.due_date || new Date().toISOString().split('T')[0], amount: dadosAnalisados.total_amount }]
        });
        toast.success(`XML da nota fiscal importado com sucesso!`);
      }
    } catch (error_: any) {
      toast.error(error_.message || "Erro ao baixar XML da nota.");
    } finally {
      setCarregandoManifesto(prev => ({ ...prev, [chave]: false }));
    }
  };

  // Processa o upload manual do XML da nota fiscal
  const lidarComUploadXML = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    try {
      const textoXML = await arquivo.text();
      const dadosAnalisados = analisarXMLNFe(textoXML);

      // Associa os itens da nota com os produtos cadastrados
      const itensAtualizados = mapearItensNota(dadosAnalisados.items, produtos);

      setDadosNota({
        ...dadosAnalisados,
        items: itensAtualizados,
        schedule_payment: true,
        installment_count: 1,
        installments: [{ due_date: dadosAnalisados.due_date || new Date().toISOString().split('T')[0], amount: dadosAnalisados.total_amount }]
      });

      toast.success(`Nota Fiscal nº ${dadosAnalisados.invoice_number} carregada! ${dadosAnalisados.items.length} itens encontrados.`);
    } catch (error_: any) {
      toast.error(error_.message || 'Erro ao processar o XML da Nota Fiscal.');
    }
  };

  // Modifica campos específicos do item na tabela de revisão da nota
  const lidarComMudancaItemNota = (indice: number, campo: 'name' | 'price_sell' | 'price_buy' | 'quantity', valor: any) => {
    if (!dadosNota) return;
    const itensAtualizados = [...dadosNota.items];
    itensAtualizados[indice] = {
      ...itensAtualizados[indice],
      [campo]: campo === 'name' ? valor : Number.parseFloat(valor) || 0
    };
    setDadosNota({
      ...dadosNota,
      items: itensAtualizados
    });
  };

  // Modifica campos de cabeçalho da nota
  const lidarComMudancaGeralNota = (campo: 'invoice_number' | 'supplier_name' | 'supplier_cnpj' | 'total_amount' | 'due_date' | 'schedule_payment' | 'installment_count', valor: any) => {
    if (!dadosNota) return;

    if (campo === 'total_amount') {
      const valorNumerico = Number.parseFloat(valor) || 0;
      const quantidadeParcelas = dadosNota.installment_count || 1;
      const valorPorParcela = Number.parseFloat((valorNumerico / quantidadeParcelas).toFixed(2));
      const novasParcelas = dadosNota.installments?.map((inst: any, idx: number) => {
        let amt = valorPorParcela;
        if (idx === quantidadeParcelas - 1) {
          const sumPrevious = valorPorParcela * (quantidadeParcelas - 1);
          amt = Number.parseFloat((valorNumerico - sumPrevious).toFixed(2));
        }
        return { ...inst, amount: amt };
      }) || [];

      setDadosNota({
        ...dadosNota,
        total_amount: valorNumerico,
        installments: novasParcelas
      });
    } else {
      setDadosNota({
        ...dadosNota,
        [campo]: valor
      });
    }
  };

  // Recalcula o plano financeiro (parcelas) conforme a quantidade de duplicatas
  const lidarComMudancaQuantidadeParcelas = (quantidade: number) => {
    if (!dadosNota) return;
    const valorBase = dadosNota.total_amount;
    const valorPorParcela = Number.parseFloat((valorBase / quantidade).toFixed(2));
    const parcelas = Array.from({ length: quantidade }, (_, idx) => {
      const dataInicio = dadosNota.due_date ? new Date(dadosNota.due_date) : new Date();
      if (idx > 0) {
        dataInicio.setDate(dataInicio.getDate() + idx * 30);
      }
      const ano = dataInicio.getFullYear();
      const mes = String(dataInicio.getMonth() + 1).padStart(2, '0');
      const dia = String(dataInicio.getDate()).padStart(2, '0');
      const dataVencimentoStr = `${ano}-${mes}-${dia}`;

      let valorParcela = valorPorParcela;
      if (idx === quantidade - 1) {
        const sumPrevious = valorPorParcela * (quantidade - 1);
        valorParcela = Number.parseFloat((valorBase - sumPrevious).toFixed(2));
      }

      return {
        due_date: dataVencimentoStr,
        amount: valorParcela
      };
    });

    setDadosNota({
      ...dadosNota,
      installment_count: quantidade,
      installments: parcelas
    });
  };

  // Modifica os dados de uma parcela específica do boleto
  const lidarComMudancaParcela = (indice: number, campo: 'due_date' | 'amount', valor: any) => {
    if (!dadosNota?.installments) return;
    const lista = [...dadosNota.installments];
    lista[indice] = {
      ...lista[indice],
      [campo]: campo === 'amount' ? (Number.parseFloat(valor) || 0) : valor
    };
    setDadosNota({
      ...dadosNota,
      installments: lista
    });
  };

  // Envia a nota para o backend processar os novos estoques e lançamentos financeiros
  const lidarComSubmissaoNota = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!dadosNota) return;

    setCarregandoNota(true);
    try {
      const dadosParaEnvio = {
        invoice_number: dadosNota.invoice_number,
        supplier_name: dadosNota.supplier_name,
        supplier_cnpj: dadosNota.supplier_cnpj || null,
        total_amount: dadosNota.total_amount,
        due_date: dadosNota.due_date || null,
        operator_name: usuarioAtual.username,
        schedule_payment: dadosNota.schedule_payment ?? true,
        installments: (dadosNota.schedule_payment ?? true) ? (dadosNota.installments ?? []) : [],
        items: dadosNota.items
      };

      const resposta = await api.invoiceEntry(dadosParaEnvio);
      if (resposta.success) {
        toast.success(`Entrada por nota fiscal processada com sucesso! ${resposta.processedItems.length} itens atualizados/criados.`);
        setDadosNota(null);
        carregarDadosIniciais(); // Atualiza a lista local de produtos
      }
    } catch (error_: any) {
      toast.error(error_.message || 'Erro ao processar entrada.');
    } finally {
      setCarregandoNota(false);
    }
  };

  // Formata valores para R$ brasileiro
  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  const renderizarSecaoUpload = () => {
    return (
      <div className="grid-2col-equal">
        {/* Coluna 1: Upload Manual */}
        <div className="flex flex-column gap-4">
          <div className="glass-card text-center p-5 flex flex-column items-center justify-center border-dashed" style={{ border: '2px dashed rgba(255, 255, 255, 0.15)', minHeight: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="icon-wrapper mb-3 bg-primary/10 p-3 rounded-circle text-primary" style={{ display: 'inline-flex', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '12px' }}>
              <FileText size={36} />
            </div>
            <h3 className="text-lg font-bold mb-2">Importação Manual de XML</h3>
            <p className="text-muted text-xs max-w-sm mb-3">
              Selecione o arquivo XML da NF-e fornecido pelo emitente para atualizar o estoque de forma convencional.
            </p>
            <label htmlFor="xml-upload-input" className="btn btn-primary cursor-pointer text-sm py-2 px-4">
              Selecionar Arquivo XML
            </label>
            <input
              id="xml-upload-input"
              type="file"
              accept=".xml"
              onChange={lidarComUploadXML}
              style={{ display: 'none' }}
            />
          </div>

          <div className="glass-card p-4">
            <h3 className="card-title text-sm border-b border-gray-800 pb-2 mb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>Como funciona a Entrada por NF-e?</h3>
            <ul className="text-xs text-muted space-y-2" style={{ listStyleType: 'disc', paddingLeft: '15px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong className="text-white">Leitura Inteligente:</strong> O sistema analisa as tags do XML da NF-e (Emitente, Duplicatas e Itens).
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong className="text-white">Associação por EAN:</strong> Se o código de barras já existir, o estoque será somado e o preço de custo atualizado.
              </li>
              <li>
                <strong className="text-white">Cadastro Automático:</strong> Novos produtos serão criados utilizando os dados fiscais da nota.
              </li>
            </ul>
          </div>
        </div>

        {/* Coluna 2: Consulta Automática contra o CNPJ na SEFAZ */}
        <div className="glass-card p-4 flex flex-column justify-between" style={{ minHeight: '380px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="flex-between border-b border-gray-800 pb-2 mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
              <h3 className="card-title text-base flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Settings className="text-primary animate-spin" style={{ animationDuration: '6s' }} size={18} />
                Consulta Automática SEFAZ (PE)
              </h3>
              {configuracoesFiscais.cnpj && (
                <span className="badge success text-xs">CNPJ Cadastrado</span>
              )}
            </div>

            {configuracoesFiscais.cnpj ? (
              <div>
                <div className="flex-between mb-3 text-xs bg-white/5 p-2 rounded" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginBottom: '12px' }}>
                  <div>
                    <p className="text-muted" style={{ margin: '0 0 2px 0' }}>CNPJ da Empresa:</p>
                    <p className="font-bold text-white" style={{ margin: 0 }}>{configuracoesFiscais.cnpj}</p>
                  </div>
                  <div className="text-right" style={{ textAlign: 'right' }}>
                    <p className="text-muted" style={{ margin: '0 0 2px 0' }}>Ambiente:</p>
                    <p className="font-bold text-blue-400" style={{ margin: 0 }}>{configuracoesFiscais.environment === 1 ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={carregandoSincronizacao}
                  onClick={lidarComSincronizacaoNotas}
                  className="btn btn-success w-full py-2 flex-center gap-2 text-sm font-bold mb-4"
                  style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '16px' }}
                >
                  {carregandoSincronizacao ? (
                    <>
                      <div className="spinner-sm" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                      Sincronizando notas...
                    </>
                  ) : (
                    <>
                      <DownloadCloud size={16} />
                      Buscar Notas pelo CNPJ (SEFAZ PE)
                    </>
                  )}
                </button>

                <h4 className="text-xs font-bold uppercase text-muted mb-2" style={{ margin: '0 0 8px 0', fontSize: '11px' }}>Notas localizadas na SEFAZ:</h4>

                <div className="table-responsive animate-fade-in" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {notasRecebidas.length === 0 ? (
                    <p className="text-center text-xs text-muted py-4">Nenhuma nota fiscal pendente de importação.</p>
                  ) : (
                    <table className="table text-xs" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '6px' }}>Fornecedor</th>
                          <th style={{ padding: '6px' }} className="text-center">Nota</th>
                          <th style={{ padding: '6px' }} className="text-right">Valor</th>
                          <th style={{ padding: '6px' }} className="text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notasRecebidas.map((inv) => (
                          <tr key={inv.chave_acesso} className="table-row">
                            <td style={{ padding: '6px' }} className="font-semibold" title={inv.nome_emitente}>
                              {inv.nome_emitente.length > 20 ? inv.nome_emitente.substring(0, 18) + '...' : inv.nome_emitente}
                            </td>
                            <td style={{ padding: '6px' }} className="text-center text-monospace">{inv.numero_nota}</td>
                            <td style={{ padding: '6px' }} className="text-right font-bold">{formatarMoeda(inv.valor_total)}</td>
                            <td style={{ padding: '6px' }} className="text-center">
                              <button
                                type="button"
                                disabled={carregandoManifesto[inv.chave_acesso]}
                                onClick={() => lidarComImportacaoSEFAZ(inv.chave_acesso)}
                                className="btn btn-primary text-xs py-1 px-2 flex-center gap-1 mx-auto"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '0 auto', padding: '2px 8px' }}
                              >
                                {carregandoManifesto[inv.chave_acesso] ? (
                                  <div className="spinner-sm" style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                ) : 'Importar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-column items-center justify-center text-center py-5" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <p className="text-muted text-sm mb-4">
                  Você precisa cadastrar o CNPJ e configurar o Módulo Fiscal para habilitar a busca de notas contra seu CNPJ.
                </p>
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  onClick={onNavigateToFiscalSettings}
                >
                  Configurar Módulo Fiscal
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderizarFormularioConferencia = () => {
    if (!dadosNota) return null;
    return (
      <form onSubmit={lidarComSubmissaoNota} className="glass-card p-4 animate-fade-in">
        <div className="flex-between border-b border-gray-800 pb-3 mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <h3 className="card-title text-lg" style={{ margin: 0 }}>Revisão de Entrada de Mercadorias</h3>
            <p className="text-xs text-muted" style={{ margin: 0 }}>Ajuste os dados gerais da Nota ou altere os preços de venda sugeridos antes de confirmar.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary text-danger border-danger/30 hover:bg-danger/10"
            onClick={() => setDadosNota(null)}
            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            Cancelar Importação
          </button>
        </div>

        {/* Dados Gerais do Cabeçalho */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 p-3 bg-white/5 rounded-lg" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginBottom: '16px' }}>
          <div>
            <label htmlFor="invoice-number-input" className="block text-xs text-muted mb-1 font-bold">Número da Nota</label>
            <input
              id="invoice-number-input"
              type="text"
              required
              value={dadosNota.invoice_number}
              onChange={(e) => lidarComMudancaGeralNota('invoice_number', e.target.value)}
              className="input-field py-1 text-sm font-semibold"
            />
          </div>
          <div>
            <label htmlFor="supplier-name-input" className="block text-xs text-muted mb-1 font-bold">Fornecedor (Emitente)</label>
            <input
              id="supplier-name-input"
              type="text"
              required
              value={dadosNota.supplier_name}
              onChange={(e) => lidarComMudancaGeralNota('supplier_name', e.target.value)}
              className="input-field py-1 text-sm font-semibold"
            />
          </div>
          <div>
            <label htmlFor="supplier-cnpj-input" className="block text-xs text-muted mb-1 font-bold">CNPJ Fornecedor</label>
            <input
              id="supplier-cnpj-input"
              type="text"
              value={dadosNota.supplier_cnpj || ''}
              onChange={(e) => lidarComMudancaGeralNota('supplier_cnpj', e.target.value)}
              className="input-field py-1 text-sm font-semibold"
            />
          </div>
          <div>
            <label htmlFor="due-date-input" className="block text-xs text-muted mb-1 font-bold">Vencimento Fatura (Opcional)</label>
            <input
              id="due-date-input"
              type="date"
              value={dadosNota.due_date || ''}
              onChange={(e) => lidarComMudancaGeralNota('due_date', e.target.value)}
              className="input-field py-1 text-sm font-semibold"
            />
          </div>
        </div>

        {/* Agendamento Financeiro de Contas a Pagar */}
        <div className="mb-4 p-3 bg-white/5 rounded-lg border border-gray-800" style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', marginBottom: '16px' }}>
          <div className="flex-between mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 className="text-xs font-bold uppercase text-blue-400" style={{ margin: 0 }}>Agendamento Financeiro</h4>
            <label className="flex items-center gap-2 cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={dadosNota.schedule_payment ?? true}
                onChange={(e) => lidarComMudancaGeralNota('schedule_payment', e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-xs font-bold text-white">Gerar Contas a Pagar / Agendar Boleto</span>
            </label>
          </div>

          {(dadosNota.schedule_payment ?? true) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ maxWidth: '300px' }}>
                <label htmlFor="installment-count-select" className="block text-xs text-muted mb-1 font-bold">Plano de Pagamento (Nº de Parcelas)</label>
                <select
                  id="installment-count-select"
                  value={dadosNota.installment_count || '1'}
                  onChange={(e) => lidarComMudancaQuantidadeParcelas(Number.parseInt(e.target.value, 10))}
                  className="input-field select-field py-1 text-sm font-semibold"
                >
                  <option value="1">1x (Boleto Único / À Vista)</option>
                  <option value="2">2x (Duas parcelas - Mensal)</option>
                  <option value="3">3x (Três parcelas - 30/60/90 dias)</option>
                  <option value="4">4x (Quatro parcelas)</option>
                  <option value="5">5x (Cinco parcelas)</option>
                  <option value="6">6x (Seis parcelas)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {dadosNota.installments?.map((inst: any, idx: number) => (
                  <div key={`inst-${idx}-${inst.due_date}`} className="flex flex-column gap-2 p-2 rounded bg-black/40 border border-white/5" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="text-xs font-bold text-blue-400">Parcela {idx + 1}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label htmlFor={`inst-due-date-${idx}`} className="block text-muted" style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Vencimento</label>
                        <input
                          id={`inst-due-date-${idx}`}
                          type="date"
                          required
                          value={inst.due_date}
                          onChange={(e) => lidarComMudancaParcela(idx, 'due_date', e.target.value)}
                          className="input-field py-0.5 px-2 text-xs"
                          style={{ padding: '2px 4px', fontSize: '11px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label htmlFor={`inst-amount-${idx}`} className="block text-muted" style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Valor R$</label>
                        <input
                          id={`inst-amount-${idx}`}
                          type="number"
                          step="0.01"
                          required
                          value={inst.amount}
                          onChange={(e) => lidarComMudancaParcela(idx, 'amount', e.target.value)}
                          className="input-field py-0.5 px-2 text-xs text-right font-bold"
                          style={{ padding: '2px 4px', fontSize: '11px', textAlign: 'right' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabela de Itens da Nota */}
        <div className="table-responsive mb-4" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Cód. Barras</th>
                <th>Nome do Produto</th>
                <th className="text-center">Quantidade</th>
                <th className="text-right">R$ Compra (Unit)</th>
                <th className="text-right">R$ Venda Sugerido</th>
                <th className="text-right">Markup %</th>
              </tr>
            </thead>
            <tbody>
              {dadosNota.items.map((item: any, idx: number) => {
                const produtoExistente = produtos.find(p => p.barcode === item.barcode);
                const markup = item.price_sell && item.price_buy
                  ? ((item.price_sell - item.price_buy) / item.price_buy * 100).toFixed(0)
                  : '0';

                return (
                  <tr key={`item-${item.barcode || idx}`} className="table-row">
                    <td style={{ width: '150px' }}>
                      {produtoExistente ? (
                        <span className="badge success text-xs py-1">Estoque +{item.quantity}</span>
                      ) : (
                        <span className="badge warning text-xs py-1">Novo Produto</span>
                      )}
                    </td>
                    <td className="text-monospace text-xs" style={{ width: '130px', fontFamily: 'monospace' }}>{item.barcode}</td>
                    <td>
                      <input
                        type="text"
                        required
                        value={item.name}
                        onChange={(e) => lidarComMudancaItemNota(idx, 'name', e.target.value)}
                        className="input-field py-1 text-sm font-semibold border-transparent hover:border-gray-700 focus:border-primary bg-transparent"
                        style={{ border: 'none', backgroundColor: 'transparent', padding: '4px' }}
                      />
                    </td>
                    <td className="text-center font-semibold" style={{ width: '90px' }}>
                      <input
                        type="number"
                        step="any"
                        required
                        value={item.quantity}
                        onChange={(e) => lidarComMudancaItemNota(idx, 'quantity', e.target.value)}
                        className="input-field py-1 text-sm text-center font-semibold border-transparent hover:border-gray-700 focus:border-primary bg-transparent"
                        style={{ border: 'none', backgroundColor: 'transparent', padding: '4px', textAlign: 'center' }}
                      />
                    </td>
                    <td className="text-right font-semibold" style={{ width: '120px' }}>
                      <input
                        type="number"
                        step="any"
                        required
                        value={item.price_buy}
                        onChange={(e) => lidarComMudancaItemNota(idx, 'price_buy', e.target.value)}
                        className="input-field py-1 text-sm text-right font-semibold border-transparent hover:border-gray-700 focus:border-primary bg-transparent"
                        style={{ border: 'none', backgroundColor: 'transparent', padding: '4px', textAlign: 'right' }}
                      />
                    </td>
                    <td className="text-right" style={{ width: '130px' }}>
                      <input
                        type="number"
                        step="any"
                        required
                        value={item.price_sell || ''}
                        onChange={(e) => lidarComMudancaItemNota(idx, 'price_sell', e.target.value)}
                        placeholder="Venda"
                        className="input-field py-1 text-sm text-right font-bold text-primary border-transparent hover:border-gray-700 focus:border-primary bg-transparent"
                        style={{ border: 'none', backgroundColor: 'transparent', padding: '4px', textAlign: 'right', color: 'var(--primary)' }}
                      />
                    </td>
                    <td className="text-right text-muted text-xs font-semibold" style={{ width: '90px', textAlign: 'right' }}>
                      {markup}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Salvar / Confirmar */}
        <div className="flex-between p-3 bg-white/5 rounded-lg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
          <div className="text-sm">
            <span className="text-muted">Valor Total da Nota: </span>
            <strong className="text-lg text-primary">{formatarMoeda(dadosNota.total_amount)}</strong>
          </div>

          <button
            type="submit"
            disabled={carregandoNota}
            className="btn btn-primary flex-center gap-2 px-5 py-2"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {carregandoNota ? 'Processando...' : 'Confirmar Entrada no Estoque'}
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="invoice-entry-tab">
      {dadosNota ? renderizarFormularioConferencia() : renderizarSecaoUpload()}
    </div>
  );
}
