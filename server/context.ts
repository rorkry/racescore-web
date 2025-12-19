import { inferAsyncReturnType } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';

export async function createContext(opts: CreateNextContextOptions) {
  // コンテキストは空でOK（各ルーターでgetRawDbを直接呼び出す）
  return {};
}

export type Context = inferAsyncReturnType<typeof createContext>;
