# Monitor Switcher

Um aplicativo de bandeja do sistema desenvolvido em Electron para alternar facilmente entre monitores principais usando o MultiMonitorTool.

![Monitor Switcher](https://img.shields.io/badge/version-1.0.13-blue.svg)
![Electron](https://img.shields.io/badge/Electron-39.2.3-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

## 📋 Descrição

O Monitor Switcher é uma solução simples e eficiente para usuários que trabalham com múltiplos monitores e precisam alternar rapidamente entre diferentes configurações de monitor principal. Ideal para quem usa configurações específicas para jogos, reuniões ou trabalho.

## ✨ Características

- **Interface de Bandeja**: Fica discretamente na bandeja do sistema
- **Alternação Rápida**: Troca entre monitores com apenas um clique
- **Modos Predefinidos**: 
  - Modo Reunião (Monitor 2)
  - Modo Jogo (Monitor 1)
- **Notificações**: Feedback visual quando o monitor é alterado
- **Inicialização Automática**: Pode ser configurado para iniciar com o Windows
- **Configuração Flexível**: Arquivo de configuração editável
- **Ferramentas de Diagnóstico**: Listagem de monitores e teste de configuração

## 🛠️ Requisitos

- Windows 10 ou superior
- Múltiplos monitores conectados
- Node.js (para desenvolvimento)

## 📦 Instalação

### Usuário Final

1. Baixe o instalador `.exe` da versão mais recente
2. Execute o instalador e siga as instruções
3. O aplicativo será iniciado automaticamente após a instalação

### Desenvolvedor

```bash
# Clone o repositório
git clone <url-do-repositorio>

# Navegue até o diretório
cd monitor-switcher

# Instale as dependências
npm install

# Execute em modo de desenvolvimento
npm start

# Construa a aplicação
npm run build
```

## 🔧 Configuração

O arquivo `display_config.txt` permite configurar quais monitores serão usados:

```ini
# Configuração recomendada (usar números simples)
DISPLAY1=1
DISPLAY2=2

# Configuração alternativa (também funciona)
# DISPLAY1=\\.\DISPLAY1
# DISPLAY2=\\.\DISPLAY2
```

### Como descobrir o número do seu monitor:

1. Clique com o botão direito no ícone da bandeja
2. Selecione "Listar Monitores"
3. Ou use "Testar Configuração" para verificar se está funcionando

## 🎮 Como Usar

### Menu da Bandeja

- **Modo Reunião**: Define o Monitor 2 como principal
- **Modo Jogo**: Define o Monitor 1 como principal
- **Listar Monitores**: Mostra todos os monitores conectados
- **Testar Configuração**: Verifica se tudo está funcionando
- **Iniciar com Windows**: Ativa/desativa inicialização automática
- **Sair**: Encerra a aplicação

### Atalhos e Dicas

- O aplicativo permanece na bandeja mesmo quando "fechado"
- Notificações aparecem quando o monitor é alterado
- Pode ser iniciado minimizado com o Windows
- Apenas uma instância da aplicação roda por vez

## 📁 Estrutura do Projeto

```
monitor-switcher/
├── main.js                 # Arquivo principal da aplicação
├── package.json            # Configurações do projeto
├── preload.js              # Script de preload (segurança)
├── display_config.txt      # Configuração dos monitores
├── monitorswitcher.ico     # Ícone da aplicação
├── MultiMonitorTool.exe    # Ferramenta externa (NirSoft)
└── README.md              # Este arquivo
```

## 🔧 Desenvolvimento

### Scripts Disponíveis

```bash
npm start          # Inicia em modo desenvolvimento
npm run build      # Constrói a aplicação
npm run dist       # Cria distribuível
npm run pack       # Empacota sem criar instalador
```

### Tecnologias Utilizadas

- **Electron**: Framework para aplicações desktop
- **Node.js**: Runtime JavaScript
- **MultiMonitorTool**: Ferramenta da NirSoft para gerenciar monitores
- **Electron Builder**: Para criar instaladores

## 🐛 Solução de Problemas

### Monitor não alterna

1. Verifique se o `MultiMonitorTool.exe` está na pasta correta
2. Use "Listar Monitores" para verificar os IDs corretos
3. Edite o `display_config.txt` com os números corretos
4. Use "Testar Configuração" para diagnosticar problemas

### Ícone não aparece na bandeja

1. Verifique se o arquivo `monitorswitcher.ico` existe
2. Reinicie a aplicação
3. Verifique se não há outra instância rodando

### Notificações não aparecem

1. Verifique as configurações de notificação do Windows
2. Certifique-se de que o aplicativo tem permissão para notificações

## 📄 Licença

Este projeto está licenciado sob a MIT License - veja o arquivo LICENSE para detalhes.

## 🙏 Créditos

- **MultiMonitorTool**: Desenvolvido por NirSoft (https://www.nirsoft.net/)
- **Electron**: Framework mantido pela OpenJS Foundation

## 📞 Suporte

Para problemas ou sugestões:

1. Verifique a seção "Solução de Problemas" acima
2. Use a funcionalidade "Testar Configuração" para diagnóstico
3. Abra uma issue no repositório do projeto

---

**Desenvolvido por Alessandro Willian**

> 💡 **Dica**: Para uma experiência otimizada, configure os monitores uma vez e deixe o aplicativo iniciando automaticamente com o Windows!
