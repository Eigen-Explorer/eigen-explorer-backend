import z from '../../../../api/src/schema/zod';
import { AvsMetaDataSchema } from '../../../../api/src/schema/zod/schemas/base/avsMetaData';
import { EthereumAddressSchema } from '../../../../api/src/schema/zod/schemas/base/ethereumAddress';
import { StrategySharesSchema } from '../../../../api/src/schema/zod/schemas/base/strategyShares';
import { TvlSchema } from '../base/tvlResponses';

export const AvsSchema = z.object({
    address: EthereumAddressSchema.describe(
        'AVS service manager contract address'
    ).openapi({ example: '0x35f4f28a8d3ff20eed10e087e8f96ea2641e6aa1' }),
    metadataName: AvsMetaDataSchema.shape.metadataName,
    metadataDescription: AvsMetaDataSchema.shape.metadataDescription,
    metadataDiscord: AvsMetaDataSchema.shape.metadataDiscord,
    metadataLogo: AvsMetaDataSchema.shape.metadataLogo,
    metadataTelegram: AvsMetaDataSchema.shape.metadataTelegram,
    metadataWebsite: AvsMetaDataSchema.shape.metadataWebsite,
    metadataX: AvsMetaDataSchema.shape.metadataX,
    tags: z
        .array(z.string())
        .optional()
        .describe('The tags associated with the AVS')
        .openapi({ example: ['DA', 'DeFi'] }),
    shares: z
        .array(StrategySharesSchema)
        .describe('The strategy shares held in the AVS')
        .openapi({
            example: [
                {
                    strategyAddress:
                        '0x93c4b944d05dfe6df7645a86cd2206016c51564d',
                    shares: '135064894598947935263152',
                },
                {
                    strategyAddress:
                        '0x54945180db7943c0ed0fee7edab2bd24620256bc',
                    shares: '9323641881708650182301',
                },
            ],
        }),
    totalOperators: z
        .number()
        .describe('The total number of operators operating the AVS')
        .openapi({ example: 10 }),
    totalStakers: z
        .number()
        .describe('The total number of stakers staking in the AVS')
        .openapi({ example: 10 }),
    tvl: TvlSchema.optional()
        .describe('The total value locked in the AVS')
        .openapi({
            example: {
                tvl: 1000000,
                tvlRestaking: 1000000,
                tvlWETH: 1000000,
                tvlBeaconChain: 1000000,
            },
        }),
});

// Deprecated
// ------------------------------
// isVisible: z
// .boolean()
// .optional()
// .default(false)
// .describe('Whether the AVS is visible on the EigenExplorer UI')
// .openapi({ example: true }),
// isVerified: z
// .boolean()
// .optional()
// .default(false)
// .describe('Whether the AVS has gone through manual verification')
// .openapi({ example: true }),
