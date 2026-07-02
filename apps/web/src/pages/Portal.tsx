import { ShoppingCart, LayoutGrid, LogOut, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PortalProps {
  currentUser: { username: string; role: string };
  onLogout: () => void;
}

export default function Portal({ currentUser, onLogout }: PortalProps) {
  const navigate = useNavigate();

  return (
    <div className="auth-screen animate-fade-in">
      <div className="auth-card" style={{ maxWidth: '750px', width: '90%' }}>
        <header className="auth-header mb-5 text-center">
          <div className="auth-logo-icon mx-auto mb-3">
            <ShoppingCart size={32} />
          </div>
          <h2 className="auth-title">Portal de Acesso</h2>
          <p className="auth-subtitle">Olá, {currentUser.username}. Selecione o caminho de trabalho:</p>
        </header>

        <div className="grid-2col-equal" style={{ gap: '20px' }}>
          {/* Card 1: Frente de Caixa */}
          <div
            onClick={() => navigate('/pos')}
            className="glass-card cursor-pointer hover-scale p-5 text-center flex-column justify-center gap-3 transition-all duration-300"
            style={{
              border: '1px solid rgba(16, 185, 129, 0.2)',
              background: 'rgba(16, 185, 129, 0.03)',
              borderRadius: '16px'
            }}
          >
            <div className="auth-logo-icon mx-auto" style={{ background: 'linear-gradient(135deg, var(--success), #10b981)' }}>
              <ShoppingCart size={24} />
            </div>
            <h3 className="text-lg font-black text-success">FRENTE DE CAIXA (PDV)</h3>
            <p className="text-xs text-muted">Acessar terminal de vendas. Operação focada em teclado, controle de troco e fechamento de turno.</p>
            <div className="flex-center text-success font-bold text-sm mt-3 gap-1" >
              Entrar no PDV <ArrowRight size={14} />
            </div>
          </div>

          {/* Card 2: Painel Administrativo */}
          <div
            onClick={() => navigate('/admin')}
            className="glass-card cursor-pointer hover-scale p-5 text-center flex-column justify-center gap-3 transition-all duration-300"
            style={{
              border: '1px solid rgba(59, 130, 246, 0.2)',
              background: 'rgba(59, 130, 246, 0.03)',
              borderRadius: '16px'
            }}
          >
            <div className="auth-logo-icon mx-auto" style={{ background: 'linear-gradient(135deg, var(--primary), #3b82f6)' }}>
              <LayoutGrid size={24} />
            </div>
            <h3 className="text-lg font-black text-primary">PAINEL ADMINISTRATIVO</h3>
            <p className="text-xs text-muted">Controle gerencial. Relatórios de vendas, estoque, contas a pagar, cadastro de fornecedores e controle de usuários.</p>
            <div className="flex-center text-primary font-bold text-sm mt-3 gap-1">
              Gerenciar Loja <ArrowRight size={14} />
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="btn btn-secondary w-full py-2.5 mt-5 flex-center gap-2"
          style={{ marginTop: '20px' }}
        >
          <LogOut size={16} />
          Sair da Conta
        </button>
      </div>
    </div>
  );
}
