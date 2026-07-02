import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { Database, FileText, History, DownloadCloud, Plus, RefreshCw, User, Trash2 } from 'lucide-react';

/**
 * Componente de Configurações de Backup e Restauração
 * Permite que o administrador gerencie cópias de segurança do banco de dados SQLite.
 */
export default function BackupSettings() {
  // Lista de arquivos de backup locais
  const [backups, setBackups] = useState<any[]>([]);
  // Estados de carregamento
  const [backupLoading, setBackupLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);

  // Obtém o usuário atualmente logado para auditoria
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Busca a lista de backups disponíveis no servidor Express
  const fetchBackupList = async () => {
    setBackupLoading(true);
    try {
      const res = await api.getBackupList();
      setBackups(res);
    } catch (e: any) {
      toast.error('Erro ao carregar backups: ' + e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  // Carrega os backups ao montar o componente
  useEffect(() => {
    fetchBackupList();
  }, []);

  // Cria um novo backup manual no servidor
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await api.createBackup(currentUser.username);
      if (res.success) {
        toast.success(`Backup criado com sucesso: ${res.filename}`);
        fetchBackupList();
      }
    } catch (e: any) {
      toast.error('Erro ao criar backup: ' + e.message);
    } finally {
      setCreatingBackup(false);
    }
  };

  // Exclui um arquivo de backup permanentemente
  const handleDeleteBackupFile = async (filename: string) => {
    const confirm = await confirmService.show({
      title: 'Excluir Backup',
      message: `Tem certeza que deseja excluir permanentemente o arquivo de backup "${filename}"?`,
      type: 'warning'
    });
    if (!confirm) return;

    try {
      const res = await api.deleteBackup(filename, currentUser.username);
      if (res.success) {
        toast.success('Arquivo de backup excluído com sucesso!');
        fetchBackupList();
      }
    } catch (e: any) {
      toast.error('Erro ao excluir backup: ' + e.message);
    }
  };

  // Restaura o banco de dados para um ponto anterior a partir de um arquivo local
  const handleRestoreBackupFile = async (filename: string) => {
    const confirm = await confirmService.show({
      title: 'Restaurar Sistema',
      message: `CUIDADO:\n\nIsso irá substituir TODOS os dados do sistema atual (produtos, vendas, clientes, etc.) pelos dados contidos no backup "${filename}".\n\nO sistema fará um backup de segurança do estado atual automaticamente antes de restaurar. Deseja prosseguir?`,
      confirmText: 'Restaurar Agora',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    if (!confirm) return;

    setRestoringBackup(true);
    try {
      const res = await api.restoreBackup(filename, currentUser.username);
      if (res.success) {
        toast.success('Banco de dados restaurado com sucesso! Atualizando tela...');
        setTimeout(() => {
          globalThis.location.reload();
        }, 1500);
      }
    } catch (e: any) {
      toast.error('Erro ao restaurar backup: ' + e.message);
      setRestoringBackup(false);
    }
  };

  // Faz o upload de um arquivo de backup (.db) do computador e restaura
  const handleFileUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Garante que o arquivo seja um banco SQLite (.db)
    if (!file.name.endsWith('.db')) {
      toast.error('Por favor, selecione um arquivo de banco de dados SQLite válido (.db).');
      return;
    }

    const confirm = await confirmService.show({
      title: 'Enviar e Restaurar Backup',
      message: `CUIDADO:\n\nVocê está enviando o arquivo "${file.name}" para restaurar o sistema.\n\nIsso irá substituir TODOS os dados do sistema atual pelos dados contidos no arquivo enviado.\n\nO sistema fará um backup de segurança automático do estado atual antes da restauração. Deseja prosseguir?`,
      confirmText: 'Enviar & Restaurar',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    if (!confirm) {
      e.target.value = ''; // Reseta o input de arquivo
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      setRestoringBackup(true);
      try {
        const base64 = (event.target?.result as string).split(',')[1];
        const res = await api.uploadRestoreBackup(base64, file.name, currentUser.username);
        if (res.success) {
          toast.success('Banco de dados enviado e restaurado com sucesso! Atualizando tela...');
          setTimeout(() => {
            globalThis.location.reload();
          }, 1500);
        }
      } catch (err: any) {
        toast.error('Erro ao enviar e restaurar backup: ' + err.message);
        setRestoringBackup(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const lastAutomaticBackup = backups.find(b => b.type === 'Automático');

  const renderBackupContent = () => {
    if (backupLoading) {
      return (
        <div className="text-center py-5">
          <p className="text-muted animate-pulse">Carregando lista de backups...</p>
        </div>
      );
    }

    if (backups.length === 0) {
      return (
        <div className="text-center py-5 text-muted">
          Nenhum arquivo de backup localizado na pasta backups/.
        </div>
      );
    }

    return (
      <div className="table-responsive" style={{ maxHeight: '550px', overflowY: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '60px', textAlign: 'center' }}>Tipo</th>
              <th>Identificação / Arquivo</th>
              <th>Tamanho</th>
              <th>Data de Criação</th>
              <th style={{ textAlign: 'center', width: '220px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.filename}>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ 
                    display: 'inline-flex', 
                    padding: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: backup.type === 'Automático' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                    color: backup.type === 'Automático' ? 'var(--primary)' : '#8b5cf6'
                  }}>
                    {backup.type === 'Automático' ? <History size={14} /> : <User size={14} />}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="font-bold text-sm" style={{ fontFamily: 'monospace' }}>{backup.filename}</span>
                    <span className="text-xs text-muted">Local: /backups/{backup.filename}</span>
                  </div>
                </td>
                <td className="font-mono text-xs">{(backup.size / (1024 * 1024)).toFixed(2)} MB</td>
                <td>{new Date(backup.created_at).toLocaleString('pt-BR')}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                        toast.success('Download do backup iniciado!');
                        const a = document.createElement('a');
                        a.href = `${API_URL}/api/backup/download/${backup.filename}`;
                        a.download = backup.filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}
                      className="btn btn-secondary btn-icon-only"
                      title="Baixar Cópia (.db)"
                      style={{ padding: '6px 8px' }}
                    >
                      <DownloadCloud size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestoreBackupFile(backup.filename)}
                      className="btn btn-primary flex-center gap-1"
                      title="Restaurar Banco de Dados"
                      style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold' }}
                    >
                      <RefreshCw size={12} />
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBackupFile(backup.filename)}
                      className="btn btn-secondary btn-icon-only"
                      title="Excluir Cópia"
                      style={{ padding: '6px 8px', color: '#ef4444', borderColor: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
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
    <div className="backup-tab animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Overlay de carregamento para a restauração física do SQLite */}
      {restoringBackup && (
        <div className="modal-backdrop" style={{ zIndex: 9999, backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
          <div className="spin text-primary" style={{ animation: 'spin 2s linear infinite' }}>
            <RefreshCw size={48} />
          </div>
          <h3 style={{ color: '#fff', margin: 0, fontWeight: 700 }}>Restaurando Banco de Dados...</h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', textAlign: 'center' }}>
            Substituindo dados atuais e reiniciando a conexão física com o SQLite.
            <br />
            Por favor, <strong>não feche ou recarregue esta janela</strong>.
          </p>
        </div>
      )}

      {/* Cartões de métricas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="glass-card p-4 flex-between" style={{ borderLeft: '4px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="block text-xs text-muted mb-1 font-bold">TOTAL DE BACKUPS</span>
            <span className="text-2xl font-bold font-mono">{backups.length}</span>
          </div>
          <Database size={32} className="text-primary/20" style={{ opacity: 0.2, color: 'var(--primary)' }} />
        </div>

        <div className="glass-card p-4 flex-between" style={{ borderLeft: '4px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="block text-xs text-muted mb-1 font-bold">ESPAÇO UTILIZADO</span>
            <span className="text-2xl font-bold font-mono">
              {(backups.reduce((sum, b) => sum + b.size, 0) / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>
          <FileText size={32} className="text-success/20" style={{ opacity: 0.2, color: '#10b981' }} />
        </div>

        <div className="glass-card p-4 flex-between" style={{ borderLeft: '4px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="block text-xs text-muted mb-1 font-bold">ÚLTIMO PONTO AUTOMÁTICO</span>
            <span className="text-sm font-bold block mt-1" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lastAutomaticBackup 
                ? new Date(lastAutomaticBackup.created_at).toLocaleString('pt-BR')
                : 'Nenhum'
              }
            </span>
          </div>
          <History size={32} className="text-warning/20" style={{ opacity: 0.2, color: '#f59e0b' }} />
        </div>
      </div>

      {/* Painel de ações rápidas */}
      <div className="glass-card p-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 className="panel-title" style={{ fontSize: '1.1rem', margin: '0 0 4px 0' }}>Pontos de Restauração</h3>
          <p className="text-muted text-xs" style={{ margin: 0 }}>
            O SuperPOS faz cópias automáticas a cada inicialização e diariamente. Você também pode forçar backups manuais.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label 
            className="btn btn-secondary flex-center gap-2" 
            style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <DownloadCloud size={16} />
            Enviar Banco (.db)
            <input 
              type="file" 
              accept=".db" 
              onChange={handleFileUploadRestore} 
              style={{ display: 'none' }} 
            />
          </label>

          <button 
            type="button" 
            onClick={handleCreateBackup} 
            disabled={creatingBackup}
            className="btn btn-primary flex-center gap-2"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {creatingBackup ? (
              <>
                <RefreshCw size={16} className="spin" />
                Gerando Cópia...
              </>
            ) : (
              <>
                <Plus size={16} />
                Novo Backup Manual
              </>
            )}
          </button>
        </div>
      </div>

      {/* Lista de backups disponíveis */}
      <div className="glass-card p-4">
        {renderBackupContent()}
      </div>
    </div>
  );
}
