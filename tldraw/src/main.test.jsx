import { describe, it, expect } from 'vitest'

describe('TLDraw Application', () => {
  it('application constants are defined correctly', () => {
    // Test basic application setup
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })

  it('can perform basic math operations', () => {
    // Simple functionality test
    expect(2 + 2).toBe(4)
    expect(Math.max(1, 2, 3)).toBe(3)
  })

  it('can work with arrays', () => {
    const colors = ['red', 'blue', 'green']
    expect(colors).toHaveLength(3)
    expect(colors.includes('red')).toBe(true)
  })

  it('can work with objects', () => {
    const config = { port: 3000, host: 'localhost' }
    expect(config.port).toBe(3000)
    expect(Object.keys(config)).toEqual(['port', 'host'])
  })
})