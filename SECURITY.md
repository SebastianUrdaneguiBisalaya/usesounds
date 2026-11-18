# Security

## Reporting vulnerabilities

Email **sebasurdanegui@gmail.com** only. Do not open public GitHub issues for security bugs.

Please include:

- The affected package (`@usesounds/core` or `@usesounds/react`) and version
- Steps to reproduce (a minimal snippet is ideal)
- Impact (what an attacker could do)
- Whether the issue is already public

We will acknowledge your report and work on a fix. Please do not file a public issue for unfixed vulnerabilities.

## Other contact

- General support: **sebasurdanegui@gmail.com**
- Maintainer: **sebasurdanegui@gmail.com**

## Scope

This policy covers the npm packages published from **this repository**:

- `@usesounds/core`
- `@usesounds/react`

Examples of in-scope issues:

- Code in the packages that runs unexpected script or touches the DOM beyond the documented `data-sound` listener
- Network requests made by the library other than fetching sample URLs the consumer provides
- A compromised or tampered published package (e.g. contents that don't match this repository)

Out of scope:

- Sample URLs, audio files, or Content Security Policy (`connect-src`) configured by the consuming app
- Browser or Electron bugs in the Web Audio API itself
- Browser autoplay policies preventing sounds from playing (this is expected behavior, not a vulnerability)
- Vulnerabilities in the consuming app's own dependencies (both packages have zero runtime dependencies; `react` is a peer dependency)

## Supported versions

Security fixes are released for the latest published version of each package. Older versions are not patched; please upgrade.

There is no bug bounty program at this time.
