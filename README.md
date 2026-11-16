# Minhas Contas (versão local)

Planilha de contas pessoais em HTML, CSS e JavaScript puros. Os dados ficam salvos **no próprio navegador** (localStorage): não há login, servidor nem banco de dados.

## Como usar

- **No computador:** abra o `index.html` com dois cliques.
- **No GitHub Pages:** envie os arquivos mantendo as pastas `css/` e `js/` e ative em *Settings → Pages*.

## Estrutura

```
index.html       → página
css/style.css    → visual (inclui os ajustes para celular no final)
js/app.js        → lógica: contas, metas, filtros, gráficos e salvamento
```

## Importante sobre o salvamento

- Os dados ficam **só no navegador e aparelho** onde você usa. Celular e computador não compartilham dados.
- Limpar os dados de navegação, usar aba anônima ou trocar de navegador faz você **perder os dados**.
- Por isso, faça backup de vez em quando: botão **⋯ → Baixar backup (.json)**. Para recuperar ou passar para outro aparelho, use **⋯ → Restaurar backup…**.
