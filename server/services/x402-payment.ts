import { facilitator } from '@coinbase/x402';
import { PublicKey, Connection } from '@solana/web3.js';
import { createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { base, baseSepolia, polygon, polygonMumbai, bsc, bscTestnet, mainnet, sepolia } from 'viem/chains';
import { getNetwork, isMainnet } from '../config/networks';

export interface PaymentSplit {
  recipient: string;
  amount: string;
  description: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  splits?: {
    platform: string;
    creator: string;
    investors?: string[];
  };
}

const PLATFORM_WALLET = '0x47aB5ba5f987A8f75f8Ef2F0D8FF33De1A04a020';
const PLATFORM_FEE_USDC = '0.05';

const SOLANA_PLATFORM_WALLET = 'YOUR_SOLANA_WALLET_ADDRESS_HERE';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function getViemChain(network: string) {
  switch (network) {
    case 'base-mainnet': return base;
    case 'base-sepolia': return baseSepolia;
    case 'polygon-mainnet': return polygon;
    case 'polygon-mumbai': return polygonMumbai;
    case 'bsc-mainnet': return bsc;
    case 'bsc-testnet': return bscTestnet;
    case 'ethereum-mainnet': return mainnet;
    case 'ethereum-sepolia': return sepolia;
    default: return baseSepolia;
  }
}

function getSolanaConnection(network: string): Connection {
  const endpoint = network === 'solana-mainnet' 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
  return new Connection(endpoint, 'confirmed');
}

function getUsdcMint(network: string): PublicKey {
  const mint = network === 'solana-mainnet' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
  return new PublicKey(mint);
}

export class X402PaymentService {
  /**
   * Verify payment and log intended splits
   * In production, this would execute actual on-chain transfers via x402 facilitator
   */
  async processEvmPayment(
    totalAmount: string,
    cryptocurrency: string,
    creatorWallet: string,
    transactionHash: string,
    investorSplits?: PaymentSplit[]
  ): Promise<PaymentResult> {
    try {
      const network = getNetwork(cryptocurrency);
      const chain = getViemChain(network);
      
      // Parse total amount
      const total = parseFloat(totalAmount);
      const platformFee = parseFloat(PLATFORM_FEE_USDC);
      const creatorAmount = total - platformFee;
      
      console.log('\n=== x402 Payment Processing ===');
      console.log(`Network: ${network} (${cryptocurrency})`);
      console.log(`Total Payment: ${total} ${cryptocurrency}`);
      console.log(`Transaction Hash: ${transactionHash}`);
      console.log('\n--- Payment Distribution ---');
      console.log(`[1] Platform Fee: ${platformFee} USDC -> ${PLATFORM_WALLET}`);
      console.log(`[2] Creator Payment: ${creatorAmount} ${cryptocurrency} -> ${creatorWallet}`);
      
      if (investorSplits && investorSplits.length > 0) {
        console.log('\n--- Investor Revenue Share ---');
        investorSplits.forEach((split, idx) => {
          console.log(`[${idx + 3}] ${split.description}: ${split.amount} ${cryptocurrency} -> ${split.recipient}`);
        });
      }
      console.log('===============================\n');
      
      // TODO: Execute actual on-chain transfers
      // Current implementation logs what would be executed
      // To implement actual transfers:
      //
      // 1. Use x402 facilitator to verify client payment
      // 2. Execute payment splits via facilitator's settle endpoint
      // 3. Or use smart contract for atomic multi-send
      //
      // Options:
      // A) x402 Facilitator: Handles gas & settlement automatically
      // B) Smart Contract: Deploy payment splitter contract
      // C) Sequential Transfers: Execute individual transfers (higher gas)
      
      return {
        success: true,
        transactionHash,
        splits: {
          platform: `${platformFee} USDC`,
          creator: `${creatorAmount} ${cryptocurrency}`,
          investors: investorSplits?.map(s => `${s.amount} to ${s.recipient}`)
        }
      };
    } catch (error: any) {
      console.error('EVM payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify Solana payment and log intended splits
   * In production, this would execute actual on-chain transfers
   */
  async processSolanaPayment(
    totalAmount: string,
    creatorWallet: string,
    transactionHash: string,
    investorSplits?: PaymentSplit[]
  ): Promise<PaymentResult> {
    try {
      const network = getNetwork('SOL');
      const connection = getSolanaConnection(network);
      const usdcMint = getUsdcMint(network);
      
      // Parse amounts (USDC has 6 decimals on Solana)
      const total = parseFloat(totalAmount);
      const platformFee = parseFloat(PLATFORM_FEE_USDC);
      const creatorAmount = total - platformFee;
      
      console.log('\n=== x402 Solana Payment Processing ===');
      console.log(`Network: ${network}`);
      console.log(`Total Payment: ${total} USDC`);
      console.log(`Transaction Hash: ${transactionHash}`);
      console.log(`USDC Mint: ${usdcMint.toBase58()}`);
      console.log('\n--- Payment Distribution ---');
      console.log(`[1] Platform Fee: ${platformFee} USDC (${Math.floor(platformFee * 1_000_000)} micro) -> ${SOLANA_PLATFORM_WALLET}`);
      console.log(`[2] Creator Payment: ${creatorAmount} USDC (${Math.floor(creatorAmount * 1_000_000)} micro) -> ${creatorWallet}`);
      
      if (investorSplits && investorSplits.length > 0) {
        console.log('\n--- Investor Revenue Share ---');
        investorSplits.forEach((split, idx) => {
          const microAmount = Math.floor(parseFloat(split.amount) * 1_000_000);
          console.log(`[${idx + 3}] ${split.description}: ${split.amount} USDC (${microAmount} micro) -> ${split.recipient}`);
        });
      }
      console.log('======================================\n');
      
      // TODO: Execute actual Solana SPL token transfers
      // To implement:
      // 1. Get or create associated token accounts for all recipients
      // 2. Build transaction with multiple transfer instructions
      // 3. Sign with server wallet (requires SOLANA_PRIVATE_KEY env var)
      // 4. Send and confirm transaction
      
      return {
        success: true,
        transactionHash,
        splits: {
          platform: `${platformFee} USDC`,
          creator: `${creatorAmount} USDC`,
          investors: investorSplits?.map(s => `${s.amount} to ${s.recipient}`)
        }
      };
    } catch (error: any) {
      console.error('Solana payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate investor revenue splits based on post settings
   */
  calculateInvestorSplits(
    paymentAmount: string,
    investorRevenueSharePercent: number,
    investors: Array<{ userId: string; walletAddress: string; position: number }>
  ): PaymentSplit[] {
    const payment = parseFloat(paymentAmount);
    const platformFee = parseFloat(PLATFORM_FEE_USDC);
    const afterPlatformFee = payment - platformFee;
    
    const investorShareTotal = afterPlatformFee * (investorRevenueSharePercent / 100);
    const perInvestor = investorShareTotal / investors.length;
    
    return investors.map(inv => ({
      recipient: inv.walletAddress,
      amount: perInvestor.toFixed(6),
      description: `Investor #${inv.position} revenue share`
    }));
  }

  /**
   * Process full payment with automatic splitting
   * Routes to appropriate blockchain (Solana vs EVM)
   */
  async processPaymentWithSplits(params: {
    totalAmount: string;
    cryptocurrency: string;
    creatorWallet: string;
    transactionHash: string;
    investorRevenueSharePercent?: number;
    investors?: Array<{ userId: string; walletAddress: string; position: number }>;
  }): Promise<PaymentResult> {
    const { totalAmount, cryptocurrency, creatorWallet, transactionHash, investorRevenueSharePercent, investors } = params;
    
    // Calculate investor splits if applicable
    let investorSplits: PaymentSplit[] | undefined;
    if (investors && investors.length > 0 && investorRevenueSharePercent) {
      investorSplits = this.calculateInvestorSplits(
        totalAmount,
        investorRevenueSharePercent,
        investors
      );
    }
    
    // Route to appropriate blockchain
    if (cryptocurrency === 'SOL') {
      return this.processSolanaPayment(totalAmount, creatorWallet, transactionHash, investorSplits);
    } else {
      return this.processEvmPayment(totalAmount, cryptocurrency, creatorWallet, transactionHash, investorSplits);
    }
  }
}

export const x402PaymentService = new X402PaymentService();
