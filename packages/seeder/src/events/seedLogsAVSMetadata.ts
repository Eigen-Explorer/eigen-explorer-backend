import prisma from '@prisma/client'
import { parseAbiItem } from 'viem'
import { getEigenContracts } from '../data/address'
import { getViemClient } from '../utils/viemClient'
import {
	bulkUpdateDbTransactions,
	fetchLastSyncBlock,
	getBlockDataFromDb,
	loopThroughBlocks
} from '../utils/seeder'
import { getPrismaClient } from '../utils/prismaClient'

const blockSyncKeyLogs = 'lastSyncedBlock_logs_avs'

/**
 * Utility function to seed event logs
 *
 * @param fromBlock
 * @param toBlock
 */
export async function seedLogsAVSMetadata(toBlock?: bigint, fromBlock?: bigint) {
	console.log('Seeding Event Logs for AVSMetadataURIUpdated...')
	
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const dbTransactions: any[] = []

	const viemClient = getViemClient()
	const prismaClient = getPrismaClient()

	const logsAVSMetadataURIUpdated: prisma.EventLogs_AVSMetadataURIUpdated[] = []

	const firstBlock = fromBlock
		? fromBlock
		: await fetchLastSyncBlock(blockSyncKeyLogs)
	const lastBlock = toBlock ? toBlock : await viemClient.getBlockNumber()
	const blockData = await getBlockDataFromDb(firstBlock, lastBlock)

	// Loop through evm logs
	await loopThroughBlocks(firstBlock, lastBlock, async (fromBlock, toBlock) => {
		try {
			const logs = await viemClient.getLogs({
				address: [
					getEigenContracts().AVSDirectory
				],
				events: [
					parseAbiItem(
						'event AVSMetadataURIUpdated(address indexed avs, string metadataURI)'
					)
				],
				fromBlock,
				toBlock
			})

			// Setup a list containing event data
			for (const l in logs) {
				const log = logs[l]

                logsAVSMetadataURIUpdated.push({
                    address: log.address,
					transactionHash: log.transactionHash,
					transactionIndex: log.transactionIndex,
					blockNumber: BigInt(log.blockNumber),
					blockHash: log.blockHash,
					blockTime: blockData.get(log.blockNumber) || new Date(0),
                    avs: String(log.args.avs),
                    metadataURI: String(log.args.metadataURI)
                })
            }

			dbTransactions.push(
				prismaClient.eventLogs_AVSMetadataURIUpdated.createMany({
					data: logsAVSMetadataURIUpdated,
					skipDuplicates: true
				})
			)

			// Store last synced block
			dbTransactions.push(
				prismaClient.settings.upsert({
					where: { key: blockSyncKeyLogs },
					update: { value: Number(toBlock) },
					create: { key: blockSyncKeyLogs, value: Number(toBlock) }
				})
			)

			// Update database
			await bulkUpdateDbTransactions(dbTransactions)
		} catch (error) {}
	})

	console.log(
		`Seeded AVSMetadataURIUpdated logs between blocks ${firstBlock} ${lastBlock}: ${logsAVSMetadataURIUpdated.length}`
	)
}