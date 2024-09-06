# Squads Jito Vault Initialization

This script initializes a Jito Vault Program through the Squads multisig SDK. It sets up the vault configuration and performs the initialization process.

## Prerequisites

- Node.js (v18 or later recommended)
- npm or yarn

## Installation

1. Clone the repository:
`git clone https://github.com/your-username/squads-jito-vault-init.git cd squads-jito-vault-init`


2. Install dependencies:
`yarn install`


## Configuration

Before running the script, make sure to:

1. Replace the relevant vault args in `src/index.ts`:
- `DEPOSIT_FEE_BPS`
- `WITHDRAWAL_FEE_BPS`
- `REWARD_FEE_BPS`
- `DECIMALS`

## Usage

Run the script using:
`yarn start -- [options]`

The script will:
1. Set up a Squads multisig
2. Create and execute a transaction to initialize the Jito Vault config
3. Create and execute a transaction to initialize the Jito Vault


### Command-line Arguments

The script accepts the following command-line arguments:

- `--restaking-program-id <id>`: Restaking Program ID (required)
- `--vault-program-id <id>`: Vault Program ID (required)
- `--multisig-address <address>`: Multisig Address (optional)
- `--mint <address>`: Mint Address (optional)
- `--rpc-url <url>`: RPC URL (default: https://api.devnet.solana.com)

Example:

```
yarn start --
--restaking-program-id ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop
--vault-program-id QRSTUVWXYZabcdefghijklmnopABCDEFGHIJKLMNOP
--multisig-address 3Jq8ikZhdNtZc5NY3utNrevLRRvg5j2ADz7wLxjaPt5s
--mint So11111111111111111111111111111111111111112
--rpc-url https://api.devnet.solana.com
```


If `--multisig-address` is not provided, the script will create a new multisig.
If `--mint` is not provided, the script will create a new mint.

## Script Behavior

The script will:

1. Set up a Squads multisig (if not provided)
2. Create and execute a transaction to initialize the Jito Vault config
3. Create and execute a transaction to initialize the Jito Vault
4. Create and approve proposals for the transactions
5. Execute the approved transactions

## Development

- `yarn build`: Compile TypeScript to JavaScript
- `yarn dev`: Run the script in development mode with hot reloading
- `yarn lint`: Lint the source code

## Configuration

The script uses the following configuration parameters:

- `mintDecimals`: Set to 9 by default. Adjust this in the script if needed.
- Fees (in basis points):
  - `depositFeeBps`: 200 (2%)
  - `withdrawalFeeBps`: 200 (2%)
  - `rewardFeeBps`: 200 (2%)

To modify these parameters, edit the values in the `main` function of `src/index.ts`.

## Development

- `npm run build` or `yarn build`: Compile TypeScript to JavaScript
- `npm run dev` or `yarn dev`: Run the script in development mode with hot reloading
- `npm run lint` or `yarn lint`: Lint the source code

`https://github.com/jito-foundation/restaking/blob/master/vault_program/src/initialize_vault.rs`

`https://github.com/jito-foundation/restaking/tree/ddcb69ff9400bdbd716bbab64508c87dc5512494/vault_sdk`