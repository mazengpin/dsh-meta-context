/**
 * The Client half's dictionaries.
 *
 * Every string the page renders lives here, so a language addition is one object
 * and the parity page needs no code change. `LOCALE_NS` is imported from the
 * shared contract rather than restated, because two spellings of a namespace is
 * a translation that silently does not apply.
 *
 * @module dsh-meta-context/client/locales
 */

export { LOCALE_NS } from '../shared/protocol.ts'

/** English dictionary. */
export const en: Record<string, string> = {
  nav: 'Context',
  title: 'Fused context surface',
  intro: 'One entry for the context family. Every number below names the plugin that owns it.',
  members: 'Members',
  parity: 'Capability parity',
  driven: 'reproduced here',
  attested: 'owned by the member',
  unmeasured: 'unmeasured',
  total: 'total',
  verdict: 'Verdict',
  excluded: 'Considered and not fused',
  routes: 'Routes',
  censusAt: 'Census',
  reason: 'Reason',
  noReason: 'no reason recorded',
  refresh: 'Refresh',
  loading: 'Reading the fused surface…',
  failed: 'The fused route did not answer',
  sidebar: 'Sidebar seat',
  empty: 'Nothing to show yet.',
}

/** Chinese dictionary. */
export const zh: Record<string, string> = {
  nav: '上下文',
  title: '融合上下文界面',
  intro: '上下文家族的统一入口。以下每个数字都标明所属插件。',
  members: '成员',
  parity: '能力对等',
  driven: '此处复现',
  attested: '由成员持有',
  unmeasured: '未测量',
  total: '合计',
  verdict: '结论',
  excluded: '已考虑但未融合',
  routes: '路由',
  censusAt: '普查时间',
  reason: '原因',
  noReason: '未记录原因',
  refresh: '刷新',
  loading: '正在读取融合界面…',
  failed: '融合路由未响应',
  sidebar: '侧边栏位置',
  empty: '暂无可显示内容。',
}
