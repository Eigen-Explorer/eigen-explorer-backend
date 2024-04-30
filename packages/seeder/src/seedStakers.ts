import { parseAbiItem } from 'viem'
import { getEigenContracts } from './data/address'
import { getViemClient } from './utils/viemClient'
import { getPrismaClient } from './utils/prismaClient'
import {
	baseBlock,
	bulkUpdateDbTransactions,
	fetchLastSyncBlock,
	IMap,
	loopThroughBlocks,
	saveLastSyncBlock
} from './utils/seeder'

const blockSyncKey = 'lastSyncedBlock_stakers'

export async function seedStakers(toBlock?: bigint, fromBlock?: bigint) {
	console.log('Seeding stakers ...')

	const viemClient = getViemClient()
	const prismaClient = getPrismaClient()
	const stakers: IMap<
		string,
		{
			operatorAddress: string | null
			shares: { shares: bigint; strategyAddress: string }[]
		}
	> = new Map()

	const firstBlock = fromBlock
		? fromBlock
		: await fetchLastSyncBlock(blockSyncKey)
	const lastBlock = toBlock ? toBlock : await viemClient.getBlockNumber()

	if (firstBlock === baseBlock) {
		await prismaClient.stakerStrategyShares.deleteMany()
	}

	// Loop through evm logs
	await loopThroughBlocks(firstBlock, lastBlock, async (fromBlock, toBlock) => {
		// Fetch logs
		const logs = await viemClient.getLogs({
			address: getEigenContracts().DelegationManager,
			events: [
				parseAbiItem(
					'event StakerDelegated(address indexed staker, address indexed operator)'
				),
				parseAbiItem(
					'event StakerUndelegated(address indexed staker, address indexed operator)'
				),
				parseAbiItem(
					'event OperatorSharesIncreased(address indexed operator, address staker, address strategy, uint256 shares)'
				),
				parseAbiItem(
					'event OperatorSharesDecreased(address indexed operator, address staker, address strategy, uint256 shares)'
				)
			],
			fromBlock,
			toBlock
		})

		// Stakers list
		const stakerAddresses = logs.map((l) => String(l.args.staker).toLowerCase())
		console.log('stakerAddresses shares for seeding', stakerAddresses)

		const stakerInit = await prismaClient.staker.findMany({
			where: { address: { in: stakerAddresses } },
			include: {
				shares: true
			}
		})

		for (const l in logs) {
			const log = logs[l]

			const operatorAddress = String(log.args.operator).toLowerCase()
			const stakerAddress = String(log.args.staker).toLowerCase()

			// Load existing staker shares data
			if (!stakers.has(stakerAddress)) {
				const foundStakerInit = stakerInit.find(
					(s) => s.address.toLowerCase() === stakerAddress.toLowerCase()
				)
				if (foundStakerInit) {
					stakers.set(stakerAddress, {
						operatorAddress: foundStakerInit.operatorAddress,
						shares: foundStakerInit.shares.map((s) => ({
							...s,
							shares: BigInt(s.shares)
						}))
					})
				} else {
					stakers.set(stakerAddress, {
						operatorAddress: null,
						shares: []
					})
				}
			}

			if (log.eventName === 'StakerDelegated') {
				stakers.get(stakerAddress).operatorAddress = operatorAddress
			} else if (log.eventName === 'StakerUndelegated') {
				stakers.get(stakerAddress).operatorAddress = null
			} else if (
				log.eventName === 'OperatorSharesIncreased' ||
				log.eventName === 'OperatorSharesDecreased'
			) {
				const strategyAddress = String(log.args.strategy).toLowerCase()
				const shares = log.args.shares
				if (!shares) continue

				let foundSharesIndex = stakers
					.get(stakerAddress)
					.shares.findIndex(
						(ss) =>
							ss.strategyAddress.toLowerCase() === strategyAddress.toLowerCase()
					)

				if (foundSharesIndex !== undefined && foundSharesIndex === -1) {
					stakers
						.get(stakerAddress)
						.shares.push({ shares: 0n, strategyAddress })

					foundSharesIndex = stakers
						.get(stakerAddress)
						.shares.findIndex(
							(os) =>
								os.strategyAddress.toLowerCase() ===
								strategyAddress.toLowerCase()
						)
				}

				if (log.eventName === 'OperatorSharesIncreased') {
					stakers.get(stakerAddress).shares[foundSharesIndex].shares =
						stakers.get(stakerAddress).shares[foundSharesIndex].shares + shares

					stakers.get(stakerAddress).operatorAddress = operatorAddress
				} else if (log.eventName === 'OperatorSharesDecreased') {
					stakers.get(stakerAddress).shares[foundSharesIndex].shares =
						stakers.get(stakerAddress).shares[foundSharesIndex].shares - shares
					stakers.get(stakerAddress).operatorAddress = null
				}
			}
		}

		console.log(
			`Stakers deployed between blocks ${fromBlock} ${toBlock}: ${logs.length}`
		)
	})

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const dbTransactions: any[] = []

	if (firstBlock === baseBlock) {
		// Clear existing table
		dbTransactions.push(prismaClient.stakerStrategyShares.deleteMany())
		dbTransactions.push(prismaClient.staker.deleteMany())

		const newStakers: { address: string; operatorAddress: string | null }[] = []
		const newStakerShares: {
			stakerAddress: string
			strategyAddress: string
			shares: string
		}[] = []

		for (const [stakerAddress, stakerDetails] of stakers) {
			newStakers.push({
				address: stakerAddress,
				operatorAddress: stakerDetails.operatorAddress
			})

			stakerDetails.shares.map((share) => {
				newStakerShares.push({
					stakerAddress,
					strategyAddress: share.strategyAddress,
					shares: share.shares.toString()
				})
			})
		}

		dbTransactions.push(
			prismaClient.staker.createMany({
				data: newStakers,
				skipDuplicates: true
			})
		)

		dbTransactions.push(
			prismaClient.stakerStrategyShares.createMany({
				data: newStakerShares,
				skipDuplicates: true
			})
		)
	} else {
		for (const [stakerAddress, stakerDetails] of stakers) {
			dbTransactions.push(
				prismaClient.staker.upsert({
					where: { address: stakerAddress },
					create: {
						address: stakerAddress,
						operatorAddress: stakerDetails.operatorAddress
					},
					update: {
						operatorAddress: stakerDetails.operatorAddress
					}
				})
			)

			stakerDetails.shares.map((share) => {
				dbTransactions.push(
					prismaClient.stakerStrategyShares.upsert({
						where: {
							stakerAddress_strategyAddress: {
								stakerAddress,
								strategyAddress: share.strategyAddress
							}
						},
						create: {
							stakerAddress,
							strategyAddress: share.strategyAddress,
							shares: share.shares.toString()
						},
						update: {
							shares: share.shares.toString()
						}
					})
				)
			})
		}
	}

	await bulkUpdateDbTransactions(dbTransactions)

	// Storing last sycned block
	await saveLastSyncBlock(blockSyncKey, lastBlock)

	console.log('Seeded stakers:', stakers.size)
}
