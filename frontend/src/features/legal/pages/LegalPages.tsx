import { Link } from 'react-router-dom';
import { GameLogo } from '../../../components/brand/GameLogo';
import '../styles/legal.css';

const LAST_UPDATED = '20 de agosto de 2026';

function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link to="/" aria-label="Voltar para Dead Idle">
          <GameLogo />
        </Link>
        <Link className="legal-back" to="/">
          Voltar
        </Link>
      </header>
      <article className="legal-document">
        <h1>{title}</h1>
        <p className="legal-updated">Versao 2026-08-20. Atualizado em {LAST_UPDATED}.</p>
        {children}
      </article>
    </main>
  );
}
export function TermsPage() {
  return (
    <LegalLayout title="Termos de Uso">
      <section>
        <h2>1. Objeto e elegibilidade</h2>
        <p>
          Estes termos regem o acesso ao Dead Idle, um jogo online em
          desenvolvimento. O usuario declara ter capacidade legal para criar a
          conta ou autorizacao de seu responsavel.
        </p>
      </section>
      <section>
        <h2>2. Conta e seguranca</h2>
        <p>
          O usuario e responsavel por dados corretos, pela confidencialidade da
          senha e pelas atividades realizadas em sua conta. Contas nao podem ser
          vendidas, cedidas, automatizadas ou compartilhadas para obter vantagem.
        </p>
      </section>
      <section>
        <h2>3. Conduta e integridade do jogo</h2>
        <p>
          Sao proibidos fraude, exploracao intencional de falhas, assedio,
          engenharia reversa indevida, interferencia na infraestrutura e uso de
          ferramentas que alterem a progressao. Medidas podem incluir reversao de
          ganhos, suspensao ou encerramento da conta.
        </p>
      </section>
      <section>
        <h2>4. Conteudo, disponibilidade e alteracoes</h2>
        <p>
          Balanceamento, itens, progresso e funcionalidades podem mudar durante o
          desenvolvimento. Manutencoes e incidentes podem afetar a disponibilidade.
          Nao ha garantia de permanencia de conteudo experimental.
        </p>
      </section>
      <section>
        <h2>5. Compras e Premium</h2>
        <p>
          Recursos pagos somente serao cobrados quando um fluxo de compra indicar
          claramente preco, duracao e condicoes. Beneficios nao concedem propriedade
          sobre a conta nem sobre ativos virtuais.
        </p>
      </section>
      <section>
        <h2>6. Encerramento e contato</h2>
        <p>
          O usuario pode solicitar exclusao da conta. A operadora pode limitar o
          acesso para proteger jogadores e servicos. Questoes devem ser encaminhadas
          pelo canal de suporte informado dentro do jogo.
        </p>
      </section>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Politica de Privacidade">
      <section>
        <h2>1. Dados tratados</h2>
        <p>
          Tratamos e-mail, identificadores de conta e personagem, progresso,
          configuracoes, eventos de seguranca, endereco IP, agente do navegador e
          registros tecnicos necessarios para operar o jogo.
        </p>
      </section>
      <section>
        <h2>2. Finalidades e bases</h2>
        <p>
          Os dados sao usados para autenticar, manter progresso, prevenir fraude,
          prestar suporte, cumprir obrigacoes legais e melhorar estabilidade e
          balanceamento. O tratamento observa execucao do servico, interesse
          legitimo, consentimento quando aplicavel e obrigacao legal.
        </p>
      </section>
      <section>
        <h2>3. Compartilhamento e armazenamento</h2>
        <p>
          Fornecedores de hospedagem, banco, e-mail e monitoramento podem processar
          dados sob contrato e apenas para prestar seus servicos. Nao vendemos dados
          pessoais. Aplicamos controles de acesso, criptografia em transito, backups
          e registros de auditoria.
        </p>
      </section>
      <section>
        <h2>4. Retencao e direitos</h2>
        <p>
          Mantemos dados pelo tempo necessario ao servico, seguranca e obrigacoes
          legais. O titular pode pedir confirmacao, acesso, correcao, portabilidade,
          oposicao ou exclusao, observadas as excecoes legais e antifraude.
        </p>
      </section>
      <section>
        <h2>5. Contato e atualizacoes</h2>
        <p>
          Solicitacoes de privacidade devem usar o canal de suporte do jogo. Mudancas
          relevantes nesta politica serao apresentadas com nova versao e, quando
          necessario, novo aceite.
        </p>
      </section>
    </LegalLayout>
  );
}
