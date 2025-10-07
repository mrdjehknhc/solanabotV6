import { Connection } from "@solana/web3.js";
import { validateEnv } from "../env-validator";
import { config } from "../../config";

// Constants
const WSOL_MINT = config.wsol_pc_mint;

/**
 * Оптимизированный SignatureHandler для максимальной скорости
 */
export class SignatureHandler {
  private connection: Connection;
  private static instance: SignatureHandler;

  constructor(connection?: Connection) {
    const env = validateEnv();
    this.connection = connection || new Connection(env.HELIUS_HTTPS_URI, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 10000, // Reduced timeout
    });
  }

  /**
   * Singleton pattern для переиспользования connection
   */
  static getInstance(): SignatureHandler {
    if (!SignatureHandler.instance) {
      SignatureHandler.instance = new SignatureHandler();
    }
    return SignatureHandler.instance;
  }

  /**
   * Получить mint address из transaction signature - МАКСИМАЛЬНО БЫСТРО
   */
  public async getMintFromSignature(signature: string): Promise<string | null> {
    // Мгновенная валидация
    if (!signature?.trim()) return null;

    try {
      // Попытка 1: Быстрое получение транзакции
      let tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      // Быстрая проверка и один retry
      if (!tx?.meta) {
        // Один быстрый retry с минимальной задержкой
        await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 200ms
        
        tx = await this.connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });

        if (!tx?.meta) return null;
      }

      // Приоритет postTokenBalances (новые токены чаще там)
      const tokenBalances = tx.meta.postTokenBalances || tx.meta.preTokenBalances;
      if (!tokenBalances?.length) return null;

      // Супер-быстрый поиск non-WSOL токена
      for (const balance of tokenBalances) {
        if (balance.mint !== WSOL_MINT) {
          return balance.mint;
        }
      }

      return null;

    } catch (error) {
      // Минимальное логирование для скорости
      return null;
    }
  }

  /**
   * Batch обработка множественных signatures (для будущего использования)
   */
  public async getMintFromSignatures(signatures: string[]): Promise<Array<{ signature: string; mint: string | null }>> {
    if (!signatures.length) return [];

    // Параллельная обработка всех signatures
    const promises = signatures.map(async signature => ({
      signature,
      mint: await this.getMintFromSignature(signature)
    }));

    // Ждем все параллельно
    return Promise.all(promises);
  }

  /**
   * Предварительная проверка signature без полного парсинга
   */
  public isValidSignature(signature: string): boolean {
    return !!(signature?.trim() && signature.length >= 80 && signature.length <= 90);
  }
}

// Singleton instance для максимальной производительности
const signatureHandler = SignatureHandler.getInstance();

/**
 * Оптимизированная функция для получения mint address
 */
export async function getMintFromSignature(signature: string): Promise<string | null> {
  return signatureHandler.getMintFromSignature(signature);
}

/**
 * Batch функция для обработки множественных signatures
 */
export async function getMintFromSignatures(signatures: string[]): Promise<Array<{ signature: string; mint: string | null }>> {
  return signatureHandler.getMintFromSignatures(signatures);
}