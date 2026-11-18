# Publishing to npm

Publishing is not a local command. You create a **GitHub Release**, and the `publish.yml` workflow publishes the packages. Before the first release, you need to do some one-time setup. At the time of writing, the repository is public (required for `--provenance`), neither package exists on npm yet, and the repository does not have the `NPM_TOKEN` secret.

## 1. One-time setup

1. **Create the `@usesounds` scope on npm.** Sign in to npmjs.com and create a free organization named `usesounds` (avatar → *Add Organization*). Without it, publishing `@usesounds/*` fails. If the name is already taken, the packages' scope has to change.
2. **Enable 2FA** on your npm account.
3. **Create the token.** Go to *Access Tokens* → *Generate New Token* → **Granular Access Token**:
   - Permissions: *Read and write*, on the `usesounds` organization.
   - Check the **bypass 2FA** option. Without it, CI can't publish because it can't enter an OTP code.
   - Set an expiration date and write it down, because you'll have to renew the token when it expires.

   AGENTS.md mentions an *Automation* token. npm has been retiring classic tokens, so if you no longer see that option, use the granular one.
4. **Store the token in GitHub.** Go to *Settings → Secrets and variables → Actions → New repository secret*, named `NPM_TOKEN`. You can also run this in your terminal:
   ```bash
   gh secret set NPM_TOKEN
   ```
   That way you paste the token without it ending up in your shell history.

## 2. Local verification before the first release (recommended)

```bash
git checkout main && git pull
bun install
bun run build && bun run check:package
cd packages/core  && bun pm pack
cd ../react       && bun pm pack
```

Then, in a separate React project (ideally a Next.js App Router one), install both `.tgz` files:

```bash
bun add ./path/usesounds-core-0.1.0.tgz ./path/usesounds-react-0.1.0.tgz
```

Check that `import`, `require`, the types in the editor and an SSR page all work. Then delete the `.tgz` files and `dist/`.

## 3. Publish (0.1.0)

Both packages are already at `0.1.0` and there are no pending changesets, so there's no version to bump. Just create the Release from `main`:

```bash
gh release create v0.1.0 --target main --title "v0.1.0" --notes "Initial release of @usesounds/core and @usesounds/react."
```

You can also do it on GitHub under *Releases → Draft a new release*. When the Release is published:

1. The workflow runs typecheck → lint → test → build → `check:package`.
2. It publishes `@usesounds/core` and then `@usesounds/react`, with provenance.

To follow its progress:

```bash
gh run watch
```

To check that both packages were published:

```bash
npm view @usesounds/core version
npm view @usesounds/react version
```

If something fails partway through, you can re-run the workflow: it skips packages whose version is already on npm.

## 4. Later releases

1. In every PR that changes a package, run `bun run changeset` and commit the file it generates.
2. When you want to cut a release, on a branch run `bun run version-packages`, review the changes, open a PR titled `chore(release): version packages`, and merge it.
3. Create a Release from `main`, with a tag such as `@usesounds/core@0.2.0` or `v0.2.0`. The workflow publishes only the packages that have a new version.

A warning: a version published to npm can't be published again, and unpublishing it has restrictions. That's why it's worth doing the verification in step 2 before the first release.
