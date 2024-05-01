import type { Request, Response } from 'express'
import prisma from '../../utils/prismaClient'
import { PaginationQuerySchema } from '../../schema/zod/schemas/paginationQuery'
import { WithTvlQuerySchema } from '../../schema/zod/schemas/withTvlQuery'
import { handleAndReturnErrorResponse } from '../../schema/errors'
import {
	getStrategiesWithShareUnderlying,
	sharesToTVL
} from '../strategies/strategiesController'

/**
 * Route to get a list of all operators
 *
 * @param req
 * @param res
 */
export async function getAllOperators(req: Request, res: Response) {
	// Validate pagination query
	const result = PaginationQuerySchema.and(WithTvlQuerySchema).safeParse(
		req.query
	)
	if (!result.success) {
		return handleAndReturnErrorResponse(req, res, result.error)
	}
	const { skip, take, withTvl } = result.data

	try {
		// Fetch count and record
		const operatorCount = await prisma.operator.count()
		const operatorRecords = await prisma.operator.findMany({
			skip,
			take,
			include: {
				shares: {
					select: { strategyAddress: true, shares: true }
				},
				stakers: true
			}
		})

		const strategiesWithSharesUnderlying = withTvl
			? await getStrategiesWithShareUnderlying()
			: []

		const operators = operatorRecords.map((operator) => ({
			...operator,
			totalStakers: operator.stakers.length,
			tvl: withTvl
				? sharesToTVL(operator.shares, strategiesWithSharesUnderlying)
				: undefined,
			stakers: undefined
		}))

		res.send({
			data: operators,
			meta: {
				total: operatorCount,
				skip,
				take
			}
		})
	} catch (error) {
		handleAndReturnErrorResponse(req, res, error)
	}
}

/**
 * Route to get a single operator
 *
 * @param req
 * @param res
 */
export async function getOperator(req: Request, res: Response) {
	// Validate pagination query
	const result = WithTvlQuerySchema.safeParse(req.query)
	if (!result.success) {
		return handleAndReturnErrorResponse(req, res, result.error)
	}
	const { withTvl } = result.data

	try {
		const { id } = req.params

		const operator = await prisma.operator.findUniqueOrThrow({
			where: { address: id },
			include: {
				shares: {
					select: { strategyAddress: true, shares: true }
				},
				stakers: true
			}
		})

		const strategiesWithSharesUnderlying = withTvl
			? await getStrategiesWithShareUnderlying()
			: []

		res.send({
			...operator,
			totalStakers: operator.stakers.length,
			tvl: withTvl
				? sharesToTVL(operator.shares, strategiesWithSharesUnderlying)
				: undefined,
			stakers: undefined
		})
	} catch (error) {
		handleAndReturnErrorResponse(req, res, error)
	}
}
