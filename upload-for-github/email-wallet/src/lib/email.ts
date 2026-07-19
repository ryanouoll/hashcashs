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

export function hashEmail(email: string): `0x${string}` {
  const normalized = email.trim().toLowerCase()
  return keccak256(encodePacked(['bytes32', 'string'], [DOMAIN_SALT, normalized]))
}
