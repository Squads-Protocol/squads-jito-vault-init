/*

    This script will 
    a) Create the relevant multisig squad
    b) slate and create the config and init Jito Vault transactions
    c) create the proposals and vote on them
    d) execute the transactions
*/

import { getMultisigPda, getVaultPda, getProgramConfigPda, getTransactionPda, accounts, instructions, types, transactions, getEphemeralSignerPda} from "@sqds/multisig";
import { PublicKey, Keypair, Connection, TransactionInstruction, Transaction, TransactionMessage, Signer, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";

// EXAMPLE - REPLACE WITH IDS
const RESTAKING_PROGRAM_ID = new PublicKey("-----");
const VAULT_PROGRAM_ID = new PublicKey("------");

const RPC_URL = "https://api.devnet.solana.com";

// REPLACE THIS IF THE MULTISIG HAS ALREADY BEEN CREATED
const MULTISIG_ADDRESS: PublicKey | null = null;

// REPLACE THIS WITH THE MINT IF IT EXISTS, OR IT WILL CREATE A NEW ONE AND ASSIGN IT
const MINT: PublicKey | undefined = undefined;
const mintDecimals = 9; // Adjust if creating

// creates the vault args buffer from args
const initVaultArgs = (
    depositFeeBps: number,
    withdrawalFeeBps: number,
    rewardFeeBps: number,
    decimals: number
  ): ArrayBuffer => {
    // Total size = 1 byte for discriminator + 6 bytes for u16s + 1 byte for u8
    const buffer = new ArrayBuffer(9); // 9 bytes total
    const view = new DataView(buffer);
    const discriminator = 1; 
    view.setUint8(0, discriminator);
    view.setUint16(1, depositFeeBps, true);
    view.setUint16(3, withdrawalFeeBps, true);
    view.setUint16(5, rewardFeeBps, true);
    view.setUint8(7, decimals);
  
    return buffer;
};

// derives the vault config PDA
const getJitoVaultConfigPda = () => {
    return PublicKey.findProgramAddressSync([
        // first slice is "config" string
        Buffer.from("config"),
    ], VAULT_PROGRAM_ID);
};

// derives the vault pda (w base as seed)
const getJitoVaultPda = (base: PublicKey) => {
    return PublicKey.findProgramAddressSync([
        // first slice is "config" string
        Buffer.from("vault"),
        base.toBuffer(),
    ], VAULT_PROGRAM_ID);
};


const createMultisigTx = (
    multisigPda: PublicKey,
    creator: PublicKey,
    createKey: PublicKey,
    members: PublicKey[],
    programConfig: accounts.ProgramConfig,
    threshold: number,
    blockhash: string,
    ): VersionedTransaction => {
    const configTreasury = programConfig.treasury;

    return transactions.multisigCreateV2({
        blockhash,
        createKey,
        creator,
        multisigPda,
        configAuthority: null,
        timeLock: 0,
        members: members.map((member) => {
        return {
            key: member,
            permissions: types.Permissions.all()
        };
        }),
        threshold,
        rentCollector: null,
        treasury: configTreasury,
    });
};

const createJitoVaultInitConfigIx =  (
    jitoVaultProgramId: PublicKey,
    jitoRestakingProgramId: PublicKey,
    admin: PublicKey,
    configPda: PublicKey
) => {
    const jitoVaultConfigIx = new TransactionInstruction({
        programId: jitoVaultProgramId,
        keys: [
            {pubkey: configPda, isSigner: false, isWritable: true}, // config - mut (PDA)
            {pubkey: admin, isSigner: true, isWritable: false}, // admin - mut, signer
            {pubkey: jitoRestakingProgramId, isSigner: false, isWritable: false}, // restakingProgram
            {pubkey: SystemProgram.programId, isSigner: false, isWritable: false}, // systemProgram
        ],
        data: Buffer.from([0]) // deposit fee, withdraw fee, reward fee, decimals
    });
    return jitoVaultConfigIx;
};

const createJitoVaultInitIx =  (
    jitoVaultProgramId: PublicKey,
    configPda: PublicKey,
    vault: PublicKey,
    vrtMint: PublicKey,
    mint: PublicKey,
    admin: PublicKey,
    base: PublicKey,
    data: Buffer
) => {
    const jitoInitVaultIx = new TransactionInstruction({
        programId: jitoVaultProgramId,
        keys: [
            {pubkey: configPda, isSigner: false, isWritable: true}, // config - mut (PDA)
            {pubkey: vault, isSigner: false, isWritable: true}, // vault - mut
            {pubkey: vrtMint, isSigner: true, isWritable: true}, // vrtMint - mut, signer
            {pubkey: mint, isSigner: false, isWritable: false}, // mint
            {pubkey: admin, isSigner: true, isWritable: true}, // admin - mut, signer
            {pubkey: base, isSigner: true, isWritable: false}, // base - signer
            {pubkey: SystemProgram.programId, isSigner: false, isWritable: false}, // systemProgram
            {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false}, // tokenProgram
        ],
        data // deposit fee, withdraw fee, reward fee, decimals
    });
    return jitoInitVaultIx
};


// returns the tx to setup the squad
const setupSquad = async (creator: PublicKey, multisigCreateKey: PublicKey, members: PublicKey[], defaultThreshold: number, blockhash: string, connection: Connection) => {

    console.log("MultiSig Create Key: ", multisigCreateKey.toBase58());
    const [multisigAddress] = getMultisigPda({createKey: multisigCreateKey});
    console.log("MultiSig Config Address: ", multisigAddress.toBase58());
    const [defaultVault] = getVaultPda({multisigPda: multisigAddress, index: 0});
    console.log("Default Vault/Authority Address: ", defaultVault.toBase58());

    // multisig program config fetch
    const programConfigPda = getProgramConfigPda({})[0];

    const programConfig =
    await accounts.ProgramConfig.fromAccountAddress(
        connection,
        programConfigPda
    );

    const createMsTx = createMultisigTx(
        multisigAddress,
        creator,
        multisigCreateKey,
        members,
        programConfig,
        defaultThreshold,
        blockhash
    );
    
    return {
        createMsTx,
        multisigAddress,
        defaultSquadAuthority: defaultVault, 
        multisigCreateKey
    };
}

// will be used to create a new mint if one is not provided
const setupMint = async (connection: Connection, creator: Keypair, squadVault: PublicKey, decimals: number) => {
    console.log("Creating mint...");
    const mint = await createMint(connection, creator, squadVault, squadVault, decimals);
    console.log("Mint created: ", mint.toBase58());
    return mint;
}

const setupJitoVaultConfigTx = (
    multisigPda: PublicKey,
    defaultSquadAuthority: PublicKey,
    blockhash: string,
    creator: PublicKey,
    feePayer: PublicKey,
    rentPayer: PublicKey,
    index: bigint
) => {
    // first squads transaction will be to setup the vault config for JITO
    const [txPda] = getTransactionPda({multisigPda, index});

    const [jitoVaultConfigPda] = getJitoVaultConfigPda();

    const jConfigInitIx = createJitoVaultInitConfigIx(
        VAULT_PROGRAM_ID,
        RESTAKING_PROGRAM_ID,
        defaultSquadAuthority,
        jitoVaultConfigPda
    );

    // create the squad tx for the jConfigInitIx
    const vaultConfigTx = transactions.vaultTransactionCreate({
        blockhash,
        feePayer,
        multisigPda,
        transactionIndex: index,
        creator,
        rentPayer,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage: new TransactionMessage({
            instructions: [jConfigInitIx],
            recentBlockhash: blockhash,
            payerKey: defaultSquadAuthority,
        }),
        addressLookupTableAccounts: []
    });

    return {vaultConfigTx, configTxPda: txPda};
}

const setupJitoVaultInitTx = async (
    multisigPda: PublicKey,
    defaultSquadAuthority: PublicKey,
    blockhash: string,
    creator: PublicKey,
    feePayer: PublicKey,
    rentPayer: PublicKey,
    index: bigint,
    depositFeeBps: number,
    withdrawalFeeBps: number,
    rewardFeeBps: number,
    decimals: number,
    mint: PublicKey
) => {

    const [transactionPda] = getTransactionPda({multisigPda, index});
    // VAULT RELEVANT VARS
    const [jitoBase] = getEphemeralSignerPda({transactionPda, ephemeralSignerIndex: Number(1)});  
    console.log("Vault BASE: ", jitoBase.toBase58());
    const [jitoVrtMint] =  getEphemeralSignerPda({transactionPda, ephemeralSignerIndex: Number(2)});
    console.log("Vault VRT MINT: ", jitoVrtMint.toBase58());
    const jitoMint = mint; 
    console.log("Vault MINT: ", jitoMint.toBase58());
    const jitoAdmin = defaultSquadAuthority;     
    console.log("Vault Admin: ", jitoAdmin.toBase58());
    const [jitoVaultConfigPda] = getJitoVaultConfigPda();
    console.log("Vault Config PDA: ", jitoVaultConfigPda.toBase58());
    const [jitoVaultPda] = getJitoVaultPda(jitoBase);
    console.log("Vault PDA: ", jitoVaultPda.toBase58());
    const initVaultData = initVaultArgs(depositFeeBps, withdrawalFeeBps, rewardFeeBps, decimals);

    const jVaultInitIx = await createJitoVaultInitIx(
        VAULT_PROGRAM_ID,
        jitoVaultConfigPda,
        jitoVaultPda,
        jitoVrtMint,
        jitoMint,
        jitoAdmin,
        jitoBase,
        Buffer.from(initVaultData)
    );

    // create the squad tx for the jConfigInitIx
    const jVaultInitTx = transactions.vaultTransactionCreate({
        blockhash,
        feePayer,
        multisigPda,
        transactionIndex: index,
        creator,
        rentPayer,
        vaultIndex: 0,
        ephemeralSigners: 2,
        transactionMessage: new TransactionMessage({
            instructions: [jVaultInitIx],
            recentBlockhash: blockhash,
            payerKey: defaultSquadAuthority,
        }),
        addressLookupTableAccounts: []
    });


    return {vaultInitTx: jVaultInitTx};
}

const multisig = async (connection: Connection, creator: Keypair, multisigCreateKey: Keypair, members: PublicKey[], defaultThreshold: number) => {
    let {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash();

    const {createMsTx, multisigAddress, defaultSquadAuthority} = await setupSquad(
        creator.publicKey,
        multisigCreateKey.publicKey,
        members,
        defaultThreshold,
        blockhash,
        connection
    );
    createMsTx.sign([multisigCreateKey, creator]);
    let signature = await connection.sendTransaction(createMsTx);
    await connection.confirmTransaction({signature, blockhash, lastValidBlockHeight});
    return {multisigAddress, defaultSquadAuthority};
};

const jitoConfig = async (connection: Connection, creator: Keypair, multisigAddress: PublicKey, defaultSquadAuthority: PublicKey) => {
    const nextBlockhash = await connection.getLatestBlockhash();

    const {vaultConfigTx, configTxPda} = await setupJitoVaultConfigTx(
        multisigAddress,
        defaultSquadAuthority,
        nextBlockhash.blockhash,
        creator.publicKey,
        creator.publicKey,
        creator.publicKey,
        1n
    );
    vaultConfigTx.sign([creator]);
    const signature = await connection.sendTransaction(vaultConfigTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
};

const jitoInit = async (connection: Connection, creator: Keypair, multisigAddress: PublicKey, defaultSquadAuthority: PublicKey, depositFeeBps: number, withdrawalFeeBps: number, rewardFeeBps: number, decimals: number, mint: PublicKey) => {
    const nextBlockhash = await connection.getLatestBlockhash();
    const {vaultInitTx} = await setupJitoVaultInitTx(
        multisigAddress,
        defaultSquadAuthority,
        nextBlockhash.blockhash,
        creator.publicKey,
        creator.publicKey,
        creator.publicKey,
        2n,
        depositFeeBps,
        withdrawalFeeBps,
        rewardFeeBps,
        decimals,
        mint,
    );
    vaultInitTx.sign([creator]);
    const signature = await connection.sendTransaction(vaultInitTx);
    await connection.confirmTransaction({signature,blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
};

const proposals = async (connection: Connection, creator: Keypair, multisigAddress: PublicKey) => {
    let nextBlockhash = await connection.getLatestBlockhash();
    const createConfigInitProposalTx = transactions.proposalCreate({
        blockhash: nextBlockhash.blockhash,
        multisigPda: multisigAddress,
        transactionIndex: 1n,
        creator: creator.publicKey,
        rentPayer: creator.publicKey,
        feePayer: creator.publicKey,
    });
    createConfigInitProposalTx.sign([creator]);
    let signature = await connection.sendTransaction(createConfigInitProposalTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    nextBlockhash = await connection.getLatestBlockhash();
    const createVaultInitProposalTx = transactions.proposalCreate({
        blockhash: nextBlockhash.blockhash,
        multisigPda: multisigAddress,
        transactionIndex: 2n,
        creator: creator.publicKey,
        rentPayer: creator.publicKey,
        feePayer: creator.publicKey,
    });
    createVaultInitProposalTx.sign([creator]);
    signature = await connection.sendTransaction(createVaultInitProposalTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    // approve the proposals
    nextBlockhash = await connection.getLatestBlockhash();
    const approveConfigInitProposalTx = transactions.proposalApprove({
        blockhash: nextBlockhash.blockhash,
        multisigPda: multisigAddress,
        transactionIndex: 1n,
        member: creator.publicKey,
        feePayer: creator.publicKey,
    });
    approveConfigInitProposalTx.sign([creator]);
    signature = await connection.sendTransaction(approveConfigInitProposalTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    nextBlockhash = await connection.getLatestBlockhash();
    const approveVaultInitProposalTx = transactions.proposalApprove({
        blockhash: nextBlockhash.blockhash,
        multisigPda: multisigAddress,
        transactionIndex: 2n,
        member: creator.publicKey,
        feePayer: creator.publicKey
    });
    approveVaultInitProposalTx.sign([creator]);
    signature = await connection.sendTransaction(approveVaultInitProposalTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
};

const executions = async (connection: Connection, creator: Keypair, multisigAddress: PublicKey) => {
    // now execute the transaction
    let nextBlockhash = await connection.getLatestBlockhash();
    const executeConfigTx = await transactions.vaultTransactionExecute({
            connection,
            blockhash: nextBlockhash.blockhash,
            feePayer: creator.publicKey,
            multisigPda:multisigAddress,
            transactionIndex: 1n,
            member: creator.publicKey,
        });
    executeConfigTx.sign([creator]);
    let signature = await connection.sendTransaction(executeConfigTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    // execute the transaction
    nextBlockhash = await connection.getLatestBlockhash();
    const executeInitTx = await transactions.vaultTransactionExecute({
            connection,
            blockhash: nextBlockhash.blockhash,
            feePayer: creator.publicKey,
            multisigPda: multisigAddress,
            transactionIndex: 2n,
            member: creator.publicKey,
        });
    executeInitTx.sign([creator]);
    signature = await connection.sendTransaction(executeInitTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
}

// Main logic example
const main = async () => {
    // replace this with the CLI wallet keypair/Signer
    const creator = Keypair.generate();

    const connection = new Connection(RPC_URL, "confirmed");
    // create the squad if needed
    let multisigAddress: PublicKey;
    let defaultSquadAuthority: PublicKey;

    if (MULTISIG_ADDRESS === null) {
        console.log("No multisig address provided, creating one...");
        const multisigCreateKey = Keypair.generate();
        // EXAMPLE append the multisig members to this array
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
    await jitoConfig(connection, creator, multisigAddress, defaultSquadAuthority);

    // ----------
    
    // now create the jito vault init tx
    // EXAMPLE init vault args for JITO vault
    const depositFeeBps = 200;
    const withdrawalFeeBps = 200;
    const rewardFeeBps= 200;
    const decimals = 9;
    let mint: PublicKey | undefined = MINT;
    if (!MINT) {
        console.log("No mint provided, creating one...");
        mint = await setupMint(connection, creator, defaultSquadAuthority, mintDecimals);
    }

    // At this point, ensure mint is of type PublicKey
    if (!mint) {
        throw new Error("Mint is undefined and could not be created.");
    }

    await jitoInit(connection, creator, multisigAddress, defaultSquadAuthority, depositFeeBps, withdrawalFeeBps, rewardFeeBps, decimals, mint);

    // -------

    // Now create the proposals and approve them
    await proposals(connection, creator, multisigAddress);

    // -------

    // execute the transactions
    await executions(connection, creator, multisigAddress);
};