import { getMultisigPda, getVaultPda, getProgramConfigPda, accounts} from "@sqds/multisig";
import { PublicKey, Keypair, Connection,} from "@solana/web3.js";

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { createMultisigTx } from "./transactions";
import { loadWalletFromFile } from "./wallet";
import { executions, jitoConfig, jitoInit, multisig, proposals, setupMint } from "./rpc";

const argv = yargs(hideBin(process.argv))
  .option('restaking-program-id', {
    type: 'string',
    description: 'Restaking Program ID',
    demandOption: true
  })
  .option('vault-program-id', {
    type: 'string',
    description: 'Vault Program ID',
    demandOption: true
  })
  .option('multisig-address', {
    type: 'string',
    description: 'Multisig Address (optional)',
  })
  .option('mint', {
    type: 'string',
    description: 'Mint Address (optional)',
  })
  .option('rpc-url', {
    type: 'string',
    description: 'RPC URL',
    default: 'https://api.devnet.solana.com'
  })
  .option('wallet-path', {
    type: 'string',
    description: 'Path to the Solana wallet JSON file',
    demandOption: true
  })
  .help('help')
  .alias('help', 'h')
  .usage('Usage: $0 [options]')
  .example('$0 --restaking-program-id ABC... --vault-program-id DEF... --wallet-path /path/to/wallet.json', 'Initialize Jito Vault with specified programs')
  .epilogue('For more information, visit https://github.com/Squads-Protocol/squads-jito-vault-init')
  .strict()
  .parseSync();


const RESTAKING_PROGRAM_ID = new PublicKey(argv['restaking-program-id']);
const VAULT_PROGRAM_ID = new PublicKey(argv['vault-program-id']);
const RPC_URL = argv['rpc-url'];

const MULTISIG_ADDRESS: PublicKey | null = argv['multisig-address'] 
  ? new PublicKey(argv['multisig-address']) 
  : null;

const MINT: PublicKey | undefined = argv['mint'] 
  ? new PublicKey(argv['mint']) 
  : undefined;

const mintDecimals = 9; // Adjust if creating

// Vault Config Args
const DEPOSIT_FEE_BPS = 200;
const WITHDRAWAL_FEE_BPS = 200;
const rREWARD_FEE_BPS = 200;
const DECIMALS = 9;

// Main logic example
const main = async () => {
    const walletPath = argv['wallet-path'];
    const creator = loadWalletFromFile(walletPath);
  
    console.log("Using wallet public key:", creator.publicKey.toBase58());

    const connection = new Connection(RPC_URL, "confirmed");
    // create the squad if needed
    let multisigAddress: PublicKey;
    let defaultSquadAuthority: PublicKey;

    if (MULTISIG_ADDRESS === null) {
        console.log("No multisig address provided, creating one...");
        const multisigCreateKey = Keypair.generate();
        const members = [creator.publicKey]
        const defaultThreshold = 1;
        
        const multisigResult = await multisig(connection, creator, multisigCreateKey, members, defaultThreshold);
        multisigAddress = multisigResult.multisigAddress;
        defaultSquadAuthority = multisigResult.defaultSquadAuthority;
    }else {
        multisigAddress = MULTISIG_ADDRESS as PublicKey;
        console.log("Using provided multisig address: ", multisigAddress.toBase58());
        defaultSquadAuthority = getVaultPda({multisigPda: multisigAddress, index: 0})[0];
    }

    // Ensure that multisigAddress and defaultSquadAuthority are both set
    if (!multisigAddress || !defaultSquadAuthority) {
        throw new Error("Failed to set multisig address or squad authority.");
    }

    // ---------

    // now create the jito vault config tx
    await jitoConfig(connection, creator, multisigAddress, defaultSquadAuthority, VAULT_PROGRAM_ID, RESTAKING_PROGRAM_ID);

    // ----------
    
    // now create the jito vault init tx
    const depositFeeBps = DEPOSIT_FEE_BPS;
    const withdrawalFeeBps = WITHDRAWAL_FEE_BPS;
    const rewardFeeBps= rREWARD_FEE_BPS;
    const decimals = DECIMALS;
    let mint: PublicKey | undefined = MINT;
    if (!MINT) {
        console.log("No mint provided, creating one...");
        mint = await setupMint(connection, creator, defaultSquadAuthority, mintDecimals);
    }

    // At this point, ensure mint is of type PublicKey
    if (!mint) {
        throw new Error("Mint is undefined and could not be created.");
    }

    await jitoInit(connection, creator, multisigAddress, defaultSquadAuthority, depositFeeBps, withdrawalFeeBps, rewardFeeBps, decimals, mint, VAULT_PROGRAM_ID);

    // -------

    // Now create the proposals and approve them
    await proposals(connection, creator, multisigAddress);

    // -------

    // execute the transactions
    await executions(connection, creator, multisigAddress);

    console.log("Jito Vault initialized successfully!");
};

main();