import React, { useEffect, useState } from 'react';
import { api, type AIRecommendation } from '../services/api';
import { toast } from '../services/toast';
import { Sparkles, RefreshCw, TrendingDown, AlertTriangle, Layout, Package, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

/**
 * Componente de Insights da Inteligência Artificial (Gemini)
 * Analisa o histórico de vendas, produtos com queda recente nas vendas,
 * itens sem giro (estoque parado) e sugere melhorias de layout e promoções.
 */
export default function AIRecommendations() {
  const [recomendacoes, setRecomendacoes] = useState<AIRecommendation[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('superpos_gemini_api_key') || '');
  const [inputKey, setInputKey] = useState(() => localStorage.getItem('superpos_gemini_api_key') || '');
  const [mostrarKey, setMostrarKey] = useState(false);
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'queda_vendas' | 'parado' | 'estoque_baixo' | 'layout'>('todos');

  const carregarDadosIA = async () => {
    if (!apiKey) {
      toast.error('Nenhuma chave API conectada. Por favor, insira e salve sua chave.');
      return;
    }
    setCarregando(true);
    setHasRun(true);
    try {
      const resposta = await api.getAIRecommendations(apiKey);
      setRecomendacoes(resposta.recommendations);
      if ((resposta as any).fallbackReason) {
        toast.warning((resposta as any).fallbackReason);
      }
    } catch (error_: any) {
      toast.error('Erro ao gerar recomendações: ' + error_.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    setHasRun(false);
    setRecomendacoes([]);
  }, [apiKey]);

  const lidarComSalvarKey = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const chaveLimpa = inputKey.trim();
    if (chaveLimpa) {
      localStorage.setItem('superpos_gemini_api_key', chaveLimpa);
      setApiKey(chaveLimpa);
      toast.success('Chave Gemini API salva com sucesso!');
    } else {
      lidarComLimparKey();
    }
  };

  const lidarComLimparKey = () => {
    localStorage.removeItem('superpos_gemini_api_key');
    setApiKey('');
    setInputKey('');
    toast.success('Chave removida com sucesso.');
  };

  // Filtra as recomendações dependendo da aba ativa
  const recomendacoesFiltradas = recomendacoes.filter(rec => {
    if (filtroAtivo === 'todos') return true;
    if (filtroAtivo === 'queda_vendas') return rec.status === 'queda_vendas';
    if (filtroAtivo === 'parado') return rec.status === 'parado';
    if (filtroAtivo === 'estoque_baixo') return rec.status === 'estoque_baixo';
    if (filtroAtivo === 'layout') return rec.status === 'layout_geral' || rec.tipo_acao === 'layout';
    return true;
  });

  // Retorna ícone correspondente ao status da recomendação
  const obterIconeRecomendacao = (status: string) => {
    switch (status) {
      case 'queda_vendas':
        return <TrendingDown className="text-warning" size={24} style={{ color: 'var(--warning)' }} />;
      case 'estoque_baixo':
        return <AlertTriangle className="text-danger" size={24} style={{ color: 'var(--danger)' }} />;
      case 'parado':
        return <Package className="text-primary" size={24} style={{ color: 'var(--primary)' }} />;
      default:
        return <Layout className="text-success" size={24} style={{ color: 'var(--success)' }} />;
    }
  };

  const obterLabelStatus = (status: string) => {
    switch (status) {
      case 'queda_vendas': return 'Queda de Vendas';
      case 'estoque_baixo': return 'Estoque Crítico';
      case 'parado': return 'Sem Giro';
      default: return 'Layout da Loja';
    }
  };

  const obterClasseStatus = (status: string) => {
    switch (status) {
      case 'queda_vendas': return 'warning';
      case 'estoque_baixo': return 'danger';
      case 'parado': return 'primary';
      default: return 'success';
    }
  };

  const obterLabelFiltro = (filtro: 'todos' | 'queda_vendas' | 'parado' | 'estoque_baixo' | 'layout') => {
    switch (filtro) {
      case 'todos': return 'Todas';
      case 'queda_vendas': return 'Queda de Vendas 📉';
      case 'parado': return 'Estoque Parado 📦';
      case 'estoque_baixo': return 'Abaixo do Mínimo ⚠️';
      default: return 'Visual & Layout 💡';
    }
  };

  // Formata valores em reais
  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  const renderConteudoPrincipal = () => {
    if (!apiKey) {
      return (
        <div className="glass-card p-5 text-center flex flex-column items-center justify-center gap-3 mb-4 animate-fade-in" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={48} className="text-warning mb-2 animate-pulse" style={{ color: 'var(--warning)' }} />
          <h3 className="text-xl font-bold text-white mb-2">Chave API Não Conectada</h3>
          <p className="text-sm text-muted max-w-lg leading-relaxed" style={{ margin: 0 }}>
            Para gerar recomendações personalizadas com base no estoque real e no histórico de vendas do seu mercado, 
            insira e salve sua Chave de API do Gemini no painel de configuração acima.
          </p>
        </div>
      );
    }

    if (carregando) {
      return (
        <div className="glass-card flex flex-column items-center justify-center p-5 animate-fade-in" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw className="animate-spin text-primary mb-3" size={48} />
          <h3 className="font-bold text-white mb-2">A inteligência artificial está processando seu inventário</h3>
          <p className="text-muted text-xs max-w-sm text-center" style={{ margin: 0 }}>
            Aguarde alguns segundos. Estamos consolidando o fluxo de caixa dos últimos 30 dias e aplicando padrões mercadológicos para gerar insights sob medida.
          </p>
        </div>
      );
    }

    if (!hasRun) {
      return (
        <div className="glass-card p-5 text-center flex flex-column items-center justify-center gap-3 mb-4 animate-fade-in" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={48} className="text-primary mb-2" style={{ color: 'var(--primary)' }} />
          <h3 className="text-xl font-bold text-white mb-1">Análise Pronta para Iniciar</h3>
          <p className="text-sm text-muted max-w-lg leading-relaxed mb-3" style={{ margin: 0 }}>
            Sua chave de API do Gemini está conectada com sucesso. Para evitar o uso acidental e economizar sua cota, 
            as consultas automáticas foram desativadas. Clique no botão abaixo para iniciar a análise inteligente de estoque e layout agora.
          </p>
          <button
            onClick={carregarDadosIA}
            disabled={carregando}
            className="btn btn-primary px-6 py-2.5 text-sm font-semibold flex items-center gap-2"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Sparkles size={16} />
            Iniciar Análise de IA
          </button>
        </div>
      );
    }

    return (
      <>
        {/* Navegação de Abas e Ações de Recarregar */}
        <div className="flex-between items-center animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Abas Filtro */}
          <div className="flex gap-2 p-1 bg-white/5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', display: 'flex' }}>
            {(['todos', 'queda_vendas', 'parado', 'estoque_baixo', 'layout'] as const).map((filtro) => (
              <button
                key={filtro}
                onClick={() => setFiltroAtivo(filtro)}
                className="btn text-xs px-4 py-1.5"
                style={{
                  textTransform: 'capitalize',
                  background: filtroAtivo === filtro ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  color: filtroAtivo === filtro ? '#fff' : 'rgba(255,255,255,0.6)',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: filtroAtivo === filtro ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {obterLabelFiltro(filtro)}
              </button>
            ))}
          </div>

          {/* Botão de Rodar Novamente */}
          <button
            onClick={carregarDadosIA}
            disabled={carregando}
            className="btn btn-secondary flex items-center gap-2 text-xs py-2 px-4"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw className={carregando ? 'animate-spin' : ''} size={14} />
            Analisar Novamente
          </button>
        </div>

        {/* Conteúdo de Recomendações */}
        {recomendacoesFiltradas.length === 0 ? (
          <div className="glass-card flex flex-column items-center justify-center p-5 text-center animate-fade-in" style={{ minHeight: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Package className="text-muted mb-3" size={40} />
            <h4 className="text-white font-bold mb-1">Nenhuma recomendação nesta categoria</h4>
            <p className="text-muted text-xs" style={{ margin: 0 }}>O estoque e as vendas parecem estar saudáveis para os parâmetros filtrados.</p>
          </div>
        ) : (
          <div className="grid-2col-equal animate-fade-in" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: '20px', display: 'grid' }}>
            {recomendacoesFiltradas.map((rec) => {
              const statusLabel = obterLabelStatus(rec.status);
              const statusClass = obterClasseStatus(rec.status);

              return (
                <div 
                  key={`${rec.produto_id || 'general'}-${rec.nome_produto}-${rec.status}-${rec.tipo_acao}`} 
                  className="glass-card p-4 flex flex-column justify-between animate-fade-in"
                  style={{ 
                    borderLeft: `4px solid var(--${statusClass})`, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between',
                    minHeight: '220px',
                    backgroundColor: 'rgba(255,255,255,0.015)' 
                  }}
                >
                  <div>
                    {/* Cabeçalho do Card */}
                    <div className="flex-between items-center mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="flex items-center gap-2">
                        {obterIconeRecomendacao(rec.status)}
                        <div>
                          <h4 className="text-sm font-bold text-white mb-0.5" style={{ margin: 0 }}>
                            {rec.nome_produto}
                          </h4>
                          <span className="text-xs text-muted">{rec.categoria}</span>
                        </div>
                      </div>
                      <span className={`badge ${statusClass} text-xs font-semibold`} style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Título e Descrição do Insight */}
                    <h5 className="text-sm font-bold text-white mb-2" style={{ margin: '0 0 8px 0', color: 'rgba(255, 255, 255, 0.95)' }}>
                      {rec.titulo}
                    </h5>
                    <p className="text-xs text-muted leading-relaxed" style={{ margin: 0 }}>
                      {rec.descricao}
                    </p>
                  </div>

                  {/* Bloco de Ações e Informações Adicionais */}
                  <div 
                    className="flex-between items-center mt-4 pt-3 border-t border-gray-800" 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      borderTop: '1px solid rgba(255,255,255,0.06)' 
                    }}
                  >
                    <div>
                      {rec.sugestao_preco && (
                        <div className="text-xs">
                          <span className="text-muted">Preço Sugerido: </span>
                          <strong className="text-green-400 font-bold" style={{ color: '#4ade80' }}>
                            {formatarMoeda(rec.sugestao_preco)}
                          </strong>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      {rec.tipo_acao === 'promocao' && (
                        <span className="badge warning text-xs font-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          💡 Sugestão de Promoção
                        </span>
                      )}
                      {rec.tipo_acao === 'layout' && (
                        <span className="badge success text-xs font-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🏠 Mudança de Gôndola
                        </span>
                      )}
                      {rec.tipo_acao === 'compra' && (
                        <span className="badge danger text-xs font-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🛒 Reposição Necessária
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-column gap-4 animate-fade-in" style={{ paddingBottom: '40px' }}>
      
      {/* Banner Principal de Configuração da IA */}
      <div className="grid-2col-equal" style={{ gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        
        {/* Lado Esquerdo: Título e Descrição */}
        <div className="glass-card p-5 flex flex-column justify-center" style={{ minHeight: '180px' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-yellow-500/10 rounded-circle text-yellow-500" style={{ display: 'inline-flex', borderRadius: '50%', backgroundColor: 'rgba(234, 179, 8, 0.1)', padding: '12px', color: '#fbbf24' }}>
              <Sparkles size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-1" style={{ margin: 0 }}>Assistente de IA SuperPOS</h2>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">Análise de Vendas, Giro de Estoque e Visual Merchandising</span>
            </div>
          </div>
          <p className="text-sm text-muted leading-relaxed" style={{ margin: 0, maxWidth: '95%' }}>
            Nossa Inteligência Artificial analisa os dados reais de fluxo de caixa, estoque mínimo e histórico de vendas recentes do seu banco de dados SQLite para propor ações automáticas de aumento de vendas, descontos sugeridos e sugestões de layout de prateleiras.
          </p>
        </div>

        {/* Lado Direito: Caixa de Chave da API Gemini */}
        <div className="glass-card p-4 flex flex-column justify-between" style={{ minHeight: '180px' }}>
          <form onSubmit={lidarComSalvarKey} className="flex flex-column gap-3">
            <div className="flex-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider" style={{ margin: 0 }}>Chave Gemini API</h3>
              {apiKey ? (
                <span className="badge success text-xs flex items-center gap-1" style={{ fontSize: '0.7rem' }}>
                  <CheckCircle2 size={10} /> Conectada
                </span>
              ) : (
                <span className="badge danger text-xs flex items-center gap-1" style={{ fontSize: '0.7rem' }}>
                  <AlertTriangle size={10} /> Desconectada
                </span>
              )}
            </div>

            <div className="flex gap-2" style={{ position: 'relative' }}>
              <input
                type={mostrarKey ? 'text' : 'password'}
                className="input-field text-sm"
                placeholder="Cole sua API Key do Gemini aqui..."
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                style={{ paddingRight: '40px', width: '100%' }}
              />
              <button
                type="button"
                className="btn-icon"
                onClick={() => setMostrarKey(!mostrarKey)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
              >
                {mostrarKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary text-xs py-1.5 px-3 flex-1 font-semibold">
                Salvar Chave
              </button>
              {apiKey && (
                <button type="button" onClick={lidarComLimparKey} className="btn btn-secondary text-xs py-1.5 px-3 font-semibold">
                  Remover
                </button>
              )}
            </div>
          </form>
          <div className="text-center mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
            <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline" style={{ textDecoration: 'none' }}>
              Obter chave de API gratuita ↗
            </a>
          </div>
        </div>

      </div>

      {/* Conteúdo Principal */}
      {renderConteudoPrincipal()}

    </div>
  );
}
