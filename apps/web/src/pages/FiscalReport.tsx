import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { FileText, DownloadCloud, X } from 'lucide-react';

/**
 * Componente do Relatório de Notas Fiscais Emitidas
 * Permite buscar, filtrar por datas e status, exportar XMLs compactados para o contador,
 * emitir um PDF impresso consolidado e visualizar erros ou XMLs de Notas fiscais de venda (NFC-e).
 */
export default function FiscalReport() {
  const [fiscalReports, setFiscalReports] = useState<any[]>([]);
  const [fiscalReportLoading, setFiscalReportLoading] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState<any>(null);

  // Filtros de Data e Horários (inicializa com a data de hoje)
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [filterStartTime, setFilterStartTime] = useState('00:00');
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [filterEndTime, setFilterEndTime] = useState('23:59');
  const [filterStatus, setFilterStatus] = useState('all');

  // Obtém o usuário logado para auditoria do relatório impresso
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Busca as notas fiscais emitidas conforme os parâmetros de busca
  const fetchFiscalReport = async () => {
    setFiscalReportLoading(true);
    try {
      const res = await api.getEmittedFiscalReport({
        startDate: filterStartDate,
        startTime: filterStartTime,
        endDate: filterEndDate,
        endTime: filterEndTime,
        status: filterStatus
      });
      setFiscalReports(res);
    } catch (e: any) {
      toast.error("Erro ao carregar relatório fiscal: " + e.message);
    } finally {
      setFiscalReportLoading(false);
    }
  };

  useEffect(() => {
    fetchFiscalReport();
  }, []);

  // Gera uma janela de visualização e impressão em PDF para o relatório fiscal consolidado
  const handleDownloadFiscalReportPDF = () => {
    const newWindow = globalThis.open('', '_blank');
    if (!newWindow) {
      toast.error('Erro ao abrir nova janela para gerar PDF.');
      return;
    }

    const sortedReports = [...fiscalReports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const successCount = sortedReports.filter(r => r.status === 'success').length;
    const errorCount = sortedReports.filter(r => r.status !== 'success').length;
    const totalAmountSum = sortedReports.reduce((sum, r) => sum + (r.final_amount || 0), 0);

    const rowsHtml = sortedReports.map(r => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; text-align: left;">${new Date(r.created_at).toLocaleString('pt-BR')}</td>
        <td style="padding: 10px; text-align: center; font-weight: bold; color: #3b82f6;">#${r.sale_id || 'Avulso'}</td>
        <td style="padding: 10px; text-align: left; font-family: monospace; font-size: 11px;">${r.chave_acesso || '-'}</td>
        <td style="padding: 10px; text-align: center;">${r.cpf_customer || 'Consumidor Final'}</td>
        <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: bold;">R$ ${(r.final_amount || 0).toFixed(2)}</td>
        <td style="padding: 10px; text-align: center;">
          <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${r.status === 'success' ? '#d1fae5; color: #065f46;' : '#fee2e2; color: #991b1b;'}">
            ${r.status === 'success' ? 'Sucesso' : 'Erro'}
          </span>
        </td>
      </tr>
    `).join('');

    const doc = newWindow.document as any;
    doc.write(`
      <html>
        <head>
          <title>Relatorio_Notas_Fiscais_${new Date().toISOString().slice(0, 10)}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
            .meta { font-size: 12px; color: #64748b; text-align: right; }
            .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .kpi-card { padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
            .kpi-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px; display: block; }
            .kpi-val { font-size: 20px; font-weight: 800; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #f8fafc; padding: 12px 10px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
            td { font-size: 12px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; margin-top: 5px; }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Relatório de Emissões de Cupom Fiscal (NFC-e)</h1>
              <div style="font-size: 13px; color: #64748b; margin-top: 5px;">SuperPOS - Controle Fiscal</div>
            </div>
            <div class="meta">
              <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
              <div>Operador: ${currentUser.username}</div>
            </div>
          </div>
          
          <div class="kpis">
            <div class="kpi-card" style="border-top: 3px solid #10b981;">
              <span class="kpi-title">Emissões Sucesso</span>
              <span class="kpi-val" style="color: #10b981;">${successCount}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #ef4444;">
              <span class="kpi-title">Falhas de Emissão</span>
              <span class="kpi-val" style="color: #ef4444;">${errorCount}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #3b82f6;">
              <span class="kpi-title">Total Transmitido</span>
              <span class="kpi-val" style="color: #3b82f6;">R$ ${totalAmountSum.toFixed(2)}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="text-align: left; width: 140px;">Data / Hora</th>
                <th style="text-align: center; width: 80px;">Cód. Venda</th>
                <th style="text-align: left;">Chave de Acesso</th>
                <th style="text-align: center; width: 120px;">CPF Cliente</th>
                <th style="text-align: right; width: 110px;">Valor Final</th>
                <th style="text-align: center; width: 80px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          
          <div class="footer">
            Relatório emitido através do módulo fiscal SuperPOS. Todos os direitos reservados.
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const renderFiscalReportTable = () => {
    if (fiscalReportLoading) {
      return (
        <div className="text-center py-5">
          <p className="text-muted animate-pulse">Carregando relatório fiscal...</p>
        </div>
      );
    }

    if (fiscalReports.length === 0) {
      return (
        <div className="text-center py-5 text-muted">
          Nenhuma tentativa de emissão de nota fiscal localizada no período especificado.
        </div>
      );
    }

    return (
      <div className="table-responsive" style={{ maxHeight: '550px', overflowY: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: '130px' }}>Data / Hora</th>
              <th>Cód. Venda</th>
              <th>Chave de Acesso</th>
              <th>CPF Cliente</th>
              <th>Valor (R$)</th>
              <th>Status</th>
              <th>Detalhes / Ações</th>
            </tr>
          </thead>
          <tbody>
            {fiscalReports.map((report) => (
              <tr key={report.id}>
                <td>{new Date(report.created_at).toLocaleString('pt-BR')}</td>
                <td className="font-bold">#{report.sale_id || 'Avulso'}</td>
                <td className="text-xs font-mono" style={{ fontSize: '11px' }}>
                  {report.chave_acesso ? (
                    <span title={report.chave_acesso}>
                      {report.chave_acesso.substring(0, 8)}...{report.chave_acesso.substring(36)}
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td>{report.cpf_customer || <span className="text-muted">Não Identificado</span>}</td>
                <td className="font-bold">R$ {report.final_amount.toFixed(2)}</td>
                <td>
                  {report.status === 'success' ? (
                    <span className="badge badge-success" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      Sucesso
                    </span>
                  ) : (
                    <span className="badge badge-danger" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      Erro
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {report.status === 'success' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewingInvoice(report)}
                          className="btn btn-secondary text-xs font-bold"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          Visualizar XML
                        </button>
                        {report.chave_acesso && (
                          <a
                            href={`https://nfce.sefaz.pe.gov.br/nfce/consulta?chNFe=${report.chave_acesso}&versao=100&tpAmb=2`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary text-xs font-bold text-center"
                            style={{ padding: '4px 8px', fontSize: '11px', textDecoration: 'none' }}
                          >
                            SEFAZ PE
                          </a>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreviewingInvoice(report)}
                        className="btn btn-secondary text-xs font-bold"
                        style={{ padding: '4px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        Ver Motivo do Erro
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="fiscal-report-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Filtros de busca */}
      <div className="glass-card p-4">
        <h3 className="panel-title mb-4 flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.15rem' }}>
          <FileText className="text-primary" size={22} />
          <span>Relatório de Notas Fiscais Emitidas (NFC-e)</span>
        </h3>

        <div className="form-row" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <span className="block text-xs text-muted mb-1 font-bold">INÍCIO DO PERÍODO *</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="input-field"
                style={{ flex: 2 }}
              />
              <input
                type="time"
                value={filterStartTime}
                onChange={(e) => setFilterStartTime(e.target.value)}
                className="input-field"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <span className="block text-xs text-muted mb-1 font-bold">FIM DO PERÍODO *</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="input-field"
                style={{ flex: 2 }}
              />
              <input
                type="time"
                value={filterEndTime}
                onChange={(e) => setFilterEndTime(e.target.value)}
                className="input-field"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="form-group" style={{ flex: '0 0 150px' }}>
            <label htmlFor="fiscal-status-select" className="block text-xs text-muted mb-1 font-bold">STATUS DA NOTA</label>
            <select
              id="fiscal-status-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field select-field"
            >
              <option value="all">Todos</option>
              <option value="success">Sucesso (Autorizadas)</option>
              <option value="error">Erros (Contingência)</option>
            </select>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={fetchFiscalReport}
              className="btn btn-primary font-bold py-2 px-4"
              style={{ height: '42px' }}
            >
              Buscar Relatório
            </button>
            <button
              type="button"
              onClick={() => {
                const url = api.exportFiscalXmlsUrl({
                  startDate: filterStartDate,
                  startTime: filterStartTime,
                  endDate: filterEndDate,
                  endTime: filterEndTime
                });
                globalThis.location.href = url;
                toast.success("Iniciando exportação de XMLs para o contador...");
              }}
              className="btn btn-secondary font-bold py-2 px-4 flex-center gap-2"
              style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <DownloadCloud size={16} />
              Exportar XMLs (ZIP)
            </button>
          </div>
        </div>
      </div>

      {/* Resultados da busca */}
      <div className="glass-card p-4">
        <div className="flex-between mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 className="font-semibold text-sm" style={{ margin: 0 }}>Resultados da Busca ({fiscalReports.length} registros)</h4>
          <button
            type="button"
            onClick={handleDownloadFiscalReportPDF}
            className="btn btn-secondary flex-center gap-2"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px' }}
          >
            <FileText size={14} />
            Exportar PDF
          </button>
        </div>
        {renderFiscalReportTable()}
      </div>

      {/* Modal para visualizar conteúdo do XML transmitido */}
      {previewingInvoice && (
        <div className="modal-backdrop" style={{ zIndex: 999 }}>
          <div className="glass-card modal-content animate-slide-up" style={{ maxWidth: '700px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                {previewingInvoice.status === 'success'
                  ? `XML da NFC-e - Venda #${previewingInvoice.sale_id || 'Avulso'}`
                  : `Erro de Emissão Fiscal - Venda #${previewingInvoice.sale_id || 'Avulso'}`
                }
              </h3>
              <button className="btn-icon" onClick={() => setPreviewingInvoice(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '480px', overflowY: 'auto', padding: '16px' }}>
              {previewingInvoice.status === 'success' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="grid grid-cols-2 gap-3 p-3 rounded" style={{ background: 'rgba(255,255,255,0.03)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <span className="block text-xs text-muted">CHAVE DE ACESSO:</span>
                      <strong className="text-sm font-mono break-all">{previewingInvoice.chave_acesso}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-muted">PROTOCOLO DE AUTORIZAÇÃO:</span>
                      <strong className="text-sm">{previewingInvoice.protocolo}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-muted">VALOR FINAL DA NOTA:</span>
                      <strong className="text-sm text-primary">R$ {previewingInvoice.final_amount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-muted">DATA DE EMISSÃO:</span>
                      <strong className="text-sm">{new Date(previewingInvoice.created_at).toLocaleString('pt-BR')}</strong>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="block text-xs text-muted font-bold">CONTEÚDO DO XML TRANSMITIDO</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(previewingInvoice.xml_completo || '');
                          toast.success("XML copiado para a área de transferência!");
                        }}
                        className="btn btn-secondary text-xs"
                        style={{ padding: '2px 8px' }}
                      >
                        Copiar XML
                      </button>
                    </div>
                    <pre
                      className="p-3 rounded font-mono text-xs overflow-auto bg-black text-green-400"
                      style={{
                        maxHeight: '220px',
                        overflow: 'auto',
                        backgroundColor: '#050505',
                        color: '#4ade80',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid #222',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                      }}
                    >
                      {previewingInvoice.xml_completo}
                    </pre>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="p-3 rounded border border-red-500/20" style={{ background: 'rgba(239, 68, 68, 0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="block text-xs text-red-400 font-bold">MENSAGEM DE REJEIÇÃO DA SEFAZ:</span>
                    <strong className="text-md text-red-500">{previewingInvoice.erro_mensagem}</strong>
                  </div>

                  <div className="p-3 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <h5 className="font-bold text-sm mb-2">Orientações de Contingência:</h5>
                    <p className="text-xs text-muted" style={{ lineHeight: '1.5' }}>
                      Esta nota fiscal não pôde ser transmitida com sucesso para os servidores da SEFAZ PE devido à rejeição detalhada acima.
                      <br /><br />
                      <strong>Comportamento do Ponto de Venda (PDV):</strong>
                      <br />
                      Para não interromper as vendas, o PDV imprimiu automaticamente um recibo não-fiscal para o cliente. As vendas foram gravadas no banco de dados local. Você pode ajustar as tributações do produto rejeitado no cadastro de produtos e tentar emitir cupons futuros normalmente.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setPreviewingInvoice(null)}>
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
