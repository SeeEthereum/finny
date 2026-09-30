import Papa from 'papaparse'
import type { Grid } from './table'

export type FileKind = 'csv' | 'xlsx' | 'pdf'

export function fileKind(file: File): FileKind | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv') || file.type === 'text/csv') return 'csv'
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return 'xlsx'
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  return null
}

export class ImportError extends Error {}

/** Bank exports are often Windows-1252, not UTF-8: try strict UTF-8 first, then fall back. */
export async function decodeText(file: Blob) {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export function parseCsvText(text: string): Grid {
  const res = Papa.parse<string[]>(text, {
    delimitersToGuess: [';', ',', '\t', '|'],
    skipEmptyLines: 'greedy',
  })
  if (!res.data.length) throw new ImportError('Il file è vuoto oppure non è un CSV leggibile.')
  return res.data
}

export async function readCsv(file: File): Promise<Grid> {
  return parseCsvText(await decodeText(file))
}

export async function readXlsx(file: File): Promise<Grid> {
  const { readSheet } = await import('read-excel-file/browser')
  try {
    const data = await readSheet(file)
    return data as unknown as Grid
  } catch {
    throw new ImportError(
      'Non riesco ad aprire questo Excel. Se è un vecchio formato .xls, salvalo come .xlsx o CSV e riprova.',
    )
  }
}
