import { getMultisigPda, getVaultPda, getProgramConfigPda, getTransactionPda, accounts, instructions, types, transactions, getEphemeralSignerPda} from "@sqds/multisig";
import { PublicKey, Keypair, Connection, TransactionInstruction, Transaction, TransactionMessage, Signer, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// EXAMPLE - REPLACE WITH IDS
const RESTAKING_PROGRAM_ID = new PublicKey("-----");
const VAULT_PROGRAM_ID = new PublicKey("------");

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

const getJitoVaultConfigPda = () => {
    // use PublicKey.findProgramAddressSync to generate the PDA
    return PublicKey.findProgramAddressSync([
        // first slice is "config" string
        Buffer.from("config"),
    ], VAULT_PROGRAM_ID);
};

const getJitoVaultPda = (base: PublicKey) => {
    // use PublicKey.findProgramAddressSync to generate the PDA
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
    connection: Connection,
    blockhash: string,
    creator: PublicKey,
    feePayer: PublicKey,
    rentPayer: PublicKey,
    index: bigint,
    depositFeeBps: number,
    withdrawalFeeBps: number,
    rewardFeeBps: number,
    decimals: number
) => {

    const [transactionPda] = getTransactionPda({multisigPda, index});
    // VAULT RELEVANT VARS
    const [jitoBase] = getEphemeralSignerPda({transactionPda, ephemeralSignerIndex: Number(index)})  // since the base needs to sign as ephemeral
    const jitoVrtMintKeypair = Keypair.generate(); // adjust this as neeeded - will be ephemeral
    const jitoMint = Keypair.generate().publicKey; // adjust this as neeeded - should be an existing mint
    const jitoAdmin = defaultSquadAuthority;                // adjust this as neeeded - should be an existing admin  
    const [jitoVaultConfigPda] = getJitoVaultConfigPda();
    const [jitoVaultPda] = getJitoVaultPda(jitoBase);
    const initVaultData = initVaultArgs(depositFeeBps, withdrawalFeeBps, rewardFeeBps, decimals);

    const jVaultInitIx = await createJitoVaultInitIx(
        VAULT_PROGRAM_ID,
        jitoVaultConfigPda,
        jitoVaultPda,
        jitoVrtMintKeypair.publicKey,
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
        ephemeralSigners: 0,
        transactionMessage: new TransactionMessage({
            instructions: [jVaultInitIx],
            recentBlockhash: blockhash,
            payerKey: defaultSquadAuthority,
        }),
        addressLookupTableAccounts: []
    });


    return {vaultInitTx: jVaultInitTx};
}

// Main logic example
const main = async () => {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    // create the squad
    // replace this with the CLI wallet keypair/Signer
    const creator = Keypair.generate();
    const multisigCreateKey = Keypair.generate();
    // EXAMPLE append the multisig members to this array
    const members = [creator.publicKey]
    const defaultThreshold = 1;
    
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


    // ---------

    // now create the jito vault config tx
    let nextBlockhash = await connection.getLatestBlockhash();

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
    signature = await connection.sendTransaction(vaultConfigTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    // now execute the transaction
    nextBlockhash = await connection.getLatestBlockhash();
    const executeConfigTx = await transactions.vaultTransactionExecute({
            connection,
            blockhash: nextBlockhash.blockhash,
            feePayer: creator.publicKey,
            multisigPda:multisigAddress,
            transactionIndex: 1n,
            member: creator.publicKey,
        });
    executeConfigTx.sign([creator]);
    signature = await connection.sendTransaction(executeConfigTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    // ----------
    
    // now create the jito vault init tx
    // EXAMPLE init vault args for JITO vault
    const depositFeeBps = 200;
    const withdrawalFeeBps = 200;
    const rewardFeeBps= 200;
    const decimals = 9;
    nextBlockhash = await connection.getLatestBlockhash();
    const {vaultInitTx} = await setupJitoVaultInitTx(
        multisigAddress,
        defaultSquadAuthority,
        connection,
        nextBlockhash.blockhash,
        creator.publicKey,
        creator.publicKey,
        creator.publicKey,
        2n,
        depositFeeBps,
        withdrawalFeeBps,
        rewardFeeBps,
        decimals
    );
    vaultInitTx.sign([creator]);
    signature = await connection.sendTransaction(vaultInitTx);
    await connection.confirmTransaction({signature,blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});

    // proposal vote here

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
    signature = await connection.sendTransaction(executeConfigTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
};