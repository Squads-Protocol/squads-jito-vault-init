import { createMint } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { setupJitoVaultConfigTx, setupJitoVaultInitTx, setupSquad } from "./transactions";
import { transactions } from "@sqds/multisig";

// will be used to create a new mint if one is not provided
const setupMint = async (connection: Connection, creator: Keypair, squadVault: PublicKey, decimals: number) => {
    console.log("Creating mint...");
    const mint = await createMint(connection, creator, squadVault, squadVault, decimals);
    console.log("Mint created: ", mint.toBase58());
    return mint;
}


// creates the multisig
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

// runs the jito vault config logic
const jitoConfig = async (connection: Connection, creator: Keypair, multisigAddress: PublicKey, defaultSquadAuthority: PublicKey, VAULT_PROGRAM_ID: PublicKey, RESTAKING_PROGRAM_ID: PublicKey) => {
    const nextBlockhash = await connection.getLatestBlockhash();

    const {vaultConfigTx, configTxPda} = await setupJitoVaultConfigTx(
        multisigAddress,
        defaultSquadAuthority,
        nextBlockhash.blockhash,
        creator.publicKey,
        creator.publicKey,
        creator.publicKey,
        1n,
        VAULT_PROGRAM_ID,
        RESTAKING_PROGRAM_ID
    );
    vaultConfigTx.sign([creator]);
    const signature = await connection.sendTransaction(vaultConfigTx);
    await connection.confirmTransaction({signature, blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
};

// runs the jito vault program init logic
const jitoInit = async (connection: Connection, creator: Keypair, multisigAddress: PublicKey, defaultSquadAuthority: PublicKey, depositFeeBps: number, withdrawalFeeBps: number, rewardFeeBps: number, decimals: number, mint: PublicKey, VAULT_PROGRAM_ID: PublicKey) => {
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
        VAULT_PROGRAM_ID
    );
    vaultInitTx.sign([creator]);
    const signature = await connection.sendTransaction(vaultInitTx);
    await connection.confirmTransaction({signature,blockhash: nextBlockhash.blockhash, lastValidBlockHeight: nextBlockhash.lastValidBlockHeight});
};

// create and approve the proposals
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

// execute the transactions
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

export {
    setupMint,
    multisig,
    jitoConfig,
    jitoInit,
    proposals,
    executions
}
