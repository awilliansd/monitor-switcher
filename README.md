Monitor Switcher - Electron
Aplicativo de bandeja do sistema para alternar entre monitores principais usando o MultiMonitorTool.exe.

Funcionalidades
Modo Reunião: Define o segundo monitor como principal
Modo Jogo: Define o primeiro monitor como principal
Ícone na bandeja: Aplicativo fica minimizado na bandeja do sistema
Notificações: Mostra notificações quando o modo é alterado
Requisitos
Node.js (versão 16 ou superior)
Windows (devido à dependência do MultiMonitorTool.exe)
MultiMonitorTool.exe (deve estar na mesma pasta do aplicativo)
Instalação
Clone ou baixe o projeto
Instale as dependências:
bash
npm install
Configuração
Arquivo display_config.txt
Crie um arquivo display_config.txt com as configurações dos seus monitores:

DISPLAY1=1
DISPLAY2=2
Formato simples (recomendado):

Use números simples: 1, 2, 3, etc.
Corresponde à ordem dos monitores no sistema
Formato alternativo (compatível):

DISPLAY1=\\.\DISPLAY1
DISPLAY2=\\.\DISPLAY2
Para descobrir qual número usar:

Teste manualmente no prompt de comando:
cmd
MultiMonitorTool.exe /SetPrimary 1
MultiMonitorTool.exe /SetPrimary 2
Ou execute o MultiMonitorTool.exe e veja a ordem dos monitores
Arquivo de Ícone
Coloque o arquivo monitorswitcher.ico na pasta raiz do projeto. Se não tiver o ícone, o aplicativo funcionará com um ícone padrão.

Execução
Modo Desenvolvimento
bash
npm start
Compilação para Produção
bash
npm run build
Isso criará um instalador na pasta dist/.

Estrutura de Arquivos
monitor-switcher-electron/
├── main.js                 # Processo principal do Electron
├── preload.js              # Script de preload (opcional)
├── package.json            # Configurações do projeto
├── display_config.txt      # Configuração dos monitores
├── MultiMonitorTool.exe    # Ferramenta para alternar monitores
├── monitorswitcher.ico     # Ícone do aplicativo
└── README.md              # Este arquivo
Uso
Execute o aplicativo
Procure o ícone na bandeja do sistema (próximo ao relógio)
Clique com o botão direito no ícone para ver as opções:
Modo Reunião: Para videoconferências
Modo Jogo: Para jogos
Sair: Para fechar o aplicativo
Diferenças em Relação ao Windows Forms
Vantagens do Electron:
Multiplataforma: Pode ser adaptado para Linux e macOS
Interface moderna: Possibilidade de criar UIs com HTML/CSS/JS
Atualizações automáticas: Facilita distribuição de atualizações
Comunidade ativa: Muitos recursos e plugins disponíveis
Considerações:
Tamanho: Aplicativo Electron é maior que Windows Forms
Recursos: Consome mais memória que aplicativo nativo
Compatibilidade: MultiMonitorTool.exe ainda é necessário no Windows
Personalização
Adicionando Novos Modos
Para adicionar novos modos, edite o arquivo main.js na seção createTray():

javascript
const contextMenu = Menu.buildFromTemplate([
    {
        label: 'Modo Reunião',
        click: () => this.setPrimary(this.display2, 'Modo Reunião')
    },
    {
        label: 'Modo Jogo',
        click: () => this.setPrimary(this.display1, 'Modo Jogo')
    },
    // Adicione novos modos aqui
    {
        label: 'Modo Trabalho',
        click: () => this.setPrimary(this.display1, 'Modo Trabalho')
    },
    { type: 'separator' },
    {
        label: 'Sair',
        click: () => app.quit()
    }
]);
Mudando Ícones
Substitua o arquivo monitorswitcher.ico por um ícone de sua preferência.

Solução de Problemas
Aplicativo não inicia
Verifique se o MultiMonitorTool.exe está na pasta
Verifique se o display_config.txt existe e está configurado corretamente
Monitores não alternam
Confirme os IDs dos monitores no arquivo de configuração
Execute o MultiMonitorTool.exe manualmente para testar
Notificações não aparecem
Verifique se as notificações estão habilitadas no Windows
Algumas versões do Windows podem bloquear notificações
Suporte
Este é um projeto de exemplo. Para problemas específicos do MultiMonitorTool.exe, consulte a documentação oficial da ferramenta.