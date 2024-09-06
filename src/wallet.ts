import fs from 'fs';
import { Keypair } from "@solana/web3.js";

function loadWalletFromFile(filePath: string): Keypair {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(fileContent));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Error loading wallet file:', error);
    throw new Error('Failed to load wallet file');
  }
}

export {
    loadWalletFromFile
}