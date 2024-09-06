import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

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

export {
    createJitoVaultInitConfigIx,
    createJitoVaultInitIx
}