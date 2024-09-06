import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { accounts, getEphemeralSignerPda, getMultisigPda, getProgramConfigPda, getTransactionPda, getVaultPda, transactions, types } from "@sqds/multisig";
import { createJitoVaultInitConfigIx, createJitoVaultInitIx } from "./instructions";
import { getJitoVaultConfigPda, getJitoVaultPda, initVaultArgs } from "./helpers";


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

// crafts the jito vault program config tx
const setupJitoVaultConfigTx = (
    multisigPda: PublicKey,
    defaultSquadAuthority: PublicKey,
    blockhash: string,
    creator: PublicKey,
    feePayer: PublicKey,
    rentPayer: PublicKey,
    index: bigint,
    VAULT_PROGRAM_ID: PublicKey,
    RESTAKING_PROGRAM_ID: PublicKey
) => {
    // first squads transaction will be to setup the vault config for JITO
    const [txPda] = getTransactionPda({multisigPda, index});

    const [jitoVaultConfigPda] = getJitoVaultConfigPda(VAULT_PROGRAM_ID);

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

// creates the jito vault program init tx
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
    mint: PublicKey,
    VAULT_PROGRAM_ID: PublicKey
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
    const [jitoVaultConfigPda] = getJitoVaultConfigPda(VAULT_PROGRAM_ID);
    console.log("Vault Config PDA: ", jitoVaultConfigPda.toBase58());
    const [jitoVaultPda] = getJitoVaultPda(jitoBase, VAULT_PROGRAM_ID);
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

export {
    setupSquad,
    setupJitoVaultConfigTx,
    setupJitoVaultInitTx,
    createMultisigTx
}