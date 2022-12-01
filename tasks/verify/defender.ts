import { execSync } from 'child_process'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { constants } from 'ethers'

async function main(args: { referenceUrl?: string; contracts: string[] }, hre: HRE) {
  const { referenceUrl, contracts } = args
  const { defender, graph } = hre

  const workflowUrl =
    referenceUrl ||
    process.env.WORKFLOW_URL ||
    execSync(`git config --get remote.origin.url`).toString().trim()
  const addressBook = graph().addressBook
  const errs = []

  for (const contractName of contracts) {
    const entry = addressBook.getEntry(contractName)
    if (!entry || entry.address === constants.AddressZero) {
      errs.push([contractName, { message: `Entry not found on address book.` }])
      continue
    }

    const addressToVerify = entry.implementation?.address ?? entry.address
    console.error(`Verifying artifact for ${contractName} at ${addressToVerify}`)

    try {
      const response = await defender.verifyDeployment(addressToVerify, contractName, workflowUrl)
      console.error(`Bytecode match for ${contractName} is ${response.matchType}`)
      if (response.matchType === 'NO_MATCH') {
        errs.push([contractName, { message: `No bytecode match.` }])
      }
    } catch (err: any) {
      console.error(`Error verifying artifact: ${err.message}`)
      errs.push([contractName, err])
    }
  }

  if (errs.length > 0) {
    throw new Error(
      `Some verifications failed:\n${errs.map(([name, err]) => `${name}: ${err.message}`)}`,
    )
  }
}

task('verify-defender')
  .addVariadicPositionalParam('contracts', 'List of contracts to verify')
  .addOptionalParam(
    'referenceUrl',
    'URL to link to for artifact verification (defaults to $WORKFLOW_URL or the remote.origin.url of the repository)',
  )
  .setDescription('Verifies deployed implementations on Defender')
  .setAction(main)
