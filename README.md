# Moonbeam / Moonriver Collator Offboarding

A single-page app to offboard a collator on Moonbeam, Moonriver, or Moonbase Alpha
using an **Ethereum wallet** (MetaMask / any injected wallet). Each action calls
the Moonbeam staking and author-mapping precompiles — either **directly** from the
connected wallet, or wrapped in the **proxy precompile**
(`proxy.proxy(real, callTo, callData)`) to act on behalf of a **Real account**.

## What it does

Toggle **“Execute via proxy”** next to the account field (default **off**):

- **Off (default)** — the connected wallet acts on itself; calls go straight to
  the precompiles (no wrapping).
- **On** — enter the **Real account** (the collator you hold proxy rights for);
  every action is wrapped in `proxy.proxy` and dispatched on its behalf.

Every parameter other than the account is read on-chain automatically, and each
step is gated on live on-chain state:

| # | Operation | Precompile call | Gated on |
|---|-----------|-----------------|----------|
| 1 | Schedule leave candidates | Staking `scheduleLeaveCandidates(candidateCount)` | `isCandidate` — disabled if the account isn't a candidate |
| 2 | Execute leave candidates | Staking `executeLeaveCandidates(account, delegationCount)` | live round status — disabled until the exit round is reached (see below) |
| 3 | Remove author mapping keys | AuthorMapping `removeKeys()` | `nimbusIdOf` — disabled if the account has no author-mapping keys |

The status panel shows the account's `isCandidate`, author-mapping keys, free
balance, candidate/delegation counts, and Nimbus ID.

### Live round-status gate on “execute leave”

The EVM staking precompile exposes `round()` but **not** the round at which a
scheduled exit becomes executable. So the app reads Substrate over WSS — a live
subscription to `parachainStaking.candidateInfo(collator).status` (which is
`Leaving(round)` once a leave is scheduled), `parachainStaking.round()`, and new
block heads — via a lazily-loaded `@polkadot/api` (read-only, no signing). It
computes the executable block (`roundFirst + (leavingRound − currentRound) ×
roundLength`) and shows a **live countdown** (~6s block time), updating every
block. “Execute leave” stays disabled until `currentRound ≥ leavingRound`, so you
can't broadcast a transaction that would revert. If the subscription fails, the
button is re-enabled and the on-chain call is allowed to arbitrate.

### Why there is no balance-transfer step

A native balance sweep from the Real account is intentionally **not** included.
The proxy precompile rejects calls to the ERC-20 precompile (`CallFiltered` — only
Governance / Staking / AuthorMapping precompiles are permitted targets), and its
only allowed value movement is a native transfer whose amount rides as `msg.value`.
The EVM moves that `msg.value` from the *connected wallet* at call entry (the
precompile then refunds it), so a single transfer is capped at the delegate's own
balance and cannot sweep the Real account. To move the Real account's full balance
with the delegate paying only fees, use Substrate instead — Polkadot.js
`proxy.proxy(real, balances.transferAll(dest, false))`.

## Precompile addresses (all networks)

- Proxy: `0x000000000000000000000000000000000000080b`
- Staking: `0x0000000000000000000000000000000000000800`
- Author Mapping: `0x0000000000000000000000000000000000000807`
- ERC-20 (native token, used only to read the Real account's balance): `0x0000000000000000000000000000000000000802`

## Prerequisites

In **proxy mode**, your connected wallet must already be registered as a proxy of
the Real account. Proxy type `Any` covers everything; otherwise use `Staking`
(leave-candidates steps) and `AuthorMapping` (removeKeys). Register the proxy via
Polkadot.js or the proxy precompile's `addProxy`. With proxy mode **off**, no proxy
is needed — the connected wallet acts as the collator directly.

## Run

```bash
pnpm install
pnpm run dev      # http://localhost:5173
pnpm run build    # production build in dist/
pnpm run preview  # serve the production build locally
```

> Build-script approvals live in `pnpm-workspace.yaml` (`allowBuilds`). esbuild
> must be allowed to build (it downloads a platform binary) or vite won't run;
> the other native modules are optional and silenced.

## Deploy to GitHub Pages

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that
builds with pnpm and publishes `dist/` to GitHub Pages on every push to `main`.

One-time setup after pushing the repo to GitHub:

1. **Settings → Pages → Build and deployment → Source: “GitHub Actions”.**
2. Push to `main` (or run the workflow manually from the Actions tab).

The site is served at `https://<user>.github.io/<repo>/`. The Vite `base` is set
to `./` (relative), so assets resolve correctly under that subpath — no config
change is needed for a different repo name. A `public/.nojekyll` file is included
so GitHub doesn't run Jekyll over the build output.

Everything is client-side and static — the app talks to the public Moonbeam/
Moonriver/Moonbase RPCs directly from the browser, so no server or secrets are
required.

## Stack

Vite + React + wagmi + viem. Networks: Moonbeam (1284), Moonriver (1285),
Moonbase Alpha (1287).
