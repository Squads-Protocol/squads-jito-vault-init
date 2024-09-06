# Squads Jito Vault Initialization

This script initializes a Jito Vault Program through the Squads multisig SDK. It sets up the vault configuration and performs the initialization process.

## Prerequisites

- Node.js (v14 or later recommended)
- npm or yarn

## Installation

1. Clone the repository:
`git clone https://github.com/your-username/squads-jito-vault-init.git cd squads-jito-vault-init`


2. Install dependencies:
`yarn install`


## Configuration

Before running the script, make sure to:

1. Replace the placeholder program IDs in `src/index.ts`:
- `RESTAKING_PROGRAM_ID`
- `VAULT_PROGRAM_ID`

2. Adjust any other configuration parameters as needed (e.g., fees, decimals).

## Usage

Run the script using:
`yarn start`


The script will:
1. Set up a Squads multisig
2. Create and execute a transaction to initialize the Jito Vault config
3. Create and execute a transaction to initialize the Jito Vault

## Development

- `npm run build` or `yarn build`: Compile TypeScript to JavaScript
- `npm run dev` or `yarn dev`: Run the script in development mode with hot reloading
- `npm run lint` or `yarn lint`: Lint the source code

## License

This project is licensed under the ISC License.