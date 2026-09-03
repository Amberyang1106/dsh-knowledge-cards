/**
 * Frontmatter parser/serializer unit tests — flat legacy behavior plus the
 * nested YAML subset (flow maps, block maps, block lists of maps) that rule
 * cards (type=rules) rely on.
 * @module dsh-knowledge-cards/tests/frontmatter
 */

import { describe, expect, it } from 'vitest'
import {
  hasNestedFrontmatter, isManagedFrontmatterKey, parseFlowArray, parseFlowMap, parseFrontmatter, parseYamlPayload,
  renderYamlPayload, serializePage,
} from '../src/core/frontmatter.ts'

describe('flat frontmatter (legacy behavior preserved)', () => {
  it('parses the canonical flat form', () => {
    const { frontmatter, body } = parseFrontmatter('---\ntype: concept\ntitle: 成本分摊\ntags: [财务, allocation]\nrelated: [利润中心]\n---\n\n正文。\n')
    expect(frontmatter?.type).toBe('concept')
    expect(frontmatter?.title).toBe('成本分摊')
    expect(frontmatter?.tags).toEqual(['财务', 'allocation'])
    expect(body).toContain('正文')
  })

  it('round-trips scalars with typed values', () => {
    const fm = { type: 'source', title: 'note', priority: 30, active: true, version: 1 }
    const parsed = parseFrontmatter(serializePage(fm, 'body'))
    expect(parsed.frontmatter).toEqual(fm)
  })

  it('strips lenient fences and the stray frontmatter: key', () => {
    const dirty = '```yaml\nfrontmatter:\n---\ntype: entity\ntitle: A\n---\nbody'
    const { frontmatter, body } = parseFrontmatter(dirty)
    expect(frontmatter?.type).toBe('entity')
    expect(body.trim()).toBe('body')
  })

  it('survives CRLF input', () => {
    const { frontmatter } = parseFrontmatter('---\r\ntype: query\r\ntitle: Q\r\n---\r\n')
    expect(frontmatter?.title).toBe('Q')
  })
})

describe('nested YAML subset (rule cards)', () => {
  const ruleSpec = {
    type: 'rules',
    title: 'MSPA03存在非9位WBS',
    description: '规则卡示例',
    rule_id: 'B3-NOWBS-003',
    rule_set: 'b3-b4-no-wbs',
    applies_to: ['B3'],
    status: 'active',
    priority: 30,
    match: 'all',
    conditions: [
      { fact: 'mspa03_customer_row_count', operator: 'gt', value: 0 },
      { fact: 'mspa03_valid_9char_wbs_count', operator: 'eq', value: 0 },
      { fact: 'wbs_len', operator: 'in', value: [9, 10] },
    ],
    outcome: { category: 'WBS_FORMAT', label: '存在WBS但均非9位', explanation: '说明文字' },
    test_cases: [
      { name: '支持案例', facts: { mspa03_customer_row_count: 1, mspa03_valid_9char_wbs_count: 0 }, expected: 'SUPPORTED' },
    ],
    tags: [],
    related: [],
    sources: [],
  }

  it('serializes and re-parses nested structures losslessly', () => {
    const text = serializePage(ruleSpec, '正文说明')
    expect(text).toContain('conditions:')
    expect(text).toContain('- fact: mspa03_customer_row_count')
    expect(text).toContain('outcome:')
    const { frontmatter, body } = parseFrontmatter(text)
    expect(body).toContain('正文说明')
    const fm = frontmatter as Record<string, unknown>
    expect(fm.rule_id).toBe('B3-NOWBS-003')
    expect(fm.status).toBe('active')
    expect(fm.priority).toBe(30)
    expect(fm.applies_to).toEqual(['B3'])
    const conditions = fm.conditions as Array<{ fact: string; operator: string; value: unknown }>
    expect(conditions).toHaveLength(3)
    expect(conditions[0]).toEqual({ fact: 'mspa03_customer_row_count', operator: 'gt', value: 0 })
    expect(conditions[2].value).toEqual([9, 10])
    const outcome = fm.outcome as { category: string; label: string }
    expect(outcome.category).toBe('WBS_FORMAT')
    const testCases = fm.test_cases as Array<{ name: string; facts: Record<string, number>; expected: string }>
    expect(testCases[0].name).toBe('支持案例')
    expect(testCases[0].facts).toEqual({ mspa03_customer_row_count: 1, mspa03_valid_9char_wbs_count: 0 })
    expect(hasNestedFrontmatter(fm)).toBe(true)
  })

  it('canonical render round-trips through parseYamlPayload', () => {
    const payload = renderYamlPayload(ruleSpec)
    const reparsed = parseYamlPayload(payload)
    expect(reparsed).not.toBeNull()
    expect((reparsed as Record<string, unknown>).conditions).toEqual(ruleSpec.conditions)
    expect((reparsed as Record<string, unknown>).outcome).toEqual(ruleSpec.outcome)
    expect((reparsed as Record<string, unknown>).test_cases).toEqual(ruleSpec.test_cases)
  })

  it('parses lenient hand-written multi-line block YAML', () => {
    const yaml = [
      'rule_id: B3-NOWBS-001',
      'rule_set: b3-b4-no-wbs',
      'status: draft',
      'conditions:',
      '  - fact: mspa03_customer_row_count',
      '    operator: gt',
      '    value: 0',
      '  - fact: customer_account_l2_present',
      '    operator: eq',
      '    value: true',
      'outcome:',
      '  category: L2ID_MISSING',
      '  label: L2ID为空',
      'test_cases:',
      '  - name: t1',
      '    facts:',
      '      mspa03_customer_row_count: 1',
      '    expected: SUPPORTED',
    ].join('\n')
    const fm = parseYamlPayload(yaml)
    expect(fm?.rule_set).toBe('b3-b4-no-wbs')
    const conditions = fm?.conditions as Array<{ fact: string; operator: string; value: unknown }>
    expect(conditions[0]).toEqual({ fact: 'mspa03_customer_row_count', operator: 'gt', value: 0 })
    expect(conditions[1].value).toBe(true)
    const outcome = fm?.outcome as { category: string }
    expect(outcome.category).toBe('L2ID_MISSING')
    const cases = fm?.test_cases as Array<{ name: string; facts: Record<string, number>; expected: string }>
    expect(cases[0].facts.mspa03_customer_row_count).toBe(1)
  })

  it('parses flow maps and arrays', () => {
    expect(parseFlowMap('{a: 1, b: "x,y", c: {d: 2}}')).toEqual({ a: 1, b: 'x,y', c: { d: 2 } })
    expect(parseFlowArray('[a, 2, {k: v}]')).toEqual(['a', 2, { k: 'v' }])
  })

  it('flag managed keys', () => {
    expect(isManagedFrontmatterKey('title')).toBe(true)
    expect(isManagedFrontmatterKey('rule_id')).toBe(false)
  })
})
