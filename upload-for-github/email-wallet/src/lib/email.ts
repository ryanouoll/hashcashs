import { keccak256, stringToBytes, encodePacked } from 'viem'

/**
 * Email → salted commitment (bytes32)。
 *
 * emailHash = keccak256(DOMAIN_SALT ‖ lowercase(email))
 *
 * DOMAIN_SALT 讓這個部署的 hash 跟其他合約/彩虹表不通用。
 * ⚠️ 注意:這不是加密——email 熵太低,知道公式的人仍可字典暴力猜出
 *    「哪個 email 有金庫」。合約 SECURITY NOTES (B) 有誠實記載。
 *
 * 這個公式必須和 functions/api/bind.ts 的 emailToHash 完全一致。
 */
const DOMAIN_SALT = keccak256(stringToBytes('hashcash:v1'))

/**
 * 正規化 email,讓「同一個信箱的不同寫法」對到同一個 hash。
 * - 全部 trim + 小寫
 * - Gmail / Googlemail:去掉 local part 的點、去掉 "+" 後綴、googlemail→gmail
 *   (Gmail 把 r.yan+foo@gmail.com 和 ryan@gmail.com 視為同一信箱)
 * - 其他 domain 不動點(它們的點是有意義的)
 *
 * ⚠️ 這個函式必須和 functions/api/bind.ts 與 sdk/hashcash.ts 完全一致。
 */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  let local = e.slice(0, at)
  let domain = e.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '')
  return `${local}@${domain}`
}

export function hashEmail(email: string): `0x${string}` {
  return keccak256(encodePacked(['bytes32', 'string'], [DOMAIN_SALT, normalizeEmail(email)]))
}
