import { describe, expect, it } from 'vitest'
import { buildPrompt, normalizeChunk, normalizeOutput } from '../src/ai'

describe('buildPrompt', () => {
  it('builds translate prompt with structural rules', () => {
    const prompt = buildPrompt({
      mode: 'translate',
      text: 'Hello\nWorld',
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hans',
      customPrompt: ''
    })

    expect(prompt).toContain('You are a precise translation assistant.')
    expect(prompt).toContain('Translate from English to 简体中文.')
    expect(prompt).toContain('- Return translation only, no explanation.')
    expect(prompt).toContain('Text:')
    expect(prompt).toContain('Hello\nWorld')
  })

  it('builds summarize prompt', () => {
    const prompt = buildPrompt({
      mode: 'summarize',
      text: 'Long text',
      sourceLanguage: 'auto',
      targetLanguage: 'en',
      customPrompt: ''
    })
    expect(prompt).toContain('Summarize the following text in English.')
    expect(prompt).toContain('- Output only summary content.')
  })

  it('uses fallback custom prompt when missing', () => {
    const prompt = buildPrompt({
      mode: 'custom',
      text: 'Input text',
      sourceLanguage: 'auto',
      targetLanguage: 'ja',
      customPrompt: ''
    })
    expect(prompt).toContain('Respond in 日本語.')
    expect(prompt).toContain('Input:')
  })
})

describe('chunk/output normalization', () => {
  it('normalizes chunk variants', () => {
    expect(normalizeChunk('abc')).toBe('abc')
    expect(normalizeChunk({ text: 'a' })).toBe('a')
    expect(normalizeChunk({ output_text: 'b' })).toBe('b')
    expect(normalizeChunk({ content: 'c' })).toBe('c')
    expect(normalizeChunk({ unknown: 'x' })).toBe('')
  })

  it('normalizes output variants', () => {
    expect(normalizeOutput('abc')).toBe('abc')
    expect(normalizeOutput({ text: 'a' })).toBe('a')
    expect(normalizeOutput({ output_text: 'b' })).toBe('b')
    expect(normalizeOutput({ content: 'c' })).toBe('c')
    expect(normalizeOutput({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2))
  })
})
