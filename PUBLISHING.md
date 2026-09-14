# Publication instructions

This repository is prepared as a private portfolio copy under `saifmourzik3-droid/ai-operations-cockpit`. Its source history starts from a new root commit; no original branch, tag or commit is included. Original repositories and original local checkouts must remain unchanged.

## Updating this private copy

Run the documented tests and `npm run check` first. If you add files, stage them before the release check so it inspects the complete intended release. Review the staged diff. Never stage runtime credentials, recordings, private data or production configuration.

```sh
git status --short
git diff --cached
git push origin main
```

## Public release — only after separate owner approval

Review README claims, publication rights, tracked files, new history and any future GitHub issues, Actions logs or attachments. Re-run dependency checks where applicable. Public visibility makes repository content accessible to everyone; it does not deploy a live application.

The following command is documentation only and has **not** been run:

```sh
gh repo edit saifmourzik3-droid/ai-operations-cockpit --visibility public --accept-visibility-change-consequences
```

Apply it only to this new portfolio repository after explicit approval. Never apply it to an original repository.
