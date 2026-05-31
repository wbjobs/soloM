import { create } from 'ipfs-http-client'
import { lookup } from 'mime-types'
import type { Readable } from 'stream'

const IPFS_URL = process.env.IPFS_URL || 'http://127.0.0.1:5001'

let client: ReturnType<typeof create> | null = null

function getClient() {
  if (!client) {
    client = create({ url: IPFS_URL })
  }
  return client
}

async function* streamToAsyncIterable(
  stream: Readable,
): AsyncIterable<Uint8Array> {
  for await (const chunk of stream) {
    yield chunk as Uint8Array
  }
}

export async function uploadStreamToIpfs(
  stream: Readable,
  originalName: string,
): Promise<{ cid: string; size: number }> {
  const ipfs = getClient()
  const result = await ipfs.add({
    path: originalName,
    content: streamToAsyncIterable(stream),
  })
  return {
    cid: result.cid.toString(),
    size: result.size,
  }
}

export async function uploadToIpfs(
  buffer: Buffer,
  originalName: string,
): Promise<{ cid: string; size: number }> {
  const ipfs = getClient()
  const result = await ipfs.add({
    path: originalName,
    content: buffer,
  })
  return {
    cid: result.cid.toString(),
    size: result.size,
  }
}

export async function* streamFromIpfs(cid: string): AsyncIterable<Uint8Array> {
  const ipfs = getClient()
  for await (const chunk of ipfs.cat(cid)) {
    yield chunk
  }
}

export async function getFromIpfs(cid: string): Promise<Buffer> {
  const ipfs = getClient()
  const chunks: Uint8Array[] = []
  for await (const chunk of ipfs.cat(cid)) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function resolveMimeType(
  filename: string,
  fallback?: string,
): string {
  const mime = lookup(filename)
  return mime || fallback || 'application/octet-stream'
}
