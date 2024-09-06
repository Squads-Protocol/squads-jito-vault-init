import { PublicKey } from "@solana/web3.js";

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
const getJitoVaultConfigPda = (VAULT_PROGRAM_ID: PublicKey) => {
    return PublicKey.findProgramAddressSync([
        // first slice is "config" string
        Buffer.from("config"),
    ], VAULT_PROGRAM_ID);
};

// derives the vault pda (w base as seed)
const getJitoVaultPda = (base: PublicKey, VAULT_PROGRAM_ID: PublicKey) => {
    return PublicKey.findProgramAddressSync([
        // first slice is "config" string
        Buffer.from("vault"),
        base.toBuffer(),
    ], VAULT_PROGRAM_ID);
};

export {
    initVaultArgs,
    getJitoVaultConfigPda,
    getJitoVaultPda
}