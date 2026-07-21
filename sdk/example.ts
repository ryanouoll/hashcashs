/**
 * Runnable example: an agent pays a human by email.
 *
 *   npm i viem
 *   AGENT_KEY=0x... npx tsx sdk/example.ts labeler@gmail.com 5
 *
 * The agent wallet needs testnet USDC (faucet.circle.com, Base Sepolia)
 * and a little testnet ETH (alchemy.com/faucets/base-sepolia) for gas.
 */
import { HashcashClient } from './hashcash'

async function main() {
  const [email, amountStr] = process.argv.slice(2)
  if (!email || !amountStr) {
    console.error('usage: AGENT_KEY=0x... npx tsx sdk/example.ts <email> <usdAmount>')
    process.exit(1)
  }
  const key = process.env.AGENT_KEY as `0x${string}` | undefined
  if (!key) throw new Error('set AGENT_KEY env var to the agent wallet private key')

  const hc = new HashcashClient({ privateKey: key })

  console.log('agent wallet   :', hc.account.address)
  console.log('agent USDC     :', await hc.myUsdcBalance())
  console.log(`paying ${email} $${amountStr} …`)

  const { txHash, emailHash } = await hc.payEmail(email, Number(amountStr))

  console.log('emailHash      :', emailHash)
  console.log('tx             : https://sepolia.basescan.org/tx/' + txHash)
  console.log('recipient vault:', await hc.balanceOf(email), 'USD')
  console.log('already claimed:', await hc.isClaimed(email))
  console.log('\nDone. The recipient can now sign in at https://cfoing.io and claim it.')
}

main().catch((e) => { console.error(e); process.exit(1) })
