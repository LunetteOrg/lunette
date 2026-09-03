import { chain } from '../../domain/chain.ts'
import { hostEnv } from '../config/env.ts'

void hostEnv()

export const { app: deps, dispose } = await chain.build()
