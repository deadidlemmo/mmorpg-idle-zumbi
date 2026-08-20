# Limpeza do historico Git

Os assets atuais foram convertidos para WebP, mas os PNGs antigos continuam nos
objetos historicos do Git. Remover esses objetos muda todos os hashes afetados e
exige `force-push` e novo clone de todos os colaboradores.

## Auditoria sem alteracao

Execute na raiz:

```powershell
.\scripts\audit-git-history.ps1 -Limit 40 -MinimumSizeMb 5
```

## Procedimento de reescrita

So execute em janela de manutencao e com aprovacao explicita do responsavel pelo
repositorio remoto.

1. Bloqueie merges e pushes temporariamente.
2. Crie um clone espelho e uma copia offline desse clone.
3. Instale `git-filter-repo` no ambiente isolado.
4. Gere uma lista revisada dos caminhos ou um limite de tamanho para remocao.
5. Rode `git filter-repo` no clone espelho.
6. Verifique branches, tags, build e os hashes dos assets atuais.
7. Publique branches e tags reescritas apenas com autorizacao:

```bash
git push --force-with-lease --all
git push --force-with-lease --tags
```

8. Invalide clones antigos e oriente todos a clonar novamente.

Nao rode a reescrita diretamente neste working tree. O `--force-with-lease`
reduz o risco de sobrescrever alteracoes remotas novas, mas nao elimina o impacto
da troca de hashes.
