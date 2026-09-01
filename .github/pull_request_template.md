## O que muda

<!-- Uma linha por mudança relevante, do ponto de vista de quem usa o app. -->

## Checklist

- [ ] A PR aponta para a `dev` (a `main` só recebe o merge da `dev`)
- [ ] `npm run check` passa (typecheck, lint, formatação, testes e `patchnotes.json`)
- [ ] `npm run test:e2e` passa, se a mudança pega na UI
- [ ] `patchnotes.json` atualizado, se muda algo visível para quem usa
- [ ] `version` do `package.json` subido, se esta PR fecha uma versão
