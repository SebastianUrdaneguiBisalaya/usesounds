# Changesets

This folder holds pending release notes for the packages in `packages/*`, managed by [changesets](https://github.com/changesets/changesets).

- Add one with `bun run changeset` in any pull request that changes a package's behavior or public API.
- The maintainer turns them into version bumps and `CHANGELOG.md` entries with `bun run version-packages`.

See the release steps in [AGENTS.md](../AGENTS.md) (sections 3 and 4).
